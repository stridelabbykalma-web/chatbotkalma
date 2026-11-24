// Chat page: it only draws messages and buttons. Every decision and every piece of data
// comes from the backend (/reservas/api). No keys, no business logic here.
"use strict";

(function () {
  const API = "api";

  const STR = {
    es: {
      title: "Reservas", privacy_title: "Antes de empezar",
      privacy_text: "Este chat te orienta sobre el servicio que te conviene y te ayuda a reservar cita. Puedes contarnos qué te molesta; no hace falta que nos digas enfermedades, diagnósticos ni medicación. Para reservar te pediremos nombre, apellidos, móvil y email.",
      controller: "Responsable", purpose: "Finalidad", purpose_text: "Orientarte sobre el servicio adecuado, gestionar tu cita y responder tus dudas.",
      legal_basis: "Base legal", legal_basis_text: "Tu consentimiento explícito, también para lo que nos cuentes sobre tu molestia.",
      retention: "Conservación", retention_text: "La conversación se borra al cerrarla o a las 24 h. La cita queda en la agenda del centro.",
      policy: "Política de privacidad completa", accept: "He leído y acepto el aviso de privacidad.",
      start: "Empezar", write: "Escribe tu mensaje", placeholder: "Escribe aquí…", end: "Terminar y borrar la conversación",
      first_name: "Nombre", last_name: "Apellidos", phone: "Móvil", email: "Email", continue: "Continuar",
      confirm: "Confirmar", cancel: "Cancelar", call: "Llamar", whatsapp: "WhatsApp", mail: "Email",
      callback_title: "¿Te llamamos?", name: "Nombre", send: "Enviar", contact_form_title: "Tus datos",
      error: "Algo ha fallado. Inténtalo de nuevo.", expired: "La conversación ha caducado. Recarga la página para empezar de nuevo.",
      bot_check: "No hemos podido verificar que no eres un robot. Recarga la página.",
      ended: "Conversación borrada. ¡Gracias!",
    },
    ca: {
      title: "Reserves", privacy_title: "Abans de començar",
      privacy_text: "Aquest xat t'orienta sobre el servei que et convé i t'ajuda a reservar cita. Ens pots explicar què et molesta; no cal que ens diguis malalties, diagnòstics ni medicació. Per reservar et demanarem nom, cognoms, mòbil i correu.",
      controller: "Responsable", purpose: "Finalitat", purpose_text: "Orientar-te sobre el servei adequat, gestionar la teva cita i respondre els teus dubtes.",
      legal_basis: "Base legal", legal_basis_text: "El teu consentiment explícit, també per al que ens expliquis de la teva molèstia.",
      retention: "Conservació", retention_text: "La conversa s'esborra en tancar-la o a les 24 h. La cita queda a l'agenda del centre.",
      policy: "Política de privacitat completa", accept: "He llegit i accepto l'avís de privacitat.",
      start: "Començar", write: "Escriu el teu missatge", placeholder: "Escriu aquí…", end: "Acabar i esborrar la conversa",
      first_name: "Nom", last_name: "Cognoms", phone: "Mòbil", email: "Correu", continue: "Continuar",
      confirm: "Confirmar", cancel: "Cancel·lar", call: "Trucar", whatsapp: "WhatsApp", mail: "Correu",
      callback_title: "Et truquem?", name: "Nom", send: "Enviar", contact_form_title: "Les teves dades",
      error: "Alguna cosa ha fallat. Torna-ho a provar.", expired: "La conversa ha caducat. Recarrega la pàgina per començar de nou.",
      bot_check: "No hem pogut verificar que no ets un robot. Recarrega la pàgina.",
      ended: "Conversa esborrada. Gràcies!",
    },
    en: {
      title: "Bookings", privacy_title: "Before we start",
      privacy_text: "This chat helps you find the right service and book an appointment. You can tell us what bothers you; there's no need to share illnesses, diagnoses or medication. To book we'll ask for your first name, surname, mobile and email.",
      controller: "Controller", purpose: "Purpose", purpose_text: "Guiding you to the right service, managing your appointment and answering your questions.",
      legal_basis: "Legal basis", legal_basis_text: "Your explicit consent, including for what you tell us about your complaint.",
      retention: "Retention", retention_text: "The conversation is deleted when you close it or after 24 h. The appointment stays in the centre's schedule.",
      policy: "Full privacy policy", accept: "I have read and accept the privacy notice.",
      start: "Start", write: "Write your message", placeholder: "Type here…", end: "End and delete the conversation",
      first_name: "First name", last_name: "Surname", phone: "Mobile", email: "Email", continue: "Continue",
      confirm: "Confirm", cancel: "Cancel", call: "Call", whatsapp: "WhatsApp", mail: "Email",
      callback_title: "Shall we call you?", name: "Name", send: "Send", contact_form_title: "Your details",
      error: "Something went wrong. Please try again.", expired: "The conversation has expired. Reload the page to start again.",
      bot_check: "We couldn't verify you're not a robot. Please reload the page.",
      ended: "Conversation deleted. Thank you!",
    },
  };

  const $ = (id) => document.getElementById(id);
  const state = { lang: pickLang(), sessionId: null, busy: false, config: null, turnstileToken: null };

  function pickLang() {
    const n = (navigator.language || "es").toLowerCase();
    if (n.startsWith("ca")) return "ca";
    if (n.startsWith("en")) return "en";
    return "es";
  }
  const s = (k) => STR[state.lang][k] || STR.es[k] || k;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  }

  // ---------- language & privacy ----------
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
    $("title").textContent = s("title");
    $("privacy-title").textContent = s("privacy_title");
    $("privacy-text").textContent = s("privacy_text");
    document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = s(n.dataset.i18n); });
    $("start").textContent = s("start");
    $("input").placeholder = s("placeholder");
    $("end").textContent = s("end");
    $("privacy-link").textContent = s("policy");
  }

  document.querySelectorAll(".lang button").forEach((b) =>
    b.addEventListener("click", () => {
      state.lang = b.dataset.lang;
      applyLang();
    }),
  );

  function updateStart() {
    const needsBot = !!(state.config && state.config.turnstileSiteKey);
    $("start").disabled = !$("privacy-check").checked || (needsBot && !state.turnstileToken) || state.busy;
  }
  $("privacy-check").addEventListener("change", updateStart);

  async function loadConfig() {
    try {
      const r = await fetch(`${API}/config`, { headers: { Accept: "application/json" } });
      state.config = await r.json();
    } catch {
      state.config = {};
    }
    const p = (state.config && state.config.privacy) || {};
    $("privacy-controller").textContent = [p.controller, p.nif, p.contact_email].filter(Boolean).join(" · ") || "Centre Kalma";
    if (p.policy_url) {
      $("privacy-link").href = p.policy_url;
      $("privacy-link").hidden = false;
    }
    if (state.config && state.config.turnstileSiteKey) {
      window.onTurnstileLoad = () => {
        window.turnstile.render("#turnstile", {
          sitekey: state.config.turnstileSiteKey,
          callback: (t) => { state.turnstileToken = t; updateStart(); },
          "expired-callback": () => { state.turnstileToken = null; updateStart(); },
        });
      };
      document.head.append(el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad", async: true, defer: true }));
    }
    updateStart();
  }

  // ---------- API ----------
  async function post(path, body) {
    const r = await fetch(`${API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch { /* ignore */ }
    if (!r.ok) {
      const err = new Error((data && data.error) || `http_${r.status}`);
      err.status = r.status;
      throw err;
    }
    return data;
  }

  $("start").addEventListener("click", async () => {
    state.busy = true;
    updateStart();
    $("start-error").hidden = true;
    try {
      const data = await post("session", { lang: state.lang, privacyAccepted: true, turnstileToken: state.turnstileToken });
      state.sessionId = data.sessionId;
      $("privacy").hidden = true;
      $("chat").hidden = false;
      $("composer").hidden = false;
      $("end").hidden = false;
      render(data.messages);
      $("input").focus();
    } catch (e) {
      $("start-error").textContent = e.message === "bot_check_failed" ? s("bot_check") : s("error");
      $("start-error").hidden = false;
    } finally {
      state.busy = false;
      updateStart();
    }
  });

  // ---------- chat ----------
  const log = $("log");
  function scrollDown() {
    requestAnimationFrame(() => {
      const last = log.lastElementChild;
      if (last) last.scrollIntoView({ block: "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
  function addMine(text) {
    log.append(el("li", { class: "msg me" }, text));
    scrollDown();
  }
  function typing(on) {
    const t = $("typing");
    if (on && !t) log.append(el("li", { class: "msg bot typing", id: "typing", "aria-label": "…" }, el("span", {}, "●"), el("span", {}, "●"), el("span", {}, "●")));
    if (!on && t) t.remove();
    if (on) scrollDown();
  }
  function setBusy(b) {
    state.busy = b;
    $("send").disabled = b;
    document.querySelectorAll(".ui button:not(.keep)").forEach((x) => { if (b) x.disabled = true; });
  }
  function freeze(node) {
    node.classList.add("done");
    node.querySelectorAll("button, input").forEach((x) => (x.disabled = true));
  }

  async function send(path, body, mineText) {
    if (state.busy || !state.sessionId) return;
    if (mineText) addMine(mineText);
    setBusy(true);
    typing(true);
    try {
      const data = await post(path, { sessionId: state.sessionId, ...body });
      typing(false);
      render(data.messages);
    } catch (e) {
      typing(false);
      render([{ text: e.status === 410 ? s("expired") : s("error") }]);
      if (e.status === 410) endUi();
    } finally {
      setBusy(false);
      document.querySelectorAll(".ui:not(.done) button").forEach((x) => (x.disabled = false));
    }
  }

  $("composer").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("input").value.trim();
    if (!text || state.busy) return;
    $("input").value = "";
    autosize();
    send("chat", { text }, text);
  });
  $("input").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      $("composer").requestSubmit();
    }
  });
  function autosize() {
    const t = $("input");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  }
  $("input").addEventListener("input", autosize);

  function render(messages) {
    for (const m of messages || []) {
      if (m.text) log.append(el("li", { class: "msg bot" }, m.text));
      if (m.ui) log.append(renderUi(m.ui));
    }
    scrollDown();
  }

  function field(name, label, type, autocomplete) {
    const id = `f-${name}-${Math.random().toString(36).slice(2, 8)}`;
    return el("div", { class: "field" }, el("label", { for: id }, label), el("input", { id, name, type, autocomplete, required: true, maxlength: 80 }));
  }

  function renderUi(ui) {
    const li = el("li", { class: "ui" });
    switch (ui.type) {
      case "options":
        for (const o of ui.options) {
          li.append(el("button", { type: "button", class: "chip", onclick: () => { freeze(li); send("chat", { text: o }, o); } }, o));
        }
        break;
      case "slots": {
        const grid = el("div", { class: "slots" });
        for (const sl of ui.slots) {
          grid.append(el("button", { type: "button", class: "slot", onclick: () => { freeze(li); send("action", { action: { type: "select_slot", slotId: sl.id } }, sl.label); } }, sl.label));
        }
        li.append(grid);
        break;
      }
      case "contact_form": {
        const form = el("form", { class: "ui-card", novalidate: true },
          el("h3", {}, s("contact_form_title")),
          el("div", { class: "form-grid two" },
            field("firstName", s("first_name"), "text", "given-name"),
            field("lastName", s("last_name"), "text", "family-name"),
            field("phone", s("phone"), "tel", "tel"),
            field("email", s("email"), "email", "email"),
          ),
          el("div", { class: "actions" }, el("button", { type: "submit", class: "primary" }, s("continue"))),
        );
        form.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const data = Object.fromEntries(new FormData(form).entries());
          freeze(li);
          send("action", { action: { type: "submit_contact", data } }, null);
        });
        li.append(form);
        break;
      }
      case "summary": {
        const card = el("div", { class: "ui-card" },
          el("ul", { class: "summary-lines" }, ui.lines.map((l) => el("li", {}, l))),
          el("div", { class: "actions" },
            el("button", { type: "button", class: "primary", onclick: () => { freeze(li); send("action", { action: { type: "confirm", token: ui.token } }, s("confirm")); } }, s("confirm")),
            el("button", { type: "button", class: "secondary", onclick: () => { freeze(li); send("action", { action: { type: "cancel_pending" } }, s("cancel")); } }, s("cancel")),
          ),
        );
        li.append(card);
        break;
      }
      case "contact": {
        const links = el("div", { class: "contact-links" });
        if (ui.phone) links.append(el("a", { class: "chip", href: `tel:${ui.phone.replace(/\s/g, "")}` }, `${s("call")} ${ui.phone}`));
        if (ui.whatsapp) links.append(el("a", { class: "chip", href: `https://wa.me/${ui.whatsapp.replace(/[^\d]/g, "")}`, target: "_blank", rel: "noopener" }, s("whatsapp")));
        if (ui.email) links.append(el("a", { class: "chip", href: `mailto:${ui.email}` }, `${s("mail")} ${ui.email}`));
        if (!links.childNodes.length) return el("li", { hidden: true });
        li.append(links);
        break;
      }
      case "callback_form": {
        const form = el("form", { class: "ui-card", novalidate: true },
          el("h3", {}, s("callback_title")),
          el("div", { class: "form-grid two" }, field("name", s("name"), "text", "name"), field("phone", s("phone"), "tel", "tel")),
          el("div", { class: "actions" }, el("button", { type: "submit", class: "primary" }, s("send"))),
        );
        form.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const data = Object.fromEntries(new FormData(form).entries());
          freeze(li);
          send("action", { action: { type: "submit_callback", data } }, null);
        });
        li.append(form);
        break;
      }
      case "portal":
        li.append(el("iframe", { class: "portal", src: ui.url, title: "Docfav", loading: "lazy", referrerpolicy: "no-referrer" }));
        break;
      default:
        return el("li", { hidden: true });
    }
    return li;
  }

  function endUi() {
    $("composer").hidden = true;
    $("end").hidden = true;
    state.sessionId = null;
  }

  $("end").addEventListener("click", async () => {
    if (!state.sessionId) return;
    try { await post("end", { sessionId: state.sessionId }); } catch { /* the data expires anyway in 24 h */ }
    endUi();
    log.append(el("li", { class: "msg bot" }, s("ended")));
  });

  applyLang();
  loadConfig();
})();
