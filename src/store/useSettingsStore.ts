import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

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
  verbalFeedback: boolean;
  language: 'pl';
  model: string;
  ttsRate: TtsRatePreset;
  hydrate: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  setVerbalFeedback: (on: boolean) => void;
  setModel: (model: string) => void;
  setTtsRate: (rate: TtsRatePreset) => void;
}

interface PersistedPrefs {
  verbalFeedback: boolean;
  model: string;
  ttsRate: TtsRatePreset;
}

async function persistPrefs(state: SettingsState): Promise<void> {
  const prefs: PersistedPrefs = {
    verbalFeedback: state.verbalFeedback,
    model: state.model,
    ttsRate: state.ttsRate,
  };
  await AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  apiKey: null,
  verbalFeedback: true, // product default: correct me out loud
  language: 'pl',
  model: DEFAULT_MODEL,
  ttsRate: 'normal',

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
    set({
      hydrated: true,
      apiKey: apiKey ?? null,
      verbalFeedback: prefs.verbalFeedback ?? true,
      model: prefs.model ?? DEFAULT_MODEL,
      ttsRate: prefs.ttsRate ?? 'normal',
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

  setVerbalFeedback: (on) => {
    set({ verbalFeedback: on });
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
}));

/** CredentialsSource implementation backed by the settings store. */
export const settingsCredentials = {
  getApiKey: async (): Promise<string | null> => useSettingsStore.getState().apiKey,
};
