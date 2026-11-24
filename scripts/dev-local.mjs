// Local development without a Cloudflare account: same config minus Workers AI
// (voice notes are disabled; everything else works with .dev.vars).
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const cfg = readFileSync("wrangler.toml", "utf8").replace(/# Workers AI[^\n]*\n\[ai\]\nbinding = "AI"\n/, "");
writeFileSync("wrangler.local.toml", cfg);
spawn("npx", ["wrangler", "dev", "-c", "wrangler.local.toml", ...process.argv.slice(2)], { stdio: "inherit" });
