import { AudioCapture } from '../audio/AudioCapture';
import { Utterance, UtteranceSegmenter } from '../audio/UtteranceSegmenter';
import { pcmToWav } from '../audio/wav';
import { SqlDb } from '../db/types';
import * as repo from '../db/repo';
import { GrammarCheckResult, LlmError, LlmProvider } from '../llm/types';
import { speak } from '../tts/speak';
import { costFromUsage, estimateUtteranceCostUsd } from '../utils/cost';

export type PipelineStatus = 'listening' | 'thinking' | 'speaking';

export interface FeedItem {
  utteranceId: number;
  ts: number;
  transcript: string;
  hasError: boolean;
  errors: GrammarCheckResult['errors'];
  correctedSentence: string;
}

export interface SessionAggregates {
  utteranceCount: number;
  errorCount: number;
  audioSeconds: number;
  estCostUsd: number;
}

export interface PipelineCallbacks {
  onStatus: (status: PipelineStatus) => void;
  onFeedItem: (item: FeedItem) => void;
  onAggregates: (agg: SessionAggregates) => void;
  /** Recoverable problems (network blip, rate limit) — show a banner, keep going. */
  onTransientError: (message: string | null) => void;
  /** Unrecoverable (revoked key): the pipeline has stopped itself. */
  onFatalError: (message: string) => void;
}

export interface PipelineSettings {
  verbalFeedback: boolean;
  ttsRate: number;
  language: 'pl';
  model: string;
}

const MAX_CONCURRENT_CHECKS = 2;
const RATE_LIMIT_RETRIES = 3;
/** Extra gate time after TTS finishes, so the utterance tail isn't captured. */
const TTS_GATE_TAIL_MS = 300;

export class SessionPipeline {
  private readonly capture = new AudioCapture();
  private readonly segmenter = new UtteranceSegmenter();
  private sessionId: number | null = null;
  private running = false;
  private inFlight = 0;
  private queue: Utterance[] = [];
  private recentTranscripts: string[] = [];
  private aggregates: SessionAggregates = {
    utteranceCount: 0,
    errorCount: 0,
    audioSeconds: 0,
    estCostUsd: 0,
  };

  constructor(
    private readonly db: SqlDb,
    private readonly provider: LlmProvider,
    private readonly getSettings: () => PipelineSettings,
    private readonly callbacks: PipelineCallbacks
  ) {
    this.segmenter.onUtterance = (u) => this.enqueue(u);
  }

  get activeSessionId(): number | null {
    return this.sessionId;
  }

  start(): number {
    const settings = this.getSettings();
    this.sessionId = repo.createSession(this.db, Date.now(), settings.language, settings.model);
    this.running = true;
    this.aggregates = { utteranceCount: 0, errorCount: 0, audioSeconds: 0, estCostUsd: 0 };
    this.recentTranscripts = [];
    this.capture.start((frame) => this.segmenter.pushFrame(frame));
    this.callbacks.onStatus('listening');
    return this.sessionId;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.capture.stop();
    this.segmenter.flush();
    if (this.sessionId != null) {
      repo.endSession(this.db, this.sessionId, Date.now());
    }
    this.queue = [];
  }

  private enqueue(utterance: Utterance): void {
    if (!this.running) return;
    if (this.inFlight >= MAX_CONCURRENT_CHECKS) {
      this.queue.push(utterance);
      return;
    }
    void this.process(utterance);
  }

  private async process(utterance: Utterance): Promise<void> {
    if (this.sessionId == null) return;
    const sessionId = this.sessionId;
    this.inFlight++;
    this.callbacks.onStatus('thinking');

    const utteranceId = repo.insertPendingUtterance(
      this.db,
      sessionId,
      Date.now(),
      Math.round(utterance.durationMs)
    );
    const wav = pcmToWav(utterance.pcm, utterance.sampleRate);
    const audioSeconds = utterance.durationMs / 1000;
    const settings = this.getSettings();

    try {
      const result = await this.checkWithRetry(wav);
      repo.recordUtteranceResult(this.db, utteranceId, result);

      const costUsd = result.usage
        ? costFromUsage(result.usage, settings.model)
        : estimateUtteranceCostUsd(audioSeconds, settings.model);
      repo.addSessionAggregates(this.db, sessionId, {
        utterances: 1,
        errors: result.errors.length,
        audioSeconds,
        costUsd,
      });
      this.aggregates = {
        utteranceCount: this.aggregates.utteranceCount + 1,
        errorCount: this.aggregates.errorCount + result.errors.length,
        audioSeconds: this.aggregates.audioSeconds + audioSeconds,
        estCostUsd: this.aggregates.estCostUsd + costUsd,
      };
      this.callbacks.onAggregates(this.aggregates);
      this.callbacks.onTransientError(null);

      if (result.speakerIsPrimary && result.transcript) {
        this.recentTranscripts = [...this.recentTranscripts.slice(-2), result.transcript];
        this.callbacks.onFeedItem({
          utteranceId,
          ts: Date.now(),
          transcript: result.transcript,
          hasError: result.hasError,
          errors: result.errors,
          correctedSentence: result.correctedSentence,
        });
      }

      if (result.hasError && result.feedbackUtterance && settings.verbalFeedback && this.running) {
        await this.speakFeedback(result.feedbackUtterance, settings.ttsRate);
      }
    } catch (err) {
      repo.markUtteranceStatus(this.db, utteranceId, 'error');
      this.handleError(err);
    } finally {
      this.inFlight--;
      if (this.running) this.callbacks.onStatus('listening');
      const next = this.queue.shift();
      if (next && this.running) void this.process(next);
    }
  }

  private async checkWithRetry(wav: Uint8Array): Promise<GrammarCheckResult> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.provider.checkUtterance(wav, {
          language: this.getSettings().language,
          recentTranscripts: this.recentTranscripts,
        });
      } catch (err) {
        const rateLimited = err instanceof LlmError && err.kind === 'rate-limit';
        if (!rateLimited || attempt >= RATE_LIMIT_RETRIES || !this.running) throw err;
        await delay(1000 * 2 ** attempt);
        attempt++;
      }
    }
  }

  /** Gate the mic while TTS speaks so the app never corrects its own voice. */
  private async speakFeedback(text: string, rate: number): Promise<void> {
    this.segmenter.setGated(true);
    this.callbacks.onStatus('speaking');
    try {
      await speak(text, { language: 'pl-PL', rate });
      await delay(TTS_GATE_TAIL_MS);
    } finally {
      this.segmenter.setGated(false);
    }
  }

  private handleError(err: unknown): void {
    if (err instanceof LlmError && err.kind === 'auth') {
      this.stop();
      this.callbacks.onFatalError(
        'Your API key was rejected. Check it in Settings, then start a new session.'
      );
      return;
    }
    const message =
      err instanceof LlmError && err.kind === 'network'
        ? 'Offline — this utterance was skipped.'
        : err instanceof LlmError && err.kind === 'rate-limit'
          ? 'Rate limited by Gemini — an utterance was skipped.'
          : 'One utterance could not be checked.';
    this.callbacks.onTransientError(message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
