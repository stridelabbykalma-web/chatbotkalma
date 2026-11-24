import type { Lang } from "./types";

const LOCALES: Record<Lang, string> = { es: "es-ES", ca: "ca-ES", en: "en-GB" };

/** YYYY-MM-DD of an instant in the given time zone. */
export function localDate(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // en-CA formats as YYYY-MM-DD
}

/** HH:MM (24h) of an instant in the given time zone. */
export function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function localHour(d: Date, tz: string): number {
  return Number(localTime(d, tz).slice(0, 2));
}

/** ISO weekday 1 (Monday) .. 7 (Sunday) of an instant in the given time zone. */
export function localWeekday(d: Date, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

/** Offset (ms) of a time zone at a given instant: local wall time minus UTC. */
function tzOffsetMs(instantMs: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instantMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Converts a local wall time "YYYY-MM-DDTHH:MM[:SS]" in `tz` to a UTC ISO string ("...Z"). */
export function zonedToUtcIso(localWallTime: string, tz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(localWallTime);
  if (!m) return localWallTime;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let utc = guess - tzOffsetMs(guess, tz);
  utc = guess - tzOffsetMs(utc, tz); // second pass handles DST changes
  return new Date(utc).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(a + "T00:00:00Z");
  const pb = Date.parse(b + "T00:00:00Z");
  return Math.round((pb - pa) / 86400000);
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/** "jueves 27/11 a las 17:00" style label, in the patient's language. */
export function slotLabel(fromIso: string, tz: string, lang: Lang): string {
  const d = new Date(fromIso);
  const weekday = new Intl.DateTimeFormat(LOCALES[lang], { timeZone: tz, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d);
  const time = localTime(d, tz);
  const at = lang === "es" ? "a las" : lang === "ca" ? "a les" : "at";
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${cap} ${dm} ${at} ${time}`;
}

/** Today's date and weekday, for the system prompt. Date only, so the prompt cache lasts the day. */
export function todayContext(now: Date, tz: string): string {
  const weekday = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long" }).format(now);
  return `hoy es ${weekday} ${localDate(now, tz)} (${tz})`;
}
