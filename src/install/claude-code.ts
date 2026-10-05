import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

// Installs ai-mem into Claude Code's user settings and removes it again.
//
// The settings file belongs to the user. It is backed up before it is touched, only
// entries that are recognisably ours are ever changed, and a receipt records enough
// to put the file back exactly as it was.

export interface InstallContext {
  /** Claude Code's user settings.json. */
  settingsPath: string;
  dataDir: string;
  /** Absolute path the hooks will execute. */
  binaryPath: string;
  /** Runs a host command. Must not throw: a missing command is `ok: false`. */
  run: (command: string[]) => { ok: boolean; output: string };
  now: () => number;
}

export interface InstallResult {
  settingsPath: string;
  changed: boolean;
  mcp: "registered" | "manual";
  /** The command that registers the MCP server, for when it has to be run by hand. */
  mcpCommand: string[];
}

export interface UninstallResult {
  settingsPath: string;
  /** restored: original bytes put back. removed: file we created deleted. edited: our entries taken out. */
  settings: "restored" | "removed" | "edited" | "untouched";
}

interface Receipt {
  agent: "claude-code";
  installedAt: number;
  binaryPath: string;
  settingsPath: string;
  existedBefore: boolean;
  backupPath: string | null;
  /** Hash of the settings file as we left it; equal means nobody changed it since. */
  installedSha256: string;
}

/** Claude Code's event names and ours. Exec form (`command` + `args`): no shell is involved. */
const EVENTS = [
  ["SessionStart", "session-start"],
  ["UserPromptSubmit", "prompt"],
  ["Stop", "turn-end"],
  ["SessionEnd", "session-end"],
] as const;
const HOOK_TIMEOUT_SECONDS = 5;
const MCP_NAME = "ai-mem";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const receiptPath = (dataDir: string) => join(dataDir, "install", "claude-code.json");

function isOurs(hook: unknown): boolean {
  if (!isObject(hook) || typeof hook.command !== "string" || !Array.isArray(hook.args))
    return false;
  return (
    basename(hook.command).startsWith("ai-mem") &&
    hook.args[0] === "hook" &&
    hook.args[1] === "claude-code"
  );
}

