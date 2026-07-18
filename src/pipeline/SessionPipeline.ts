import { AudioCapture } from '../audio/AudioCapture';
import { Utterance, UtteranceSegmenter } from '../audio/UtteranceSegmenter';
import { pcmToWav } from '../audio/wav';
import { SqlDb } from '../db/types';
import * as repo from '../db/repo';
import { LanguageCode } from '../languages/types';
import { getLanguagePack } from '../languages/registry';
import { GrammarCheckResult, LlmError, LlmProvider, SpeakerProfile } from '../llm/types';
import { playCorrectionChime } from '../tts/earcons';
import { speak, isSpeaking } from '../tts/speak';
import { costFromUsage, estimateUtteranceCostUsd } from '../utils/cost';
import { FeedbackAction, FeedbackMode, FeedbackPolicy, feedbackDedupKey } from './FeedbackPolicy';

export type PipelineStatus = 'listening' | 'thinking' | 'speaking';

export interface FeedItem {
  utteranceId: number;
  ts: number;
  transcript: string;
  hasError: boolean;
  errors: GrammarCheckResult['errors'];
  correctedSentence: string;
  /** How this correction was delivered (speak / chime / log-only). */
  deliveredAs?: FeedbackAction;
  /** How many times this exact correction occurred before in the session. */
  repeats?: number;
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
  feedbackMode: FeedbackMode;
  ttsRate: number;
  language: LanguageCode;
  model: string;
  profile: SpeakerProfile;
}

const MAX_CONCURRENT_CHECKS = 2;
const RATE_LIMIT_RETRIES = 3;
/** In-session retries for utterances that failed on a network blip. */
const NETWORK_RETRIES = 2;
const NETWORK_RETRY_DELAY_MS = 4000;
/** Extra gate time after TTS finishes, so the utterance tail isn't captured. */
const TTS_GATE_TAIL_MS = 300;
/** The conversational lull required before a correction is spoken. */
const SILENCE_GAP_MS = 800;
const FEEDBACK_TICK_MS = 250;

interface PendingSpoken {
  text: string;
  enqueuedAt: number;
  utteranceSeq: number;
}

