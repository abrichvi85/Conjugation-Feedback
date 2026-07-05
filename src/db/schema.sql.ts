/**
 * Ordered migrations; index+1 == resulting PRAGMA user_version.
 * Never edit an existing entry — append a new one.
 *
 * No raw audio is stored (privacy + disk); only transcripts and corrections.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    language TEXT NOT NULL DEFAULT 'pl',
    model TEXT,
    utterance_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    audio_seconds REAL NOT NULL DEFAULT 0,
    est_cost_usd REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE utterances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    transcript TEXT,
    has_error INTEGER NOT NULL DEFAULT 0,
    corrected_sentence TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' -- pending | ok | error | dropped
  );

  CREATE TABLE errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utterance_id INTEGER NOT NULL REFERENCES utterances(id) ON DELETE CASCADE,
    erroneous_fragment TEXT NOT NULL,
    corrected_fragment TEXT NOT NULL,
    error_type TEXT NOT NULL,
    explanation_short TEXT NOT NULL,
    flagged_wrong INTEGER NOT NULL DEFAULT 0 -- user marked "this correction was wrong"
  );

  CREATE INDEX idx_utterances_session ON utterances(session_id);
  CREATE INDEX idx_errors_utterance ON errors(utterance_id);
  `,
];
