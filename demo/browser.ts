/**
 * Demo in the browser: the REAL backend (worker/src/app.ts with its rules, tools and guards)
 * running inside the page, with Docfav simulated (real services and prices, fake agenda) and
 * Claude reached through the artifact's `sample` capability. Nothing is written anywhere.
 * Build: npm run build:demo
 */
import type Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../worker/src/app";
import { loadConfig } from "../worker/src/config";
import { DemoLLM } from "../worker/src/demo-llm";
import { DocfavMock } from "../worker/src/docfav/mock";
import type { LLM, LLMRequest, LLMResponse } from "../worker/src/llm";
import { MemoryLogger } from "../worker/src/log";
import { MemoryMailer } from "../worker/src/notify";
import { MemoryStore } from "../worker/src/store";
import { slotLabel } from "../worker/src/time";
import { PERSONAS, runPersona, type Turn } from "./personas";

declare global {
  interface Window {
    claude?: { use(name: string): Promise<any> };
  }
}

type Tier = "quick" | "default";

/** One model step = one `sample.json` call that either calls tools or answers the patient. */
class SampleLLM implements LLM {
  tier: Tier = "default";
  constructor(private sample: any) {}

  async create(req: LLMRequest): Promise<LLMResponse> {
    const names = new Map<string, string>();
    const lines: string[] = [];
    for (const m of req.messages) {
      if (typeof m.content === "string") {
        lines.push(`${m.role === "user" ? "PACIENTE" : "ASISTENTE"}: ${m.content}`);
        continue;
      }
      for (const b of m.content as any[]) {
        if (b.type === "text" && b.text) lines.push(`${m.role === "user" ? "PACIENTE" : "ASISTENTE"}: ${b.text}`);
        if (b.type === "tool_use") {
          names.set(b.id, b.name);
          lines.push(`ASISTENTE LLAMÓ A ${b.name} ${JSON.stringify(b.input)}`);
        }
        if (b.type === "tool_result") lines.push(`RESULTADO DE ${names.get(b.tool_use_id) ?? "herramienta"}: ${b.content}`);
      }
    }
    const tools = req.tools.map((t) => ({ name: t.name, description: t.description, input: t.input_schema }));
    const prompt = [
      "Eres el modelo de un chatbot de reservas. Sigue estas instrucciones del sistema al pie de la letra:",
      "<sistema>",
      req.system.map((s) => s.text).join("\n\n"),
      "</sistema>",
      "Herramientas disponibles (JSON Schema de su entrada):",
      JSON.stringify(tools),
      "Conversación hasta ahora:",
      lines.join("\n"),
      "",
      "Decide el siguiente paso del ASISTENTE. Responde SOLO con un objeto JSON, sin texto alrededor:",
      '- para usar herramientas: {"tool_calls":[{"name":"get_availability","input":{"service_id":"quiropodia"}}]}',
      '- para contestar al paciente: {"text":"tu mensaje"}',
      "Después de un RESULTADO de herramienta normalmente toca contestar con text.",
    ].join("\n");
    let out: any;
    try {
      out = await this.sample.json(prompt, { modelTier: this.tier, cache: false });
    } catch (e: any) {
      if (e?.code === "refused") return { content: [], stop_reason: "refusal" };
      throw Object.assign(new Error(e?.code ?? "sample_error"), { name: String(e?.code ?? "SampleError") });
    }
    const calls = Array.isArray(out?.tool_calls) ? out.tool_calls.filter((c: any) => c && typeof c.name === "string") : [];
    if (calls.length) {
      return {
        content: calls.map((c: any, i: number) => ({
          type: "tool_use",
          id: `call_${Date.now()}_${i}`,
          name: c.name,
          input: c.input && typeof c.input === "object" ? c.input : {},
        })) as Anthropic.Beta.BetaToolUseBlock[],
        stop_reason: "tool_use",
      };
    }
    const text = typeof out?.text === "string" ? out.text : "";
    return { content: [{ type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock], stop_reason: "end_turn" };
  }
}

/** The LLM the app holds; it can switch to Claude once the capability answers. */
class SwitchLLM implements LLM {
  inner: LLM = new DemoLLM();
  create(req: LLMRequest) {
    return this.inner.create(req);
  }
}

const cfg = loadConfig();
const cal = (k: string) => cfg.settings.staff.find((s) => s.key === k)!.staff_calendar_id;
const all = ["abraham", "matilde", "jose_antonio"].map(cal);
// Real services, prices and durations read from Docfav on 24/11/2026. The agenda is simulated.
const docfav = new DocfavMock(
  [
    { id: "6c8c843b-5e18-4b82-9691-1efec9cabd0b", name: "Estudio biomecanico de la carrera", amountCents: 25000, durationMin: 90, isActive: true, staffCalendarIds: [cal("abraham")] },
    { id: "a2cf06ac-a659-4fb7-bf67-06e097f17ecf", name: "Exploración Biomecánica del Pie", amountCents: 5000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "b42a1fec-80d7-4015-b92a-f877a31da7ed", name: "Quiropodia", amountCents: 2500, durationMin: 15, isActive: true, staffCalendarIds: all },
    { id: "34580ad7-e911-4405-89bb-fd39538d7dee", name: "Revisión Plantillas", amountCents: 4000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "6a16fd66-89a6-472f-b419-3e3322cdfd02", name: "Cat Salut", amountCents: 0, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "7f94dea1-fa86-4195-8564-fe2dee3e2f26", name: "Visita", amountCents: 5000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "528840d7-5797-4176-b98a-7a954a3e5c98", name: "Osteopatia", amountCents: 7000, durationMin: 40, isActive: true, staffCalendarIds: [cal("jose_antonio")] },
    { id: "072b9205-237a-4307-9ca1-2b85c98e7b7f", name: "Verrugas Plantares", amountCents: 6000, durationMin: 30, isActive: true, staffCalendarIds: all },
    { id: "42444742-fa67-4286-b2dd-be503bea785c", name: "Ondas de choque", amountCents: 2000, durationMin: 15, isActive: true, staffCalendarIds: all },
    { id: "4f110472-1405-4ffb-b7a6-bff08301115b", name: "Infiltración", amountCents: 10000, durationMin: 40, isActive: true, staffCalendarIds: [cal("matilde")] },
    { id: "bf118c9b-7c1f-4163-aa8c-90d753e479e1", name: "PRP", amountCents: 29000, durationMin: 60, isActive: true, staffCalendarIds: all },
    { id: "fb80618d-c36f-4321-be1e-2b9ed5bcaa13", name: "Cirugía Ungueal", amountCents: 35000, durationMin: 60, isActive: true, staffCalendarIds: [cal("matilde")] },
    { id: "439cb1db-1fcc-4bd4-bc12-8aa118937383", name: "Exeresis IPK", amountCents: 40000, durationMin: 60, isActive: true, staffCalendarIds: all },
  ],
  all,
);
const mailer = new MemoryMailer();
const llm = new SwitchLLM();
const randomId = () => {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const app = createApp({
  cfg,
  docfav,
  store: new MemoryStore(),
  mailer,
  logger: new MemoryLogger(),
  now: () => Date.now(),
  randomId,
  dryRun: false,
  llm,
  verifyTurnstile: async () => true,
  allowedOrigins: [],
});

// The chat page (web/app.js) calls fetch("api/..."): answer it with the real backend in memory.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const m = /^api\/(.*)$/.exec(url);
  if (!m) return realFetch(input, init);
  const res = await app.handle(new Request(`https://demo.kalma/reservas/api/${m[1]}`, init));
  queueMicrotask(renderPanel);
  return res;
};

// ---------- test panel: what the centre would see ----------
const byId = (id: string) => document.getElementById(id)!;
const serviceByDocfavId = new Map(cfg.services.map((s) => [s.docfav_service_id, s.name.es]));
const staffByCal = new Map(cfg.settings.staff.map((s) => [s.staff_calendar_id, s.name]));

function li(text: string) {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

function renderPanel() {
  const appts = byId("demo-appts");
  appts.replaceChildren(
    ...(docfav.appointments.length
      ? docfav.appointments.map((a) => {
          const c = docfav.clients.find((x) => x.id === a.clientId);
          return li(`${slotLabel(a.from, "Europe/Madrid", "es")} · ${serviceByDocfavId.get(a.serviceId) ?? a.serviceId} · ${staffByCal.get(a.staffCalendarId) ?? "?"} · ${c ? `${c.firstname} ${c.lastname}, ${c.phone}, ${c.email}` : a.clientId} · nota: "${a.note}"`);
        })
      : [li("Ninguna todavía.")]),
  );
  const mails = byId("demo-mails");
  mails.replaceChildren(
    ...(mailer.sent.length
      ? mailer.sent.map((m) => {
          const el = li(`${m.subject}\n${m.text}`);
          el.className = "pre";
          return el;
        })
      : [li("Ninguno todavía.")]),
  );
}

function setupPanel() {
  byId("demo-run").addEventListener("click", () => void runPersonaTests());
  const down = byId("demo-down") as HTMLInputElement;
  down.addEventListener("change", () => (docfav.down = down.checked));
  const tier = byId("demo-tier") as HTMLSelectElement;
  tier.addEventListener("change", () => {
    if (llm.inner instanceof SampleLLM) llm.inner.tier = tier.value as Tier;
  });
  renderPanel();
}

async function connectClaude() {
  const status = byId("demo-ai");
  status.textContent = "Conectando con Claude…";
  const sample = window.claude ? await window.claude.use("sample").catch(() => null) : null;
  if (sample) {
    const s = new SampleLLM(sample);
    s.tier = (byId("demo-tier") as HTMLSelectElement).value as Tier;
    llm.inner = s;
    status.textContent = "IA: Claude (con tu cuenta; te pedirá permiso en el primer mensaje).";
  } else {
    status.textContent = "IA: reglas de demo (Claude no está disponible en esta vista).";
    (byId("demo-tier") as HTMLSelectElement).disabled = true;
  }
}

// ---------- persona tests ----------
async function api(path: string, body: Record<string, unknown>) {
  const res = await app.handle(new Request(`https://demo.kalma/reservas/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  queueMicrotask(renderPanel);
  return res.json();
}

async function runPersonaTests() {
  const btn = byId("demo-run") as HTMLButtonElement;
  const out = byId("demo-results");
  if (!(llm.inner instanceof SampleLLM)) {
    out.textContent = "Las pruebas necesitan Claude, y no está disponible en esta vista.";
    return;
  }
  const sample = (llm.inner as any).sample;
  const db = window.claude ? await window.claude.use("db").catch(() => null) : null;
  btn.disabled = true;
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  out.replaceChildren();
  const status = document.createElement("p");
  status.className = "muted";
  out.append(status);
  let done = 0;
  const update = () => (status.textContent = `Pruebas: ${done}/${PERSONAS.length} terminadas${db ? " · se guardan para que Claude las lea" : " · no se pueden guardar (sin base de datos)"}.`);
  update();
  if (db) await db.doc(`pruebas/${runId}`).set({ startedAt: new Date().toISOString(), tier: (llm.inner as SampleLLM).tier, personas: PERSONAS.length }).catch(() => undefined);

  const queue = [...PERSONAS];
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const box = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = `${p.name} · en curso…`;
      const list = document.createElement("ol");
      list.className = "transcript";
      box.append(sum, list);
      out.append(box);
      const onTurn = (t: Turn) => {
        const li = document.createElement("li");
        li.className = t.who;
        li.textContent = `${t.who === "bot" ? "Bot" : "Paciente"}: ${t.text}${t.ui ? `  ⟨${t.ui}⟩` : ""}${t.note ? `  — ${t.note}` : ""}`;
        list.append(li);
      };
      try {
        const r = await runPersona(p, api, sample, onTurn);
        sum.textContent = `${p.name} · ${r.booked ? "reservó" : r.ended}`;
        if (db) await db.doc(`pruebas/${runId}/conversaciones/${p.id}`).set({ ...r, finishedAt: new Date().toISOString() }).catch(() => undefined);
      } catch (e: any) {
        sum.textContent = `${p.name} · error: ${e?.code ?? e?.message ?? e}`;
      }
      done++;
      update();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  status.textContent += " Listo: dile a Claude que ya puede leer los resultados.";
  btn.disabled = false;
}

// ---------- voice in the demo: Claude's dictation and voice instead of Whisper / the phone ----------
// The artifact viewer blocks the microphone for pages, so the demo uses the viewer's own
// capabilities. The real chat records audio and sends it to Whisper on Cloudflare.
async function setupVoice() {
  if (!window.claude) return;
  const [dictation, tts] = await Promise.all([
    window.claude.use("dictation").catch(() => null),
    window.claude.use("tts").catch(() => null),
  ]);
  if (dictation) {
    let finals: string[] = [];
    dictation.onFinal(({ text }: { text: string }) => finals.push(text));
    (window as any).kalmaVoice = {
      start(lang: string) {
        finals = [];
        return dictation.start({ language: lang }); // called straight from the click
      },
      async stop() {
        await dictation.stop();
        return finals.join(" ");
      },
      cancel() {
        finals = [];
        dictation.stop().catch(() => undefined);
      },
    };
    const mic = document.getElementById("mic");
    if (mic && !document.getElementById("composer")!.hidden) mic.hidden = false;
  }
  if (tts) {
    const speak = (text: string, lang: string) => tts.speak(text, { language: lang });
    (speak as any).stop = () => tts.stop().catch(() => undefined);
    (window as any).kalmaSpeak = speak;
  }
}
void setupVoice();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { setupPanel(); connectClaude(); });
else { setupPanel(); connectClaude(); }
