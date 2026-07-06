import { spanish } from './es';
import { polish } from './pl';
import { LanguageCode, LanguagePack } from './types';

export const LANGUAGE_PACKS: Record<LanguageCode, LanguagePack> = {
  pl: polish,
  es: spanish,
};

export const ALL_LANGUAGES: LanguagePack[] = Object.values(LANGUAGE_PACKS);

export function getLanguagePack(code: LanguageCode): LanguagePack {
  const pack = LANGUAGE_PACKS[code];
  if (!pack) throw new Error(`Unknown language: ${code}`);
  return pack;
}

export type { LanguageCode, LanguagePack } from './types';
