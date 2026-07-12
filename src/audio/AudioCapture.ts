import { AudioStudioModule } from '@siteed/audio-studio';
import { LegacyEventEmitter, type EventSubscription } from 'expo-modules-core';

import { base64Decode } from '../utils/base64';

export const SAMPLE_RATE = 16000;
/** 32 ms at 16 kHz — the fixed frame size the VAD expects. */
export const FRAME_SAMPLES = 512;
/** How often the native recorder emits a PCM chunk. */
const EMIT_INTERVAL_MS = 32;

// Mirror the library's own event wiring: it exposes recording data through a
// LegacyEventEmitter('AudioData') on the native module. We drive the recorder
// imperatively (outside React) because the SessionPipeline owns it.
const emitter = new LegacyEventEmitter(AudioStudioModule);

/**
 * Continuous 16 kHz mono 16-bit capture via @siteed/audio-studio, which also
 * runs the Android foreground service (configured in app.json) so a session
 * survives the screen locking, and keeps the iOS audio session alive for
 * AirPods. Variable-size native chunks are rebuffered into fixed FRAME_SAMPLES
 * frames for the segmenter.
 */
export class AudioCapture {
  private running = false;
  private generation = 0;
  private subscription: EventSubscription | null = null;
  private remainder: Int16Array = new Int16Array(0);
  private onFrame: (frame: Int16Array) => void = () => {};

  async start(onFrame: (frame: Int16Array) => void): Promise<void> {
    const generation = ++this.generation;
    this.onFrame = onFrame;
    this.remainder = new Int16Array(0);
    this.running = true;

    this.subscription = emitter.addListener('AudioData', (event: { encoded?: string }) => {
      if (!this.running || !event?.encoded) return;
      this.handleChunk(event.encoded);
    });

    try {
      // No raw/compressed files (privacy + disk) — streaming only. The
      // notification + background audio focus keep capture alive in the pocket.
      await AudioStudioModule.startRecording({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: EMIT_INTERVAL_MS,
        keepAwake: true,
        showNotification: true,
        enableProcessing: false,
        autoResumeAfterInterruption: true,
        output: { primary: { enabled: false }, compressed: { enabled: false } },
        audioFocusStrategy: 'background',
        notification: {
          title: 'Conjugation Feedback',
          text: 'Listening for corrections…',
          android: {
            channelId: 'listening-session',
            channelName: 'Listening session',
            priority: 'low',
            showPauseResumeActions: false,
          },
        },
      });
      if (!this.running || this.generation !== generation) {
        await AudioStudioModule.stopRecording().catch(() => undefined);
        throw new Error('Audio capture start was cancelled');
      }
    } catch (error) {
      if (this.generation === generation) {
        this.running = false;
        this.subscription?.remove();
        this.subscription = null;
      }
      throw error;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.generation++;
    this.running = false;
    this.subscription?.remove();
    this.subscription = null;
    void AudioStudioModule.stopRecording().catch(() => {
      // The native recorder can already be stopped after an interruption.
    });
  }

  private handleChunk(chunkBase64: string): void {
    const bytes = base64Decode(chunkBase64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));

    const combined = new Int16Array(this.remainder.length + samples.length);
    combined.set(this.remainder, 0);
    combined.set(samples, this.remainder.length);

    let offset = 0;
    while (offset + FRAME_SAMPLES <= combined.length) {
      this.onFrame(combined.subarray(offset, offset + FRAME_SAMPLES));
      offset += FRAME_SAMPLES;
    }
    this.remainder = combined.subarray(offset).slice();
  }
}
