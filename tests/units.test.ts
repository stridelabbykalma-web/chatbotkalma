import { describe, expect, it } from "vitest";
import { cleanKnowledge, loadConfig } from "../worker/src/config";
import { scrubText } from "../worker/src/log";
import { buildEmail } from "../worker/src/notify";
import { mentionsStaff, renderPlaceholders, violatesFactGuard } from "../worker/src/render";
import { normalizeEmail, normalizeName, normalizePhone } from "../worker/src/validate";

describe("validación", () => {
  it("móviles españoles e internacionales a E.164", () => {
    expect(normalizePhone("612 345 678")).toBe("+34612345678");
    expect(normalizePhone("+34 612-345-678")).toBe("+34612345678");
    expect(normalizePhone("0033 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
  it("emails", () => {
    expect(normalizeEmail(" Laura@Example.COM ")).toBe("laura@example.com");
    expect(normalizeEmail("laura@")).toBeNull();
    expect(normalizeEmail("a b@c.com")).toBeNull();
  });
  it("nombres sin números", () => {
    expect(normalizeName("  María   José ")).toBe("María José");
    expect(normalizeName("Núria d'Alòs-Puig")).toBe("Núria d'Alòs-Puig");
    expect(normalizeName("R2D2")).toBeNull();
    expect(normalizeName("<script>")).toBeNull();
  });
});

describe("marcadores y guardas", () => {
  const cfg = loadConfig();
  it("datos ausentes se sustituyen por 'consúltalo con el equipo'", () => {
    expect(renderPlaceholders("Llama al {{telefono}}", cfg, {}, "es")).toBe("Llama al consúltalo con el equipo");
    expect(renderPlaceholders("{{inventado}}", cfg, {}, "en")).toBe("please ask the team");
    expect(renderPlaceholders("{{direccion}}", cfg, {}, "ca")).toBe(cfg.settings.center.address);
  });
  it("detecta precios y teléfonos escritos por la IA, pero no fechas ni horas", () => {
    expect(violatesFactGuard("Cuesta 30€")).toBe("price");
    expect(violatesFactGuard("Son 30 euros")).toBe("price");
    expect(violatesFactGuard("Llama al 972 12 34 56")).toBe("phone");
    expect(violatesFactGuard("Tengo el jueves 27/11 a las 17:00 o el 2026-11-28 a las 9:30")).toBeNull();
    expect(violatesFactGuard("Cuesta {{precio:quiropodia}}")).toBeNull();
  });
  it("detecta nombres del equipo, con o sin acentos y por partes", () => {
    const staff = ["Abraham", "Matilde", "José Antonio"];
    expect(mentionsStaff("Te atiende ABRAHAM", staff)).toBe(true);
    expect(mentionsStaff("con jose", staff)).toBe(true);
    expect(mentionsStaff("Matilde.", staff)).toBe(true);
    expect(mentionsStaff("El profesional te atenderá el jueves", staff)).toBe(false);
    expect(mentionsStaff("Matildes", staff)).toBe(false);
  });
});

describe("knowledge.md", () => {
  it("quita comentarios y apartados PENDIENTE", () => {
    const k = cleanKnowledge("# T\n<!-- nota -->\n## A\nTexto\n\n## B\nPENDIENTE\n");
    expect(k).toBe("## A\nTexto");
    const real = loadConfig().knowledge;
    expect(real).not.toMatch(/PENDIENTE|<!--/);
    expect(real).toMatch(/Cómo anular/);
  });
});

describe("privacidad", () => {
  it("los logs eliminan emails, teléfonos y DNI", () => {
    expect(scrubText("laura@x.com 612345678 12345678Z")).toBe("[email] [num] [id]");
  });
  it("el email al centro solo tiene campos fijos", () => {
    const e = buildEmail({ reason: "urgent", name: "Ana", phone: "+34600000000" });
    expect(e.subject).toBe("[Chat reservas] Posible urgencia (se le ha indicado el 112)");
    expect(e.text).toContain("Por protección de datos no incluye el texto de la conversación");
  });
});
