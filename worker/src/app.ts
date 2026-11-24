import { runAgent } from "./agent";
import { confirmBooking, contactMessage, selectSlot, submitContact, type Deps } from "./booking";
import { t } from "./i18n";
import type { LLM } from "./llm";
import { normalizeName, normalizePhone, normalizeEmail } from "./validate";
import { LANGS, type BotMessage, type ChatResponse, type Lang, type SessionState } from "./types";

export interface AppDeps extends Deps {
  llm: LLM;
  verifyTurnstile: (token: unknown, ip: string) => Promise<boolean>;
  turnstileSiteKey?: string;
  allowedOrigins: string[];
}

const API = "/reservas/api";
const SESSION_TTL_MS = 24 * 3600_000;
const MAX_BODY = 8_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function errorResponse(code: string, status: number) {
  return json({ error: code }, status);
}

function originAllowed(req: Request, allowed: string[]): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true; // same-origin navigations and non-browser clients; CORS still blocks other sites
  if (allowed.length) return allowed.includes(origin);
  return origin === new URL(req.url).origin;
}

function ipLimited(ipHits: Map<string, number[]>, ip: string, perMinute: number, now: number): boolean {
  const list = (ipHits.get(ip) ?? []).filter((t0) => now - t0 < 60_000);
  list.push(now);
  ipHits.set(ip, list);
  if (ipHits.size > 5000) ipHits.clear();
  return list.length > perMinute;
}

/** Patient text can never pose as a system event. */
function sanitizeUserText(s: string, max: number): string {
  return s.replace(/<\/?\s*evento_sistema[^>]*>/gi, "").replace(/\u0000/g, "").trim().slice(0, max);
}

