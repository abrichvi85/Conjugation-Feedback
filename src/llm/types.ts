import { LanguageCode } from '../languages/types';

export type ErrorType = 'conjugation' | 'case' | 'gender' | 'aspect' | 'word_choice' | 'other';

export interface GrammarError {
  erroneousFragment: string;
  correctedFragment: string;
  errorType: ErrorType;
  explanationShort: string;
}

/**
 * A moment where the learner was missing a word: they code-switched to
 * another language or clearly circumlocuted. Not an error — a vocabulary
 * to-learn item mined from real conversation.
 */
export interface VocabularyGap {
  /** What the learner actually said, e.g. "no i ten... deadline". */
  nativeFragment: string;
  /** What they were trying to express, in English. */
  intendedMeaning: string;
  /** The word/phrase in the target language, e.g. "termin". */
  targetSuggestion: string;
}

export type SpeakerGender = 'unspecified' | 'female' | 'male';
export type SpeakerLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SpeakerProfile {
  gender: SpeakerGender;
  level: SpeakerLevel;
}

export interface GrammarCheckResult {
  transcript: string;
  /** false when the audio sounds like a distant/secondary speaker — never correct those. */
  speakerIsPrimary: boolean;
  hasError: boolean;
  errors: GrammarError[];
  vocabularyGaps: VocabularyGap[];
  correctedSentence: string;
  /** Short spoken correction in the target language, e.g. "Mówi się: poszłam do sklepu." */
  feedbackUtterance: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface GrammarCheckContext {
  language: LanguageCode;
  /** Last few transcripts from this session, for gender/pronoun continuity. */
  recentTranscripts: string[];
  /** Optional speaker facts that beat inference (past-tense gender forms, explanation language). */
  profile?: SpeakerProfile;
}

export type LlmErrorKind = 'auth' | 'rate-limit' | 'network' | 'bad-response' | 'api';

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface DrillCheckResult {
  transcript: string;
  /** Whether the attempt matches the target sentence grammatically. */
  correct: boolean;
  /** One short encouraging sentence in English. */
  feedbackShort: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  /** Transcribe + grammar-check one utterance (16-bit PCM WAV bytes). */
  checkUtterance(wav: Uint8Array, ctx: GrammarCheckContext): Promise<GrammarCheckResult>;
  /** Practice drill: did the learner say the target sentence correctly? */
  checkDrillAttempt(
    wav: Uint8Array,
    target: string,
    language: LanguageCode
  ): Promise<DrillCheckResult>;
  /** Cheap connectivity/key validation for the Settings "test key" button. */
  testConnection(): Promise<void>;
}

/**
 * Where API credentials come from. Today: the key the user pasted into
 * settings (secure storage). Later: an OAuth token exchange ("Sign in with
 * ChatGPT" when GA) or a session with our backend proxy — new implementations
 * of this interface, no provider rewrite.
 */
export interface CredentialsSource {
  getApiKey(): Promise<string | null>;
}
