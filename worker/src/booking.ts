import type { AppConfig, ServiceConfig, StaffConfig } from "./config";
import { serviceName, staffByKey } from "./config";
import type { DfService, DocfavClient } from "./docfav/types";
import { DocfavError } from "./docfav/types";
import { t } from "./i18n";
import type { Logger } from "./log";
import type { Mailer } from "./notify";
import { formatPrice, type ServiceFacts } from "./render";
import type { SessionStore } from "./store";
import { addDays, daysBetween, isYmd, localDate, localHour, localWeekday, slotLabel } from "./time";
import type { AvailabilityQuery, BotMessage, Lang, OfferedSlot, SessionState } from "./types";
import { validateContact } from "./validate";

export interface Deps {
  cfg: AppConfig;
  docfav: DocfavClient;
  store: SessionStore;
  mailer: Mailer;
  logger: Logger;
  now: () => number;
  randomId: () => string;
  dryRun: boolean;
  catalogCache?: { at: number; services: DfService[] };
}

export interface CatalogEntry {
  cfg: ServiceConfig;
  df?: DfService;
  priceEur: number | null;
  durationMin: number | null;
  bookable: boolean;
  staff: StaffConfig[];
}

const CATALOG_TTL_MS = 10 * 60_000;

/** services.json merged with the live Docfav catalogue. Prices/durations: config override, else Docfav. */
export async function getCatalog(deps: Deps): Promise<{ entries: CatalogEntry[]; docfavOk: boolean }> {
  let dfServices: DfService[] | undefined;
  let docfavOk = true;
  const cache = deps.catalogCache;
  if (cache && deps.now() - cache.at < CATALOG_TTL_MS) {
    dfServices = cache.services;
  } else {
    try {
      dfServices = await deps.docfav.listServices();
      deps.catalogCache = { at: deps.now(), services: dfServices };
    } catch (e) {
      docfavOk = false;
      deps.logger.event("docfav_error", { tool: "listServices", code: e instanceof DocfavError ? e.code : "UNKNOWN" });
    }
  }
  const entries = deps.cfg.services.map((s) => {
    const df = dfServices?.find((d) => d.id === s.docfav_service_id);
    const staff = s.professionals
      .map((k) => staffByKey(deps.cfg, k))
      .filter((x): x is StaffConfig => !!x)
      .filter((st) => !df || df.staffCalendarIds.includes(st.staff_calendar_id));
    return {
      cfg: s,
      df,
      priceEur: s.price_eur ?? (df ? df.amountCents / 100 : null),
      durationMin: s.duration_min ?? df?.durationMin ?? null,
      bookable: s.bookable_online && !!df && df.isActive && staff.length > 0 && !!(s.duration_min ?? df?.durationMin),
      staff,
    };
  });
  return { entries, docfavOk };
}

export function factsFrom(entries: CatalogEntry[]): ServiceFacts {
  return Object.fromEntries(entries.map((e) => [e.cfg.id, { priceEur: e.priceEur, durationMin: e.durationMin }]));
}

export type AvailabilityResult =
  | { ok: true; slots: OfferedSlot[]; query: AvailabilityQuery }
  | { ok: false; error: "unknown_service" | "not_bookable_online" | "unknown_professional" | "agenda_unavailable" };

/** Normalises the AI's preferences to a safe window: from today+lead to the booking horizon, max 14 days. */
export function normaliseQuery(deps: Deps, q: Partial<AvailabilityQuery> & { serviceId: string }): AvailabilityQuery {
  const b = deps.cfg.settings.booking;
  const today = localDate(new Date(deps.now()), b.timezone);
  const last = addDays(today, b.horizon_days);
  let from = isYmd(q.dateFrom) && q.dateFrom > today ? q.dateFrom : today;
  if (from > last) from = last;
  let to = isYmd(q.dateTo) && q.dateTo >= from ? q.dateTo : addDays(from, b.search_days_default - 1);
  if (daysBetween(from, to) > 13) to = addDays(from, 13);
  if (to > last) to = last;
  const weekdays = Array.isArray(q.weekdays) ? q.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : undefined;
  return {
    serviceId: q.serviceId,
    staffKey: q.staffKey,
    dateFrom: from,
    dateTo: to,
    partOfDay: q.partOfDay === "morning" || q.partOfDay === "afternoon" ? q.partOfDay : undefined,
    weekdays: weekdays && weekdays.length ? weekdays : undefined,
  };
}

