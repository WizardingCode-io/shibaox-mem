import { Database } from "bun:sqlite";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLAUDE_CODE } from "../install/claude-code.ts";
import { CODEX } from "../install/codex.ts";
import { CURSOR } from "../install/cursor.ts";
import { GEMINI } from "../install/gemini.ts";
import { type HostSpec, inspectHooksFile } from "../install/hooks-file.ts";
import { PLUGIN_MARKER } from "../install/opencode-plugin.ts";
import { Breaker } from "../judge/breaker.ts";
import { keyFingerprint } from "../judge/key.ts";
import { loadSettings } from "../settings/settings.ts";
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
  /** Where each other host keeps what `install` wrote. */
  codexHooksPath: string;
  cursorHooksPath: string;
  geminiSettingsPath: string;
  opencodePluginPath: string;
  /** Whether a host's command is on this machine; null when it is not. */
  which: (command: string) => string | null;
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
      detail: `${context.dataDir} is inside a synced or shared folder; SQLite files can be corrupted there. Set SHIBAOX_MEM_DATA_DIR to a local path.`,
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
  if (overdue > 0) problems.push(`${overdue} waiting for over an hour; run: shibaox-mem distill`);
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

/** How each agent installs shibaox-mem itself; what `doctor` suggests when it is missing. */
const NATIVE_INSTALL: Record<string, string> = {
  "claude-code":
    "run: claude plugin marketplace add WizardingCode-io/shibaox-plugins && claude plugin install shibaox-mem@shibaox-plugins",
  codex:
    "run: codex plugin marketplace add WizardingCode-io/shibaox-plugins && codex plugin add shibaox-mem@shibaox-plugins",
  gemini: "run: gemini extensions install https://github.com/WizardingCode-io/shibaox-mem",
  cursor: "run: shibaox-mem install cursor",
  opencode: "run: opencode plugin shibaox-mem-opencode --global",
};

const readText = (path: string): string | null => {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
};

/**
 * Whether the agent has shibaox-mem as its own plugin or extension, and how to say so.
 * Read from where each agent records what it has installed and enabled.
 */