function parseSettings(path: string, text: string | null): Json {
  if (text === null || text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON; fix it and run this again`);
  }
  if (!isObject(parsed)) throw new Error(`${path} does not hold a JSON object`);
  if (parsed.hooks !== undefined && !isObject(parsed.hooks)) {
    throw new Error(`"hooks" in ${path} is not an object; fix it and run this again`);
  }
  return parsed;
}

/** The settings without any hook of ours; hook groups and events left empty are dropped. */
function withoutOurs(settings: Json): { settings: Json; removed: number } {
  if (!isObject(settings.hooks)) return { settings, removed: 0 };
  let removed = 0;
  const hooks: Json = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const others = group.hooks.filter((hook) => !isOurs(hook));
      removed += group.hooks.length - others.length;
      if (others.length === group.hooks.length) kept.push(group);
      else if (others.length > 0) kept.push({ ...group, hooks: others });
    }
    if (kept.length > 0 || groups.length === 0) hooks[event] = kept;
  }
  const result: Json = { ...settings, hooks };
  if (removed > 0 && Object.keys(hooks).length === 0) delete result.hooks;
  return { settings: result, removed };
}

function withOurs(settings: Json, binaryPath: string): Json {
  const hooks: Json = { ...(isObject(settings.hooks) ? settings.hooks : {}) };
  for (const [hostEvent, event] of EVENTS) {
    const groups = hooks[hostEvent];
    hooks[hostEvent] = [
      ...(Array.isArray(groups) ? groups : []),
      {
        hooks: [
          {
            type: "command",
            command: binaryPath,
            args: ["hook", "claude-code", event],
            timeout: HOOK_TIMEOUT_SECONDS,
          },
        ],
      },
    ];
  }
  return { ...settings, hooks };
}

/** Serialises in the file's own style: its indentation, and its final newline or lack of one. */
function serialise(settings: Json, previous: string | null): string {
  const indent = previous === null ? "  " : (/\n([ \t]+)\S/.exec(previous)?.[1] ?? "  ");
  const newline = previous === null || previous.endsWith("\n") ? "\n" : "";
  return JSON.stringify(settings, null, indent) + newline;
}

function writeAtomically(path: string, text: string): void {
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
  const temporary = `${path}.ai-mem-new`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}

function readReceipt(dataDir: string): Receipt | null {
  try {
    const receipt = JSON.parse(readFileSync(receiptPath(dataDir), "utf8")) as Receipt;
    return receipt.agent === "claude-code" ? receipt : null;
  } catch {
    return null;
  }
}

export function installClaudeCode(context: InstallContext): InstallResult {
  const { settingsPath, dataDir, binaryPath } = context;
  const previous = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : null;
  // Validated before anything is changed or run.
  const settings = parseSettings(settingsPath, previous);
  const next = serialise(withOurs(withoutOurs(settings).settings, binaryPath), previous);
  const changed = next !== previous;

  if (changed) {
    const installDir = join(dataDir, "install");
    mkdirSync(join(installDir, "backups"), { recursive: true, mode: 0o700 });
    // The receipt of a first install describes the user's own file; later installs keep it.
    const earlier = readReceipt(dataDir);
    let backupPath = earlier?.backupPath ?? null;
    if (earlier === null && previous !== null) {
      backupPath = join(installDir, "backups", `claude-code-settings-${context.now()}.json`);
      copyFileSync(settingsPath, backupPath);
      chmodSync(backupPath, 0o600);
    }
    mkdirSync(join(settingsPath, ".."), { recursive: true });
    writeAtomically(settingsPath, next);
    const receipt: Receipt = {
      agent: "claude-code",
      installedAt: context.now(),
      binaryPath,
      settingsPath,
      existedBefore: earlier?.existedBefore ?? previous !== null,
      backupPath,
      installedSha256: sha256(next),
    };
    writeFileSync(receiptPath(dataDir), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  }

  // The MCP server is registered through Claude Code's own command: its config file
  // holds unrelated state and is rewritten by the application itself.
  const mcpCommand = ["claude", "mcp", "add", "--scope", "user", MCP_NAME, "--", binaryPath, "mcp"];
  context.run(["claude", "mcp", "remove", "--scope", "user", MCP_NAME]);
  const mcp = context.run(mcpCommand).ok ? "registered" : "manual";
  return { settingsPath, changed, mcp, mcpCommand };
}

export function uninstallClaudeCode(context: InstallContext): UninstallResult {
  const { settingsPath, dataDir } = context;
  const receipt = readReceipt(dataDir);
  const current = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : null;
  let outcome: UninstallResult["settings"] = "untouched";

  if (current !== null) {
    const untouchedSinceInstall = receipt !== null && sha256(current) === receipt.installedSha256;
    if (untouchedSinceInstall && !receipt.existedBefore) {
      rmSync(settingsPath);
      outcome = "removed";
    } else if (
      untouchedSinceInstall &&
      receipt.backupPath !== null &&
      existsSync(receipt.backupPath)
    ) {
      // Nobody changed the file since: the original bytes go back exactly.
      writeAtomically(settingsPath, readFileSync(receipt.backupPath, "utf8"));
      outcome = "restored";
    } else {
      // The file has moved on: take out what is ours and keep everything else.
      const { settings, removed } = withoutOurs(parseSettings(settingsPath, current));
      if (removed > 0) {
        writeAtomically(settingsPath, serialise(settings, current));
        outcome = "edited";
      }
    }
  }

  context.run(["claude", "mcp", "remove", "--scope", "user", MCP_NAME]);
  if (receipt?.backupPath) rmSync(receipt.backupPath, { force: true });
  rmSync(receiptPath(dataDir), { force: true });
  return { settingsPath, settings: outcome };
}

/** What of ours a settings file holds: which events are hooked, and to which binaries. */
export function inspectSettings(text: string): { events: string[]; binaries: string[] } {
  const settings = parseSettings("settings.json", text);
  const events: string[] = [];
  const binaries = new Set<string>();
  if (isObject(settings.hooks)) {
    for (const [hostEvent] of EVENTS) {
      const groups = settings.hooks[hostEvent];
      for (const group of Array.isArray(groups) ? groups : []) {
        for (const hook of isObject(group) && Array.isArray(group.hooks) ? group.hooks : []) {
          if (isOurs(hook)) {
            if (!events.includes(hostEvent)) events.push(hostEvent);
            binaries.add((hook as { command: string }).command);
          }
        }
      }
    }
  }
  return { events, binaries: [...binaries] };
}

export const HOOKED_EVENTS: readonly string[] = EVENTS.map(([hostEvent]) => hostEvent);
