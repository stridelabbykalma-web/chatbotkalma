/**
 * Emails to the centre. The body is built only from fixed categories and, when the patient
 * gave them, name + phone + email. Never chat text, never health data.
 */
export type NotifyReason =
  | "medical_question"
  | "complaint"
  | "urgent"
  | "human_request"
  | "cancel_help"
  | "unknown_question"
  | "callback_request"
  | "contact_check"
  | "booking_uncertain"
  | "review_required"
  | "other";

export const REASON_LABEL: Record<NotifyReason, string> = {
  medical_question: "Duda clínica (el bot no responde dudas médicas)",
  complaint: "Queja o reclamación",
  urgent: "Posible urgencia (se le ha indicado el 112)",
  human_request: "Quiere hablar con una persona",
  cancel_help: "Necesita ayuda para anular o cambiar una cita",
  unknown_question: "Pregunta que el bot no sabe responder",
  callback_request: "Pide que le llamen",
  contact_check: "Revisar ficha de paciente (posible duplicado o teléfono distinto)",
  booking_uncertain: "Reserva con error: comprobar en Docfav si se creó la cita",
  review_required: "Cita de CatSalut PENDIENTE DE REVISAR: comprobar la derivación del CAP y llamar al paciente",
  other: "Otro motivo",
};

export interface StaffNotice {
  reason: NotifyReason;
  name?: string;
  phone?: string;
  email?: string;
  extra?: string; // only code-generated text (e.g. slot + service), never chat text
}

export interface Mailer {
  send(n: StaffNotice): Promise<boolean>;
}

export function buildEmail(n: StaffNotice): { subject: string; text: string } {
  const lines = [
    `Motivo: ${REASON_LABEL[n.reason]}`,
    n.name ? `Nombre: ${n.name}` : "Nombre: (no lo ha dado)",
    n.phone ? `Teléfono: ${n.phone}` : "Teléfono: (no lo ha dado)",
    n.email ? `Email: ${n.email}` : undefined,
    n.extra ? `Detalle: ${n.extra}` : undefined,
    "",
    "Aviso automático del chat de reservas. Por protección de datos no incluye el texto de la conversación.",
  ].filter((l) => l !== undefined);
  return { subject: `[Chat reservas] ${REASON_LABEL[n.reason]}`, text: lines.join("\n") };
}

/** Brevo (EU provider) transactional email API. */
export class BrevoMailer implements Mailer {
  constructor(
    private apiKey: string,
    private to: string,
    private from: string,
    private fromName: string,
    private fetchFn: typeof fetch = fetch,
  ) {}
  async send(n: StaffNotice): Promise<boolean> {
    const { subject, text } = buildEmail(n);
    try {
      const r = await this.fetchFn("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: { email: this.from, name: this.fromName }, to: [{ email: this.to }], subject, textContent: text }),
        signal: AbortSignal.timeout(8000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}

export class MemoryMailer implements Mailer {
  sent: { subject: string; text: string; notice: StaffNotice }[] = [];
  async send(n: StaffNotice) {
    this.sent.push({ ...buildEmail(n), notice: n });
    return true;
  }
}

export const noopMailer: Mailer = { send: async () => false };
