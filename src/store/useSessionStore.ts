import { create } from 'zustand';

import { getDatabase } from '../db/database';
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
  startSession: () => void;
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

  startSession: () => {
    if (get().status !== 'idle') return;
    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      set({ fatalError: 'Add your Gemini API key in Settings first.' });
      return;
    }

    const provider = createProvider('gemini', settingsCredentials, settings.model);
    pipeline = new SessionPipeline(
      getDatabase(),
      provider,
      () => {
        const s = useSettingsStore.getState();
        return {
          verbalFeedback: s.verbalFeedback,
          ttsRate: TTS_RATES[s.ttsRate],
          language: s.language,
          model: s.model,
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
    pipeline?.stop();
    pipeline = null;
    set({ status: 'idle', sessionId: null, startedAt: null, transientError: null });
  },
}));
