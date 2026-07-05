/**
 * Minimal structural interface over expo-sqlite's sync API. The repo layer
 * depends only on this, so it can be unit-tested in node (node:sqlite adapter)
 * without loading any native module.
 */
export type SqlParams = (string | number | null)[];

export interface SqlDb {
  execSync(sql: string): void;
  runSync(sql: string, params: SqlParams): { lastInsertRowId: number; changes: number };
  getAllSync<T>(sql: string, params: SqlParams): T[];
  getFirstSync<T>(sql: string, params: SqlParams): T | null;
}
