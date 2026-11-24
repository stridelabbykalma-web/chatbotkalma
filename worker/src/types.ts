import type Anthropic from "@anthropic-ai/sdk";

export type Lang = "es" | "ca" | "en";
export const LANGS: Lang[] = ["es", "ca", "en"];

export type Localized = Record<Lang, string>;

/** A bookable start time offered to the patient. The id is what the browser sends back. */
export interface OfferedSlot {
  id: string;
  serviceId: string; // config service id
  staffKey: string;
  staffCalendarId: string;
  from: string; // ISO UTC
  to: string; // ISO UTC
}

export interface AvailabilityQuery {
  serviceId: string;
  staffKey?: string;
  dateFrom: string; // YYYY-MM-DD local
  dateTo: string; // YYYY-MM-DD local
  partOfDay?: "morning" | "afternoon";
  weekdays?: number[];
}

export interface ContactData {
  firstName: string;
  lastName: string;
  phone: string; // E.164
  email: string; // lowercase
  clientId?: string; // existing Docfav client matched by email
  staffNote?: "phone_mismatch" | "possible_duplicate";
}

export interface PendingConfirmation {
  token: string;
  slotId: string;
  expiresAt: number;
}

export interface SessionState {
  id: string;
  lang: Lang;
  createdAt: number;
  expiresAt: number;
  history: Anthropic.Beta.BetaMessageParam[];
  userMessages: number;
  recentRequests: number[];
  offered: Record<string, OfferedSlot>;
  lastQuery?: AvailabilityQuery;
  selectedSlotId?: string;
  contact?: ContactData;
  pending?: PendingConfirmation;
  bookedInSession: number;
  derivation?: string; // reason of the last derivation, for the optional callback form
}

export type UiElement =
  | { type: "options"; options: string[] }
  | { type: "slots"; slots: { id: string; label: string }[] }
  | { type: "contact_form"; slotLabel: string }
  | { type: "summary"; token: string; lines: string[] }
  | { type: "contact"; phone?: string; whatsapp?: string; email?: string }
  | { type: "callback_form" }
  | { type: "portal"; url: string };

export interface BotMessage {
  text: string;
  ui?: UiElement;
}

export interface ChatResponse {
  messages: BotMessage[];
  ended?: boolean;
}
