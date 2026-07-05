import { Utterance, UtteranceSegmenter } from '@/audio/UtteranceSegmenter';

const SAMPLE_RATE = 16000;
const FRAME = 512; // 32 ms
const FRAME_MS = (FRAME / SAMPLE_RATE) * 1000;

function silentFrame(): Int16Array {
  return new Int16Array(FRAME);
}

function loudFrame(): Int16Array {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = Math.round(8000 * Math.sin(i / 5));
  return f;
}

function makeSegmenter(overrides = {}) {
  const utterances: Utterance[] = [];
  const seg = new UtteranceSegmenter({
    sampleRate: SAMPLE_RATE,
    preRollMs: 100,
    minUtteranceMs: 300,
    maxUtteranceMs: 2000,
    ...overrides,
  });
  seg.onUtterance = (u) => utterances.push(u);
  return { seg, utterances };
}

function feed(seg: UtteranceSegmenter, frame: () => Int16Array, ms: number) {
  const count = Math.ceil(ms / FRAME_MS);
  for (let i = 0; i < count; i++) seg.pushFrame(frame());
}

describe('UtteranceSegmenter', () => {
  it('emits one utterance with pre-roll for speech surrounded by silence', () => {
    const { seg, utterances } = makeSegmenter();
    feed(seg, silentFrame, 1000);
    feed(seg, loudFrame, 800);
    feed(seg, silentFrame, 1000); // hangover closes it
    expect(utterances).toHaveLength(1);
    // duration ≈ pre-roll (~100ms) + speech (800ms) + hangover (~700ms)
    expect(utterances[0].durationMs).toBeGreaterThan(800);
    expect(utterances[0].pcm.length).toBeGreaterThan((800 / 1000) * SAMPLE_RATE);
  });

  it('drops utterances shorter than minUtteranceMs', () => {
    const { seg, utterances } = makeSegmenter({ minUtteranceMs: 5000 });
    feed(seg, silentFrame, 500);
    feed(seg, loudFrame, 600);
    feed(seg, silentFrame, 1000);
    expect(utterances).toHaveLength(0);
  });

  it('splits speech at maxUtteranceMs', () => {
    const { seg, utterances } = makeSegmenter({ maxUtteranceMs: 1000 });
    feed(seg, silentFrame, 500);
    feed(seg, loudFrame, 3500);
    feed(seg, silentFrame, 1000);
    expect(utterances.length).toBeGreaterThanOrEqual(3);
    for (const u of utterances.slice(0, -1)) {
      expect(u.durationMs).toBeLessThanOrEqual(1100);
    }
  });

  it('ignores all audio while gated (TTS mic-gate)', () => {
    const { seg, utterances } = makeSegmenter();
    feed(seg, silentFrame, 500);
    seg.setGated(true);
    feed(seg, loudFrame, 1500);
    seg.setGated(false);
    feed(seg, silentFrame, 500);
    expect(utterances).toHaveLength(0);
  });

  it('discards in-progress capture when the gate closes mid-utterance', () => {
    const { seg, utterances } = makeSegmenter();
    feed(seg, silentFrame, 500);
    feed(seg, loudFrame, 600); // speech in progress
    seg.setGated(true); // TTS starts speaking
    seg.setGated(false);
    feed(seg, silentFrame, 1000);
    expect(utterances).toHaveLength(0);
  });

  it('flush() emits in-progress speech on session stop', () => {
    const { seg, utterances } = makeSegmenter();
    feed(seg, silentFrame, 500);
    feed(seg, loudFrame, 800);
    seg.flush();
    expect(utterances).toHaveLength(1);
  });
});
