import { getLanguagePack } from '@/languages/registry';
import { GeminiProvider } from '@/llm/GeminiProvider';
import { LlmError } from '@/llm/types';

const WIRE_OK = {
  transcript: 'Ja chcieć kupić bilet.',
  speaker_is_primary: true,
  has_error: true,
  errors: [
    {
      erroneous_fragment: 'chcieć',
      corrected_fragment: 'chcę',
      error_type: 'conjugation',
      explanation_short: "First person singular of 'chcieć' is 'chcę'.",
    },
  ],
  vocabulary_gaps: [],
  corrected_sentence: 'Ja chcę kupić bilet.',
  feedback_utterance: 'Mówi się: chcę kupić.',
};

function geminiResponse(text: string, usage?: object) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: usage,
  };
}

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const CREDS = { getApiKey: async () => 'test-key' };
const WAV = new Uint8Array([1, 2, 3]);
const CTX = { language: 'pl' as const, recentTranscripts: [] };

describe('GeminiProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns a parsed result with usage-based cost data', async () => {
    mockFetchOnce(
      200,
      geminiResponse(JSON.stringify(WIRE_OK), {
        promptTokenCount: 1100,
        candidatesTokenCount: 140,
      })
    );
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    const result = await provider.checkUtterance(WAV, CTX);
    expect(result.hasError).toBe(true);
    expect(result.errors[0].correctedFragment).toBe('chcę');
    expect(result.usage).toEqual({ inputTokens: 1100, outputTokens: 140 });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('gemini-3.1-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe('audio/wav');
  });

  it('sends the system prompt for the requested language', async () => {
    mockFetchOnce(200, geminiResponse(JSON.stringify(WIRE_OK)));
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    await provider.checkUtterance(WAV, { language: 'es', recentTranscripts: [] });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe(getLanguagePack('es').systemPrompt);
    expect(body.systemInstruction.parts[0].text).toContain('Spanish grammar coach');
  });

  it('retries once on malformed JSON, then succeeds', async () => {
    mockFetchOnce(200, geminiResponse('not json at all'));
    mockFetchOnce(200, geminiResponse(JSON.stringify(WIRE_OK)));
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    const result = await provider.checkUtterance(WAV, CTX);
    expect(result.hasError).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws bad-response after two malformed responses', async () => {
    mockFetchOnce(200, geminiResponse('nope'));
    mockFetchOnce(200, geminiResponse('still nope'));
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    await expect(provider.checkUtterance(WAV, CTX)).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  it('maps 403 to an auth error', async () => {
    mockFetchOnce(403, { error: 'forbidden' });
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    await expect(provider.checkUtterance(WAV, CTX)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps 429 to a rate-limit error', async () => {
    mockFetchOnce(429, { error: 'quota' });
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    await expect(provider.checkUtterance(WAV, CTX)).rejects.toMatchObject({
      kind: 'rate-limit',
      status: 429,
    });
  });

  it('throws auth error immediately when no key is configured', async () => {
    const provider = new GeminiProvider({ getApiKey: async () => null }, 'gemini-3.1-flash-lite');
    await expect(provider.checkUtterance(WAV, CTX)).rejects.toMatchObject({ kind: 'auth' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('checks drill attempts against a target sentence', async () => {
    mockFetchOnce(
      200,
      geminiResponse(
        JSON.stringify({ transcript: 'Szukam mojego telefonu.', correct: true, feedback_short: 'Nice!' })
      )
    );
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    const result = await provider.checkDrillAttempt(WAV, 'Szukam mojego telefonu.', 'pl');
    expect(result).toEqual({
      transcript: 'Szukam mojego telefonu.',
      correct: true,
      feedbackShort: 'Nice!',
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toContain('Szukam mojego telefonu.');
    expect(body.generationConfig.responseSchema.required).toContain('correct');
  });

  it('wraps fetch failures as network errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    const provider = new GeminiProvider(CREDS, 'gemini-3.1-flash-lite');
    const err = await provider.checkUtterance(WAV, CTX).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe('network');
  });
});
