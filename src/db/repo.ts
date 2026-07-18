import { GrammarCheckResult } from '../llm/types';
import { SqlDb } from './types';

export type UtteranceStatus = 'pending' | 'ok' | 'error' | 'dropped';

export interface SessionRow {
  id: number;
  started_at: number;
  ended_at: number | null;
  language: string;
  model: string | null;
  utterance_count: number;
  error_count: number;
  audio_seconds: number;
  est_cost_usd: number;
}

export interface UtteranceRow {
  id: number;
  session_id: number;
  ts: number;
  transcript: string | null;
  has_error: number;
  corrected_sentence: string | null;
  duration_ms: number | null;
  status: UtteranceStatus;
}

export interface ErrorRow {
  id: number;
  utterance_id: number;
  erroneous_fragment: string;
  corrected_fragment: string;
  error_type: string;
  explanation_short: string;
  flagged_wrong: number;
}

export interface MistakeView extends ErrorRow {
  transcript: string | null;
  corrected_sentence: string | null;
  ts: number;
}

export function createSession(db: SqlDb, startedAt: number, language: string, model: string): number {
  const res = db.runSync(
    'INSERT INTO sessions (started_at, language, model) VALUES (?, ?, ?)',
    [startedAt, language, model]
  );
  return res.lastInsertRowId;
}

export function endSession(db: SqlDb, sessionId: number, endedAt: number): void {
  db.runSync('UPDATE sessions SET ended_at = ? WHERE id = ?', [endedAt, sessionId]);
}

export function insertPendingUtterance(
  db: SqlDb,
  sessionId: number,
  ts: number,
  durationMs: number
): number {
  const res = db.runSync(
    "INSERT INTO utterances (session_id, ts, duration_ms, status) VALUES (?, ?, ?, 'pending')",
    [sessionId, ts, durationMs]
  );
  return res.lastInsertRowId;
}

export function recordUtteranceResult(
  db: SqlDb,
  utteranceId: number,
  result: GrammarCheckResult
): void {
  db.runSync(
    "UPDATE utterances SET transcript = ?, has_error = ?, corrected_sentence = ?, status = 'ok' WHERE id = ?",
    [result.transcript, result.hasError ? 1 : 0, result.correctedSentence, utteranceId]
  );
  for (const e of result.errors) {
    db.runSync(
      'INSERT INTO errors (utterance_id, erroneous_fragment, corrected_fragment, error_type, explanation_short) VALUES (?, ?, ?, ?, ?)',
      [utteranceId, e.erroneousFragment, e.correctedFragment, e.errorType, e.explanationShort]
    );
  }
  for (const g of result.vocabularyGaps) {
    db.runSync(
      'INSERT INTO vocab_gaps (utterance_id, native_fragment, intended_meaning, target_suggestion) VALUES (?, ?, ?, ?)',
      [utteranceId, g.nativeFragment, g.intendedMeaning, g.targetSuggestion]
    );
  }
}

export function markUtteranceStatus(db: SqlDb, utteranceId: number, status: UtteranceStatus): void {
  db.runSync('UPDATE utterances SET status = ? WHERE id = ?', [status, utteranceId]);
}

export function addSessionAggregates(
  db: SqlDb,
  sessionId: number,
  delta: { utterances?: number; errors?: number; audioSeconds?: number; costUsd?: number }
): void {
  db.runSync(
    `UPDATE sessions SET
      utterance_count = utterance_count + ?,
      error_count = error_count + ?,
      audio_seconds = audio_seconds + ?,
      est_cost_usd = est_cost_usd + ?
     WHERE id = ?`,
    [delta.utterances ?? 0, delta.errors ?? 0, delta.audioSeconds ?? 0, delta.costUsd ?? 0, sessionId]
  );
}

export function listSessions(db: SqlDb): SessionRow[] {
  return db.getAllSync<SessionRow>('SELECT * FROM sessions ORDER BY started_at DESC', []);
}

export function getSession(db: SqlDb, sessionId: number): SessionRow | null {
  return db.getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId]);
}

export function listMistakesForSession(db: SqlDb, sessionId: number): MistakeView[] {
  return db.getAllSync<MistakeView>(
    `SELECT e.*, u.transcript, u.corrected_sentence, u.ts
     FROM errors e JOIN utterances u ON u.id = e.utterance_id
     WHERE u.session_id = ?
     ORDER BY u.ts ASC, e.id ASC`,
    [sessionId]
  );
}

