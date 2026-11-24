import type Anthropic from "@anthropic-ai/sdk";
import type { LLM, LLMRequest, LLMResponse } from "./llm";

/**
 * AI_MODEL=demo: a few keyword rules instead of Claude, to try the page locally without an
 * API key. It only uses the same tools as the real model. Never use it in production.
 */
export class DemoLLM implements LLM {
  private seq = 0;
  async create(req: LLMRequest): Promise<LLMResponse> {
    const last = req.messages[req.messages.length - 1];
    const text = (r: string): LLMResponse => ({ content: [{ type: "text", text: r, citations: null } as Anthropic.Beta.BetaTextBlock], stop_reason: "end_turn" });
    const tool = (name: string, input: Record<string, unknown>): LLMResponse => ({
      content: [{ type: "tool_use", id: `demo_${++this.seq}`, name, input } as Anthropic.Beta.BetaToolUseBlock],
      stop_reason: "tool_use",
    });
    if (Array.isArray(last.content) && last.content.some((b: any) => b.type === "tool_result")) {
      const r = String((last.content[0] as any).content ?? "");
      if (r.includes("slots_shown_as_buttons")) return text("Estos son los huecos libres más cercanos. Elige el que mejor te vaya.");
      if (r.includes("agenda_unavailable")) return text("Ahora mismo no puedo acceder a la agenda.");
      return text("Para anular usa el enlace del recordatorio de Docfav o llama al {{telefono}}.");
    }
    const msg = (typeof last.content === "string" ? last.content : "").toLowerCase();
    const service = /quiro/.test(msg) ? "quiropodia" : /plantill/.test(msg) && /revis/.test(msg) ? "revision_plantillas" : /plantill/.test(msg) ? "plantillas" : /carrera|correr|biomec|running/.test(msg) ? "estudio_biomecanico" : null;
    if (/anul|cancel/.test(msg)) return tool("show_contact", {});
    if (/precio|cuesta|cuánto|quant/.test(msg) && service) return text(`Cuesta {{precio:${service}}} y dura {{duracion:${service}}}.`);
    if (service) return tool("get_availability", { service_id: service, part_of_day: /tarde/.test(msg) ? "afternoon" : /mañana/.test(msg) ? "morning" : "any" });
    return tool("offer_options", { options: ["Estudio de la carrera", "Plantillas a medida", "Quiropodia", "Revisión de plantillas"] });
  }
}
