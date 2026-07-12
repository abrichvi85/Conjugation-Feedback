import { create } from 'zustand';

import { ensureCapturePermissions } from '../audio/permissions';
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
    let candidate: SessionPipeline;
    const isCurrent = () => pipeline === candidate;
    candidate = new SessionPipeline(
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
        onStatus: (status) => {
          if (isCurrent()) set({ status });
        },
        onFeedItem: (item) => {
          if (isCurrent()) {
            set((state) => ({ feed: [item, ...state.feed].slice(0, 50) }));
          }
        },
        onAggregates: (aggregates) => {
          if (isCurrent()) set({ aggregates });
        },
        onTransientError: (transientError) => {
          if (isCurrent()) set({ transientError });
        },
        onFatalError: (fatalError) => {
          if (!isCurrent()) return;
          pipeline = null;
          set({ fatalError, status: 'idle', sessionId: null, startedAt: null });
        },
      }
    );
    pipeline = candidate;

    try {
      const sessionId = await candidate.start();
      if (!isCurrent()) return;
      set({
        status: 'listening',
        sessionId,
        startedAt: Date.now(),
        feed: [],
        aggregates: EMPTY_AGGREGATES,
        transientError: null,
        fatalError: null,
      });
    } catch {
      if (!isCurrent()) return;
      pipeline = null;
      set({
        status: 'idle',
        sessionId: null,
        startedAt: null,
        fatalError: 'Audio capture could not start. Check microphone access and try again.',
      });
    }
  },

  stopSession: () => {
    pipeline?.stop();
    pipeline = null;
    set({ status: 'idle', sessionId: null, startedAt: null, transientError: null });
  },
}));
