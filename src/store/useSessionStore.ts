import { create } from 'zustand';

import { ensureCapturePermissions } from '../audio/permissions';
import { getDatabase } from '../db/database';
import { speak } from '../tts/speak';
import { createProvider } from '../llm/providerRegistry';
import {
  FeedItem,
  PipelineStatus,
  SessionAggregates,
  SessionPipeline,
} from '../pipeline/SessionPipeline';
import { TTS_RATES, settingsCredentials, useSettingsStore } from './useSettingsStore';

export type SessionUiStatus = 'idle' | PipelineStatus;

interface SessionState {
  status: SessionUiStatus;
  sessionId: number | null;
  startedAt: number | null;
  feed: FeedItem[];
  aggregates: SessionAggregates;
  transientError: string | null;
  fatalError: string | null;
  startSession: () => Promise<void>;
  stopSession: () => void;
}

const EMPTY_AGGREGATES: SessionAggregates = {
  utteranceCount: 0,
  errorCount: 0,
  audioSeconds: 0,
  estCostUsd: 0,
};

let pipeline: SessionPipeline | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle',
  sessionId: null,
  startedAt: null,
  feed: [],
  aggregates: EMPTY_AGGREGATES,
  transientError: null,
  fatalError: null,

  startSession: async () => {
    if (get().status !== 'idle') return;
    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      set({ fatalError: 'Add your Gemini API key in Settings first.' });
      return;
    }

    // Mark as starting so a double-tap can't launch two sessions while the
    // async permission prompt is open.
    set({ status: 'listening', fatalError: null, transientError: null });
    const granted = await ensureCapturePermissions();
    if (!granted) {
      set({
        status: 'idle',
        fatalError: 'Microphone permission is required to run a session.',
      });
      return;
    }
    // A stop or another start may have raced the permission prompt.
    if (get().status !== 'listening' || pipeline) return;

    const provider = createProvider('gemini', settingsCredentials, settings.model);
    pipeline = new SessionPipeline(
      getDatabase(),
      provider,
      () => {
        const s = useSettingsStore.getState();
        return {
          feedbackMode: s.feedbackMode,
          ttsRate: TTS_RATES[s.ttsRate],
          language: s.language,
          model: s.model,
          profile: { gender: s.gender, level: s.level },
        };
      },
      {
        onStatus: (status) => set({ status }),
        onFeedItem: (item) => set((state) => ({ feed: [item, ...state.feed].slice(0, 50) })),
        onAggregates: (aggregates) => set({ aggregates }),
        onTransientError: (transientError) => set({ transientError }),
        onFatalError: (fatalError) =>
          set({ fatalError, status: 'idle', sessionId: null, startedAt: null }),
      }
    );

    const sessionId = pipeline.start();
    set({
      status: 'listening',
      sessionId,
      startedAt: Date.now(),
      feed: [],
      aggregates: EMPTY_AGGREGATES,
      transientError: null,
      fatalError: null,
    });
  },

  stopSession: () => {
    const aggregates = pipeline?.getAggregates();
    pipeline?.stop();
    pipeline = null;
    set({ status: 'idle', sessionId: null, startedAt: null, transientError: null });

    // Spoken end-of-session summary (English — the coaching voice, not the
    // practice language). Positive reinforcement is part of the loop.
    const settings = useSettingsStore.getState();
    if (settings.feedbackMode === 'voice' && aggregates && aggregates.utteranceCount > 0) {
      const minutes = Math.max(1, Math.round(aggregates.audioSeconds / 60));
      const mistakes =
        aggregates.errorCount === 0
          ? 'no mistakes — great job'
          : aggregates.errorCount === 1
            ? '1 mistake to review'
            : `${aggregates.errorCount} mistakes to review`;
      void speak(
        `Session done. About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} of speaking, ${mistakes}.`,
        { language: 'en-US', rate: TTS_RATES[settings.ttsRate] }
      );
    }
  },
}));
