import {
  AUDIO_TOKENS_PER_SECOND,
  costFromUsage,
  estimateUtteranceCostUsd,
  formatUsd,
} from '@/utils/cost';

describe('cost', () => {
  it('computes cost from usage at published prices', () => {
    // 1M input at $0.25 + 1M output at $1.50
    expect(costFromUsage({ inputTokens: 1e6, outputTokens: 1e6 }, 'gemini-3.1-flash-lite')).toBeCloseTo(
      1.75
    );
    expect(costFromUsage({ inputTokens: 1e6, outputTokens: 0 }, 'gemini-2.5-flash-lite')).toBeCloseTo(
      0.1
    );
  });

  it('falls back to default pricing for unknown models', () => {
    const known = costFromUsage({ inputTokens: 1000, outputTokens: 100 }, 'gemini-3.1-flash-lite');
    const unknown = costFromUsage({ inputTokens: 1000, outputTokens: 100 }, 'some-future-model');
    expect(unknown).toBe(known);
  });

  it('a 6-second utterance costs a fraction of a cent', () => {
    const cost = estimateUtteranceCostUsd(6, 'gemini-3.1-flash-lite');
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.001);
  });

  it('audio token rate is what the estimate assumes', () => {
    expect(AUDIO_TOKENS_PER_SECOND).toBe(32);
  });

  it('formats sub-cent and normal amounts', () => {
    expect(formatUsd(0.0004)).toBe('<$0.01');
    expect(formatUsd(0.128)).toBe('$0.13');
  });
});
