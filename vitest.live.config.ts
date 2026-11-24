import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Pruebas contra servicios reales (Docfav y Claude). Necesitan claves en variables de entorno.
// Standalone (not merged) so that the base config's exclusion of tests/live does not apply.
export default defineConfig({
  plugins: base.plugins,
  test: { include: ["tests/live/**/*.test.ts"], environment: "node", testTimeout: 120_000 },
});
