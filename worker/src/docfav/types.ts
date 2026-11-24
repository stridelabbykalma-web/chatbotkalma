/** Internal view of the Docfav Public API v1 (https://www.docfav.com/api). */

export interface DfService {
  id: string;
  name: string;
  amountCents: number;
  durationMin: number;
  isActive: boolean;
  staffCalendarIds: string[];
}

export interface DfSlot {
  from: string; // ISO UTC
  to: string;
  available: boolean;
}

export interface DfStaffSlots {
  staffCalendarId: string;
  slots: DfSlot[];
}

export interface DfClientHit {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface DfAppointment {
  id: string;
  from: string;
  to?: string;
  serviceId?: string;
  calendarId?: string;
  status: string;
  note: string | null;
}

export interface SlotsQuery {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  serviceId?: string;
  staffCalendarId?: string;
  period?: "morning" | "afternoon";
}

export interface NewClient {
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
}

export interface NewAppointment {
  clientId: string;
  serviceId: string;
  staffCalendarId: string;
  from: string;
  to: string;
  note: string;
  behaviour: "confirmed" | "pending";
  sendReminder: boolean;
}

export interface DocfavClient {
  listServices(): Promise<DfService[]>;
  getAvailableSlots(q: SlotsQuery): Promise<DfStaffSlots[]>;
  checkAvailability(staffCalendarId: string, from: string, to: string): Promise<boolean>;
  searchClients(keyword: string): Promise<DfClientHit[]>;
  createClient(c: NewClient): Promise<{ id: string }>;
  /** Appointments of a client between two UTC instants (the API caps each call at 7 days). */
  listClientAppointments(clientId: string, fromIso: string, toIso: string): Promise<DfAppointment[]>;
  /** Every appointment of the clinic between two UTC instants (all staff, any channel). */
  listAppointments(fromIso: string, toIso: string): Promise<DfAppointment[]>;
  createAppointment(a: NewAppointment): Promise<{ id: string }>;
}

export class DocfavError extends Error {
  constructor(
    public code: string,
    public status: number,
    /** true when the request may have reached Docfav (timeouts, 5xx on writes). */
    public uncertain = false,
  ) {
    super(`Docfav ${status} ${code}`);
    this.name = "DocfavError";
  }
}
