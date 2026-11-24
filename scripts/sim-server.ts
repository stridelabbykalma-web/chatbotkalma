/**
 * Simulation server: the REAL backend (createApp) on a local port, with Docfav simulated and
 * the model replaced by a bridge, so that an external agent plays the model and another agent
 * plays the patient. Used to test conversations with real Claude without an API key here.
 *   node dist/sim-server.mjs <port> <outDir>
 * Patient side: POST /patient/{start,say,pick,data,confirm,cancel,callback,end}
 * Model side:   GET /model/next (long-poll)  ·  POST /model/answer {tool_calls}|{text}
 */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../worker/src/app";
import { toolDefinitions } from "../worker/src/agent";
import { loadConfig } from "../worker/src/config";
import { DocfavMock } from "../worker/src/docfav/mock";
import type { LLM, LLMRequest, LLMResponse } from "../worker/src/llm";
import { MemoryLogger } from "../worker/src/log";
import { MemoryMailer } from "../worker/src/notify";
import { buildSystem } from "../worker/src/prompt";
import { MemoryStore } from "../worker/src/store";
import { slotLabel, todayContext } from "../worker/src/time";
import type { BotMessage, UiElement } from "../worker/src/types";

const port = Number(process.argv[2] ?? 8900);
const outDir = process.argv[3] ?? ".";
mkdirSync(outDir, { recursive: true });

const cfg = loadConfig();
const cal = (k: string) => cfg.settings.staff.find((s) => s.key === k)!.staff_calendar_id;
const all = ["abraham", "matilde", "jose_antonio"].map(cal);
const docfav = new DocfavMock(
  [
    ["6c8c843b-5e18-4b82-9691-1efec9cabd0b", "Estudio biomecanico de la carrera", 25000, 90, [cal("abraham")]],
    ["a2cf06ac-a659-4fb7-bf67-06e097f17ecf", "Exploración Biomecánica del Pie", 5000, 30, all],
    ["b42a1fec-80d7-4015-b92a-f877a31da7ed", "Quiropodia", 2500, 15, all],
    ["34580ad7-e911-4405-89bb-fd39538d7dee", "Revisión Plantillas", 4000, 30, all],
    ["7f94dea1-fa86-4195-8564-fe2dee3e2f26", "Visita", 5000, 30, all],
    ["528840d7-5797-4176-b98a-7a954a3e5c98", "Osteopatia", 7000, 40, [cal("jose_antonio")]],
    ["072b9205-237a-4307-9ca1-2b85c98e7b7f", "Verrugas Plantares", 6000, 30, all],
    ["42444742-fa67-4286-b2dd-be503bea785c", "Ondas de choque", 2000, 15, all],
    ["4f110472-1405-4ffb-b7a6-bff08301115b", "Infiltración", 10000, 40, [cal("matilde")]],
    ["bf118c9b-7c1f-4163-aa8c-90d753e479e1", "PRP", 29000, 60, all],
    ["fb80618d-c36f-4321-be1e-2b9ed5bcaa13", "Cirugía Ungueal", 35000, 60, [cal("matilde")]],
    ["439cb1db-1fcc-4bd4-bc12-8aa118937383", "Exeresis IPK", 40000, 60, all],
  ].map(([id, name, amountCents, durationMin, staffCalendarIds]) => ({ id, name, amountCents, durationMin, isActive: true, staffCalendarIds }) as any),
  all,
);

// ---------- model bridge ----------
interface Pending {
  text: string;
  resolve: (r: LLMResponse) => void;
}
let pending: Pending | null = null;
let waiter: ((p: Pending | null) => void) | null = null;
let seen = 0;
let done = false;
const names = new Map<string, string>();