export class SessionPipeline {
  private readonly capture = new AudioCapture();
  private readonly segmenter = new UtteranceSegmenter();
  private policy: FeedbackPolicy;
  private sessionId: number | null = null;
  private running = false;
  private inFlight = 0;
  private queue: Utterance[] = [];
  private recentTranscripts: string[] = [];
  private utteranceSeq = 0;
  private latestProcessedSeq = 0;
  private lastSpeechAt = 0;
  private pendingSpoken: PendingSpoken | null = null;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  private delivering = false;
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
    this.policy = new FeedbackPolicy({ mode: this.getSettings().feedbackMode });
    this.segmenter.onUtterance = (u) => this.enqueue(u);
  }

  get activeSessionId(): number | null {
    return this.sessionId;
  }

  getAggregates(): SessionAggregates {
    return this.aggregates;
  }

  start(): number {
    const settings = this.getSettings();
    this.sessionId = repo.createSession(this.db, Date.now(), settings.language, settings.model);
    this.running = true;
    this.aggregates = { utteranceCount: 0, errorCount: 0, audioSeconds: 0, estCostUsd: 0 };
    this.recentTranscripts = [];
    this.utteranceSeq = 0;
    this.latestProcessedSeq = 0;
    this.policy = new FeedbackPolicy({ mode: settings.feedbackMode });
    this.capture.start((frame) => {
      this.segmenter.pushFrame(frame);
      if (this.segmenter.isSpeech) this.lastSpeechAt = Date.now();
    });
    this.callbacks.onStatus('listening');
    return this.sessionId;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.capture.stop();
    this.segmenter.flush();
    this.pendingSpoken = null;
    if (this.feedbackTimer) {
      clearInterval(this.feedbackTimer);
      this.feedbackTimer = null;
    }
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
    const seq = ++this.utteranceSeq;
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
      this.latestProcessedSeq = Math.max(this.latestProcessedSeq, seq);
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
        this.handleFeedback(result, utteranceId, seq);
      }
    } catch (err) {
      this.handleError(err, utterance, utteranceId);
    } finally {
      this.inFlight--;
      if (this.running) this.callbacks.onStatus('listening');
      const next = this.queue.shift();
      if (next && this.running) void this.process(next);
    }
  }

  /** Decide and deliver feedback per the politeness policy. */
  private handleFeedback(result: GrammarCheckResult, utteranceId: number, seq: number): void {
    this.policy.setMode(this.getSettings().feedbackMode);

    let deliveredAs: FeedbackAction | undefined;
    let repeats: number | undefined;
    if (result.hasError && result.errors.length > 0) {
      const key = feedbackDedupKey(result.errors[0].errorType, result.errors[0].correctedFragment);
      deliveredAs = this.policy.decide({
        dedupKey: key,
        utteranceSeq: seq,
        latestSeq: this.latestProcessedSeq,
        now: Date.now(),
      });
      repeats = Math.max(0, this.policy.repeatCount(key) - 1);

      if (deliveredAs === 'speak' && result.feedbackUtterance) {
        // Hold until a conversational lull; the tick loop delivers it.
        // A newer pending correction replaces an older one.
        this.pendingSpoken = { text: result.feedbackUtterance, enqueuedAt: Date.now(), utteranceSeq: seq };
        this.ensureFeedbackTimer();
      } else if (deliveredAs === 'chime') {
        void this.playChimeGated();
      }
    }

    this.callbacks.onFeedItem({
      utteranceId,
      ts: Date.now(),
      transcript: result.transcript,
      hasError: result.hasError,
      errors: result.errors,
      correctedSentence: result.correctedSentence,
      deliveredAs,
      repeats,
    });
  }

  private ensureFeedbackTimer(): void {
    if (this.feedbackTimer) return;
    this.feedbackTimer = setInterval(() => void this.feedbackTick(), FEEDBACK_TICK_MS);
  }

  private async feedbackTick(): Promise<void> {
    const pending = this.pendingSpoken;
    if (!pending || !this.running) {
      if (this.feedbackTimer && !pending) {
        clearInterval(this.feedbackTimer);
        this.feedbackTimer = null;
      }
      return;
    }
    const now = Date.now();
    if (
      this.policy.isExpired(pending.enqueuedAt, now) ||
      this.policy.isStale(pending.utteranceSeq, this.latestProcessedSeq)
    ) {
      // Missed its window — the mistake is still in the log.
      this.pendingSpoken = null;
      return;
    }
    const inLull = !this.segmenter.isSpeech && now - this.lastSpeechAt >= SILENCE_GAP_MS;
    if (!inLull || isSpeaking() || this.delivering) return;

    this.pendingSpoken = null;
    this.delivering = true;
    try {
      const settings = this.getSettings();
      await this.speakGated(pending.text, settings.ttsRate, settings.language);
      this.policy.recordSpoken(Date.now());
    } finally {
      this.delivering = false;
    }
  }

  private async checkWithRetry(wav: Uint8Array): Promise<GrammarCheckResult> {
    let attempt = 0;
    for (;;) {
      try {
        const settings = this.getSettings();
        return await this.provider.checkUtterance(wav, {
          language: settings.language,
          recentTranscripts: this.recentTranscripts,
          profile: settings.profile,
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
  private async speakGated(text: string, rate: number, language: LanguageCode): Promise<void> {
    this.segmenter.setGated(true);
    this.callbacks.onStatus('speaking');
    try {
      await speak(text, { language: getLanguagePack(language).ttsLocale, rate });
      await delay(TTS_GATE_TAIL_MS);
    } finally {
      this.segmenter.setGated(false);
      if (this.running) this.callbacks.onStatus('listening');
    }
  }

  private async playChimeGated(): Promise<void> {
    this.segmenter.setGated(true);
    try {
      await playCorrectionChime();
    } finally {
      this.segmenter.setGated(false);
    }
  }

  private handleError(err: unknown, utterance: Utterance, utteranceId: number): void {
    if (err instanceof LlmError && err.kind === 'auth') {
      repo.markUtteranceStatus(this.db, utteranceId, 'error');
      this.stop();
      this.callbacks.onFatalError(
        'Your API key was rejected. Check it in Settings, then start a new session.'
      );
      return;
    }

    const isNetwork = err instanceof LlmError && err.kind === 'network';
    const retries = (utterance as Utterance & { retries?: number }).retries ?? 0;
    if (isNetwork && retries < NETWORK_RETRIES) {
      // Audio is still in memory during the session — retry the utterance
      // instead of silently losing it. (Nothing is persisted to disk.)
      repo.markUtteranceStatus(this.db, utteranceId, 'dropped');
      const retryUtterance = Object.assign(utterance, { retries: retries + 1 });
      setTimeout(() => {
        if (this.running) this.enqueue(retryUtterance);
      }, NETWORK_RETRY_DELAY_MS);
      this.callbacks.onTransientError('Offline — retrying the last utterance…');
      return;
    }

    repo.markUtteranceStatus(this.db, utteranceId, 'error');
    const message = isNetwork
      ? 'Offline — an utterance was skipped.'
      : err instanceof LlmError && err.kind === 'rate-limit'
        ? 'Rate limited by Gemini — an utterance was skipped.'
        : 'One utterance could not be checked.';
    this.callbacks.onTransientError(message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
