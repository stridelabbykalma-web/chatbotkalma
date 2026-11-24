import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Pruebas contra servicios reales (Docfav y Claude). Necesitan claves en variables de entorno.
export default mergeConfig(base, defineConfig({ test: { include: ["tests/live/**/*.test.ts"], exclude: ["node_modules/**"], testTimeout: 120_000 } }));
