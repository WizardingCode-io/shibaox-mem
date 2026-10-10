import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ENV_FILE } from "../settings/env-file.ts";
import { storeDirOf } from "./paths.ts";

// Until 0.3.0 this product was shibaox-mem: data in ~/.shibaox/mem, a database called
// shibaox-mem.db, variables SHIBAOX_MEM_*. A newer binary takes all of that over once,
// before any command runs, so nobody starts again with an empty memory (ADR 0011).

const LEGACY_DB = "shibaox-mem.db";
const DB = "wizardingcode-mem.db";
const OLD_PREFIX = "SHIBAOX_";
const NEW_PREFIX = "WIZARDINGCODE_";
/** A lock older than this was left by a process that died mid-migration. */
const STALE_LOCK_MS = 10 * 60 * 1000;

type Env = Record<string, string | undefined>;
const set = (value: string | undefined): value is string => value !== undefined && value !== "";

/**
 * Old variables stand in for the new ones the user has not set. Changes `env` in place,
 * so that every module reading `process.env` sees the new names; returns the old names
 * that were used, for `doctor` to point out.
 */
export function applyLegacyEnv(env: Env): string[] {
  const used: string[] = [];
  for (const key of Object.keys(env).sort()) {
    if (!key.startsWith(OLD_PREFIX) || !set(env[key])) continue;
    const renamed = NEW_PREFIX + key.slice(OLD_PREFIX.length);
    if (set(env[renamed])) continue;
    env[renamed] = env[key];
    used.push(key);
  }
  return used;
}

export interface MigrateOptions {
  env?: Env;
  home?: string;
  /** For tests: how the directory is moved. */
  rename?: (from: string, to: string) => void;
}

export type MigrateResult = "none" | "migrated" | "busy";

/**
 * Takes a shibaox-mem install over: moves its data directory to the new one (or copies
 * it, when it cannot be moved: another volume, a file held open on Windows), renames the
 * settings it holds and the database wherever the store lives. Idempotent and cheap when
 * there is nothing to do. "busy" means another process is migrating right now: the
 * caller must not create a fresh, empty memory in the meantime.
 */
export function migrateLegacyData(options: MigrateOptions = {}): MigrateResult {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const move = options.rename ?? renameSync;
  const target = set(env.WIZARDINGCODE_MEM_DATA_DIR)
    ? env.WIZARDINGCODE_MEM_DATA_DIR
    : join(
        set(env.WIZARDINGCODE_HOME) ? env.WIZARDINGCODE_HOME : join(home, ".wizardingcode"),
        "mem",
      );
  const legacy = join(set(env.SHIBAOX_HOME) ? env.SHIBAOX_HOME : join(home, ".shibaox"), "mem");
  // The new directory may exist already without being in use: the new plugin fetches its
  // binary into it before that binary ever runs.
  const moveDir =
    !set(env.WIZARDINGCODE_MEM_DATA_DIR) &&
    legacy !== target &&
    existsSync(legacy) &&
    !existsSync(join(target, DB)) &&
    !existsSync(join(target, ENV_FILE));
  const envFile = join(moveDir ? legacy : target, ENV_FILE);
  const store = storeDirOf(moveDir ? legacy : target, legacyKeys(env, envFile));
  const renameDb = !existsSync(join(store, DB)) && existsSync(join(store, LEGACY_DB));
  const renameKeys = hasLegacyKeys(envFile);
  if (!moveDir && !renameDb && !renameKeys) return "none";

  const lock = `${target}.migrating`;
  if (!acquire(lock)) return "busy";
  try {
    if (moveDir && !existsSync(join(target, DB)) && !existsSync(join(target, ENV_FILE))) {
      takeOver(legacy, target, move);
      // The 0.3.0 viewer on record reads the old database: a session start must start a
      // new one instead of showing that one.
      rmSync(join(target, "ui.json"), { force: true });
    }
    rewriteKeys(join(target, ENV_FILE));
    const storeDir = storeDirOf(target, env);
    if (!existsSync(join(storeDir, DB)) && existsSync(join(storeDir, LEGACY_DB))) {
      renameDatabase(storeDir);
    }
    return "migrated";
  } finally {
    rmSync(lock, { force: true });
  }
}

