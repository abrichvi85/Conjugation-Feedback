import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { pcmToWav } from '../audio/wav';

const SAMPLE_RATE = 16000;

/**
 * Synthesizes the correction earcon — a soft two-note chime (E5 → A4) with a
 * short decay, ~0.36 s total. Pure DSP over our own WAV encoder, so there is
 * no bundled asset and no license to track.
 */
export function synthesizeChimePcm(): Int16Array {
  const notes = [
    { freq: 659.25, ms: 140 }, // E5
    { freq: 440.0, ms: 220 }, // A4
  ];
  const total = Math.round((notes.reduce((s, n) => s + n.ms, 0) / 1000) * SAMPLE_RATE);
  const pcm = new Int16Array(total);
  let offset = 0;
  for (const note of notes) {
    const samples = Math.round((note.ms / 1000) * SAMPLE_RATE);
    for (let i = 0; i < samples; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, i / (0.01 * SAMPLE_RATE));
      const decay = Math.exp(-4 * (i / samples));
      // fundamental + a quiet octave for a slightly bell-like timbre
      const sample =
        0.28 * Math.sin(2 * Math.PI * note.freq * t) +
        0.08 * Math.sin(2 * Math.PI * note.freq * 2 * t);
      pcm[offset + i] = Math.round(32767 * sample * attack * decay);
    }
    offset += samples;
  }
  return pcm;
}

export const CHIME_DURATION_MS = 400;

let chimeUri: string | null = null;

function ensureChimeFile(): string {
  if (chimeUri) return chimeUri;
  const wav = pcmToWav(synthesizeChimePcm(), SAMPLE_RATE);
  const file = new File(Paths.cache, 'earcon-correction.wav');
  file.write(new Uint8Array(wav));
  chimeUri = file.uri;
  return chimeUri;
}

/**
 * Plays the correction chime into the current audio route (AirPods during a
 * session) and resolves roughly when it has finished. Failures are swallowed —
 * an earcon must never break the session loop.
 */
export async function playCorrectionChime(): Promise<void> {
  try {
    const player = createAudioPlayer(ensureChimeFile());
    player.play();
    await new Promise((resolve) => setTimeout(resolve, CHIME_DURATION_MS));
    player.remove();
  } catch {
    // no-op: chime is best-effort
  }
}
