import * as Speech from 'expo-speech';

let speaking = false;

export function isSpeaking(): boolean {
  return speaking;
}

export interface SpeakOptions {
  language?: string;
  rate?: number;
}

/** Speaks and resolves when playback finishes (or fails/stops). */
export function speak(text: string, options?: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    speaking = true;
    const finish = () => {
      speaking = false;
      resolve();
    };
    Speech.speak(text, {
      language: options?.language ?? 'pl-PL',
      rate: options?.rate ?? 1.0,
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
  });
}

export function stopSpeaking(): void {
  Speech.stop();
  speaking = false;
}