/** get_availability: real free slots from Docfav, filtered and limited by code. */
export async function findSlots(
  deps: Deps,
  session: SessionState,
  rawQuery: Partial<AvailabilityQuery> & { serviceId: string },
  exclude: OfferedSlot[] = [],
): Promise<AvailabilityResult> {
  const { entries } = await getCatalog(deps);
  const entry = entries.find((e) => e.cfg.id === rawQuery.serviceId);
  if (!entry) return { ok: false, error: "unknown_service" };
  if (!entry.df) return { ok: false, error: "agenda_unavailable" };
  if (!entry.bookable) return { ok: false, error: "not_bookable_online" };
  let staff = entry.staff;
  if (rawQuery.staffKey) {
    staff = staff.filter((s) => s.key === rawQuery.staffKey);
    if (!staff.length) return { ok: false, error: "unknown_professional" };
  }
  const query = normaliseQuery(deps, { ...rawQuery, staffKey: staff.length === 1 && rawQuery.staffKey ? staff[0].key : rawQuery.staffKey });
  const b = deps.cfg.settings.booking;
  const tz = b.timezone;
  const duration = entry.durationMin!;
  const earliest = deps.now() + b.min_lead_hours * 3600_000;

  let data;
  try {
    data = await deps.docfav.getAvailableSlots({
      startDate: query.dateFrom,
      endDate: query.dateTo,
      serviceId: entry.df.id,
      staffCalendarId: staff.length === 1 ? staff[0].staff_calendar_id : undefined,
      period: query.partOfDay,
    });
  } catch (e) {
    deps.logger.event("docfav_error", { sid: session.id, tool: "getAvailableSlots", code: e instanceof DocfavError ? e.code : "UNKNOWN" });
    return { ok: false, error: "agenda_unavailable" };
  }

  const excluded = new Set(exclude.map((s) => `${s.staffCalendarId}|${s.from}`));
  const candidates: OfferedSlot[] = [];
  for (const st of data) {
    const member = staff.find((s) => s.staff_calendar_id === st.staffCalendarId);
    if (!member) continue;
    const slots = [...st.slots].sort((a, c) => a.from.localeCompare(c.from));
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].available) continue;
      const start = Date.parse(slots[i].from);
      const end = start + duration * 60_000;
      // the service needs consecutive free slots covering its whole duration
      let covered = Date.parse(slots[i].to);
      let j = i + 1;
      while (covered < end && j < slots.length && slots[j].available && Date.parse(slots[j].from) === covered) {
        covered = Date.parse(slots[j].to);
        j++;
      }
      if (covered < end) continue;
      if (start < earliest) continue;
      const d = new Date(start);
      const day = localDate(d, tz);
      if (day < query.dateFrom || day > query.dateTo) continue;
      if (query.partOfDay === "morning" && localHour(d, tz) >= 14) continue;
      if (query.partOfDay === "afternoon" && localHour(d, tz) < 14) continue;
      if (query.weekdays && !query.weekdays.includes(localWeekday(d, tz))) continue;
      const fromIso = new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z");
      if (excluded.has(`${member.staff_calendar_id}|${fromIso}`)) continue;
      candidates.push({
        id: "",
        serviceId: entry.cfg.id,
        staffKey: member.key,
        staffCalendarId: member.staff_calendar_id,
        from: fromIso,
        to: new Date(end).toISOString().replace(/\.\d{3}Z$/, "Z"),
      });
    }
  }

  // Earliest first, one professional per start time (rotating among those free, so "me da igual"
  // does not always land on the same person), max N per day spread at least 2 h apart.
  candidates.sort((a, c) => a.from.localeCompare(c.from) || staffOrder(staff, a.staffKey) - staffOrder(staff, c.staffKey));
  const byStart = new Map<string, OfferedSlot[]>();
  for (const c of candidates) byStart.set(c.from, [...(byStart.get(c.from) ?? []), c]);
  const picks = new Map<string, number>();
  const chosen: OfferedSlot[] = [];
  const perDay = new Map<string, number[]>();
  for (const group of byStart.values()) {
    if (chosen.length >= b.max_slots_offered) break;
    const day = localDate(new Date(group[0].from), tz);
    const times = perDay.get(day) ?? [];
    if (times.length >= b.max_slots_per_day) continue;
    const t0 = Date.parse(group[0].from);
    if (times.some((t1) => Math.abs(t1 - t0) < 2 * 3600_000)) continue;
    // stable sort: least-offered professional first, then the configured order
    const c = [...group].sort((a, d) => (picks.get(a.staffKey) ?? 0) - (picks.get(d.staffKey) ?? 0))[0];
    times.push(t0);
    perDay.set(day, times);
    picks.set(c.staffKey, (picks.get(c.staffKey) ?? 0) + 1);
    chosen.push({ ...c, id: deps.randomId().slice(0, 12) });
  }

  session.offered = Object.fromEntries(chosen.map((s) => [s.id, s]));
  session.lastQuery = query;
  return { ok: true, slots: chosen, query };
}

