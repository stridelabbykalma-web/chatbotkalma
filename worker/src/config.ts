import settingsJson from "../../config/settings.json";
import servicesJson from "../../config/services.json";
import knowledgeMd from "../../config/knowledge.md";
import type { Lang, Localized } from "./types";

export interface StaffConfig {
  key: string;
  name: string;
  staff_id: string;
  staff_calendar_id: string;
}

export interface ServiceConfig {
  id: string;
  docfav_service_id: string;
  brand: string;
  name: Localized;
  /** What the service is, in Spanish (the AI translates). */
  summary: string;
  /** Typical reasons a patient needs it, in Spanish. */
  for: string;
  professionals: string[];
  bookable_online: boolean;
  price_eur: number | null;
  duration_min: number | null;
  bring: Localized;
}

export interface Settings {
  center: {
    name: string;
    brands: string[];
    address: string;
    maps_url: string;
    phone: string;
    whatsapp: string;
    email: string;
    hours: Localized;
  };
  booking: {
    mode: "api" | "portal";
    portal_url: string;
    timezone: string;
    min_lead_hours: number;
    search_days_default: number;
    horizon_days: number;
    max_slots_offered: number;
    max_slots_per_day: number;
    max_future_chat_appointments: number;
    confirmation_token_ttl_minutes: number;
    appointment_behaviour: "confirmed" | "pending";
    send_reminder: boolean;
    appointment_note: string;
    cancel_min_hours: number;
  };
  limits: {
    messages_per_minute: number;
    messages_per_conversation: number;
    requests_per_minute_per_ip: number;
    max_message_chars: number;
  };
  privacy: { controller: string; nif: string; contact_email: string; policy_url: string };
  notify: { to_email: string; from_email: string; from_name: string };
  docfav: { clinic_id: string; calendar_id: string };
  staff: StaffConfig[];
}

export interface AppConfig {
  settings: Settings;
  services: ServiceConfig[];
  knowledge: string;
}

/** Removes HTML comments and sections still marked PENDIENTE, so the AI never sees placeholders. */
export function cleanKnowledge(md: string): string {
  const noComments = md.replace(/<!--[\s\S]*?-->/g, "");
  const sections = noComments.split(/\n(?=## )/);
  return sections
    .filter((s) => {
      const body = s.split("\n").slice(1).join("\n").trim();
      return body !== "" && body !== "PENDIENTE";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function loadConfig(): AppConfig {
  // Deep copies: nothing at runtime can modify the bundled configuration.
  const { _comment, ...settings } = structuredClone(settingsJson) as Settings & { _comment?: string };
  return {
    settings: settings as Settings,
    services: structuredClone((servicesJson as { services: ServiceConfig[] }).services),
    knowledge: cleanKnowledge(knowledgeMd),
  };
}

export function serviceName(s: ServiceConfig, lang: Lang): string {
  return s.name[lang] || s.name.es;
}

export function staffByKey(cfg: AppConfig, key: string): StaffConfig | undefined {
  return cfg.settings.staff.find((s) => s.key === key);
}
