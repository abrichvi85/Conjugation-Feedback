export type LanguageCode = 'pl' | 'es';

/**
 * Everything that is specific to one target language. Adding a language =
 * one new pack file + a fixture set (see fixtures/README.md); the audio
 * pipeline, provider layer, DB, and UI are language-agnostic.
 */
export interface LanguagePack {
  code: LanguageCode;
  /** Native-language name shown in the settings picker, e.g. "Polski". */
  displayName: string;
  flag: string;
  /**
   * The full grammar-coach system prompt: JSON contract, precision-over-recall
   * rules, speaker_is_primary rule, and language-specific few-shots.
   */
  systemPrompt: string;
  /** BCP-47 locale for expo-speech TTS, e.g. "pl-PL". */
  ttsLocale: string;
  /** The spoken-correction pattern the prompt mandates, e.g. "Mówi się: …". */
  feedbackPatternExample: string;
}
