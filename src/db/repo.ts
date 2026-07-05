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
