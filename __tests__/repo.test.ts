/**
 * Repo/migration tests against a real SQLite (node:sqlite, in-memory) through
 * an adapter matching the expo-sqlite sync API surface the app uses.
 */
import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '@/db/migrations';
import * as repo from '@/db/repo';
import { SqlDb, SqlParams } from '@/db/types';
import { GrammarCheckResult } from '@/llm/types';

function openTestDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  const adapter: SqlDb = {
    execSync: (sql) => db.exec(sql),
    runSync: (sql: string, params: SqlParams) => {
      const res = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(res.lastInsertRowid), changes: Number(res.changes) };
    },
    getAllSync: <T>(sql: string, params: SqlParams) => db.prepare(sql).all(...params) as T[],
    getFirstSync: <T>(sql: string, params: SqlParams) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
  };
  runMigrations(adapter);
  return adapter;
}

const RESULT_WITH_ERROR: GrammarCheckResult = {
  transcript: 'Szukam mój telefon.',
  speakerIsPrimary: true,
  hasError: true,
  errors: [
    {
      erroneousFragment: 'mój telefon',
      correctedFragment: 'mojego telefonu',
      errorType: 'case',
      explanationShort: "'Szukać' takes the genitive case.",
    },
  ],
  correctedSentence: 'Szukam mojego telefonu.',
  feedbackUtterance: 'Mówi się: szukam mojego telefonu.',
};

describe('migrations', () => {
  it('are idempotent', () => {
    const db = openTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version).toBe(
      1
    );
  });
});

describe('repo', () => {
  it('records a full session lifecycle', () => {
    const db = openTestDb();
    const sessionId = repo.createSession(db, 1000, 'pl', 'gemini-3.1-flash-lite');

    const utteranceId = repo.insertPendingUtterance(db, sessionId, 2000, 4200);
    repo.recordUtteranceResult(db, utteranceId, RESULT_WITH_ERROR);
    repo.addSessionAggregates(db, sessionId, {
      utterances: 1,
      errors: 1,
      audioSeconds: 4.2,
      costUsd: 0.0005,
    });
    repo.endSession(db, sessionId, 60000);

    const session = repo.getSession(db, sessionId);
    expect(session).toMatchObject({
      started_at: 1000,
      ended_at: 60000,
      utterance_count: 1,
      error_count: 1,
    });
    expect(session?.audio_seconds).toBeCloseTo(4.2);

    const mistakes = repo.listMistakesForSession(db, sessionId);
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toMatchObject({
      erroneous_fragment: 'mój telefon',
      corrected_fragment: 'mojego telefonu',
      error_type: 'case',
      transcript: 'Szukam mój telefon.',
    });
  });

  it('lists sessions newest first', () => {
    const db = openTestDb();
    repo.createSession(db, 1000, 'pl', 'm');
    repo.createSession(db, 3000, 'pl', 'm');
    repo.createSession(db, 2000, 'pl', 'm');
    expect(repo.listSessions(db).map((s) => s.started_at)).toEqual([3000, 2000, 1000]);
  });

  it('marks failed utterances without corrupting the session', () => {
    const db = openTestDb();
    const sessionId = repo.createSession(db, 1000, 'pl', 'm');
    const utteranceId = repo.insertPendingUtterance(db, sessionId, 2000, 1500);
    repo.markUtteranceStatus(db, utteranceId, 'error');
    expect(repo.listMistakesForSession(db, sessionId)).toHaveLength(0);
    expect(repo.getSession(db, sessionId)?.utterance_count).toBe(0);
  });

  it('flags corrections the user marked as wrong', () => {
    const db = openTestDb();
    const sessionId = repo.createSession(db, 1000, 'pl', 'm');
    const utteranceId = repo.insertPendingUtterance(db, sessionId, 2000, 1500);
    repo.recordUtteranceResult(db, utteranceId, RESULT_WITH_ERROR);

    const [mistake] = repo.listMistakesForSession(db, sessionId);
    repo.flagErrorWrong(db, mistake.id, true);
    expect(repo.listMistakesForSession(db, sessionId)[0].flagged_wrong).toBe(1);
  });
});