/** The settings file read as if its old keys already had their new names. */
function legacyKeys(env: Env, envFile: string): Env {
  if (set(env.WIZARDINGCODE_MEM_STORE_DIR)) return env;
  try {
    const old = /^\s*(?:export\s+)?SHIBAOX_MEM_STORE_DIR\s*=\s*["']?(.*?)["']?\s*$/m.exec(
      readFileSync(envFile, "utf8"),
    )?.[1];
    return set(old) ? { ...env, WIZARDINGCODE_MEM_STORE_DIR: old } : env;
  } catch {
    return env;
  }
}

function hasLegacyKeys(envFile: string): boolean {
  try {
    return /^\s*(?:export\s+)?SHIBAOX_/m.test(readFileSync(envFile, "utf8"));
  } catch {
    return false;
  }
}

function rewriteKeys(envFile: string): void {
  let text: string;
  try {
    text = readFileSync(envFile, "utf8");
  } catch {
    return;
  }
  const next = text.replace(/^(\s*(?:export\s+)?)SHIBAOX_/gm, `$1${NEW_PREFIX}`);
  if (next === text) return;
  const temporary = `${envFile}.${process.pid}.tmp`;
  writeFileSync(temporary, next, { mode: 0o600 });
  renameSync(temporary, envFile);
  if (process.platform !== "win32") chmodSync(envFile, 0o600);
}

/** An exclusive lock file; one left behind by a dead process is taken over. */
function acquire(lock: string): boolean {
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(lock, "wx"));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs < STALE_LOCK_MS) return false;
        rmSync(lock, { force: true });
      } catch {
        // Released between the two calls: try again.
      }
    }
  }
  return false;
}

const isDbFile = (path: string) => /^shibaox-mem\.db(-wal|-shm)?$/.test(basename(path));

function moveOrCopy(from: string, to: string, move: (from: string, to: string) => void): void {
  mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
  try {
    move(from, to);
    return;
  } catch {
    // Another volume, or a file held open on Windows: copy, and leave the old directory.
  }
  const partial = `${to}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  cpSync(from, partial, { recursive: true, filter: (path) => !isDbFile(path) });
  if (existsSync(join(from, LEGACY_DB))) vacuumInto(join(from, LEGACY_DB), join(partial, DB));
  renameSync(partial, to);
}

/** Into a directory that exists already: what it has (the new binary) stays. */
function takeOver(from: string, to: string, move: (from: string, to: string) => void): void {
  if (!existsSync(to)) {
    moveOrCopy(from, to, move);
    return;
  }
  for (const name of readdirSync(from)) {
    if (existsSync(join(to, name)) || (isDbFile(name) && name !== LEGACY_DB)) continue;
    if (name !== LEGACY_DB) {
      moveOrCopy(join(from, name), join(to, name), move);
      continue;
    }
    try {
      checkpoint(join(from, LEGACY_DB));
      move(join(from, LEGACY_DB), join(to, LEGACY_DB));
      for (const suffix of ["-wal", "-shm"]) {
        try {
          move(join(from, LEGACY_DB + suffix), join(to, LEGACY_DB + suffix));
        } catch {
          // Not there.
        }
      }
    } catch {
      vacuumInto(join(from, LEGACY_DB), join(to, DB));
    }
  }
}

function checkpoint(path: string): void {
  const db = new Database(path);
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

/** A consistent copy, whatever another process is writing. */
function vacuumInto(from: string, to: string): void {
  const source = new Database(from, { readonly: true });
  try {
    source.run(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
    if (process.platform !== "win32") chmodSync(to, 0o600);
  } finally {
    source.close();
  }
}

/** Everything in the WAL goes into the file first, so that the rename loses nothing. */
function renameDatabase(dir: string): void {
  checkpoint(join(dir, LEGACY_DB));
  renameSync(join(dir, LEGACY_DB), join(dir, DB));
  for (const suffix of ["-wal", "-shm"]) {
    try {
      renameSync(join(dir, LEGACY_DB + suffix), join(dir, DB + suffix));
    } catch {
      // Not there: the checkpoint emptied it, or the last connection removed it.
    }
  }
}
