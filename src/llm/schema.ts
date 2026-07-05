import { z } from 'zod';

import { GrammarCheckResult } from './types';

const ERROR_TYPES = ['conjugation', 'case', 'gender', 'aspect', 'word_choice', 'other'] as const;

// Wire format (snake_case, as produced by Gemini via responseSchema).
export const grammarCheckWireSchema = z.object({
  transcript: z.string(),
  speaker_is_primary: z.boolean(),
  has_error: z.boolean(),
  errors: z.array(
    z.object({
      erroneous_fragment: z.string(),
      corrected_fragment: z.string(),
      error_type: z.enum(ERROR_TYPES).catch('other'),
      explanation_short: z.string(),
    })
  ),
  corrected_sentence: z.string(),
  feedback_utterance_pl: z.string(),
});

export type GrammarCheckWire = z.infer<typeof grammarCheckWireSchema>;

/**
 * Parses the model's JSON text into a validated result. Tolerates markdown
 * code fences. Throws ZodError/SyntaxError on violation — the provider retries
 * once, then drops the utterance (never crashes the session loop).
 */
export function parseGrammarCheckResponse(text: string): GrammarCheckResult {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const wire = grammarCheckWireSchema.parse(JSON.parse(stripped));
  return fromWire(wire);
}

export function fromWire(wire: GrammarCheckWire): GrammarCheckResult {
  const errors = wire.errors.map((e) => ({
    erroneousFragment: e.erroneous_fragment,
    correctedFragment: e.corrected_fragment,
    errorType: e.error_type,
    explanationShort: e.explanation_short,
  }));
  // Belt and braces: never surface errors from a non-primary speaker, and
  // keep hasError consistent with the errors list.
  const speakerIsPrimary = wire.speaker_is_primary;
  const hasError = speakerIsPrimary && wire.has_error && errors.length > 0;
  return {
    transcript: wire.transcript,
    speakerIsPrimary,
    hasError,
    errors: hasError ? errors : [],
    correctedSentence: wire.corrected_sentence,
    feedbackUtterance: wire.feedback_utterance_pl,
  };
}

/** JSON schema passed to Gemini's generationConfig.responseSchema. */
export const geminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    speaker_is_primary: { type: 'BOOLEAN' },
    has_error: { type: 'BOOLEAN' },
    errors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          erroneous_fragment: { type: 'STRING' },
          corrected_fragment: { type: 'STRING' },
          error_type: { type: 'STRING', enum: [...ERROR_TYPES] },
          explanation_short: { type: 'STRING' },
        },
        required: ['erroneous_fragment', 'corrected_fragment', 'error_type', 'explanation_short'],
      },
    },
    corrected_sentence: { type: 'STRING' },
    feedback_utterance_pl: { type: 'STRING' },
  },
  required: [
    'transcript',
    'speaker_is_primary',
    'has_error',
    'errors',
    'corrected_sentence',
    'feedback_utterance_pl',
  ],
  propertyOrdering: [
    'transcript',
    'speaker_is_primary',
    'has_error',
    'errors',
    'corrected_sentence',
    'feedback_utterance_pl',
  ],
} as const;