function renderNew(req: LLMRequest): string {
  const lines: string[] = [];
  for (const m of req.messages.slice(seen)) {
    const label = (t: string) =>
      m.role === "assistant" ? `EL SISTEMA MOSTRÓ AL PACIENTE: ${t}` : t.startsWith("<evento_sistema>") ? `SISTEMA: ${t}` : `PACIENTE: ${t}`;
    if (typeof m.content === "string") {
      lines.push(label(m.content));
      continue;
    }
    for (const b of m.content as any[]) {
      if (b.type === "text" && b.text) lines.push(label(b.text));
      if (b.type === "tool_use") names.set(b.id, b.name);
      if (b.type === "tool_result") lines.push(`RESULTADO DE ${names.get(b.tool_use_id) ?? "herramienta"}: ${b.content}`);
    }
  }
  seen = req.messages.length;
  return lines.join("\n");
}

const bridge: LLM = {
  create(req: LLMRequest): Promise<LLMResponse> {
    const text = renderNew(req);
    return new Promise((resolve) => {
      const p: Pending = {
        text,
        resolve: (r) => {
          // what the model returns becomes part of the history; skip it next time
          seen += 1;
          resolve(r);
        },
      };
      pending = p;
      if (waiter) {
        waiter(p);
        waiter = null;
      }
    });
  },
};

function toResponse(a: any): LLMResponse {
  const calls = Array.isArray(a?.tool_calls) ? a.tool_calls.filter((c: any) => c && typeof c.name === "string") : [];
  if (calls.length) {
    return {
      content: calls.map((c: any, i: number) => {
        const id = `toolu_${Date.now()}_${i}`;
        names.set(id, c.name);
        return { type: "tool_use", id, name: c.name, input: c.input ?? {} };
      }) as Anthropic.Beta.BetaToolUseBlock[],
      stop_reason: "tool_use",
    };
  }
  return { content: [{ type: "text", text: String(a?.text ?? ""), citations: null } as Anthropic.Beta.BetaTextBlock], stop_reason: "end_turn" };
}

// ---------- app ----------
let seq = 0;
const mailer = new MemoryMailer();
const app = createApp({
  cfg,
  docfav,
  store: new MemoryStore(),
  mailer,
  logger: new MemoryLogger(),
  now: () => Date.now(),
  randomId: () => `s${(++seq).toString(36)}${Math.random().toString(36).slice(2, 10)}`,
  dryRun: false,
  llm: bridge,
  verifyTurnstile: async () => true,
  allowedOrigins: [],
});

// The model agent gets the exact production system prompt and tools once.
writeFileSync(`${outDir}/system.txt`, buildSystem(cfg, todayContext(new Date(), "Europe/Madrid"), "es").map((b) => b.text).join("\n\n"));
writeFileSync(`${outDir}/tools.json`, JSON.stringify(toolDefinitions(false).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })), null, 1));

function describeUi(ui?: UiElement): string {
  if (!ui) return "";
  switch (ui.type) {
    case "options": return `[botones: ${ui.options.join(" | ")}]`;
    case "slots": return `[huecos: ${ui.slots.map((s, i) => `${i + 1}) ${s.label}`).join(" | ")}]`;
    case "contact_form": return "[formulario: nombre, apellidos, móvil, email]";
    case "summary": return `[resumen: ${ui.lines.join(" / ")} — botones Confirmar / Cancelar]`;
    case "contact": return `[tarjeta de contacto: ${[ui.phone, ui.whatsapp, ui.email].filter(Boolean).join(", ")}]`;
    case "callback_form": return "[formulario ¿Te llamamos?: nombre y móvil]";
    case "portal": return "[agenda online]";
  }
}

