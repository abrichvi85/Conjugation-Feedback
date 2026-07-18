import { GrammarCheckContext } from './types';

/**
 * Per-language grammar-coach prompts live in src/languages/ (one pack per
 * language — the highest-iteration files in the app; tune them with
 * `npm run replay` against recorded fixtures). This module builds the
 * language-neutral per-call context text: recent transcripts + speaker
 * profile.
 */
export function buildUserContextText(ctx: GrammarCheckContext): string {
  const parts: string[] = [];

  if (ctx.profile) {
    const facts: string[] = [];
    if (ctx.profile.gender !== 'unspecified') {
      facts.push(
        `The learner is ${ctx.profile.gender} — use this for gender agreement (e.g. past-tense and adjective forms); do not infer gender from the voice.`
      );
    }
    facts.push(
      ctx.profile.level === 'advanced'
        ? `The learner is advanced: write explanation_short in the target language instead of English, and hold colloquial speech to a slightly higher standard while still never flagging correct informal usage.`
        : ctx.profile.level === 'beginner'
          ? `The learner is a beginner: keep explanation_short in very simple English and only flag basic, high-value errors — let subtle issues pass.`
          : `The learner is intermediate: keep explanation_short in plain English.`
    );
    parts.push(`Speaker profile: ${facts.join(' ')}`);
  }

  if (ctx.recentTranscripts.length === 0) {
    parts.push('This is the first utterance of the session. Analyze the attached audio.');
  } else {
    const recent = ctx.recentTranscripts
      .slice(-3)
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n');
    parts.push(
      `Recent utterances by the learner in this conversation (for context only — do not correct these):\n${recent}\n\nAnalyze the attached audio.`
    );
  }

  return parts.join('\n\n');
}