export function flagErrorWrong(db: SqlDb, errorId: number, flagged: boolean): void {
  db.runSync('UPDATE errors SET flagged_wrong = ? WHERE id = ?', [flagged ? 1 : 0, errorId]);
}

// --- Progress / stats queries ---------------------------------------------

export interface VocabGapView {
  id: number;
  native_fragment: string;
  intended_meaning: string;
  target_suggestion: string;
  ts: number;
  language: string;
}

export function listRecentVocabGaps(db: SqlDb, language: string, limit: number): VocabGapView[] {
  return db.getAllSync<VocabGapView>(
    `SELECT v.id, v.native_fragment, v.intended_meaning, v.target_suggestion, u.ts, s.language
     FROM vocab_gaps v
     JOIN utterances u ON u.id = v.utterance_id
     JOIN sessions s ON s.id = u.session_id
     WHERE s.language = ?
     ORDER BY u.ts DESC
     LIMIT ?`,
    [language, limit]
  );
}

export interface SpeakingTotals {
  total_audio_seconds: number;
  week_audio_seconds: number;
  session_count: number;
  error_count: number;
}

export function getSpeakingTotals(db: SqlDb, language: string, weekStartMs: number): SpeakingTotals {
  const row = db.getFirstSync<SpeakingTotals>(
    `SELECT
       COALESCE(SUM(audio_seconds), 0) AS total_audio_seconds,
       COALESCE(SUM(CASE WHEN started_at >= ? THEN audio_seconds ELSE 0 END), 0) AS week_audio_seconds,
       COUNT(*) AS session_count,
       COALESCE(SUM(error_count), 0) AS error_count
     FROM sessions WHERE language = ?`,
    [weekStartMs, language]
  );
  return (
    row ?? { total_audio_seconds: 0, week_audio_seconds: 0, session_count: 0, error_count: 0 }
  );
}

export interface ErrorTypeCount {
  error_type: string;
  n: number;
}

/** Error-type breakdown since a timestamp; user-flagged wrong corrections excluded. */
export function getErrorTypeCounts(db: SqlDb, language: string, sinceMs: number): ErrorTypeCount[] {
  return db.getAllSync<ErrorTypeCount>(
    `SELECT e.error_type, COUNT(*) AS n
     FROM errors e
     JOIN utterances u ON u.id = e.utterance_id
     JOIN sessions s ON s.id = u.session_id
     WHERE s.language = ? AND u.ts >= ? AND e.flagged_wrong = 0
     GROUP BY e.error_type
     ORDER BY n DESC`,
    [language, sinceMs]
  );
}

export interface RecurringMistake {
  corrected_fragment: string;
  erroneous_fragment: string;
  error_type: string;
  n: number;
}

export function getTopRecurringMistakes(db: SqlDb, language: string, limit: number): RecurringMistake[] {
  return db.getAllSync<RecurringMistake>(
    `SELECT e.corrected_fragment, MIN(e.erroneous_fragment) AS erroneous_fragment,
            MIN(e.error_type) AS error_type, COUNT(*) AS n
     FROM errors e
     JOIN utterances u ON u.id = e.utterance_id
     JOIN sessions s ON s.id = u.session_id
     WHERE s.language = ? AND e.flagged_wrong = 0
     GROUP BY LOWER(e.corrected_fragment)
     ORDER BY n DESC, MAX(u.ts) DESC
     LIMIT ?`,
    [language, limit]
  );
}

export interface DrillItem {
  error_id: number;
  erroneous_fragment: string;
  corrected_fragment: string;
  error_type: string;
  explanation_short: string;
  corrected_sentence: string | null;
  ts: number;
}

/** Distinct recent mistakes (latest first) to re-speak in the Practice tab. */
export function listDrillItems(db: SqlDb, language: string, limit: number): DrillItem[] {
  // Single MAX aggregate: SQLite's documented bare-column rule makes the other
  // selected columns come from the max-ts row of each group.
  return db.getAllSync<DrillItem>(
    `SELECT e.id AS error_id, e.erroneous_fragment, e.corrected_fragment, e.error_type,
            e.explanation_short, u.corrected_sentence, MAX(u.ts) AS ts
     FROM errors e
     JOIN utterances u ON u.id = e.utterance_id
     JOIN sessions s ON s.id = u.session_id
     WHERE s.language = ? AND e.flagged_wrong = 0
     GROUP BY LOWER(e.corrected_fragment)
     ORDER BY ts DESC
     LIMIT ?`,
    [language, limit]
  );
}
