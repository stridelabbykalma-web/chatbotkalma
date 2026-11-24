import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [
    {
      // Same behaviour as wrangler's Text rule: importing a .md file gives its text.
      name: "md-as-text",
      load(id) {
        if (id.endsWith(".md")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
      },
    },
  ],
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/live/**", "node_modules/**"], environment: "node" },
});
