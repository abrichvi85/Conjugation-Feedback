// Energy-based voice activity detection.
//
// Pure logic (no audio APIs) so it is unit-testable with synthetic PCM.
// The AirPods HFP mic strongly favors the wearer's voice, which is what makes
// a simple energy VAD viable for "correct only the wearer" in the MVP.

export interface VadOptions {
  sampleRate: number;
  /** Consecutive above-threshold frames required to enter speech. */
  onsetFrames: number;
  /** Trailing silence that closes an utterance. */
  hangoverMs: number;
  /** EMA coefficient for the adaptive noise floor (updated during silence). */
  noiseFloorAlpha: number;
  /** Speech threshold = noiseFloor * thresholdRatio (clamped to minThreshold). */
  thresholdRatio: number;
  /** Absolute RMS floor on int16 scale, so silence in a dead-quiet room doesn't trigger. */
  minThreshold: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  sampleRate: 16000,
  onsetFrames: 3,
  hangoverMs: 700,
  noiseFloorAlpha: 0.05,
  thresholdRatio: 3.0,
  minThreshold: 500,
};

export type VadEvent = 'speech-start' | 'speech-end' | null;

export function rms(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

export class EnergyVad {
  private readonly opts: VadOptions;
  private noiseFloor: number;
  private inSpeech = false;
  private aboveCount = 0;
  private silenceMs = 0;

  constructor(options?: Partial<VadOptions>) {
    this.opts = { ...DEFAULT_VAD_OPTIONS, ...options };
    this.noiseFloor = this.opts.minThreshold / this.opts.thresholdRatio;
  }

  get isSpeech(): boolean {
    return this.inSpeech;
  }

  get threshold(): number {
    return Math.max(this.noiseFloor * this.opts.thresholdRatio, this.opts.minThreshold);
  }

  get currentNoiseFloor(): number {
    return this.noiseFloor;
  }

  reset(): void {
    this.inSpeech = false;
    this.aboveCount = 0;
    this.silenceMs = 0;
  }

  /** Feed one PCM frame; returns a transition event or null. */
  processFrame(frame: Int16Array): VadEvent {
    const frameMs = (frame.length / this.opts.sampleRate) * 1000;
    const energy = rms(frame);
    const above = energy > this.threshold;

    if (!this.inSpeech) {
      if (above) {
        this.aboveCount++;
        if (this.aboveCount >= this.opts.onsetFrames) {
          this.inSpeech = true;
          this.silenceMs = 0;
          return 'speech-start';
        }
      } else {
        this.aboveCount = 0;
        // Only learn the noise floor from non-speech audio.
        const a = this.opts.noiseFloorAlpha;
        this.noiseFloor = (1 - a) * this.noiseFloor + a * energy;
      }
      return null;
    }

    if (above) {
      this.silenceMs = 0;
    } else {
      this.silenceMs += frameMs;
      if (this.silenceMs >= this.opts.hangoverMs) {
        this.inSpeech = false;
        this.aboveCount = 0;
        this.silenceMs = 0;
        return 'speech-end';
      }
    }
    return null;
  }
}
