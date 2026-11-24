import { parsePhoneNumberFromString } from "libphonenumber-js/min";

const NAME_RE = /^[\p{L}][\p{L}\p{M}'’ .-]{0,59}$/u;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!NAME_RE.test(s) || /\d/.test(s)) return null;
  return s;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

/** Spanish numbers without prefix, or international with +/00. Returns E.164 or null. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^00/, "+");
  if (!/^[+\d][\d\s().-]{5,24}$/.test(s)) return null;
  const p = parsePhoneNumberFromString(s, "ES");
  if (!p || !p.isValid()) return null;
  return p.number;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export function validateContact(input: unknown):
  | { ok: true; value: ContactInput }
  | { ok: false; invalid: (keyof ContactInput)[] } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const firstName = normalizeName(o.firstName);
  const lastName = normalizeName(o.lastName);
  const phone = normalizePhone(o.phone);
  const email = normalizeEmail(o.email);
  const invalid: (keyof ContactInput)[] = [];
  if (!firstName) invalid.push("firstName");
  if (!lastName) invalid.push("lastName");
  if (!phone) invalid.push("phone");
  if (!email) invalid.push("email");
  if (invalid.length) return { ok: false, invalid };
  return { ok: true, value: { firstName: firstName!, lastName: lastName!, phone: phone!, email: email! } };
}