function staffOrder(staff: StaffConfig[], key: string) {
  const i = staff.findIndex((s) => s.key === key);
  return i < 0 ? 99 : i;
}

export function labelFor(deps: Deps, slot: OfferedSlot, lang: Lang): string {
  return slotLabel(slot.from, deps.cfg.settings.booking.timezone, lang);
}

/** Internal only (emails to the centre). Never shown to the patient or the AI. */
export function staffName(deps: Deps, key: string): string {
  return staffByKey(deps.cfg, key)?.name ?? key;
}

/** Patient-facing slot buttons: date and time only. The professional is never shown. */
export function slotsUi(deps: Deps, slots: OfferedSlot[], lang: Lang) {
  return {
    type: "slots" as const,
    slots: slots.map((s) => ({
      id: s.id,
      label: labelFor(deps, s, lang),
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Actions that never go through the AI: choosing a slot, giving contact data, confirming.
// ---------------------------------------------------------------------------------------

export function selectSlot(deps: Deps, session: SessionState, slotId: unknown): BotMessage[] {
  const slot = typeof slotId === "string" ? session.offered[slotId] : undefined;
  if (!slot) return [{ text: t(session.lang, "slot_expired") }];
  session.selectedSlotId = slot.id;
  session.pending = undefined;
  const label = labelFor(deps, slot, session.lang);
  return [{ text: t(session.lang, "ask_contact", { slot: label }), ui: { type: "contact_form", slotLabel: label } }];
}

function contactUi(deps: Deps) {
  const c = deps.cfg.settings.center;
  return { type: "contact" as const, phone: c.phone || undefined, whatsapp: c.whatsapp || undefined, email: c.email || undefined };
}

export function contactMessage(deps: Deps, text: string): BotMessage {
  return { text, ui: contactUi(deps) };
}

/** Counts upcoming appointments created from the chat (identified by the note). */
async function futureChatAppointments(deps: Deps, clientId: string): Promise<number> {
  const b = deps.cfg.settings.booking;
  const from = new Date(deps.now()).toISOString();
  const to = new Date(deps.now() + b.horizon_days * 86400_000).toISOString();
  const list = await deps.docfav.listClientAppointments(clientId, from, to);
  return list.filter((a) => (a.note ?? "").startsWith(b.appointment_note) && !/cancel/i.test(a.status)).length;
}

export async function submitContact(deps: Deps, session: SessionState, input: unknown): Promise<BotMessage[]> {
  const lang = session.lang;
  const slot = session.selectedSlotId ? session.offered[session.selectedSlotId] : undefined;
  if (!slot) return [{ text: t(lang, "slot_expired") }];
  const v = validateContact(input);
  if (!v.ok) {
    const fields = v.invalid.map((f) => t(lang, `field_${f}` as const)).join(", ");
    return [{ text: t(lang, "invalid_contact", { fields }), ui: { type: "contact_form", slotLabel: labelFor(deps, slot, lang) } }];
  }
  const b = deps.cfg.settings.booking;
  if (session.bookedInSession >= b.max_future_chat_appointments) {
    return [contactMessage(deps, t(lang, "limit_reached", { n: b.max_future_chat_appointments }))];
  }

  const c = v.value;
  let clientId: string | undefined;
  let staffNote: "phone_mismatch" | "possible_duplicate" | undefined;
  try {
    // Existing patient = same email (Docfav enforces unique emails). The confirmation email goes
    // to that address, so nobody can silently book in someone else's name.
    const byEmail = (await deps.docfav.searchClients(c.email)).filter((h) => (h.email ?? "").toLowerCase() === c.email);
    if (byEmail.length) {
      clientId = byEmail[0].id;
      const phones = byEmail.map((h) => (h.phone ?? "").replace(/[^\d+]/g, ""));
      if (!phones.some((p) => p && (p === c.phone || c.phone.endsWith(p.replace(/^\+?34/, ""))))) staffNote = "phone_mismatch";
      const n = await futureChatAppointments(deps, clientId);
      if (n >= b.max_future_chat_appointments) {
        deps.logger.event("limit_reached", { sid: session.id, count: n });
        return [contactMessage(deps, t(lang, "limit_reached", { n: b.max_future_chat_appointments }))];
      }
    } else {
      const national = c.phone.replace(/^\+34/, "");
      const byPhone = await deps.docfav.searchClients(national);
      if (byPhone.length) staffNote = "possible_duplicate";
    }
  } catch (e) {
    deps.logger.event("docfav_error", { sid: session.id, tool: "findPatient", code: e instanceof DocfavError ? e.code : "UNKNOWN" });
    return [contactMessage(deps, t(lang, "agenda_down"))];
  }

  session.contact = { ...c, clientId, staffNote };
  const token = deps.randomId();
  session.pending = { token, slotId: slot.id, expiresAt: deps.now() + b.confirmation_token_ttl_minutes * 60_000 };

  const { entries } = await getCatalog(deps);
  const entry = entries.find((e) => e.cfg.id === slot.serviceId);
  const lines = [
    `${labelFor(deps, slot, lang)} · ${entry ? serviceName(entry.cfg, lang) : slot.serviceId} · ${deps.cfg.settings.center.name}`,
    t(lang, "summary_price", { price: formatPrice(entry?.priceEur ?? null, lang) }),
    t(lang, "summary_for", { name: `${c.firstName} ${c.lastName}` }),
  ];
  deps.logger.event("summary_shown", { sid: session.id, service: slot.serviceId });
  return [{ text: t(lang, "summary_intro"), ui: { type: "summary", token, lines } }];
}

/** Re-offers slots for the last query, skipping the ones that just failed. */
async function reoffer(deps: Deps, session: SessionState, introKey: "slot_taken" | "token_invalid" | "slot_expired", failed: OfferedSlot[]): Promise<BotMessage[]> {
  const lang = session.lang;
  if (!session.lastQuery) return [{ text: t(lang, introKey) }];
  const r = await findSlots(deps, session, session.lastQuery, failed);
  if (!r.ok) return [contactMessage(deps, t(lang, "agenda_down"))];
  if (!r.slots.length) return [{ text: t(lang, introKey) }, { text: t(lang, "no_slots") }];
  return [{ text: t(lang, introKey), ui: slotsUi(deps, r.slots, lang) }];
}

export interface ConfirmOutcome {
  messages: BotMessage[];
  booked: boolean;
  historyNote: string; // what the AI is told happened (no personal data)
}

export async function confirmBooking(deps: Deps, sessionId: string, token: unknown): Promise<{ session: SessionState | null; outcome: ConfirmOutcome }> {
  const consumed = typeof token === "string" ? await deps.store.consumeToken(sessionId, token, deps.now()) : null;
  if (!consumed) {
    const session = await deps.store.get(sessionId);
    if (!session) return { session: null, outcome: { messages: [], booked: false, historyNote: "" } };
    const messages = await reoffer(deps, session, "token_invalid", []);
    return { session, outcome: { messages, booked: false, historyNote: "La confirmación había caducado; se han vuelto a ofrecer huecos." } };
  }
  const session = consumed;
  const lang = session.lang;
  const pending = session.pending!;
  session.pending = undefined;
  const slot = session.offered[pending.slotId];
  const contact = session.contact;
  const b = deps.cfg.settings.booking;
  if (!slot || !contact) {
    return { session, outcome: { messages: await reoffer(deps, session, "token_invalid", []), booked: false, historyNote: "Confirmación no válida; se han vuelto a ofrecer huecos." } };
  }
  if (Date.parse(slot.from) < deps.now() + b.min_lead_hours * 3600_000) {
    return { session, outcome: { messages: await reoffer(deps, session, "slot_taken", [slot]), booked: false, historyNote: "El hueco elegido ya no cumple la antelación mínima; se han ofrecido otros." } };
  }
  if (session.bookedInSession >= b.max_future_chat_appointments) {
    return { session, outcome: { messages: [contactMessage(deps, t(lang, "limit_reached", { n: b.max_future_chat_appointments }))], booked: false, historyNote: "Límite de citas alcanzado." } };
  }

  const { entries } = await getCatalog(deps);
  const entry = entries.find((e) => e.cfg.id === slot.serviceId);
  if (!entry?.df || !entry.bookable) {
    return { session, outcome: { messages: [contactMessage(deps, t(lang, "booking_failed"))], booked: false, historyNote: "La reserva ha fallado; no se ha creado ninguna cita." } };
  }

  // 1) Revalidate the slot just before writing.
  try {
    const free = await deps.docfav.checkAvailability(slot.staffCalendarId, slot.from, slot.to);
    if (!free) {
      deps.logger.event("slot_taken", { sid: session.id, service: slot.serviceId });
      return { session, outcome: { messages: await reoffer(deps, session, "slot_taken", [slot]), booked: false, historyNote: "El hueco se ocupó antes de confirmar; se han ofrecido otros." } };
    }
  } catch (e) {
    deps.logger.event("docfav_error", { sid: session.id, tool: "checkAvailability", code: e instanceof DocfavError ? e.code : "UNKNOWN" });
    return { session, outcome: { messages: [contactMessage(deps, t(lang, "agenda_down"))], booked: false, historyNote: "No se pudo acceder a la agenda; no se ha creado ninguna cita." } };
  }

  // 2) Patient: reuse the one found by email, otherwise create it now (after the confirmation).
  let clientId = contact.clientId;
  try {
    if (!clientId) {
      try {
        clientId = (await deps.docfav.createClient({ firstname: contact.firstName, lastname: contact.lastName, phone: contact.phone, email: contact.email })).id;
        deps.logger.event("patient_created", { sid: session.id });
      } catch (e) {
        if (!(e instanceof DocfavError && e.code === "CLIENT_EMAIL_EXISTS")) throw e;
        const hit = (await deps.docfav.searchClients(contact.email)).find((h) => (h.email ?? "").toLowerCase() === contact.email);
        if (!hit) throw e;
        clientId = hit.id;
      }
    }
  } catch (e) {
    deps.logger.event("docfav_error", { sid: session.id, tool: "createPatient", code: e instanceof DocfavError ? e.code : "UNKNOWN" });
    return { session, outcome: { messages: [contactMessage(deps, t(lang, "booking_failed"))], booked: false, historyNote: "La reserva ha fallado; no se ha creado ninguna cita." } };
  }

  // 3) Appointment.
  try {
    await deps.docfav.createAppointment({
      clientId,
      serviceId: entry.df.id,
      staffCalendarId: slot.staffCalendarId,
      from: slot.from,
      to: slot.to,
      note: b.appointment_note,
      behaviour: b.appointment_behaviour,
      sendReminder: b.send_reminder,
    });
  } catch (e) {
    const code = e instanceof DocfavError ? e.code : "UNKNOWN";
    deps.logger.event("docfav_error", { sid: session.id, tool: "createAppointment", code });
    if (e instanceof DocfavError && e.status === 409) {
      return { session, outcome: { messages: await reoffer(deps, session, "slot_taken", [slot]), booked: false, historyNote: "El hueco se ocupó antes de confirmar; se han ofrecido otros." } };
    }
    if (e instanceof DocfavError && e.uncertain) {
      await deps.mailer.send({
        reason: "booking_uncertain",
        name: `${contact.firstName} ${contact.lastName}`,
        phone: contact.phone,
        email: contact.email,
        extra: `${slotLabel(slot.from, b.timezone, "es")} · ${serviceName(entry.cfg, "es")} · ${staffName(deps, slot.staffKey)}`,
      });
      session.contact = undefined;
      return { session, outcome: { messages: [contactMessage(deps, t(lang, "booking_uncertain"))], booked: false, historyNote: "Error al guardar la cita; el equipo lo revisará. No digas que la cita está hecha." } };
    }
    return { session, outcome: { messages: [contactMessage(deps, t(lang, "booking_failed"))], booked: false, historyNote: "La reserva ha fallado; no se ha creado ninguna cita." } };
  }

  // 4) Success.
  if (contact.staffNote) {
    await deps.mailer.send({
      reason: "contact_check",
      name: `${contact.firstName} ${contact.lastName}`,
      phone: contact.phone,
      email: contact.email,
      extra: contact.staffNote === "phone_mismatch" ? "Reserva con email de una ficha existente pero con otro teléfono." : "Ficha nueva con un teléfono que ya existe en otra ficha.",
    });
  }
  session.bookedInSession += 1;
  session.contact = undefined; // minimisation: the data now lives in Docfav only
  session.offered = {};
  session.selectedSlotId = undefined;
  deps.logger.event("appointment_created", { sid: session.id, service: slot.serviceId, mode: deps.dryRun ? "dry_run" : "live" });

  const label = labelFor(deps, slot, lang);
  const parts = [t(lang, "booked", { slot: label, service: serviceName(entry.cfg, lang), address: deps.cfg.settings.center.address })];
  const bring = entry.cfg.bring[lang] || entry.cfg.bring.es;
  if (bring) parts.push(t(lang, "bring", { text: bring }));
  parts.push(t(lang, "booked_footer"));
  if (deps.dryRun) parts.push(t(lang, "booked_dry_run"));
  return {
    session,
    outcome: {
      messages: [{ text: parts.join("\n") }],
      booked: true,
      historyNote: `Cita creada correctamente: ${label}, ${serviceName(entry.cfg, "es")}. El paciente ya ha recibido el resumen.`,
    },
  };
}
