import { openDatabaseSync } from 'expo-sqlite';

import { runMigrations } from './migrations';
import { SqlDb } from './types';

export type { SqlDb, SqlParams } from './types';
export { runMigrations } from './migrations';

let instance: SqlDb | null = null;

export function getDatabase(): SqlDb {
  if (!instance) {
    const db = openDatabaseSync('conjugation-feedback.db');
    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync('PRAGMA foreign_keys = ON');
    runMigrations(db as unknown as SqlDb);
    instance = db as unknown as SqlDb;
  }
  return instance;
}
