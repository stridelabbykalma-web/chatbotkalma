/**
 * Read-only check against the real Docfav account: services, professionals and free slots.
 * It never reads patient data and never writes.
 *   DOCFAV_API_KEY=df_pk_... npm run check:docfav
 */
import { describe, expect, it } from "vitest";
import { findSlots, getCatalog, labelFor, staffName, type Deps } from "../../worker/src/booking";
import { loadConfig } from "../../worker/src/config";
import { DocfavApi } from "../../worker/src/docfav/api";
import { MemoryLogger } from "../../worker/src/log";
import { noopMailer } from "../../worker/src/notify";
import { MemoryStore } from "../../worker/src/store";
import type { SessionState } from "../../worker/src/types";

const key = process.env.DOCFAV_API_KEY;

describe.skipIf(!key)("Docfav real (solo lectura)", () => {
  const cfg = loadConfig();
  const api = new DocfavApi(key!, cfg.settings.docfav.clinic_id, cfg.settings.docfav.calendar_id, fetch, cfg.settings.docfav.available_slots_local_time !== false);
  const deps: Deps = {
    cfg, docfav: api, store: new MemoryStore(), mailer: noopMailer, logger: new MemoryLogger(),
    now: () => Date.now(), randomId: () => crypto.randomUUID().replace(/-/g, ""), dryRun: true,
  };

  it("cada servicio de services.json existe y está activo en Docfav", async () => {
    const { entries, docfavOk } = await getCatalog(deps);
    expect(docfavOk).toBe(true);
    for (const e of entries) {
      console.log(`${e.cfg.id}: docfav=${e.df?.name ?? "NO ENCONTRADO"} · ${e.priceEur} € · ${e.durationMin} min · reservable=${e.bookable} · ${e.staff.map((s) => s.name).join(", ")}`);
      expect(e.df, `${e.cfg.id} no existe en Docfav`).toBeDefined();
      expect(e.df!.isActive).toBe(true);
      expect(e.staff.length).toBeGreaterThan(0);
    }
  });

  it("encuentra huecos reales y Docfav confirma que están libres", async () => {
    const { entries } = await getCatalog(deps);
    for (const e of entries.filter((x) => x.bookable)) {
      const session = { id: "live", lang: "es", offered: {} } as unknown as SessionState;
      const r = await findSlots(deps, session, { serviceId: e.cfg.id });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      console.log(`${e.cfg.id}: ${r.slots.map((s) => `${labelFor(deps, s, "es")} (${staffName(deps, s.staffKey)})`).join(" | ") || "sin huecos en 14 días"}`);
      // Every offered slot must be free for Docfav's own (UTC) check: catches time-zone mistakes.
      for (const sl of r.slots) expect(await api.checkAvailability(sl.staffCalendarId, sl.from, sl.to), `${e.cfg.id} ${sl.from}`).toBe(true);
    }
  });

  it("nunca ofrece un hueco con todas las salas ocupadas (citas reales del centro)", async () => {
    const res = cfg.settings.resources ?? [];
    if (!res.length) return;
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 15 * 86400_000).toISOString();
    const appts = (await api.listAppointments(from, to)).filter((a) => a.to && !/cancel/i.test(a.status) && (!a.calendarId || a.calendarId === cfg.settings.docfav.calendar_id));
    let checked = 0;
    let fullMoments = 0;
    for (const s of cfg.services.filter((x) => x.bookable_online)) {
      const session = { id: "live", lang: "es", offered: {} } as unknown as SessionState;
      const r = await findSlots(deps, session, { serviceId: s.id });
      if (!r.ok) continue;
      for (const slot of r.slots) {
        const a = Date.parse(slot.from);
        const b = Date.parse(slot.to);
        const overlapping = appts.filter((x) => Date.parse(x.from) < b && Date.parse(x.to!) > a).length;
        expect(overlapping, `${s.id} ${slot.from}`).toBeLessThan(res[0].capacity);
        checked++;
      }
    }
    for (const x of appts) {
      const n = appts.filter((y) => Date.parse(y.from) < Date.parse(x.to!) && Date.parse(y.to!) > Date.parse(x.from)).length;
      if (n >= res[0].capacity) fullMoments++;
    }
    console.log(`citas del centro: ${appts.length}; citas en momentos con todas las salas ocupadas: ${fullMoments}; huecos ofrecidos comprobados: ${checked}`);
  });
});
