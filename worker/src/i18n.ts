import type { Lang } from "./types";

/** Fixed texts written by code (never by the AI). {x} are replaced by fmt(). */
const T = {
  greeting: {
    es: "¡Hola! Soy el asistente de reservas de Kalma y Stride Lab. Puedo buscarte cita o resolver dudas sobre el centro. ¿Qué necesitas?",
    ca: "Hola! Sóc l'assistent de reserves de Kalma i Stride Lab. Et puc buscar cita o resoldre dubtes sobre el centre. Què necessites?",
    en: "Hi! I'm the Kalma and Stride Lab booking assistant. I can find you an appointment or answer questions about the centre. What do you need?",
  },
  agenda_down: {
    es: "Ahora mismo no puedo acceder a la agenda. El equipo te ayuda a reservar.",
    ca: "Ara mateix no puc accedir a l'agenda. L'equip t'ajuda a reservar.",
    en: "I can't access the schedule right now. The team can help you book.",
  },
  ai_down: {
    es: "Ahora mismo no puedo responderte. El equipo te ayuda.",
    ca: "Ara mateix no et puc respondre. L'equip t'ajuda.",
    en: "I can't answer right now. The team can help you.",
  },
  team_confirms: {
    es: "Eso te lo confirma el equipo.",
    ca: "Això t'ho confirma l'equip.",
    en: "The team will confirm that for you.",
  },
  slot_expired: {
    es: "Ese hueco ya no está disponible en esta conversación. Te enseño los huecos libres de nuevo.",
    ca: "Aquesta hora ja no està disponible en aquesta conversa. Et torno a ensenyar les hores lliures.",
    en: "That slot is no longer available in this conversation. Here are the free slots again.",
  },
  ask_contact: {
    es: "Perfecto: {slot}. Para reservar necesito tu nombre, apellidos, móvil y email.",
    ca: "Perfecte: {slot}. Per reservar necessito el teu nom, cognoms, mòbil i correu.",
    en: "Great: {slot}. To book I need your first name, surname, mobile and email.",
  },
  invalid_contact: {
    es: "Revisa estos datos: {fields}.",
    ca: "Revisa aquestes dades: {fields}.",
    en: "Please check: {fields}.",
  },
  field_firstName: { es: "nombre (sin números)", ca: "nom (sense números)", en: "first name (no numbers)" },
  field_lastName: { es: "apellidos (sin números)", ca: "cognoms (sense números)", en: "surname (no numbers)" },
  field_phone: { es: "móvil", ca: "mòbil", en: "mobile" },
  field_email: { es: "email", ca: "correu", en: "email" },
  summary_intro: {
    es: "Revisa tu reserva. Solo se hará cuando pulses «Confirmar».",
    ca: "Revisa la teva reserva. Només es farà quan premis «Confirmar».",
    en: "Please review your booking. It will only be made when you tap “Confirm”.",
  },
  summary_price: { es: "Precio: {price}", ca: "Preu: {price}", en: "Price: {price}" },
  summary_for: { es: "A nombre de: {name}", ca: "A nom de: {name}", en: "Booked for: {name}" },
  limit_reached: {
    es: "Ya tienes {n} citas próximas reservadas desde el chat, que es el máximo. Para otra cita, contacta con el centro.",
    ca: "Ja tens {n} cites properes reservades des del xat, que és el màxim. Per a una altra cita, contacta amb el centre.",
    en: "You already have {n} upcoming appointments booked through the chat, which is the maximum. For another one, please contact the centre.",
  },
  token_invalid: {
    es: "Esta confirmación ha caducado o ya se usó. Te enseño los huecos libres de nuevo.",
    ca: "Aquesta confirmació ha caducat o ja s'ha fet servir. Et torno a ensenyar les hores lliures.",
    en: "This confirmation has expired or was already used. Here are the free slots again.",
  },
  slot_taken: {
    es: "Vaya, ese hueco se acaba de ocupar. Estos siguen libres:",
    ca: "Vaja, aquesta hora s'acaba d'ocupar. Aquestes continuen lliures:",
    en: "Sorry, that slot has just been taken. These are still free:",
  },
  no_slots: {
    es: "No he encontrado huecos libres con esas preferencias. ¿Probamos otras fechas o franja?",
    ca: "No he trobat hores lliures amb aquestes preferències. Provem altres dates o franja?",
    en: "I couldn't find free slots with those preferences. Shall we try other dates or times?",
  },
  booked: {
    es: "¡Reserva hecha! {slot} · {service}. Dirección: {address}.",
    ca: "Reserva feta! {slot} · {service}. Adreça: {address}.",
    en: "Booked! {slot} · {service}. Address: {address}.",
  },
  booked_dry_run: {
    es: "(MODO PRUEBA: la cita NO se ha creado en Docfav.)",
    ca: "(MODE PROVA: la cita NO s'ha creat a Docfav.)",
    en: "(TEST MODE: the appointment was NOT created in Docfav.)",
  },
  bring: { es: "Qué traer: {text}", ca: "Què portar: {text}", en: "What to bring: {text}" },
  booked_footer: {
    es: "Te llegará un mensaje de confirmación con un enlace por si necesitas anularla.",
    ca: "Et vindrà un missatge de confirmació amb un enllaç per si l'has d'anul·lar.",
    en: "You'll get a confirmation message with a link in case you need to cancel.",
  },
  booking_failed: {
    es: "No he podido completar la reserva. No se ha creado ninguna cita. Contacta con el centro y te ayudamos.",
    ca: "No he pogut completar la reserva. No s'ha creat cap cita. Contacta amb el centre i t'ajudarem.",
    en: "I couldn't complete the booking. No appointment was created. Please contact the centre and we'll help you.",
  },
  booking_uncertain: {
    es: "No he podido confirmar si la reserva se ha guardado. Para evitar duplicados, el equipo lo revisará y te contactará. También puedes llamar al centro.",
    ca: "No he pogut confirmar si la reserva s'ha desat. Per evitar duplicats, l'equip ho revisarà i et contactarà. També pots trucar al centre.",
    en: "I couldn't confirm whether the booking was saved. To avoid duplicates, the team will check and contact you. You can also call the centre.",
  },
  cancelled_pending: {
    es: "De acuerdo, no he reservado nada. ¿Quieres buscar otro hueco?",
    ca: "D'acord, no he reservat res. Vols buscar una altra hora?",
    en: "OK, I haven't booked anything. Would you like to look for another slot?",
  },
  rate_minute: {
    es: "Vas muy rápido. Espera unos segundos y vuelve a escribir.",
    ca: "Vas molt de pressa. Espera uns segons i torna a escriure.",
    en: "You're going too fast. Wait a few seconds and try again.",
  },
  rate_total: {
    es: "Hemos llegado al límite de mensajes de esta conversación. Para seguir, contacta con el centro.",
    ca: "Hem arribat al límit de missatges d'aquesta conversa. Per continuar, contacta amb el centre.",
    en: "We've reached the message limit for this conversation. To continue, please contact the centre.",
  },
  callback_thanks: {
    es: "Gracias. He avisado al equipo y te contactarán lo antes posible.",
    ca: "Gràcies. He avisat l'equip i et contactaran al més aviat possible.",
    en: "Thanks. I've told the team and they'll contact you as soon as possible.",
  },
  callback_offer: {
    es: "Si quieres, déjanos tu nombre y móvil y te llamamos.",
    ca: "Si vols, deixa'ns el teu nom i mòbil i et truquem.",
    en: "If you like, leave your name and mobile and we'll call you.",
  },
  portal_intro: {
    es: "Puedes reservar directamente en nuestra agenda online:",
    ca: "Pots reservar directament a la nostra agenda en línia:",
    en: "You can book directly in our online schedule:",
  },
  price_free: { es: "a consultar", ca: "a consultar", en: "ask the team" },
} as const satisfies Record<string, Record<Lang, string>>;

export type MsgKey = keyof typeof T;

export function t(lang: Lang, key: MsgKey, vars: Record<string, string | number> = {}): string {
  const s: string = T[key][lang] ?? T[key].es;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
