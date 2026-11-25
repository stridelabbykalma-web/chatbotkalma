import { createApp, type AppDeps } from "./app";
import { loadConfig } from "./config";
import { DocfavApi } from "./docfav/api";
import { DocfavMock, DryRunDocfav } from "./docfav/mock";
import type { DocfavClient } from "./docfav/types";
import { DemoLLM } from "./demo-llm";
import { AnthropicLLM } from "./llm";
import { consoleLogger } from "./log";
import { BrevoMailer, noopMailer } from "./notify";
import { DurableStore } from "./store";
import { STATIC_FILES } from "./static";
import { verifyTurnstile } from "./turnstile";

export { SessionDO } from "./store";

export interface Env {
  AI?: Ai;
  SESSIONS: DurableObjectNamespace;
  // secrets (wrangler secret put ...)
  ANTHROPIC_API_KEY?: string;
  DOCFAV_API_KEY?: string;
  BREVO_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  // plain vars (wrangler.toml)
  DRY_RUN?: string;
  DOCFAV_MODE?: string; // "api" | "mock"
  AI_MODEL?: string;
  AI_EFFORT?: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_SITE_KEY?: string;
  DEBUG_ERRORS?: string; // "true" only locally: prints error messages (may contain data)
  SESSIONS_JURISDICTION?: string; // "eu" (default). "none" only for local development: workerd has no jurisdictions
}

let app: ReturnType<typeof createApp> | undefined;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Workers AI Whisper: Spanish, Catalan and English, language detected automatically. */
async function transcribeWithWhisper(ai: Ai, audio: ArrayBuffer): Promise<string> {
  const out = (await (ai as any).run("@cf/openai/whisper-large-v3-turbo", { audio: toBase64(audio) })) as { text?: string };
  return (out?.text ?? "").trim();
}

function randomId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function build(env: Env) {
  const cfg = loadConfig();
  const dryRun = env.DRY_RUN === "true";
  let docfav: DocfavClient;
  // The mock is only used when asked for explicitly: a missing key must fail loudly, never fake bookings.
  if (env.DOCFAV_MODE === "mock") {
    const staffCals = cfg.settings.staff.map((s) => s.staff_calendar_id);
    docfav = new DocfavMock(
      cfg.services.map((s) => ({ id: s.docfav_service_id, name: s.name.es, amountCents: 0, durationMin: 30, isActive: true, staffCalendarIds: staffCals })),
      staffCals,
    );
  } else {
    docfav = new DocfavApi(env.DOCFAV_API_KEY ?? "", cfg.settings.docfav.clinic_id, cfg.settings.docfav.calendar_id, fetch, cfg.settings.docfav.available_slots_local_time !== false);
  }
  if (dryRun) docfav = new DryRunDocfav(docfav);
  const n = cfg.settings.notify;
  const effort = env.AI_EFFORT === "medium" || env.AI_EFFORT === "high" ? env.AI_EFFORT : "low";
  const deps: AppDeps = {
    cfg,
    docfav,
    store: new DurableStore(env.SESSIONS, env.SESSIONS_JURISDICTION === "none" ? null : "eu"),
    mailer: env.BREVO_API_KEY && n.to_email && n.from_email ? new BrevoMailer(env.BREVO_API_KEY, n.to_email, n.from_email, n.from_name) : noopMailer,
    logger: consoleLogger,
    now: () => Date.now(),
    randomId,
    dryRun,
    llm: env.AI_MODEL === "demo" ? new DemoLLM() : new AnthropicLLM(env.ANTHROPIC_API_KEY ?? "", env.AI_MODEL || "claude-opus-5-5", effort),
    verifyTurnstile: (token, ip) => verifyTurnstile(env.TURNSTILE_SECRET, token, ip),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    transcribe: env.AI ? (audio) => transcribeWithWhisper(env.AI!, audio) : undefined,
  };
  return createApp(deps);
}

const PAGE_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-src https://challenges.cloudflare.com https://www.docfav.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/reservas/api/")) {
      app ??= build(env);
      try {
        return await app.handle(req);
      } catch (e) {
        consoleLogger.event("unhandled_error", { code: e instanceof Error ? e.name : "UNKNOWN" });
        if (env.DEBUG_ERRORS === "true") console.error(e);
        return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    if (url.pathname === "/reservas") return Response.redirect(new URL("/reservas/", url).toString(), 301);
    if (url.pathname.startsWith("/reservas/")) {
      const file = STATIC_FILES[url.pathname.slice("/reservas".length) || "/"];
      if (!file || req.method !== "GET") return new Response("Not found", { status: 404 });
      return new Response(file.body, {
        headers: { "Content-Type": file.type, "Cache-Control": "no-cache", ...PAGE_HEADERS },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
