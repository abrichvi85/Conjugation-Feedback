import { parseGrammarCheckResponse } from '@/llm/schema';

const VALID = {
  transcript: 'Szukam mój telefon.',
  speaker_is_primary: true,
  has_error: true,
  errors: [
    {
      erroneous_fragment: 'mój telefon',
      corrected_fragment: 'mojego telefonu',
      error_type: 'case',
      explanation_short: "'Szukać' takes the genitive case.",
    },
  ],
  corrected_sentence: 'Szukam mojego telefonu.',
  feedback_utterance: 'Mówi się: szukam mojego telefonu.',
};

describe('parseGrammarCheckResponse', () => {
  it('parses a valid response and maps to camelCase', () => {
    const result = parseGrammarCheckResponse(JSON.stringify(VALID));
    expect(result.hasError).toBe(true);
    expect(result.errors[0]).toEqual({
      erroneousFragment: 'mój telefon',
      correctedFragment: 'mojego telefonu',
      errorType: 'case',
      explanationShort: "'Szukać' takes the genitive case.",
    });
    expect(result.feedbackUtterance).toBe('Mówi się: szukam mojego telefonu.');
  });

  it('tolerates markdown code fences', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseGrammarCheckResponse(fenced).hasError).toBe(true);
  });

  it('suppresses errors from a non-primary speaker', () => {
    const wire = { ...VALID, speaker_is_primary: false };
    const result = parseGrammarCheckResponse(JSON.stringify(wire));
    expect(result.hasError).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('forces hasError=false when the errors list is empty', () => {
    const wire = { ...VALID, errors: [] };
    const result = parseGrammarCheckResponse(JSON.stringify(wire));
    expect(result.hasError).toBe(false);
  });

  it('coerces unknown error types to "other"', () => {
    const wire = {
      ...VALID,
      errors: [{ ...VALID.errors[0], error_type: 'spelling' }],
    };
    const result = parseGrammarCheckResponse(JSON.stringify(wire));
    expect(result.errors[0].errorType).toBe('other');
  });

  it('throws on missing required fields', () => {
    const { transcript: _dropped, ...incomplete } = VALID;
    expect(() => parseGrammarCheckResponse(JSON.stringify(incomplete))).toThrow();
  });

  it('throws on non-JSON text', () => {
    expect(() => parseGrammarCheckResponse('Sure! Here is the analysis:')).toThrow();
  });
});
