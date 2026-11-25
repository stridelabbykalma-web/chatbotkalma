// The chat page is bundled inside the Worker (no separate asset upload): three small files.
import indexHtml from "../../web/index.html";
import stylesCss from "../../web/styles.css";
import appJs from "../../web/app.js";

export const STATIC_FILES: Record<string, { body: string; type: string }> = {
  "/": { body: indexHtml, type: "text/html; charset=utf-8" },
  "/index.html": { body: indexHtml, type: "text/html; charset=utf-8" },
  "/styles.css": { body: stylesCss, type: "text/css; charset=utf-8" },
  "/app.js": { body: appJs, type: "text/javascript; charset=utf-8" },
};
