import { getLanguagePack } from '../languages/registry';
import { LanguageCode } from '../languages/types';
import { base64Encode } from '../utils/base64';
import { buildUserContextText } from './prompt';
import {
  geminiDrillResponseSchema,
  geminiResponseSchema,
  parseDrillResponse,
  parseGrammarCheckResponse,
} from './schema';
import {
  CredentialsSource,
  DrillCheckResult,
  GrammarCheckContext,
  GrammarCheckResult,
  LlmError,
  LlmProvider,
} from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 25000;

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';

  constructor(
    private readonly credentials: CredentialsSource,
    readonly model: string
  ) {}

  async checkUtterance(wav: Uint8Array, ctx: GrammarCheckContext): Promise<GrammarCheckResult> {
    const body = {
      systemInstruction: { parts: [{ text: getLanguagePack(ctx.language).systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildUserContextText(ctx) },
            { inlineData: { mimeType: 'audio/wav', data: base64Encode(wav) } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema,
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    // One retry on a malformed/schema-violating response; API errors bubble up.
    let lastParseError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const json = await this.post(`models/${this.model}:generateContent`, body);
      const text = extractText(json);
      try {
        const result = parseGrammarCheckResponse(text);
        const usage = json?.usageMetadata;
        if (usage?.promptTokenCount != null) {
          result.usage = {
            inputTokens: usage.promptTokenCount ?? 0,
            outputTokens:
              (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
          };
        }
        return result;
      } catch (err) {
        lastParseError = err;
      }
    }
    throw new LlmError('bad-response', `Model returned invalid JSON: ${String(lastParseError)}`);
  }

  async checkDrillAttempt(
    wav: Uint8Array,
    target: string,
    language: LanguageCode
  ): Promise<DrillCheckResult> {
    const pack = getLanguagePack(language);
    const body = {
      systemInstruction: {
        parts: [
          {
            text: `You are a ${pack.displayName} pronunciation-agnostic grammar drill checker. The learner was asked to say a target sentence. Transcribe the attached audio and judge ONLY whether the grammar of the target was reproduced correctly: accept minor pronunciation issues, fillers, hesitations, and small wording differences that keep the grammar of the target intact. Reject attempts that reproduce the original grammatical mistake or introduce a new one in the target fragment. feedback_short: one short encouraging English sentence. Respond ONLY with the JSON object.`,
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Target sentence: "${target}"` },
            { inlineData: { mimeType: 'audio/wav', data: base64Encode(wav) } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: geminiDrillResponseSchema,
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const json = await this.post(`models/${this.model}:generateContent`, body);
    try {
      return parseDrillResponse(extractText(json));
    } catch (err) {
      throw new LlmError('bad-response', `Model returned invalid drill JSON: ${String(err)}`);
    }
  }

  async testConnection(): Promise<void> {
    await this.post(`models/${this.model}:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } },
    });
  }

  private async post(path: string, body: unknown): Promise<any> {
    const apiKey = await this.credentials.getApiKey();
    if (!apiKey) throw new LlmError('auth', 'No API key configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new LlmError('network', `Network error: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new LlmError('auth', 'API key rejected', response.status);
    }
    if (response.status === 429) {
      throw new LlmError('rate-limit', 'Rate limited', 429);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError('api', `Gemini API error ${response.status}: ${detail.slice(0, 300)}`, response.status);
    }
    return response.json();
  }
}

function extractText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new LlmError('bad-response', 'No candidates in Gemini response');
  }
  const text = parts.map((p: any) => p?.text ?? '').join('');
  if (!text) throw new LlmError('bad-response', 'Empty text in Gemini response');
  return text;
}
