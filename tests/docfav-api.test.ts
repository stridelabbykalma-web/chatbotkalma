import { describe, expect, it } from "vitest";
import { DocfavApi } from "../worker/src/docfav/api";
import { DocfavError } from "../worker/src/docfav/types";

const CLINIC = "bed10ea2-0b01-4a7e-a0db-4ffa09e4ec5e";
const CAL = "0125b951-7a33-4e3f-9f36-7f2f5ff0afc9";

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500, body: { data: null, errors: [{ code: "INTERNAL_ERROR" }] } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ok = (data: unknown) => ({ status: 200, body: { data, errors: [], meta: {} } });

describe("Docfav Public API v1 client", () => {
  it("sends the key in X-Api-Key and converts durations from seconds", async () => {
    const f = fakeFetch([
      ok([{ id: "s1", name: "Quiropodia", amount: 2500, duration: 900, is_active: true, staff_calendars: [{ id: "sc1" }] }]),
    ]);
    const api = new DocfavApi("df_pk_test", CLINIC, CAL, f.fn);
    const services = await api.listServices();
    expect(services).toEqual([{ id: "s1", name: "Quiropodia", amountCents: 2500, durationMin: 15, isActive: true, staffCalendarIds: ["sc1"] }]);
    expect(f.calls[0].url).toBe(`https://www.docfav.com/api-connector/v1/backofficeclinics/${CLINIC}/services?expand=staff_calendars&limit=100&offset=0`);
    expect((f.calls[0].init.headers as Record<string, string>)["X-Api-Key"]).toBe("df_pk_test");
  });

  it("retries a failed read once", async () => {
    const f = fakeFetch([{ status: 503, body: { data: null, errors: [{ code: "API_DISABLED" }] } }, ok({ available: true })]);
    const api = new DocfavApi("k", CLINIC, CAL, f.fn);
    expect(await api.checkAvailability("sc1", "2026-11-25T09:00:00Z", "2026-11-25T09:15:00Z")).toBe(true);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].url).toContain(`/calendars/${CAL}/check-availability?from=2026-11-25T09%3A00%3A00Z&to=2026-11-25T09%3A15%3A00Z&staff_calendar_id=sc1`);
  });

  it("does not retry 4xx errors", async () => {
    const f = fakeFetch([{ status: 403, body: { data: null, errors: [{ code: "INSUFFICIENT_SCOPES" }] } }]);
    const api = new DocfavApi("k", CLINIC, CAL, f.fn);
    await expect(api.searchClients("a@b.c")).rejects.toMatchObject({ code: "INSUFFICIENT_SCOPES", status: 403 });
    expect(f.calls).toHaveLength(1);
  });

  it("never retries a write and marks 5xx on writes as uncertain", async () => {
    const f = fakeFetch([{ status: 500, body: { data: null, errors: [{ code: "INTERNAL_ERROR" }] } }]);
    const api = new DocfavApi("k", CLINIC, CAL, f.fn);
    const err = await api
      .createAppointment({ clientId: "c", serviceId: "s", staffCalendarId: "sc", from: "a", to: "b", note: "n", behaviour: "confirmed", sendReminder: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DocfavError);
    expect(err.uncertain).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  it("creates appointments with the documented body", async () => {
    const f = fakeFetch([ok([{ id: "appt-1" }])]);
    const api = new DocfavApi("k", CLINIC, CAL, f.fn);
    await api.createAppointment({ clientId: "c1", serviceId: "s1", staffCalendarId: "sc1", from: "2026-11-25T09:00:00Z", to: "2026-11-25T09:15:00Z", note: "Reserva desde Chat web", behaviour: "confirmed", sendReminder: true });
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      client: "c1",
      timezone: "Europe/Madrid",
      appointments: [{ service: "s1", back_office_staff_calendar: "sc1", from: "2026-11-25T09:00:00Z", to: "2026-11-25T09:15:00Z", note: "Reserva desde Chat web" }],
      send_reminder: true,
      behaviour: "confirmed",
      force: false,
    });
  });

  it("maps CLIENT_EMAIL_EXISTS and splits appointment searches into 7-day windows", async () => {
    const f = fakeFetch([{ status: 409, body: { data: null, errors: [{ code: "CLIENT_EMAIL_EXISTS" }] } }]);
    const api = new DocfavApi("k", CLINIC, CAL, f.fn);
    await expect(api.createClient({ firstname: "a", lastname: "b", phone: "+34600000000", email: "a@b.c" })).rejects.toMatchObject({ code: "CLIENT_EMAIL_EXISTS" });

    const g = fakeFetch([ok({ appointments: [{ id: "x", booked_from: "2026-11-30T09:00:00Z", status: "confirmed", note: "Reserva desde Chat web" }] }), ok({ appointments: [] }), ok({ appointments: [] })]);
    const api2 = new DocfavApi("k", CLINIC, CAL, g.fn);
    const list = await api2.listClientAppointments("c1", "2026-11-24T10:00:00.000Z", "2026-12-10T10:00:00.000Z");
    expect(list).toHaveLength(1);
    expect(g.calls).toHaveLength(3);
    expect(g.calls[0].url).toContain("result_type=appointments");
  });
});
