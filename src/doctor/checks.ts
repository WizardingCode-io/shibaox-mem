import { Database } from "bun:sqlite";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOKED_EVENTS, inspectSettings } from "../install/claude-code.ts";
import { hookLatency } from "../status/report.ts";
import { DB_FILE, type Db, LATEST_VERSION, openExisting, SchemaTooNewError } from "../store/db.ts";

export interface Check {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

export interface DoctorContext {
  dataDir: string;
  /** Claude Code's user settings.json. */
  settingsPath: string;
  now: number;
}

// Folders that copy files behind SQLite's back, or cannot lock them properly.
const SYNCED =
  /[\\/](?:Dropbox|OneDrive|Google Drive|iCloud Drive|Mobile Documents)[\\/]|^\/mnt\/[a-z]\//i;
const PROMPT_BUDGET_MS = 100;
const HOUR_MS = 3_600_000;

function dataDirectory(context: DoctorContext): Check {
  const name = "data directory";
  if (SYNCED.test(`${context.dataDir}/`)) {
    return {
      name,
      status: "warn",
      detail: `${context.dataDir} is inside a synced or shared folder; SQLite files can be corrupted there. Set AI_MEM_DATA_DIR to a local path.`,
    };
  }
  if (!existsSync(context.dataDir)) {
    return { name, status: "ok", detail: `${context.dataDir} (created on first use)` };
  }
  try {
    accessSync(context.dataDir, constants.R_OK | constants.W_OK);
    return { name, status: "ok", detail: context.dataDir };
  } catch {
    return { name, status: "fail", detail: `${context.dataDir} is not readable and writable` };
  }
}

function database(context: DoctorContext): { check: Check; db: Db | null } {
  const name = "database";
  try {
    const db = openExisting(context.dataDir);
    if (db === null) return { check: { name, status: "ok", detail: "not created yet" }, db };
    const version =
      db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    const integrity =
      db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check ?? "unknown";
    if (integrity !== "ok") {
      db.close();
      return {
        check: {
          name,
          status: "fail",
          detail: `${join(context.dataDir, DB_FILE)} failed its integrity check: ${integrity}. Restore a file from ${join(context.dataDir, "backups")}.`,
        },
        db: null,
      };
    }
    const pending = version < LATEST_VERSION ? ", will be migrated on next use" : "";
    return { check: { name, status: "ok", detail: `schema version ${version}${pending}` }, db };
  } catch (error) {
    const detail =
      error instanceof SchemaTooNewError
        ? error.message
        : `cannot be opened: ${error instanceof Error ? error.message : String(error)}`;
    return { check: { name, status: "fail", detail }, db: null };
  }
}

function fullTextSearch(): Check {
  const name = "full-text search";
  const probe = new Database(":memory:");
  try {
    probe.run(`CREATE VIRTUAL TABLE t USING fts5(x, tokenize = "unicode61 remove_diacritics 2")`);
    probe.run("INSERT INTO t (x) VALUES ('migração')");
    const found = probe.query("SELECT 1 FROM t WHERE t MATCH 'migracao'").get() !== null;
    const version = probe.query<{ v: string }, []>("SELECT sqlite_version() AS v").get()?.v;
    return found
      ? { name, status: "ok", detail: `FTS5 available (SQLite ${version})` }
      : { name, status: "fail", detail: "FTS5 does not fold diacritics on this SQLite" };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: `FTS5 is not available: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    probe.close();
  }
}

function queue(db: Db | null, now: number): Check {
  const name = "queue";
  if (db === null) return { name, status: "ok", detail: "nothing queued" };
  const count = (where: string, ...args: number[]) =>
    db.query<{ n: number }, number[]>(`SELECT count(*) AS n FROM turns WHERE ${where}`).get(...args)
      ?.n ?? 0;
  const failed = count("state = 'failed'");
  const waiting = count("state IN ('pending', 'processing')");
  const overdue = count("state = 'pending' AND started_at < ?", now - HOUR_MS);
  const problems: string[] = [];
  if (failed > 0) problems.push(`${failed} failed (see ${"`"}last_error${"`"} in the turns table)`);
  if (overdue > 0) problems.push(`${overdue} waiting for over an hour; run: ai-mem distill`);
  return problems.length > 0
    ? { name, status: "warn", detail: problems.join("; ") }
    : { name, status: "ok", detail: waiting === 0 ? "nothing queued" : `${waiting} waiting` };
}

function hookSpeed(db: Db | null): Check {
  const name = "hook speed";
  const prompt =
    db === null ? undefined : hookLatency(db).latency.find((l) => l.event === "prompt");
  if (prompt === undefined) return { name, status: "ok", detail: "no runs recorded yet" };
  const detail = `prompt p95 ${prompt.p95} ms over ${prompt.runs} runs`;
  return prompt.p95 > PROMPT_BUDGET_MS
    ? { name, status: "warn", detail: `${detail}; the budget is ${PROMPT_BUDGET_MS} ms` }
    : { name, status: "ok", detail };
}

function claudeCode(context: DoctorContext): Check {
  const name = "Claude Code";
  const install = "run: ai-mem install claude-code";
  if (!existsSync(context.settingsPath)) {
    return { name, status: "warn", detail: `not installed; ${install}` };
  }
  let found: ReturnType<typeof inspectSettings>;
  try {
    found = inspectSettings(readFileSync(context.settingsPath, "utf8"));
  } catch (error) {
    return {
      name,
      status: "warn",
      detail:
        error instanceof Error
          ? error.message.replace("settings.json", context.settingsPath)
          : String(error),
    };
  }
  if (found.events.length === 0)
    return { name, status: "warn", detail: `not installed; ${install}` };
  const gone = found.binaries.filter((binary) => !existsSync(binary));
  if (gone.length > 0) {
    return {
      name,
      status: "fail",
      detail: `its hooks run ${gone.join(", ")}, which does not exist; ${install}`,
    };
  }
  const missing = HOOKED_EVENTS.filter((event) => !found.events.includes(event));
  if (missing.length > 0) {
    return {
      name,
      status: "warn",
      detail: `partly installed (no ${missing.join(", ")} hook); ${install}`,
    };
  }
  return { name, status: "ok", detail: `installed, running ${found.binaries.join(", ")}` };
}

/** Looks, and changes nothing: no directory, database or setting is created or altered. */
export function runChecks(context: DoctorContext): Check[] {
  const { check: databaseCheck, db } = database(context);
  try {
    return [
      dataDirectory(context),
      databaseCheck,
      fullTextSearch(),
      databaseCheck.status === "fail"
        ? { name: "queue", status: "skip", detail: "the database could not be read" }
        : queue(db, context.now),
      hookSpeed(db),
      claudeCode(context),
    ];
  } finally {
    db?.close();
  }
}