function nativeInstall(agent: string, context: DoctorContext): string | null {
  try {
    switch (agent) {
      case "claude-code": {
        const settings = JSON.parse(readText(context.settingsPath) ?? "{}") as {
          enabledPlugins?: Record<string, unknown>;
        };
        const key = Object.entries(settings.enabledPlugins ?? {}).find(
          ([name, enabled]) => name.startsWith("shibaox-mem@") && enabled === true,
        )?.[0];
        return key === undefined ? null : `installed as a plugin (${key})`;
      }
      case "codex": {
        const config = readText(join(dirname(context.codexHooksPath), "config.toml")) ?? "";
        const section = /^\[plugins\."(shibaox-mem@[^"]+)"\]\s*\n((?:(?!\[)[^\n]*\n?)*)/m.exec(
          config,
        );
        if (section === null || !/^enabled\s*=\s*true/m.test(section[2] ?? "")) return null;
        return `installed as a plugin (${section[1]})`;
      }
      case "gemini": {
        const manifest = readText(
          join(
            dirname(context.geminiSettingsPath),
            "extensions",
            "shibaox-mem",
            "gemini-extension.json",
          ),
        );
        if (manifest === null) return null;
        const version = (JSON.parse(manifest) as { version?: string }).version ?? "unknown version";
        return `installed as an extension (${version})`;
      }
      case "opencode": {
        const dir = dirname(dirname(context.opencodePluginPath));
        const listed = ["opencode.json", "opencode.jsonc"].some((file) =>
          (readText(join(dir, file)) ?? "").includes('"shibaox-mem-opencode'),
        );
        return listed ? "installed as an npm plugin (shibaox-mem-opencode)" : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Not installed directly: installed natively, absent from the machine, or simply missing. */
function withoutDirect(
  name: string,
  agent: string,
  command: string | null,
  context: DoctorContext,
): Check {
  const native = nativeInstall(agent, context);
  if (native !== null) return { name, status: "ok", detail: native };
  return command !== null && context.which(command) === null
    ? { name, status: "skip", detail: "not found on this machine" }
    : { name, status: "warn", detail: `not installed; ${NATIVE_INSTALL[agent]}` };
}

/** A host that keeps hooks in a JSON file: installed and whole, partly, pointing nowhere, or absent. */
function hooksHost(
  name: string,
  spec: HostSpec,
  path: string,
  command: string | null,
  context: DoctorContext,
): Check {
  const install = `run: shibaox-mem install ${spec.agent}`;
  const absent = (): Check => withoutDirect(name, spec.agent, command, context);
  if (!existsSync(path)) return absent();
  let found: ReturnType<typeof inspectHooksFile>;
  try {
    found = inspectHooksFile(spec, readFileSync(path, "utf8"));
  } catch (error) {
    return {
      name,
      status: "warn",
      detail: error instanceof Error ? error.message.replace("settings.json", path) : String(error),
    };
  }
  if (found.events.length === 0) return absent();
  const gone = found.binaries.filter((binary) => !existsSync(binary));
  if (gone.length > 0) {
    return {
      name,
      status: "fail",
      detail: `its hooks run ${gone.join(", ")}, which does not exist; ${install}`,
    };
  }
  const missing = spec.events
    .map(([hostEvent]) => hostEvent)
    .filter((event) => !found.events.includes(event));
  if (missing.length > 0) {
    return {
      name,
      status: "warn",
      detail: `partly installed (no ${missing.join(", ")} hook); ${install}`,
    };
  }
  return { name, status: "ok", detail: `installed, running ${found.binaries.join(", ")}` };
}

function openCode(context: DoctorContext): Check {
  const name = "OpenCode";
  const install = "run: shibaox-mem install opencode";
  const path = context.opencodePluginPath;
  let source: string | null = null;
  try {
    source = existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    source = null;
  }
  if (source === null || !source.includes(PLUGIN_MARKER)) {
    return withoutDirect(name, "opencode", "opencode", context);
  }
  const binary = /^const BINARY = (".*");$/m.exec(source)?.[1];
  const binaryPath = binary === undefined ? null : (JSON.parse(binary) as string);
  if (binaryPath === null || !existsSync(binaryPath)) {
    return {
      name,
      status: "fail",
      detail: `its plugin runs ${binaryPath ?? "an unknown binary"}, which does not exist; ${install}`,
    };
  }
  return { name, status: "ok", detail: `installed, running ${binaryPath}` };
}

function typeSafe(context: DoctorContext, db: Db | null): Check {
  const name = "TypeSafe";
  const settings = loadSettings(process.env, context.dataDir);
  const key = settings.typesafeKey;
  if (key === null) {
    return {
      name,
      status: "ok",
      detail: "not configured: the heuristic judge works alone and nothing leaves the machine",
    };
  }
  if (settings.typesafe === "off") {
    return {
      name,
      status: "ok",
      detail: "turned off in the settings; the key is kept and the heuristic judge works alone",
    };
  }
  const fingerprint = keyFingerprint(key);
  if (db !== null) {
    const state = new Breaker(db, { keyFingerprint: fingerprint }).state();
    if (state.reason === "auth") {
      return {
        name,
        status: "fail",
        detail:
          "the key was rejected by the service; check it at console.typesafe.ai/keys and save it again (the heuristic judge is standing in)",
      };
    }
    if (state.openUntil !== null && state.openUntil > context.now) {
      return {
        name,
        status: "warn",
        detail: `unavailable lately (${state.reason}); the heuristic judge is standing in until ${new Date(state.openUntil).toISOString()}`,
      };
    }
  }
  return { name, status: "ok", detail: `configured (key …${fingerprint.slice(-6)})` };
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
      typeSafe(context, db),
      // Claude Code is the host this started on: its absence is a warning, not a skip.
      hooksHost("Claude Code", CLAUDE_CODE, context.settingsPath, null, context),
      hooksHost("Codex", CODEX, context.codexHooksPath, "codex", context),
      hooksHost("Cursor", CURSOR, context.cursorHooksPath, "cursor", context),
      hooksHost("Gemini CLI", GEMINI, context.geminiSettingsPath, "gemini", context),
      openCode(context),
    ];
  } finally {
    db?.close();
  }
}
