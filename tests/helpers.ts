import type Anthropic from "@anthropic-ai/sdk";
import { createApp, type AppDeps } from "../worker/src/app";
import { loadConfig, type AppConfig } from "../worker/src/config";
import { DocfavMock, DryRunDocfav } from "../worker/src/docfav/mock";
import type { DocfavClient } from "../worker/src/docfav/types";
import type { LLM, LLMRequest, LLMResponse } from "../worker/src/llm";
import { MemoryLogger } from "../worker/src/log";
import { MemoryMailer } from "../worker/src/notify";
import { MemoryStore } from "../worker/src/store";

/** Tuesday 24/11/2026 11:00 in Madrid. */
export const NOW = Date.parse("2026-11-24T10:00:00Z");

export function realLikeServices(cfg: AppConfig) {
  const cal = (k: string) => cfg.settings.staff.find((s) => s.key === k)!.staff_calendar_id;
  const all = ["abraham", "matilde", "jose_antonio"].map(cal);
  return [
    { id: "6c8c843b-5e18-4b82-9691-1efec9cabd0b", name: "Estudio biomecanico de la carrera", amountCents: 25000, durationMin: 90, isActive: true, staffCalendarIds: all },
    { id: "a2cf06ac-a659-4fb7-bf67-06e097f17ecf", name: "Exploración Biomecánica del Pie", amountCents: 5000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "b42a1fec-80d7-4015-b92a-f877a31da7ed", name: "Quiropodia", amountCents: 2500, durationMin: 15, isActive: true, staffCalendarIds: all },
    { id: "34580ad7-e911-4405-89bb-fd39538d7dee", name: "Revisión Plantillas", amountCents: 4000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "6a16fd66-89a6-472f-b419-3e3322cdfd02", name: "Cat Salut", amountCents: 0, durationMin: 30, isActive: true, staffCalendarIds: all },
  ];
}

export function textBlock(text: string): Anthropic.Beta.BetaTextBlock {
  return { type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock;
}

let toolSeq = 0;
export function toolUse(name: string, input: Record<string, unknown>): Anthropic.Beta.BetaToolUseBlock {
  toolSeq += 1;
  return { type: "tool_use", id: `toolu_${toolSeq}`, name, input } as Anthropic.Beta.BetaToolUseBlock;
}

/**
 * Scripted stand-in for Claude. Each entry answers one model call: either a list of tool calls
 * or a final text. Lets the tests check everything the code enforces, deterministically.
 */
export class ScriptedLLM implements LLM {
  requests: LLMRequest[] = [];
  queue: (LLMResponse | Error)[] = [];
  push(...items: (LLMResponse | Error)[]) {
    this.queue.push(...items);
    return this;
  }
  tools(...uses: Anthropic.Beta.BetaToolUseBlock[]) {
    return this.push({ content: uses, stop_reason: "tool_use" });
  }
  say(text: string) {
    return this.push({ content: [textBlock(text)], stop_reason: "end_turn" });
  }
  async create(req: LLMRequest): Promise<LLMResponse> {
    this.requests.push(structuredClone(req));
    const next = this.queue.shift();
    if (!next) return { content: [textBlock("¿En qué más te puedo ayudar?")], stop_reason: "end_turn" };
    if (next instanceof Error) throw next;
    return next;
  }
}

export interface Harness {
  cfg: AppConfig;
  docfav: DocfavMock;
  client: DocfavClient;
  store: MemoryStore;
  mailer: MemoryMailer;
  logger: MemoryLogger;
  llm: ScriptedLLM;
  deps: AppDeps;
  app: ReturnType<typeof createApp>;
  clock: { now: number };
  call(route: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: any }>;
  start(lang?: string): Promise<string>;
}

export function harness(opts: { dryRun?: boolean; cfg?: (c: AppConfig) => void; turnstile?: boolean } = {}): Harness {
  const cfg = loadConfig();
  cfg.settings.center.phone = "972 00 00 00";
  cfg.settings.center.whatsapp = "+34 600 00 00 00";
  cfg.settings.center.email = "hola@kalma.test";
  opts.cfg?.(cfg);
  const docfav = new DocfavMock(realLikeServices(cfg), cfg.settings.staff.map((s) => s.staff_calendar_id));
  const client: DocfavClient = opts.dryRun ? new DryRunDocfav(docfav) : docfav;
  const clock = { now: NOW };
  const store = new MemoryStore(() => clock.now);
  const mailer = new MemoryMailer();
  const logger = new MemoryLogger();
  const llm = new ScriptedLLM();
  let seq = 0;
  const deps: AppDeps = {
    cfg,
    docfav: client,
    store,
    mailer,
    logger,
    llm,
    now: () => clock.now,
    randomId: () => `id${(++seq).toString().padStart(6, "0")}xxxxxxxxxxxxxxxx`,
    dryRun: !!opts.dryRun,
    verifyTurnstile: async (token) => (opts.turnstile ? token === "ok-token" : true),
    allowedOrigins: [],
  };
  const app = createApp(deps);
  const h: Harness = {
    cfg, docfav, client, store, mailer, logger, llm, deps, app, clock,
    async call(route, body, headers = {}) {
      const res = await h.app.handle(
        new Request(`https://kalma.test/reservas/api${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://kalma.test", ...headers },
          body: JSON.stringify(body),
        }),
      );
      return { status: res.status, body: await res.json() };
    },
    async start(lang = "es") {
      const r = await h.call("/session", { lang, privacyAccepted: true, turnstileToken: "ok-token" });
      if (r.status !== 200) throw new Error(`session failed ${r.status}`);
      return r.body.sessionId as string;
    },
  };
  return h;
}

export const PATIENT = { firstName: "Laura", lastName: "Martí Soler", phone: "612 345 678", email: "Laura.Marti@example.com" };

/** Runs the happy path up to the summary and returns the token and the chosen slot. */
export async function bookUntilSummary(h: Harness, sid: string, serviceId = "quiropodia") {
  h.llm.tools(toolUse("get_availability", { service_id: serviceId })).say("Estos son los huecos libres, elige uno.");
  const chat = await h.call("/chat", { sessionId: sid, text: "Quiero cita para quiropodia" });
  const slotsUi = chat.body.messages.find((m: any) => m.ui?.type === "slots")?.ui;
  if (!slotsUi) throw new Error("no slots: " + JSON.stringify(chat.body) + JSON.stringify(h.llm.requests.at(-1)?.messages.at(-1)));
  const slot = slotsUi.slots[0];
  const sel = await h.call("/action", { sessionId: sid, action: { type: "select_slot", slotId: slot.id } });
  const contact = await h.call("/action", { sessionId: sid, action: { type: "submit_contact", data: PATIENT } });
  const summary = contact.body.messages.find((m: any) => m.ui?.type === "summary")?.ui;
  return { chat, slotsUi, slot, sel, contact, summary, token: summary?.token as string | undefined };
}
