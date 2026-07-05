import { MIGRATIONS } from './schema.sql';
import { SqlDb } from './types';

// Kept free of expo-sqlite imports so it can run in node unit tests.
export function runMigrations(db: SqlDb): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.execSync('BEGIN');
    try {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
      db.execSync('COMMIT');
    } catch (err) {
      db.execSync('ROLLBACK');
      throw err;
    }
  }
}
