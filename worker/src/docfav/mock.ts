import { DocfavError } from "./types";
import type {
  DfAppointment, DfClientHit, DfService, DfStaffSlots, DocfavClient, NewAppointment, NewClient, SlotsQuery,
} from "./types";
import { addDays, localDate, localHour, localWeekday } from "../time";

const TZ = "Europe/Madrid";

interface MockClient extends NewClient {
  id: string;
}
interface MockAppointment extends NewAppointment {
  id: string;
}

/**
 * In-memory Docfav with the same shape as the real API: 15-minute slots, Monday–Friday
 * 09:00–14:00 and 16:00–20:00 (Madrid). Used by tests and when DOCFAV_MODE=mock.
 */
export class DocfavMock implements DocfavClient {
  clients: MockClient[] = [];
  appointments: MockAppointment[] = [];
  /** Slots taken by someone else (ISO "from" per staff calendar). */
  blocked = new Set<string>();
  down = false;
  failCreateAppointment = false;
  calls: string[] = [];
  private seq = 0;

  constructor(
    public services: DfService[],
    public staffCalendarIds: string[],
  ) {}

  private guard(name: string) {
    this.calls.push(name);
    if (this.down) throw new DocfavError("NETWORK", 0);
  }

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(4, "0")}`;
  }

  private isFree(staffCalendarId: string, fromMs: number, toMs: number): boolean {
    for (let t = fromMs; t < toMs; t += 15 * 60_000) {
      const d = new Date(t);
      const h = localHour(d, TZ);
      const wd = localWeekday(d, TZ);
      if (wd > 5 || !((h >= 9 && h < 14) || (h >= 16 && h < 20))) return false;
      const iso = d.toISOString().replace(/\.\d{3}Z$/, "Z");
      if (this.blocked.has(`${staffCalendarId}|${iso}`)) return false;
    }
    return !this.appointments.some(
      (a) => a.staffCalendarId === staffCalendarId && Date.parse(a.from) < toMs && Date.parse(a.to) > fromMs,
    );
  }

  block(staffCalendarId: string, fromIso: string, minutes: number) {
    for (let t = Date.parse(fromIso); t < Date.parse(fromIso) + minutes * 60_000; t += 15 * 60_000) {
      this.blocked.add(`${staffCalendarId}|${new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z")}`);
    }
  }

  async listServices(): Promise<DfService[]> {
    this.guard("listServices");
    return this.services;
  }

  async getAvailableSlots(q: SlotsQuery): Promise<DfStaffSlots[]> {
    this.guard("getAvailableSlots");
    const ids = q.staffCalendarId ? [q.staffCalendarId] : this.staffCalendarIds;
    const startMs = Date.parse(addDays(q.startDate, -1) + "T00:00:00Z");
    const endMs = Date.parse(addDays(q.endDate, 1) + "T23:59:59Z");
    return ids.map((id) => {
      const slots = [];
      for (let t = startMs; t < endMs; t += 15 * 60_000) {
        const d = new Date(t);
        const day = localDate(d, TZ);
        if (day < q.startDate || day > q.endDate) continue;
        const h = localHour(d, TZ);
        const working = localWeekday(d, TZ) <= 5 && ((h >= 9 && h < 14) || (h >= 16 && h < 20));
        if (!working) continue;
        if (q.period === "morning" && h >= 14) continue;
        if (q.period === "afternoon" && h < 14) continue;
        slots.push({
          from: d.toISOString().replace(/\.\d{3}Z$/, "Z"),
          to: new Date(t + 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          available: this.isFree(id, t, t + 15 * 60_000),
        });
      }
      return { staffCalendarId: id, slots };
    });
  }

  async checkAvailability(staffCalendarId: string, from: string, to: string): Promise<boolean> {
    this.guard("checkAvailability");
    return this.isFree(staffCalendarId, Date.parse(from), Date.parse(to));
  }

  async searchClients(keyword: string): Promise<DfClientHit[]> {
    this.guard("searchClients");
    const k = keyword.toLowerCase();
    return this.clients
      .filter((c) => c.email.toLowerCase().includes(k) || c.phone.includes(k) || `${c.firstname} ${c.lastname}`.toLowerCase().includes(k))
      .map((c) => ({ id: c.id, email: c.email, phone: c.phone }));
  }

  async createClient(c: NewClient): Promise<{ id: string }> {
    this.guard("createClient");
    if (this.clients.some((x) => x.email.toLowerCase() === c.email.toLowerCase())) {
      throw new DocfavError("CLIENT_EMAIL_EXISTS", 409);
    }
    const id = this.nextId("client");
    this.clients.push({ ...c, id });
    return { id };
  }

  async listClientAppointments(clientId: string, fromIso: string, toIso: string): Promise<DfAppointment[]> {
    this.guard("listClientAppointments");
    return this.appointments
      .filter((a) => a.clientId === clientId && a.from >= fromIso && a.from <= toIso)
      .map((a) => ({ id: a.id, from: a.from, status: a.behaviour, note: a.note }));
  }

  async createAppointment(a: NewAppointment): Promise<{ id: string }> {
    this.guard("createAppointment");
    if (this.failCreateAppointment) throw new DocfavError("INTERNAL_ERROR", 500, true);
    if (!this.isFree(a.staffCalendarId, Date.parse(a.from), Date.parse(a.to))) {
      throw new DocfavError("SLOT_NOT_AVAILABLE", 409);
    }
    const id = this.nextId("appt");
    this.appointments.push({ ...a, id });
    return { id };
  }
}

/** Reads go to the real client; writes are skipped and return fake ids (DRY_RUN=true). */
export class DryRunDocfav implements DocfavClient {
  writes: string[] = [];
  constructor(private inner: DocfavClient) {}
  listServices() { return this.inner.listServices(); }
  getAvailableSlots(q: SlotsQuery) { return this.inner.getAvailableSlots(q); }
  checkAvailability(s: string, f: string, t: string) { return this.inner.checkAvailability(s, f, t); }
  searchClients(k: string) { return this.inner.searchClients(k); }
  listClientAppointments(c: string, f: string, t: string) { return this.inner.listClientAppointments(c, f, t); }
  async createClient(_c: NewClient) {
    this.writes.push("createClient");
    return { id: "dry-run-client" };
  }
  async createAppointment(_a: NewAppointment) {
    this.writes.push("createAppointment");
    return { id: "dry-run-appointment" };
  }
}
