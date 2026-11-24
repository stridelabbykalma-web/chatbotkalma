import type Anthropic from "@anthropic-ai/sdk";
import { contactMessage, contactUi, factsFrom, findSlots, getCatalog, labelFor, slotsUi, type Deps } from "./booking";
import { serviceName } from "./config";
import { t } from "./i18n";
import type { LLM } from "./llm";
import { scrubText } from "./log";
import type { NotifyReason } from "./notify";
import { buildSystem } from "./prompt";
import { mentionsStaff, renderPlaceholders, violatesFactGuard } from "./render";
import { todayContext } from "./time";
import type { BotMessage, SessionState, UiElement } from "./types";

const MAX_TOOL_ROUNDS = 5;

const DERIVATION_REASONS: NotifyReason[] = ["medical_question", "complaint", "urgent", "human_request", "cancel_help", "unknown_question", "other"];

/**
 * The only tools the AI has. There is deliberately no tool to search patients, list or cancel
 * appointments, or create anything: patient data and the booking itself go through the
 * contact form and the "Confirmar" button, which the code handles without the AI.
 */
export function toolDefinitions(portalMode: boolean): Anthropic.Beta.BetaTool[] {
  const tools: Anthropic.Beta.BetaTool[] = [
    {
      name: "list_services",
      description: "Lista los servicios del centro con su id, y si se pueden reservar por el chat ahora mismo. Úsala si necesitas confirmar qué se puede reservar.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "offer_options",
      description: "Muestra al paciente entre 2 y 6 botones de respuesta rápida (por ejemplo, servicios o 'Me da igual'). Al pulsar uno, el texto del botón llega como mensaje del paciente.",
      input_schema: {
        type: "object",
        properties: { options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 } },
        required: ["options"],
        additionalProperties: false,
      },
    },
    {
      name: "show_contact",
      description: "Muestra al paciente cómo contactar con el centro (tarjeta con teléfono, WhatsApp y email, o un formulario para que le llamen). Úsala en vez de escribir datos de contacto.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "notify_staff",
      description: "Avisa al equipo de que este paciente necesita una persona. Muestra al paciente un formulario opcional para dejar nombre y móvil; el email al centro se envía cuando lo rellena. No incluyas detalles: solo el motivo.",
      input_schema: {
        type: "object",
        properties: { reason: { type: "string", enum: DERIVATION_REASONS } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
    {
      name: "log_unanswered",
      description: "Registra de forma anónima el tema de una pregunta que no has podido responder, para mejorar la base de conocimiento. 2-5 palabras genéricas, sin datos personales ni de salud.",
      input_schema: {
        type: "object",
        properties: { topic: { type: "string", maxLength: 60 } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
  ];
  if (portalMode) {
    tools.push({
      name: "open_booking_portal",
      description: "Abre dentro del chat la agenda online de Docfav para que el paciente reserve allí.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    });
  } else {
    tools.push({
      name: "get_availability",
      description:
        "Busca huecos libres reales en la agenda para un servicio y los muestra al paciente como botones (máximo 5). Devuelve las etiquetas de los huecos mostrados. Las fechas son locales (YYYY-MM-DD); si no hay preferencia, omítelas y se busca desde hoy.",
      input_schema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "id del servicio (de la lista de servicios)" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          part_of_day: { type: "string", enum: ["morning", "afternoon", "any"] },
          weekdays: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 }, description: "1=lunes ... 7=domingo" },
        },
        required: ["service_id"],
        additionalProperties: false,
      },
    });
  }
  return tools;
}

interface ToolRun {
  result: unknown;
  ui?: UiElement;
  isError?: boolean;
}

async function runTool(deps: Deps, session: SessionState, name: string, input: Record<string, unknown>): Promise<ToolRun> {
  const lang = session.lang;
  deps.logger.event("tool", { sid: session.id, tool: name });
  switch (name) {
    case "list_services": {
      const { entries, docfavOk } = await getCatalog(deps);
      return {
        result: {
          agenda_available: docfavOk,
          services: entries.map((e) => ({
            id: e.cfg.id,
            name: serviceName(e.cfg, lang),
            brand: e.cfg.brand,
            what_it_is: e.cfg.summary,
            for: e.cfg.for,
            bookable_in_chat: e.bookable,
            price: `{{precio:${e.cfg.id}}}`,
            duration: `{{duracion:${e.cfg.id}}}`,
          })),
        },
      };
    }
    case "offer_options": {
      const options = Array.isArray(input.options)
        ? input.options.filter((o): o is string => typeof o === "string").map((o) => o.slice(0, 60)).slice(0, 6)
        : [];
      if (options.length < 2) return { result: { error: "need 2-6 options" }, isError: true };
      return { result: { shown: true }, ui: { type: "options", options } };
    }
    case "show_contact": {
      const ui = contactUi(deps);
      return ui.type === "contact"
        ? { result: { shown: "tarjeta con el contacto del centro" }, ui }
        : { result: { shown: "formulario para que el paciente deje su nombre y móvil y le llamen (el centro aún no tiene teléfono publicado)" }, ui };
    }
    case "notify_staff": {
      const reason = DERIVATION_REASONS.includes(input.reason as NotifyReason) ? (input.reason as NotifyReason) : "other";
      session.derivation = reason;
      deps.logger.event("derivation", { sid: session.id, reason });
      return { result: { callback_form_shown: true, note: "El equipo recibirá el aviso cuando el paciente deje su nombre y móvil en el formulario." }, ui: { type: "callback_form" } };
    }
    case "log_unanswered": {
      const topic = typeof input.topic === "string" ? scrubText(input.topic).slice(0, 60) : "";
      deps.logger.event("unanswered_question", { sid: session.id, topic });
      return { result: { logged: true } };
    }
    case "open_booking_portal": {
      const url = deps.cfg.settings.booking.portal_url;
      if (!url) return { result: { error: "portal_not_configured" }, isError: true };
      return { result: { shown: true }, ui: { type: "portal", url } };
    }
    case "get_availability": {
      if (typeof input.service_id !== "string") return { result: { error: "service_id required" }, isError: true };
      const partOfDay = input.part_of_day === "morning" || input.part_of_day === "afternoon" ? input.part_of_day : undefined;
      const r = await findSlots(deps, session, {
        serviceId: input.service_id,
        dateFrom: typeof input.date_from === "string" ? input.date_from : undefined,
        dateTo: typeof input.date_to === "string" ? input.date_to : undefined,
        partOfDay,
        weekdays: Array.isArray(input.weekdays) ? (input.weekdays as number[]) : undefined,
      });
      if (!r.ok) {
        if (r.error === "agenda_unavailable") {
          return { result: { error: "agenda_unavailable", instruction: "Di que ahora mismo no puedes acceder a la agenda y usa show_contact. No inventes huecos." } };
        }
        return { result: { error: r.error } };
      }
      return {
        result: {
          searched: { from: r.query.dateFrom, to: r.query.dateTo, part_of_day: r.query.partOfDay ?? "any" },
          slots_shown_as_buttons: r.slots.map((s) => labelFor(deps, s, lang)),
          ...(r.slots.length ? {} : { note: "No hay huecos con esas preferencias. Propón otras fechas o franja." }),
        },
        ui: r.slots.length ? slotsUi(deps, r.slots, lang) : undefined,
      };
    }
    default:
      return { result: { error: `unknown tool ${name}` }, isError: true };
  }
}

function fallbackTeam(deps: Deps, session: SessionState): BotMessage {
  return contactMessage(deps, t(session.lang, "team_confirms"));
}

/** One patient message → AI with tools → rendered, guarded bot messages. */
export async function runAgent(deps: Deps & { llm: LLM }, session: SessionState, userText: string): Promise<BotMessage[]> {
  const cfg = deps.cfg;
  const portal = cfg.settings.booking.mode === "portal";
  const tools = toolDefinitions(portal);
  const system = buildSystem(cfg, todayContext(new Date(deps.now()), cfg.settings.booking.timezone), session.lang);
  session.history.push({ role: "user", content: userText });
  const uis: UiElement[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let res;
    try {
      res = await deps.llm.create({ system, messages: session.history, tools });
    } catch (e) {
      deps.logger.event("ai_error", { sid: session.id, code: e instanceof Error ? e.name : "UNKNOWN" });
      return [contactMessage(deps, t(session.lang, "ai_down"))];
    }
    session.history.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") {
      deps.logger.event("ai_refusal", { sid: session.id });
      return [fallbackTeam(deps, session)];
    }

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length && round < MAX_TOOL_ROUNDS) {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const input = tu.input && typeof tu.input === "object" ? (tu.input as Record<string, unknown>) : {};
        let run: ToolRun;
        try {
          run = await runTool(deps, session, tu.name, input);
        } catch (e) {
          deps.logger.event("tool_error", { sid: session.id, tool: tu.name, code: e instanceof Error ? e.name : "UNKNOWN" });
          run = { result: { error: "internal_error" }, isError: true };
        }
        if (run.ui) uis.push(run.ui);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(run.result), ...(run.isError ? { is_error: true } : {}) });
      }
      session.history.push({ role: "user", content: results });
      continue;
    }

    if (toolUses.length) {
      // Tool calls left unanswered would break the next request: answer them as skipped.
      session.history.push({
        role: "user",
        content: toolUses.map((tu) => ({ type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify({ error: "too_many_steps" }), is_error: true })),
      });
    }

    const raw = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const guard = violatesFactGuard(raw) ?? (mentionsStaff(raw, cfg.settings.staff.map((s) => s.name)) ? "staff_name" : null);
    if (guard) {
      deps.logger.event("fact_guard", { sid: session.id, reason: guard });
      return [fallbackTeam(deps, session)];
    }
    const { entries } = await getCatalog(deps);
    const text = renderPlaceholders(raw, cfg, factsFrom(entries), session.lang);
    if (!text && !uis.length) return [fallbackTeam(deps, session)];
    const seen = new Set<string>();
    const unique = uis.filter((u) => !seen.has(u.type) && !!seen.add(u.type));
    const [first, ...rest] = unique;
    return [{ text, ui: first }, ...rest.map((ui) => ({ text: "", ui }))];
  }
  return [fallbackTeam(deps, session)];
}
