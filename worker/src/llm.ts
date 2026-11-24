import Anthropic from "@anthropic-ai/sdk";

export interface LLMRequest {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}

export interface LLMResponse {
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: string | null;
}

export interface LLM {
  create(req: LLMRequest): Promise<LLMResponse>;
}

/** Models that accept the server-side refusal fallback ("default" routing). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);

export class AnthropicLLM implements LLM {
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model: string,
    private effort: "low" | "medium" | "high",
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
  }

  async create(req: LLMRequest): Promise<LLMResponse> {
    const useFallback = FALLBACK_MODELS.has(this.model);
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      output_config: { effort: this.effort },
      cache_control: { type: "ephemeral" },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    return { content: res.content, stop_reason: res.stop_reason };
  }
}
