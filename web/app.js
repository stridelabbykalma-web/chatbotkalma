// Chat page: it only draws messages and buttons. Every decision and every piece of data
// comes from the backend (/reservas/api). No keys, no business logic here.
"use strict";

(function () {
  const API = "api";

  const STR = {
    es: {
      title: "Reservas",
      mic: "Grabar audio", mic_send: "Enviar audio", mic_cancel: "Cancelar audio", recording: "Grabando…", mic_denied: "No se ha podido usar el micrófono. Puedes escribir tu mensaje.", listen: "Escuchar", voice_privacy: "Si mandas un audio, solo se usa para pasarlo a texto y no se guarda.", privacy_title: "Antes de empezar",
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
      title: "Reserves",
      mic: "Gravar àudio", mic_send: "Enviar àudio", mic_cancel: "Cancel·lar àudio", recording: "Gravant…", mic_denied: "No s'ha pogut fer servir el micròfon. Pots escriure el missatge.", listen: "Escoltar", voice_privacy: "Si envies un àudio, només s'utilitza per passar-lo a text i no es guarda.", privacy_title: "Abans de començar",
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
      title: "Bookings",
      mic: "Record audio", mic_send: "Send audio", mic_cancel: "Cancel audio", recording: "Recording…", mic_denied: "The microphone couldn't be used. You can type your message.", listen: "Listen", voice_privacy: "If you send audio, it is only used to turn it into text and is not stored.", privacy_title: "Before we start",
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
    $("privacy-text").textContent = s("privacy_text") + (voiceAvailable() ? " " + s("voice_privacy") : "");
    document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = s(n.dataset.i18n); });
    $("start").textContent = s("start");
    $("input").placeholder = s("placeholder");
    $("end").textContent = s("end");
    $("mic").setAttribute("aria-label", recorder.active ? s("mic_send") : s("mic"));
    $("mic-cancel").setAttribute("aria-label", s("mic_cancel"));
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
    applyLang();
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
      $("mic").hidden = !voiceAvailable();
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
      if (m.text) log.append(botBubble(m.text));
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


  // ---------- voice: record a note (sent to the backend for transcription) ----------
  const LOCALES = { es: "es-ES", ca: "ca-ES", en: "en-GB" };
  const recorder = { active: false, media: null, chunks: [], stream: null, timer: null, started: 0, cancelled: false };

  function voiceAvailable() {
    if (window.kalmaVoice) return true; // demo adapter
    return !!(state.config && state.config.voice && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function pickMime() {
    const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
    return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  }

  function setRecordingUi(on) {
    recorder.active = on;
    $("mic").classList.toggle("recording", on);
    $("mic").setAttribute("aria-label", on ? s("mic_send") : s("mic"));
    $("mic-cancel").hidden = !on;
    $("send").hidden = on;
    $("input").classList.toggle("recording", on);
    $("input").readOnly = on;
    if (on) {
      recorder.started = Date.now();
      const tick = () => {
        const sec = Math.floor((Date.now() - recorder.started) / 1000);
        $("input").value = `● ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}  ${s("recording")}`;
        if (sec >= 60) stopRecording(false);
      };
      tick();
      recorder.timer = setInterval(tick, 500);
    } else {
      clearInterval(recorder.timer);
      $("input").value = "";
    }
  }

  async function startRecording() {
    if (state.busy || !state.sessionId) return;
    if (window.kalmaVoice) {
      try {
        await window.kalmaVoice.start(state.lang);
        setRecordingUi(true);
      } catch {
        render([{ text: s("mic_denied") }]);
      }
      return;
    }
    try {
      recorder.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      render([{ text: s("mic_denied") }]);
      $("mic").hidden = true;
      return;
    }
    const mime = pickMime();
    recorder.media = new MediaRecorder(recorder.stream, mime ? { mimeType: mime } : undefined);
    recorder.chunks = [];
    recorder.cancelled = false;
    recorder.media.ondataavailable = (e) => { if (e.data && e.data.size) recorder.chunks.push(e.data); };
    recorder.media.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      if (recorder.cancelled) return;
      const blob = new Blob(recorder.chunks, { type: (recorder.media.mimeType || mime || "audio/webm").split(";")[0] });
      sendAudio(blob);
    };
    recorder.media.start();
    setRecordingUi(true);
  }

  async function stopRecording(cancel) {
    if (!recorder.active) return;
    setRecordingUi(false);
    if (window.kalmaVoice) {
      const text = cancel ? "" : (await window.kalmaVoice.stop().catch(() => "")).trim();
      if (cancel) window.kalmaVoice.cancel && window.kalmaVoice.cancel();
      if (text) send("chat", { text }, "🎤 " + text);
      return;
    }
    recorder.cancelled = cancel;
    if (recorder.media && recorder.media.state !== "inactive") recorder.media.stop();
  }

  async function sendAudio(blob) {
    if (state.busy || !state.sessionId) return;
    const mine = el("li", { class: "msg me" }, "🎤 …");
    log.append(mine);
    setBusy(true);
    typing(true);
    try {
      const r = await fetch(`${API}/audio`, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm", "X-Session-Id": state.sessionId }, body: blob });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error((data && data.error) || "http"), { status: r.status });
      typing(false);
      if (data.transcript) mine.textContent = "🎤 " + data.transcript;
      else mine.remove();
      render(data.messages);
    } catch (e) {
      typing(false);
      mine.remove();
      render([{ text: e.status === 410 ? s("expired") : s("error") }]);
      if (e.status === 410) endUi();
    } finally {
      setBusy(false);
      document.querySelectorAll(".ui:not(.done) button").forEach((x) => (x.disabled = false));
    }
  }

  $("mic").addEventListener("click", () => (recorder.active ? stopRecording(false) : startRecording()));
  $("mic-cancel").addEventListener("click", () => stopRecording(true));

  // ---------- voice: read bot messages aloud (the phone's own voice, nothing is sent) ----------
  const canSpeak = !!window.kalmaSpeak || ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
  let speaking = null;

  function speak(text, btn) {
    if (speaking === btn) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    speaking = btn;
    btn.classList.add("on");
    const done = () => { if (speaking === btn) { speaking = null; btn.classList.remove("on"); } };
    if (window.kalmaSpeak) {
      window.kalmaSpeak(text, state.lang).then(done, done);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALES[state.lang];
    const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith(state.lang));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (window.kalmaSpeak && window.kalmaSpeak.stop) window.kalmaSpeak.stop();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (speaking) speaking.classList.remove("on");
    speaking = null;
  }

  function botBubble(text) {
    const li = el("li", { class: "msg bot" }, el("span", {}, text));
    if (canSpeak) {
      const btn = el("button", { type: "button", class: "speak keep", "aria-label": s("listen"), title: s("listen") });
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" fill="currentColor"/></svg>';
      btn.addEventListener("click", () => speak(text, btn));
      li.append(btn);
    }
    return li;
  }

  function endUi() {
    stopRecording(true);
    stopSpeaking();
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
