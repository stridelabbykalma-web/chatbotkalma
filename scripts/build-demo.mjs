// Builds dist/demo.html: the real chat page + the real backend running in the browser,
// with Docfav simulated and Claude through the artifact's `sample` capability.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "dist/demo.html";
const bundle = await build({
  entryPoints: ["demo/browser.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
  loader: { ".md": "text" },
  legalComments: "none",
});
const js = bundle.outputFiles[0].text;
const css = readFileSync("web/styles.css", "utf8");
const appJs = readFileSync("web/app.js", "utf8");
const page = readFileSync("web/index.html", "utf8");
const body = page
  .slice(page.indexOf("<body>") + "<body>".length, page.indexOf("</body>"))
  .replace(/<script[^>]*src="app\.js"[^>]*><\/script>/, "");

const demoCss = `
.demo { width: 100%; max-width: 720px; margin: 0 auto 24px; padding: 0 16px; }
.demo-banner { background: var(--accent); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; font-size: .85rem; margin: 12px auto 0; max-width: 688px; }
.demo-banner strong { color: var(--brand); }
.demo details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; font-size: .88rem; }
.demo summary { cursor: pointer; font-weight: 600; }
.demo h4 { margin: 14px 0 6px; font-size: .9rem; }
.demo ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.demo li.pre { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
.demo .row { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-top: 10px; }
.demo select { font: inherit; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
.demo .muted { margin: 6px 0 0; }
`;

const demoHtml = `
<div class="demo-banner" role="note"><strong>Demo.</strong> Es el código real del bot con la agenda simulada (servicios y precios reales de Docfav, huecos inventados). No se reserva nada de verdad.</div>
`;
const panelHtml = `
<section class="demo" aria-label="Panel de pruebas">
  <details>
    <summary>Panel de pruebas · lo que vería el centro</summary>
    <p id="demo-ai" class="muted">IA: …</p>
    <div class="row">
      <label>Modelo <select id="demo-tier"><option value="quick">rápido</option><option value="default">completo (más lento)</option></select></label>
      <label><input type="checkbox" id="demo-down"> Simular Docfav caído</label>
    </div>
    <h4>Citas creadas en la agenda (simulada)</h4>
    <ul id="demo-appts"></ul>
    <h4>Emails enviados al centro</h4>
    <ul id="demo-mails"></ul>
    <p class="muted">Este panel no existe en el chat real; el paciente nunca ve el profesional asignado.</p>
  </details>
</section>
`;

const html = `<title>Chat de reservas Kalma</title>
<style>${css}\n${demoCss}</style>
${body.replace("<main", demoHtml + "<main").replace('<footer class="footer">', panelHtml + '<footer class="footer">')}
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>
<script>${appJs}</script>
`;
mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KiB`);
