import { getLanguagePack } from '../languages/registry';
import { base64Encode } from '../utils/base64';
import { buildUserContextText } from './prompt';
import { geminiResponseSchema, parseGrammarCheckResponse } from './schema';
import {
  CredentialsSource,
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
