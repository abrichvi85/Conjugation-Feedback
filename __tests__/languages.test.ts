import { ALL_LANGUAGES, LANGUAGE_PACKS, getLanguagePack } from '@/languages/registry';
import { LanguageCode } from '@/languages/types';

describe('language packs', () => {
  it('registry keys match pack codes and are unique', () => {
    for (const [code, pack] of Object.entries(LANGUAGE_PACKS)) {
      expect(pack.code).toBe(code);
    }
    const codes = ALL_LANGUAGES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each(ALL_LANGUAGES.map((p) => [p.code, p] as const))(
    '%s pack is complete and honors the wire contract',
    (_code, pack) => {
      expect(pack.displayName.length).toBeGreaterThan(0);
      expect(pack.flag.length).toBeGreaterThan(0);
      expect(pack.ttsLocale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(pack.systemPrompt.length).toBeGreaterThan(500);

      // Load-bearing contract strings every prompt must reference: the
      // bystander rule, the renamed feedback field, and precision bias.
      expect(pack.systemPrompt).toContain('speaker_is_primary');
      expect(pack.systemPrompt).toContain('feedback_utterance');
      expect(pack.systemPrompt).not.toContain('feedback_utterance_pl');
      expect(pack.systemPrompt).toContain('has_error=false');
      expect(pack.systemPrompt).toContain('corrected_sentence');

      // The spoken-feedback pattern shown in settings must be the one the
      // prompt actually mandates.
      const pattern = pack.feedbackPatternExample.replace('…', '');
      expect(pack.systemPrompt).toContain(pattern.trim());
    }
  );

  it('getLanguagePack returns the right pack and throws on unknown codes', () => {
    expect(getLanguagePack('pl').ttsLocale).toBe('pl-PL');
    expect(getLanguagePack('es').ttsLocale).toBe('es-ES');
    expect(getLanguagePack('fr').ttsLocale).toBe('fr-FR');
    expect(getLanguagePack('en').ttsLocale).toBe('en-US');
    expect(() => getLanguagePack('xx' as LanguageCode)).toThrow('Unknown language');
  });
});
