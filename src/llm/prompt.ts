import { GrammarCheckContext } from './types';

/**
 * Per-language grammar-coach prompts live in src/languages/ (one pack per
 * language — the highest-iteration files in the app; tune them with
 * `npm run replay` against recorded fixtures). This module only builds the
 * language-neutral per-call context text.
 */
export function buildUserContextText(ctx: GrammarCheckContext): string {
  if (ctx.recentTranscripts.length === 0) {
    return 'This is the first utterance of the session. Analyze the attached audio.';
  }
  const recent = ctx.recentTranscripts
    .slice(-3)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');
  return `Recent utterances by the learner in this conversation (for context only — do not correct these):\n${recent}\n\nAnalyze the attached audio.`;
}
