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
  const api = new DocfavApi(key!, cfg.settings.docfav.clinic_id, cfg.settings.docfav.calendar_id);
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
      if (r.slots[0]) expect(await api.checkAvailability(r.slots[0].staffCalendarId, r.slots[0].from, r.slots[0].to)).toBe(true);
    }
  });
});
