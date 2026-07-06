/**
 * Prompt-iteration harness: replay recorded WAV fixtures through the real
 * segmenter + GeminiProvider and print the JSON verdicts.
 *
 * Usage:
 *   GEMINI_API_KEY=... npm run replay -- fixtures/pl/blad-koniugacja.wav [more.wav]
 *   GEMINI_API_KEY=... REPLAY_LANGUAGE=es npm run replay -- fixtures/es/*.wav
 *   GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash-lite npm run replay -- fixtures/pl/*.wav
 *
 * Record fixtures as 16 kHz (or any rate — they are fed as-is) 16-bit PCM WAV,
 * ideally through actual AirPods so mic coloration matches production.
 */
import * as fs from 'fs';

import { UtteranceSegmenter } from '../src/audio/UtteranceSegmenter';
import { pcmToWav, wavToPcm } from '../src/audio/wav';
import { LANGUAGE_PACKS } from '../src/languages/registry';
import { LanguageCode } from '../src/languages/types';
import { GeminiProvider } from '../src/llm/GeminiProvider';
import { GrammarCheckResult } from '../src/llm/types';
import { DEFAULT_MODEL } from '../src/utils/cost';

const FRAME_SAMPLES = 512;

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: GEMINI_API_KEY=... npm run replay -- <fixture.wav> [...]');
    process.exit(1);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in the environment.');
    process.exit(1);
  }
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const language = (process.env.REPLAY_LANGUAGE ?? 'pl') as LanguageCode;
  if (!LANGUAGE_PACKS[language]) {
    console.error(
      `Unknown REPLAY_LANGUAGE "${language}". Available: ${Object.keys(LANGUAGE_PACKS).join(', ')}`
    );
    process.exit(1);
  }
  console.log(`Language: ${language} · Model: ${model}`);
  const provider = new GeminiProvider({ getApiKey: async () => apiKey }, model);

  const recentTranscripts: string[] = [];
  for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const { pcm, sampleRate } = wavToPcm(new Uint8Array(fs.readFileSync(file)));

    // Run the fixture through the same VAD segmentation the app uses.
    const segments: { pcm: Int16Array; durationMs: number }[] = [];
    const segmenter = new UtteranceSegmenter({ sampleRate });
    segmenter.onUtterance = (u) => segments.push(u);
    for (let off = 0; off + FRAME_SAMPLES <= pcm.length; off += FRAME_SAMPLES) {
      segmenter.pushFrame(pcm.subarray(off, off + FRAME_SAMPLES));
    }
    segmenter.flush();

    if (segments.length === 0) {
      console.log('  (VAD found no speech — falling back to whole file)');
      segments.push({ pcm, durationMs: (pcm.length / sampleRate) * 1000 });
    }

    for (const [i, seg] of segments.entries()) {
      const wav = pcmToWav(seg.pcm, sampleRate);
      const started = Date.now();
      let result: GrammarCheckResult;
      try {
        result = await provider.checkUtterance(wav, { language, recentTranscripts });
      } catch (err) {
        console.error(`  segment ${i}: FAILED —`, err);
        continue;
      }
      const latencyMs = Date.now() - started;
      if (result.transcript) recentTranscripts.push(result.transcript);
      console.log(
        `  segment ${i} (${Math.round(seg.durationMs)}ms audio, ${latencyMs}ms latency):`
      );
      console.log(JSON.stringify(result, null, 2).replace(/^/gm, '    '));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
