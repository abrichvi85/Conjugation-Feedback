import LiveAudioStream from 'react-native-live-audio-stream';

import { base64Decode } from '../utils/base64';

export const SAMPLE_RATE = 16000;
/** 32 ms at 16 kHz — the fixed frame size the VAD expects. */
export const FRAME_SAMPLES = 512;

/**
 * Wraps react-native-live-audio-stream: starts continuous 16 kHz mono 16-bit
 * capture and rebuffers the variable-size native chunks into fixed
 * FRAME_SAMPLES frames for the segmenter.
 */
export class AudioCapture {
  private running = false;
  private initialized = false;
  private remainder: Int16Array = new Int16Array(0);
  private onFrame: (frame: Int16Array) => void = () => {};

  start(onFrame: (frame: Int16Array) => void): void {
    this.onFrame = onFrame;
    this.remainder = new Int16Array(0);

    if (!this.initialized) {
      LiveAudioStream.init({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // Android VOICE_RECOGNITION; ignored on iOS
        bufferSize: FRAME_SAMPLES * 2 * 4,
        wavFile: '', // unused: we consume the raw stream
      });
      LiveAudioStream.on('data', (chunkBase64: string) => this.handleChunk(chunkBase64));
      this.initialized = true;
    }

    this.running = true;
    LiveAudioStream.start();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    LiveAudioStream.stop();
  }

  private handleChunk(chunkBase64: string): void {
    if (!this.running) return;
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