let sid = "";
let lastUi: UiElement | undefined;
const transcript: string[] = [];
async function call(path: string, body: Record<string, unknown>) {
  const res = await app.handle(new Request(`https://sim/reservas/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return (await res.json()) as { messages?: BotMessage[]; sessionId?: string; error?: string };
}
function botOut(r: { messages?: BotMessage[]; error?: string }) {
  if (r.error) {
    transcript.push(`BOT: [error ${r.error}]`);
    return `[error ${r.error}]`;
  }
  const parts: string[] = [];
  for (const m of r.messages ?? []) {
    if (m.ui) lastUi = m.ui;
    const line = [m.text, describeUi(m.ui)].filter(Boolean).join(" ");
    transcript.push(`BOT: ${line}`);
    parts.push(line);
  }
  writeFileSync(`${outDir}/transcript.txt`, transcript.join("\n"));
  return parts.join("\n");
}

async function patient(action: string, b: any): Promise<string> {
  switch (action) {
    case "start": {
      const r = await call("session", { lang: b.lang ?? "es", privacyAccepted: true });
      sid = r.sessionId!;
      return botOut(r);
    }
    case "say":
      transcript.push(`PACIENTE: ${b.text}`);
      lastUi = undefined;
      return botOut(await call("chat", { sessionId: sid, text: String(b.text) }));
    case "pick": {
      if (lastUi?.type !== "slots") return "[no hay huecos en pantalla]";
      const s = lastUi.slots[Math.max(0, Number(b.n) - 1)] ?? lastUi.slots[0];
      transcript.push(`PACIENTE: [pulsa el hueco] ${s.label}`);
      lastUi = undefined;
      return botOut(await call("action", { sessionId: sid, action: { type: "select_slot", slotId: s.id } }));
    }
    case "data":
      transcript.push(`PACIENTE: [rellena el formulario] ${b.firstName} ${b.lastName}, ${b.phone}, ${b.email}`);
      lastUi = undefined;
      return botOut(await call("action", { sessionId: sid, action: { type: "submit_contact", data: b } }));
    case "confirm": {
      if (lastUi?.type !== "summary") return "[no hay resumen en pantalla]";
      transcript.push("PACIENTE: [pulsa Confirmar]");
      const token = lastUi.token;
      lastUi = undefined;
      return botOut(await call("action", { sessionId: sid, action: { type: "confirm", token } }));
    }
    case "cancel":
      transcript.push("PACIENTE: [pulsa Cancelar]");
      lastUi = undefined;
      return botOut(await call("action", { sessionId: sid, action: { type: "cancel_pending" } }));
    case "callback":
      transcript.push(`PACIENTE: [deja su contacto para que le llamen] ${b.name}, ${b.phone}`);
      lastUi = undefined;
      return botOut(await call("action", { sessionId: sid, action: { type: "submit_callback", data: b } }));
    case "button":
      transcript.push(`PACIENTE: [pulsa el botón] ${b.text}`);
      lastUi = undefined;
      return botOut(await call("chat", { sessionId: sid, text: String(b.text) }));
    case "end": {
      done = true;
      transcript.push("PACIENTE: [se va]");
      const appts = docfav.appointments.map((a) => `${slotLabel(a.from, "Europe/Madrid", "es")} · servicio ${a.serviceId} · nota "${a.note}"`);
      writeFileSync(`${outDir}/transcript.txt`, transcript.join("\n") + `\n\n== Citas creadas: ${appts.length ? appts.join(" ; ") : "ninguna"}\n== Emails al centro: ${mailer.sent.map((m) => m.subject).join(" ; ") || "ninguno"}\n`);
      if (waiter) { waiter(null); waiter = null; }
      return "fin";
    }
  }
  return "acción desconocida";
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let body = "";
  for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : {};
  const send = (s: string) => { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); res.end(s + "\n"); };
  try {
    if (url.pathname === "/model/next") {
      if (done) return send("DONE");
      if (pending) { const p = pending; return send(`PENDIENTE\n${p.text}`); }
      const p = await Promise.race([
        new Promise<Pending | null>((r) => (waiter = r)),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 90_000)),
      ]);
      if (p === "timeout") { waiter = null; return send("NADA (vuelve a preguntar)"); }
      if (p === null) return send("DONE");
      return send(`PENDIENTE\n${p.text}`);
    }
    if (url.pathname === "/model/answer") {
      if (!pending) return send("no hay nada pendiente");
      const p = pending;
      pending = null;
      p.resolve(toResponse(json));
      return send("ok");
    }
    const m = /^\/patient\/(\w+)$/.exec(url.pathname);
    if (m) return send(await patient(m[1], json));
    res.writeHead(404); res.end();
  } catch (e: any) {
    res.writeHead(500); res.end(String(e?.message ?? e));
  }
}).listen(port, () => console.log(`sim ${port} -> ${outDir}`));
