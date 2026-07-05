import { EnergyVad, VadOptions } from './vad';

export interface Utterance {
  pcm: Int16Array;
  sampleRate: number;
  durationMs: number;
}

export interface SegmenterOptions {
  sampleRate: number;
  /** Audio kept before speech onset so word beginnings aren't clipped. */
  preRollMs: number;
  /** Utterances shorter than this are dropped (coughs, taps). */
  minUtteranceMs: number;
  /** Hard cap; longer speech is split and flushed (cost guardrail). */
  maxUtteranceMs: number;
  vad?: Partial<VadOptions>;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  sampleRate: 16000,
  preRollMs: 300,
  minUtteranceMs: 600,
  maxUtteranceMs: 15000,
};

/**
 * Consumes fixed-size PCM frames, applies VAD, and emits complete utterances
 * (with pre-roll) via the onUtterance callback.
 *
 * `setGated(true)` while TTS is speaking so the app never transcribes its own
 * feedback voice.
 */
export class UtteranceSegmenter {
  private readonly opts: SegmenterOptions;
  private readonly vad: EnergyVad;
  private preRoll: Int16Array[] = [];
  private preRollSamples = 0;
  private current: Int16Array[] = [];
  private currentSamples = 0;
  private gated = false;

  onUtterance: (utterance: Utterance) => void = () => {};

  constructor(options?: Partial<SegmenterOptions>) {
    this.opts = { ...DEFAULT_SEGMENTER_OPTIONS, ...options };
    this.vad = new EnergyVad({ sampleRate: this.opts.sampleRate, ...this.opts.vad });
  }

  get isSpeech(): boolean {
    return this.vad.isSpeech;
  }

  get isGated(): boolean {
    return this.gated;
  }

  setGated(gated: boolean): void {
    if (gated === this.gated) return;
    this.gated = gated;
    if (gated) {
      // Discard any partial capture — it would be contaminated by TTS audio.
      this.current = [];
      this.currentSamples = 0;
      this.preRoll = [];
      this.preRollSamples = 0;
      this.vad.reset();
    }
  }

  pushFrame(frame: Int16Array): void {
    if (this.gated) return;

    const event = this.vad.processFrame(frame);

    if (event === 'speech-start') {
      this.current = [...this.preRoll, frame];
      this.currentSamples = this.preRollSamples + frame.length;
      return;
    }

    if (this.vad.isSpeech || event === 'speech-end') {
      this.current.push(frame);
      this.currentSamples += frame.length;
    } else {
      this.pushPreRoll(frame);
    }

    if (event === 'speech-end') {
      this.emitCurrent();
      return;
    }

    // Hard cap: flush mid-speech and keep capturing the remainder.
    if (this.vad.isSpeech && this.samplesToMs(this.currentSamples) >= this.opts.maxUtteranceMs) {
      this.emitCurrent();
    }
  }

  /** Call on session stop to emit any in-progress speech. */
  flush(): void {
    if (this.vad.isSpeech) this.emitCurrent();
    this.vad.reset();
    this.preRoll = [];
    this.preRollSamples = 0;
  }

  private emitCurrent(): void {
    const durationMs = this.samplesToMs(this.currentSamples);
    const chunks = this.current;
    this.current = [];
    this.currentSamples = 0;
    this.preRoll = [];
    this.preRollSamples = 0;

    if (durationMs < this.opts.minUtteranceMs) return;

    const pcm = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.onUtterance({ pcm, sampleRate: this.opts.sampleRate, durationMs });
  }

  private pushPreRoll(frame: Int16Array): void {
    this.preRoll.push(frame);
    this.preRollSamples += frame.length;
    const maxSamples = this.msToSamples(this.opts.preRollMs);
    while (this.preRollSamples - (this.preRoll[0]?.length ?? 0) >= maxSamples) {
      const removed = this.preRoll.shift();
      if (!removed) break;
      this.preRollSamples -= removed.length;
    }
  }

  private samplesToMs(samples: number): number {
    return (samples / this.opts.sampleRate) * 1000;
  }

  private msToSamples(ms: number): number {
    return Math.round((ms / 1000) * this.opts.sampleRate);
  }
}
