import { DocfavError } from "./types";
import { zonedToUtcIso } from "../time";
import type {
  DfAppointment, DfClientHit, DfService, DfStaffSlots, DocfavClient, NewAppointment, NewClient, SlotsQuery,
} from "./types";

const BASE = "https://www.docfav.com/api-connector/v1";
const TIMEOUT_MS = 10_000;
const WEEK_MS = 7 * 86400_000;

interface Envelope<T> {
  data: T;
  errors: { code: string; message?: string }[];
}

/**
 * Real Docfav Public API v1 client. Reads are retried once; writes are never retried
 * automatically (a retry could create a duplicate appointment).
 */
export class DocfavApi implements DocfavClient {
  constructor(
    private apiKey: string,
    private clinicId: string,
    private calendarId: string,
    private fetchFn: typeof fetch = fetch,
    private slotsAreLocal = true,
  ) {}

  private async request<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${BASE}/backofficeclinics/${this.clinicId}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const attempts = method === "GET" ? 2 : 1;
    let lastErr: DocfavError | undefined;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchFn(url.toString(), {
          method,
          headers: { "X-Api-Key": this.apiKey, Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        let env: Envelope<T> | undefined;
        try {
          env = (await res.json()) as Envelope<T>;
        } catch {
          env = undefined;
        }
        if (res.ok && env && (!env.errors || env.errors.length === 0)) return env.data;
        const code = env?.errors?.[0]?.code ?? `HTTP_${res.status}`;
        lastErr = new DocfavError(code, res.status, method === "POST" && res.status >= 500);
        // Only server errors and rate limits are worth a retry.
        if (res.status < 500 && res.status !== 429) throw lastErr;
      } catch (e) {
        if (e instanceof DocfavError && e.status < 500 && e.status !== 429) throw e;
        lastErr = e instanceof DocfavError ? e : new DocfavError("NETWORK", 0, method === "POST");
      }
    }
    throw lastErr ?? new DocfavError("UNKNOWN", 0);
  }

  async listServices(): Promise<DfService[]> {
    const out: DfService[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await this.request<any[]>("GET", "/services", {
        query: { expand: "staff_calendars", limit: "100", offset: String(offset) },
      });
      for (const s of page) {
        out.push({
          id: s.id,
          name: s.name,
          amountCents: Number(s.amount) || 0,
          // The docs say minutes, but the live API returns seconds (e.g. 1800 for 30 min).
          durationMin: Number(s.duration) > 600 ? Math.round(Number(s.duration) / 60) : Number(s.duration),
          isActive: Boolean(s.is_active),
          staffCalendarIds: (s.staff_calendars ?? []).map((x: any) => x.id),
        });
      }
      if (page.length < 100) break;
    }
    return out;
  }

  async getAvailableSlots(q: SlotsQuery): Promise<DfStaffSlots[]> {
    const data = await this.request<any[]>("GET", `/calendars/${this.calendarId}/available-slots`, {
      query: {
        start_date: q.startDate,
        end_date: q.endDate,
        service_id: q.serviceId,
        staff_calendar_id: q.staffCalendarId,
        period: q.period,
      },
    });
    // Docfav bug (checked 24/11/2026): unlike every other endpoint, available-slots returns the
    // staff member's LOCAL wall time with a fake "Z" (a 09:00-13:00 schedule comes back as
    // "09:00Z"-"13:00Z"). Convert with the staff calendar's time zone to real UTC. If Docfav fixes
    // it, set docfav.available_slots_local_time = false (npm run check:docfav detects it).
    return data.map((st) => {
      const tz = typeof st.timezone === "string" && st.timezone ? st.timezone : "Europe/Madrid";
      const fix = (v: string) => (this.slotsAreLocal ? zonedToUtcIso(v, tz) : v);
      return {
        staffCalendarId: st.staff_calendar_id,
        slots: (st.available_slots ?? []).flatMap((day: any) =>
          (day.slots ?? []).map((s: any) => ({ from: fix(s.from), to: fix(s.to), available: Boolean(s.available) && (s.hour_type ?? "WORKING_DAY") === "WORKING_DAY" })),
        ),
      };
    });
  }

  async checkAvailability(staffCalendarId: string, from: string, to: string): Promise<boolean> {
    const data = await this.request<{ available: boolean }>("GET", `/calendars/${this.calendarId}/check-availability`, {
      query: { from, to, staff_calendar_id: staffCalendarId },
    });
    return data.available === true;
  }

  async searchClients(keyword: string): Promise<DfClientHit[]> {
    const data = await this.request<any[]>("GET", "/clients/autocomplete", { query: { keyword, limit: "20" } });
    return data.map((c) => ({ id: c.id, email: c.email ?? null, phone: c.telephone ?? c.phone ?? null }));
  }

  async createClient(c: NewClient): Promise<{ id: string }> {
    const data = await this.request<{ id: string }>("POST", "/clients", { body: c });
    return { id: data.id };
  }

  listClientAppointments(clientId: string, fromIso: string, toIso: string): Promise<DfAppointment[]> {
    return this.appointmentsBetween(fromIso, toIso, clientId);
  }

  listAppointments(fromIso: string, toIso: string): Promise<DfAppointment[]> {
    return this.appointmentsBetween(fromIso, toIso);
  }

  /** GET /availability allows at most 7 days per call, so longer windows are split. */
  private async appointmentsBetween(fromIso: string, toIso: string, clientId?: string): Promise<DfAppointment[]> {
    const out: DfAppointment[] = [];
    let start = Date.parse(fromIso);
    const end = Date.parse(toIso);
    while (start < end) {
      const stop = Math.min(start + WEEK_MS - 1000, end);
      const data = await this.request<{ appointments?: any[] }>("GET", "/availability", {
        query: {
          start_date: new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
          end_date: new Date(stop).toISOString().replace(/\.\d{3}Z$/, "Z"),
          ...(clientId ? { client_id: clientId } : {}),
          result_type: "appointments",
        },
      });
      for (const a of data.appointments ?? []) {
        out.push({ id: a.id, from: a.booked_from, to: a.booked_to, serviceId: a.service_id, calendarId: a.calendar_id, status: a.status ?? "", note: a.note ?? null });
      }
      start = stop + 1000;
    }
    return out;
  }

  async createAppointment(a: NewAppointment): Promise<{ id: string }> {
    const data = await this.request<any[]>("POST", "/appointments", {
      body: {
        client: a.clientId,
        timezone: "Europe/Madrid",
        appointments: [
          { service: a.serviceId, back_office_staff_calendar: a.staffCalendarId, from: a.from, to: a.to, note: a.note },
        ],
        send_reminder: a.sendReminder,
        behaviour: a.behaviour,
        force: false,
      },
    });
    const id = Array.isArray(data) ? data[0]?.id : undefined;
    if (!id) throw new DocfavError("NO_APPOINTMENT_ID", 200, true);
    return { id };
  }
}