function appendEvent(session: SessionState, note: string, botMessages: BotMessage[]) {
  const shown = botMessages.map((m) => m.text).filter(Boolean).join(" ");
  session.history.push({ role: "user", content: `<evento_sistema>${note}</evento_sistema>` });
  session.history.push({ role: "assistant", content: [{ type: "text", text: shown || "(acción mostrada al paciente)" }] });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createApp(deps: AppDeps) {
  const limits = deps.cfg.settings.limits;
  // Best effort per isolate; add a Cloudflare rate-limiting rule for a global limit (see README).
  const ipHits = new Map<string, number[]>();

  /** Per-session rate limits, enforced in code. Returns a message if the request must stop. */
  function rateLimit(session: SessionState, countsAsMessage: boolean): BotMessage | null {
    const now = deps.now();
    session.recentRequests = session.recentRequests.filter((t0) => now - t0 < 60_000);
    if (session.recentRequests.length >= limits.messages_per_minute) return { text: t(session.lang, "rate_minute") };
    if (countsAsMessage && session.userMessages >= limits.messages_per_conversation) return contactMessage(deps, t(session.lang, "rate_total"));
    session.recentRequests.push(now);
    if (countsAsMessage) session.userMessages += 1;
    return null;
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith(API)) return errorResponse("not_found", 404);
    const route = path.slice(API.length);

    if (req.method === "GET" && route === "/config") {
      const c = deps.cfg.settings;
      return json({
        turnstileSiteKey: deps.turnstileSiteKey ?? null,
        center: { name: c.center.name, phone: c.center.phone || null, whatsapp: c.center.whatsapp || null, email: c.center.email || null },
        privacy: c.privacy,
        mode: c.booking.mode,
      });
    }

    if (req.method !== "POST") return errorResponse("method_not_allowed", 405);
    if (!originAllowed(req, deps.allowedOrigins)) return errorResponse("forbidden_origin", 403);
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    if (ipLimited(ipHits, ip, limits.requests_per_minute_per_ip, deps.now())) return errorResponse("rate_limited", 429);
    const body = await readBody(req);
    if (!body) return errorResponse("bad_request", 400);

    if (route === "/session") {
      if (body.privacyAccepted !== true) return errorResponse("privacy_not_accepted", 400);
      if (!(await deps.verifyTurnstile(body.turnstileToken, ip))) return errorResponse("bot_check_failed", 403);
      const lang: Lang = LANGS.includes(body.lang as Lang) ? (body.lang as Lang) : "es";
      const now = deps.now();
      const session: SessionState = {
        id: deps.randomId(),
        lang,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
        history: [],
        userMessages: 0,
        recentRequests: [],
        offered: {},
        bookedInSession: 0,
      };
      await deps.store.put(session);
      deps.logger.event("session_start", { sid: session.id, lang });
      return json({ sessionId: session.id, messages: [{ text: t(lang, "greeting") }] } satisfies ChatResponse & { sessionId: string });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return errorResponse("no_session", 400);

    if (route === "/end") {
      await deps.store.delete(sessionId);
      deps.logger.event("session_end", { sid: sessionId });
      return json({ messages: [], ended: true });
    }

    // Confirmation is handled first and atomically: the token is single-use.
    if (route === "/action" && (body.action as any)?.type === "confirm") {
      const pre = await deps.store.get(sessionId);
      if (!pre) return errorResponse("session_expired", 410);
      const limited = rateLimit(pre, false);
      if (limited) return json({ messages: [limited] });
      await deps.store.put(pre);
      const { session, outcome } = await confirmBooking(deps, sessionId, (body.action as any).token);
      if (!session) return errorResponse("session_expired", 410);
      if (outcome.historyNote) appendEvent(session, outcome.historyNote, outcome.messages);
      await deps.store.put(session);
      return json({ messages: outcome.messages } satisfies ChatResponse);
    }

    const session = await deps.store.get(sessionId);
    if (!session) return errorResponse("session_expired", 410);

    if (route === "/chat") {
      const max = limits.max_message_chars;
      const text = typeof body.text === "string" ? sanitizeUserText(body.text, max) : "";
      if (!text) return errorResponse("empty_message", 400);
      const limited = rateLimit(session, true);
      if (limited) {
        await deps.store.put(session);
        return json({ messages: [limited] });
      }
      const messages = await runAgent(deps, session, text);
      await deps.store.put(session);
      return json({ messages } satisfies ChatResponse);
    }

    if (route === "/action") {
      const action = (body.action ?? {}) as Record<string, unknown>;
      const limited = rateLimit(session, false);
      if (limited) {
        await deps.store.put(session);
        return json({ messages: [limited] });
      }
      let messages: BotMessage[];
      switch (action.type) {
        case "select_slot":
          messages = selectSlot(deps, session, action.slotId);
          appendEvent(session, "El paciente ha elegido un hueco y el sistema le pide sus datos en un formulario.", messages);
          break;
        case "submit_contact":
          messages = await submitContact(deps, session, action.data);
          if (messages.some((m) => m.ui?.type === "summary")) {
            appendEvent(session, "El paciente ha enviado sus datos; se le muestra el resumen con el botón Confirmar. La cita aún NO está hecha.", messages);
          }
          break;
        case "cancel_pending":
          session.pending = undefined;
          session.contact = undefined;
          messages = [{ text: t(session.lang, "cancelled_pending") }];
          appendEvent(session, "El paciente ha cancelado el resumen; no se ha reservado nada.", messages);
          break;
        case "submit_callback": {
          const d = (action.data ?? {}) as Record<string, unknown>;
          const name = normalizeName(d.name);
          const phone = normalizePhone(d.phone);
          if (!name || !phone) {
            messages = [{ text: t(session.lang, "invalid_contact", { fields: [!name && t(session.lang, "field_firstName"), !phone && t(session.lang, "field_phone")].filter(Boolean).join(", ") }), ui: { type: "callback_form" } }];
            break;
          }
          const sent = await deps.mailer.send({
            reason: session.derivation === undefined ? "callback_request" : (session.derivation as any),
            name,
            phone,
            email: normalizeEmail(d.email) ?? undefined,
          });
          deps.logger.event("staff_notified", { sid: session.id, reason: session.derivation ?? "callback_request", ok: sent });
          messages = sent ? [{ text: t(session.lang, "callback_thanks") }] : [contactMessage(deps, t(session.lang, "team_confirms"))];
          appendEvent(session, sent ? "El paciente ha dejado su contacto y el equipo ha sido avisado." : "No se pudo avisar al equipo; se ha mostrado el contacto.", messages);
          break;
        }
        default:
          return errorResponse("unknown_action", 400);
      }
      await deps.store.put(session);
      return json({ messages } satisfies ChatResponse);
    }

    return errorResponse("not_found", 404);
  }

  return { handle };
}
