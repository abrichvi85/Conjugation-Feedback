import { FeedbackPolicy, feedbackDedupKey } from '@/pipeline/FeedbackPolicy';

const base = { utteranceSeq: 1, latestSeq: 1, now: 1000 };

describe('feedbackDedupKey', () => {
  it('normalizes case and whitespace', () => {
    expect(feedbackDedupKey('case', '  Mojego Telefonu ')).toBe('case:mojego telefonu');
  });
});

describe('FeedbackPolicy', () => {
  it('speaks the first occurrence in voice mode', () => {
    const p = new FeedbackPolicy({ mode: 'voice' });
    expect(p.decide({ ...base, dedupKey: 'case:x' })).toBe('speak');
  });

  it('logs identical repeats silently and counts them', () => {
    const p = new FeedbackPolicy({ mode: 'voice' });
    p.decide({ ...base, dedupKey: 'case:x' });
    expect(p.decide({ ...base, dedupKey: 'case:x', now: 2000 })).toBe('log-only');
    expect(p.decide({ ...base, dedupKey: 'case:x', now: 3000 })).toBe('log-only');
    expect(p.repeatCount('case:x')).toBe(3);
    // a different correction is still fresh
    expect(p.decide({ ...base, dedupKey: 'gender:y', now: 4000 })).toBe('speak');
  });

  it('downgrades voice to chime once the rolling spoken cap is hit', () => {
    const p = new FeedbackPolicy({ mode: 'voice', maxSpokenPerWindow: 2, windowMs: 10000 });
    for (let i = 0; i < 2; i++) {
      expect(p.decide({ ...base, dedupKey: `k${i}`, now: 1000 + i })).toBe('speak');
      p.recordSpoken(1000 + i);
    }
    expect(p.decide({ ...base, dedupKey: 'k2', now: 1500 })).toBe('chime');
    // window rolls: old spokens age out
    expect(p.decide({ ...base, dedupKey: 'k3', now: 20000 })).toBe('speak');
  });

  it('always chimes (never speaks) in chime mode', () => {
    const p = new FeedbackPolicy({ mode: 'chime' });
    expect(p.decide({ ...base, dedupKey: 'a' })).toBe('chime');
  });

  it('stays silent in off mode', () => {
    const p = new FeedbackPolicy({ mode: 'off' });
    expect(p.decide({ ...base, dedupKey: 'a' })).toBe('log-only');
  });

  it('drops corrections that are stale relative to newer utterances', () => {
    const p = new FeedbackPolicy({ mode: 'voice', maxStaleUtterances: 2 });
    expect(p.decide({ dedupKey: 'a', utteranceSeq: 1, latestSeq: 3, now: 1000 })).toBe('log-only');
    expect(p.decide({ dedupKey: 'b', utteranceSeq: 2, latestSeq: 3, now: 1000 })).toBe('speak');
  });

  it('expires corrections held too long for a silence gap', () => {
    const p = new FeedbackPolicy({ mode: 'voice', holdExpiryMs: 10000 });
    expect(p.isExpired(1000, 5000)).toBe(false);
    expect(p.isExpired(1000, 11500)).toBe(true);
  });
});
