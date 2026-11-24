import type { AppConfig } from "./config";
import type { Lang } from "./types";
import { t } from "./i18n";

export interface ServiceFacts {
  /** config service id -> { priceEur, durationMin } (merged from services.json and Docfav) */
  [serviceId: string]: { priceEur: number | null; durationMin: number | null };
}

export function formatPrice(eur: number | null, lang: Lang): string {
  if (eur === null || !(eur > 0)) return t(lang, "price_free");
  const n = Number.isInteger(eur) ? String(eur) : eur.toFixed(2).replace(".", lang === "en" ? "." : ",");
  return lang === "en" ? `€${n}` : `${n} €`;
}

/**
 * Replaces {{...}} markers written by the AI with values from the configuration.
 * Unknown markers or missing values become "ask the team" instead of a guess.
 */
export function renderPlaceholders(text: string, cfg: AppConfig, facts: ServiceFacts, lang: Lang): string {
  const c = cfg.settings.center;
  const unknown = t(lang, "unknown_value");
  return text.replace(/\{\{\s*([a-z_]+)(?::([a-z0-9_]+))?\s*\}\}/gi, (_m, key: string, arg?: string) => {
    const k = key.toLowerCase();
    const pick = (v: string) => (v && v.trim() ? v : unknown);
    switch (k) {
      case "telefono":
      case "phone":
        return pick(c.phone);
      case "whatsapp":
        return pick(c.whatsapp);
      case "email":
        return pick(c.email);
      case "direccion":
      case "address":
        return pick(c.address);
      case "horario":
      case "hours":
        return pick(c.hours[lang] || c.hours.es);
      case "precio":
      case "price": {
        const f = arg ? facts[arg] : undefined;
        return f ? formatPrice(f.priceEur, lang) : unknown;
      }
      case "duracion":
      case "duration": {
        const f = arg ? facts[arg] : undefined;
        return f && f.durationMin ? `${f.durationMin} min` : unknown;
      }
      default:
        return unknown;
    }
  });
}

/**
 * Facts that only the configuration may state. If the AI writes them itself
 * (a price in euros or a phone number), the reply is discarded.
 */
export function violatesFactGuard(rawAiText: string): "price" | "phone" | null {
  const withoutMarkers = rawAiText.replace(/\{\{[^}]*\}\}/g, "");
  if (/\d\s*(€|eur\b|euros?\b)|€\s*\d/i.test(withoutMarkers)) return "price";
  const withoutDates = withoutMarkers
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, "");
  if (/(\+|\b00)?\d[\d .-]{7,}\d/.test(withoutDates)) return "phone";
  return null;
}
