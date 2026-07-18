/**
 * Decides how each detected mistake is delivered, so the coach stays polite:
 *
 * - Dedup: the first occurrence of a given correction in a session gets the
 *   full treatment; identical repeats are logged silently (History still
 *   records every one).
 * - Spoken cap: at most N spoken corrections per rolling window; when the cap
 *   is hit, voice downgrades to a chime so the user still gets a signal.
 * - Staleness: if newer utterances have already been processed by the time a
 *   correction is ready, speaking it would reference a sentence the
 *   conversation has moved past — log it instead.
 * - Hold expiry: a correction waiting for a conversational lull is dropped to
 *   log-only after holdExpiryMs.
 *
 * Pure logic (all timestamps passed in) so it is unit-testable.
 */

export type FeedbackMode = 'voice' | 'chime' | 'off';
export type FeedbackAction = 'speak' | 'chime' | 'log-only';

export interface FeedbackPolicyOptions {
  mode: FeedbackMode;
  /** Max spoken corrections per rolling window. */
  maxSpokenPerWindow: number;
  windowMs: number;
  /** How many newer utterances make a pending correction stale. */
  maxStaleUtterances: number;
  /** How long a correction may wait for a silence gap before it is dropped. */
  holdExpiryMs: number;
}

export const DEFAULT_FEEDBACK_POLICY: Omit<FeedbackPolicyOptions, 'mode'> = {
  maxSpokenPerWindow: 6,
  windowMs: 10 * 60_000,
  maxStaleUtterances: 2,
  holdExpiryMs: 10_000,
};

export interface FeedbackDecisionInput {
  /** Stable identity of the correction, e.g. `${errorType}:${correctedFragment}`. */
  dedupKey: string;
  /** Sequence number of the utterance this correction belongs to. */
  utteranceSeq: number;
  /** Sequence number of the newest utterance processed so far. */
  latestSeq: number;
  now: number;
}

export function feedbackDedupKey(errorType: string, correctedFragment: string): string {
  return `${errorType}:${correctedFragment.trim().toLowerCase()}`;
}

export class FeedbackPolicy {
  private readonly opts: FeedbackPolicyOptions;
  private readonly seen = new Map<string, number>();
  private spokenAt: number[] = [];

  constructor(options: Partial<FeedbackPolicyOptions> & { mode: FeedbackMode }) {
    this.opts = { ...DEFAULT_FEEDBACK_POLICY, ...options };
  }

  /** The user may flip the feedback mode mid-session; dedup/cap state survives. */
  setMode(mode: FeedbackMode): void {
    this.opts.mode = mode;
  }

  /** Times a dedupKey has been decided before (for "again" counters in the UI). */
  repeatCount(dedupKey: string): number {
    return this.seen.get(dedupKey) ?? 0;
  }

  decide(input: FeedbackDecisionInput): FeedbackAction {
    const repeats = this.seen.get(input.dedupKey) ?? 0;
    this.seen.set(input.dedupKey, repeats + 1);

    if (this.opts.mode === 'off') return 'log-only';
    if (this.isStale(input.utteranceSeq, input.latestSeq)) return 'log-only';
    if (repeats > 0) return 'log-only';

    if (this.opts.mode === 'chime') return 'chime';

    // voice mode: downgrade to chime once the rolling spoken cap is hit
    this.spokenAt = this.spokenAt.filter((t) => input.now - t < this.opts.windowMs);
    if (this.spokenAt.length >= this.opts.maxSpokenPerWindow) return 'chime';
    return 'speak';
  }

  /** Call after actually speaking, so the rolling cap advances. */
  recordSpoken(now: number): void {
    this.spokenAt.push(now);
  }

  isStale(utteranceSeq: number, latestSeq: number): boolean {
    return latestSeq - utteranceSeq >= this.opts.maxStaleUtterances;
  }

  isExpired(enqueuedAt: number, now: number): boolean {
    return now - enqueuedAt >= this.opts.holdExpiryMs;
  }
}
