import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir } from "../util/paths.ts";
import init from "./migrations/0001_init.sql" with { type: "text" };

export type Db = Database;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Forward-only. A migration is never edited once released; a change is a new migration. */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: "init", sql: init }];
export const LATEST_VERSION = MIGRATIONS.length;

export const DB_FILE = "shibaox-mem.db";
const BACKUPS_DIR = "backups";
const BACKUPS_KEPT = 2;

/** The database was written by a newer shibaox-mem. Callers must leave it alone. */
export class SchemaTooNewError extends Error {
  constructor(found: number, supported: number) {
    super(
      `database schema version ${found} is newer than this shibaox-mem supports (${supported}); upgrade shibaox-mem`,
    );
    this.name = "SchemaTooNewError";
  }
}

export interface OpenOptions {
  /** Defaults to SHIBAOX_MEM_DATA_DIR, then ~/.shibaox/mem. */
  dataDir?: string;
  /** How long a statement waits for another process's lock. Keep it below the caller's own deadline. */
  busyTimeoutMs: number;
  /** For tests. */
  migrations?: readonly Migration[];
}

function userVersion(db: Db): number {
  return db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
}

function restrict(path: string, mode: number): void {
  if (process.platform !== "win32" && existsSync(path)) chmodSync(path, mode);
}

function backup(db: Db, dir: string, version: number): void {
  const backups = join(dir, BACKUPS_DIR);
  mkdirSync(backups, { recursive: true, mode: 0o700 });
  // Timestamp first, so that sorting by name is sorting by age.
  const target = join(backups, `shibaox-mem-${Date.now()}-v${version}.db`);
  db.run(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  restrict(target, 0o600);
  const old = readdirSync(backups)
    .filter((name) => name.endsWith(".db"))
    .sort()
    .slice(0, -BACKUPS_KEPT);
  for (const name of old) rmSync(join(backups, name), { force: true });
}

/**
 * WAL persists in the file, so it is set once, when the database is created.
 * Changing the journal mode needs an exclusive lock and, unlike ordinary statements,
 * fails at once instead of waiting for `busy_timeout`. Several processes creating the
 * database together therefore have to retry by hand.
 */
function enableWal(db: Db, busyTimeoutMs: number): void {
  const deadline = Date.now() + Math.max(busyTimeoutMs, 1000);
  for (;;) {
    try {
      db.run("PRAGMA journal_mode = WAL");
      return;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      const busy = typeof code === "string" && code.startsWith("SQLITE_BUSY");
      if (!busy || Date.now() >= deadline) throw error;
      Bun.sleepSync(15);
    }
  }
}

function migrate(
  db: Db,
  dir: string,
  migrations: readonly Migration[],
  busyTimeoutMs: number,
): void {
  const latest = Math.max(0, ...migrations.map((migration) => migration.version));
  const current = userVersion(db);
  if (current > latest) throw new SchemaTooNewError(current, latest);
  if (current === latest) return;

  if (current === 0) enableWal(db, busyTimeoutMs);
  else backup(db, dir, current);

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    db.transaction(() => {
      // Read again under the write lock: another process may have got here first.
      if (userVersion(db) >= migration.version) return;
      db.run(migration.sql);
      db.run(`PRAGMA user_version = ${migration.version}`);
    }).immediate();
  }
}

export function openDb(options: OpenOptions): Db {
  const dir = options.dataDir ?? defaultDataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, DB_FILE);
  const db = new Database(path, { create: true });
  try {
    // busy_timeout first: every later statement on this connection depends on it.
    db.run(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs))}`);
    db.run("PRAGMA foreign_keys = ON");
    db.run("PRAGMA synchronous = NORMAL");
    migrate(db, dir, options.migrations ?? MIGRATIONS, options.busyTimeoutMs);
  } catch (error) {
    db.close();
    throw error;
  }
  for (const suffix of ["", "-wal", "-shm"]) restrict(path + suffix, 0o600);
  return db;
}

/** Runs `fn` in a transaction that takes the write lock up front, so `busy_timeout` applies. */
export function withWrite<T>(db: Db, fn: () => T): T {
  return db.transaction(fn).immediate();
}

/**
 * Opens the database for reading only, without creating or migrating anything.
 * Null when there is no database yet. For commands that inspect: status and doctor.
 */
export function openExisting(dataDir: string = defaultDataDir()): Db | null {
  const path = join(dataDir, DB_FILE);
  if (!existsSync(path)) return null;
  const db = new Database(path, { readonly: true });
  try {
    db.run("PRAGMA busy_timeout = 2000");
    const found = userVersion(db);
    if (found > LATEST_VERSION) throw new SchemaTooNewError(found, LATEST_VERSION);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
