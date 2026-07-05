export type ErrorType = 'conjugation' | 'case' | 'gender' | 'aspect' | 'word_choice' | 'other';

export interface GrammarError {
  erroneousFragment: string;
  correctedFragment: string;
  errorType: ErrorType;
  explanationShort: string;
}

export interface GrammarCheckResult {
  transcript: string;
  /** false when the audio sounds like a distant/secondary speaker — never correct those. */
  speakerIsPrimary: boolean;
  hasError: boolean;
  errors: GrammarError[];
  correctedSentence: string;
  /** Short spoken correction in the target language, e.g. "Mówi się: poszłam do sklepu." */
  feedbackUtterance: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface GrammarCheckContext {
  language: 'pl';
  /** Last few transcripts from this session, for gender/pronoun continuity. */
  recentTranscripts: string[];
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

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  /** Transcribe + grammar-check one utterance (16-bit PCM WAV bytes). */
  checkUtterance(wav: Uint8Array, ctx: GrammarCheckContext): Promise<GrammarCheckResult>;
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
