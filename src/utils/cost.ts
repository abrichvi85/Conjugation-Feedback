// Cost estimation for Gemini audio grammar checks.
// Gemini bills audio input at ~32 tokens per second.

export const AUDIO_TOKENS_PER_SECOND = 32;

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMTok: number;
  /** USD per 1M output tokens */
  outputPerMTok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemini-3.1-flash-lite': { inputPerMTok: 0.25, outputPerMTok: 1.5 },
  'gemini-2.5-flash-lite': { inputPerMTok: 0.1, outputPerMTok: 0.4 },
};

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

/** Typical fixed overhead per call: system prompt + few-shots + context. */
const PROMPT_TEXT_TOKENS = 900;
/** Typical structured JSON response size. */
const OUTPUT_TOKENS = 150;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function costFromUsage(usage: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  return (
    (usage.inputTokens / 1e6) * pricing.inputPerMTok +
    (usage.outputTokens / 1e6) * pricing.outputPerMTok
  );
}

/** Pre-call estimate used for the live cost badge when usage isn't known yet. */
export function estimateUtteranceCostUsd(audioSeconds: number, model: string): number {
  return costFromUsage(
    {
      inputTokens: PROMPT_TEXT_TOKENS + Math.ceil(audioSeconds * AUDIO_TOKENS_PER_SECOND),
      outputTokens: OUTPUT_TOKENS,
    },
    model
  );
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}
