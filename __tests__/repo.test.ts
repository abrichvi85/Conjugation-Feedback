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
  vocabularyGaps: [
    { nativeFragment: 'no i ten... deadline', intendedMeaning: 'deadline', targetSuggestion: 'termin' },
  ],
  correctedSentence: 'Szukam mojego telefonu.',
  feedbackUtterance: 'Mówi się: szukam mojego telefonu.',
};

describe('migrations', () => {
  it('are idempotent and reach the latest version', () => {
    const db = openTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version).toBe(
      2
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

  it('stores and lists vocabulary gaps per language', () => {
    const db = openTestDb();
    const plSession = repo.createSession(db, 1000, 'pl', 'm');
    const utteranceId = repo.insertPendingUtterance(db, plSession, 2000, 1500);
    repo.recordUtteranceResult(db, utteranceId, RESULT_WITH_ERROR);

    const gaps = repo.listRecentVocabGaps(db, 'pl', 10);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      native_fragment: 'no i ten... deadline',
      target_suggestion: 'termin',
      language: 'pl',
    });
    expect(repo.listRecentVocabGaps(db, 'es', 10)).toHaveLength(0);
  });
});

describe('progress stats', () => {
  function seed(db: ReturnType<typeof openTestDb>) {
    const s1 = repo.createSession(db, 1000, 'pl', 'm');
    const u1 = repo.insertPendingUtterance(db, s1, 2000, 4000);
    repo.recordUtteranceResult(db, u1, RESULT_WITH_ERROR);
    repo.addSessionAggregates(db, s1, { utterances: 1, errors: 1, audioSeconds: 60 });

    const s2 = repo.createSession(db, 500_000, 'pl', 'm');
    const u2 = repo.insertPendingUtterance(db, s2, 500_100, 3000);
    repo.recordUtteranceResult(db, u2, RESULT_WITH_ERROR); // same mistake again
    const u3 = repo.insertPendingUtterance(db, s2, 500_200, 3000);
    repo.recordUtteranceResult(db, u3, {
      ...RESULT_WITH_ERROR,
      errors: [
        {
          erroneousFragment: 'chcieć',
          correctedFragment: 'chcę',
          errorType: 'conjugation',
          explanationShort: 'First person singular.',
        },
      ],
      vocabularyGaps: [],
    });
    repo.addSessionAggregates(db, s2, { utterances: 2, errors: 2, audioSeconds: 120 });
    return { s1, s2 };
  }

  it('computes speaking totals with a week window', () => {
    const db = openTestDb();
    seed(db);
    const totals = repo.getSpeakingTotals(db, 'pl', 400_000);
    expect(totals.total_audio_seconds).toBeCloseTo(180);
    expect(totals.week_audio_seconds).toBeCloseTo(120);
    expect(totals.session_count).toBe(2);
    expect(totals.error_count).toBe(3);
  });

  it('breaks down error types and excludes flagged-wrong corrections', () => {
    const db = openTestDb();
    seed(db);
    let counts = repo.getErrorTypeCounts(db, 'pl', 0);
    expect(counts).toEqual([
      { error_type: 'case', n: 2 },
      { error_type: 'conjugation', n: 1 },
    ]);

    const [first] = repo.listMistakesForSession(db, 1);
    repo.flagErrorWrong(db, first.id, true);
    counts = repo.getErrorTypeCounts(db, 'pl', 0);
    expect(counts.find((c) => c.error_type === 'case')?.n).toBe(1);
  });

  it('ranks recurring mistakes and dedupes drill items by correction', () => {
    const db = openTestDb();
    seed(db);
    const top = repo.getTopRecurringMistakes(db, 'pl', 5);
    expect(top[0]).toMatchObject({ corrected_fragment: 'mojego telefonu', n: 2 });

    const drills = repo.listDrillItems(db, 'pl', 5);
    expect(drills).toHaveLength(2); // deduped by corrected fragment
    expect(drills[0].ts).toBeGreaterThanOrEqual(drills[1].ts); // latest first
  });
});
