/**
 * Structured logs WITHOUT personal data: only session ids, action names, codes and counts.
 * Never pass names, phones, emails, chat text or Docfav response bodies here.
 */
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  event(action: string, fields?: LogFields): void;
}

const ALLOWED_KEYS = new Set([
  "sid", "code", "status", "tool", "service", "count", "ms", "lang", "reason", "topic", "mode", "model", "stop", "ok",
]);

export function scrubFields(fields: LogFields = {}): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(k) || v === undefined) continue;
    out[k] = typeof v === "string" ? scrubText(v).slice(0, 120) : v;
  }
  return out;
}

/** Removes things that look like emails, phone numbers, ID cards or long digit runs. */
export function scrubText(s: string): string {
  return s
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .replace(/\b\d{8}[A-Za-z]\b/g, "[id]")
    .replace(/\b[XYZxyz]\d{7}[A-Za-z]\b/g, "[id]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[num]");
}

export const consoleLogger: Logger = {
  event(action, fields) {
    console.log(JSON.stringify({ action, ...scrubFields(fields) }));
  },
};

export class MemoryLogger implements Logger {
  lines: string[] = [];
  event(action: string, fields?: LogFields) {
    this.lines.push(JSON.stringify({ action, ...scrubFields(fields) }));
  }
}
