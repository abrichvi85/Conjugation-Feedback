import { AudioCapture } from './AudioCapture';
import { Utterance, UtteranceSegmenter } from './UtteranceSegmenter';

/**
 * Captures a single VAD-delimited utterance (used by the Practice drills).
 * Resolves with the utterance, or null on timeout / if nothing was said.
 */
export function captureOneUtterance(maxWaitMs = 12000): Promise<Utterance | null> {
  return new Promise((resolve) => {
    const capture = new AudioCapture();
    const segmenter = new UtteranceSegmenter();
    let settled = false;

    const finish = (utterance: Utterance | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      capture.stop();
      resolve(utterance);
    };

    segmenter.onUtterance = (utterance) => finish(utterance);
    const timer = setTimeout(() => {
      // Give a trailing flush a chance: speech may be mid-utterance at timeout.
      segmenter.flush();
      finish(null);
    }, maxWaitMs);

    capture.start((frame) => segmenter.pushFrame(frame));
  });
}
