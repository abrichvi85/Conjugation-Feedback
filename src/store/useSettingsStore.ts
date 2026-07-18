import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { LanguageCode } from '../languages/types';
import { SpeakerGender, SpeakerLevel } from '../llm/types';
import { FeedbackMode } from '../pipeline/FeedbackPolicy';
import { DEFAULT_MODEL } from '../utils/cost';

const SECURE_KEY_API = 'gemini_api_key';
const STORAGE_KEY_PREFS = 'settings_prefs_v1';

export type TtsRatePreset = 'slow' | 'normal' | 'fast';

export const TTS_RATES: Record<TtsRatePreset, number> = {
  slow: 0.85,
  normal: 1.0,
  fast: 1.15,
};

interface SettingsState {
  hydrated: boolean;
  apiKey: string | null;
  feedbackMode: FeedbackMode;
  language: LanguageCode;
  model: string;
  ttsRate: TtsRatePreset;
  gender: SpeakerGender;
  level: SpeakerLevel;
  hydrate: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  setFeedbackMode: (mode: FeedbackMode) => void;
  setLanguage: (language: LanguageCode) => void;
  setModel: (model: string) => void;
  setTtsRate: (rate: TtsRatePreset) => void;
  setGender: (gender: SpeakerGender) => void;
  setLevel: (level: SpeakerLevel) => void;
}

interface PersistedPrefs {
  feedbackMode: FeedbackMode;
  language: LanguageCode;
  model: string;
  ttsRate: TtsRatePreset;
  gender: SpeakerGender;
  level: SpeakerLevel;
  /** Pre-feedbackMode versions persisted this boolean. */
  verbalFeedback?: boolean;
}

async function persistPrefs(state: SettingsState): Promise<void> {
  const prefs: PersistedPrefs = {
    feedbackMode: state.feedbackMode,
    language: state.language,
    model: state.model,
    ttsRate: state.ttsRate,
    gender: state.gender,
    level: state.level,
  };
  await AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  apiKey: null,
  feedbackMode: 'voice', // product default: correct me out loud
  language: 'pl',
  model: DEFAULT_MODEL,
  ttsRate: 'normal',
  gender: 'unspecified',
  level: 'intermediate',

  hydrate: async () => {
    if (get().hydrated) return;
    const [apiKey, prefsJson] = await Promise.all([
      SecureStore.getItemAsync(SECURE_KEY_API),
      AsyncStorage.getItem(STORAGE_KEY_PREFS),
    ]);
    let prefs: Partial<PersistedPrefs> = {};
    if (prefsJson) {
      try {
        prefs = JSON.parse(prefsJson);
      } catch {
        // corrupted prefs: fall back to defaults
      }
    }
    const migratedMode: FeedbackMode =
      prefs.feedbackMode ?? (prefs.verbalFeedback === false ? 'off' : 'voice');
    set({
      hydrated: true,
      apiKey: apiKey ?? null,
      feedbackMode: migratedMode,
      language: prefs.language ?? 'pl',
      model: prefs.model ?? DEFAULT_MODEL,
      ttsRate: prefs.ttsRate ?? 'normal',
      gender: prefs.gender ?? 'unspecified',
      level: prefs.level ?? 'intermediate',
    });
  },

  setApiKey: async (key) => {
    if (key) {
      await SecureStore.setItemAsync(SECURE_KEY_API, key);
    } else {
      await SecureStore.deleteItemAsync(SECURE_KEY_API);
    }
    set({ apiKey: key });
  },

  setFeedbackMode: (feedbackMode) => {
    set({ feedbackMode });
    void persistPrefs(get());
  },

  setLanguage: (language) => {
    set({ language });
    void persistPrefs(get());
  },

  setModel: (model) => {
    set({ model });
    void persistPrefs(get());
  },

  setTtsRate: (ttsRate) => {
    set({ ttsRate });
    void persistPrefs(get());
  },

  setGender: (gender) => {
    set({ gender });
    void persistPrefs(get());
  },

  setLevel: (level) => {
    set({ level });
    void persistPrefs(get());
  },
}));

/** CredentialsSource implementation backed by the settings store. */
export const settingsCredentials = {
  getApiKey: async (): Promise<string | null> => useSettingsStore.getState().apiKey,
};
