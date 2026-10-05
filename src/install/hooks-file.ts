import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { AgentId, HookEvent } from "../core/types.ts";

// Installs shibaox-mem into a host's hooks file and removes it again. Claude Code and
// Codex share the file's shape (event → groups → hooks); a HostSpec says what differs.
//
// The file belongs to the user. It is backed up before it is touched, only entries
// that are recognisably ours are ever changed, and a receipt records enough to put the
// file back exactly as it was.

/** What differs between hosts that keep hooks in a JSON file of the same shape. */
export interface HostSpec {
  agent: AgentId;
  /** The host's event names and ours. */
  events: readonly (readonly [string, HookEvent])[];
  /** The entry, inside a group's `hooks` array, that runs our binary for an event. */
  entry(binaryPath: string, event: HookEvent): Json;
  /** Recognises an entry of ours, whichever binary path it names. */
  isOurs(entry: unknown): boolean;
  /** The binary an entry of ours runs. */
  binaryOf(entry: Json): string;
  /** The host's own commands for its MCP server registry. */
  mcpAdd(binaryPath: string): string[];
  mcpRemove: string[];
  /** Anything the user still has to do by hand after installing. */
  notes: string[];
}

export interface InstallContext {
  /** The host's hooks file (Claude Code: settings.json; Codex: hooks.json). */
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
  notes: string[];
}

export interface UninstallResult {
  settingsPath: string;
  /** restored: original bytes put back. removed: file we created deleted. edited: our entries taken out. */
  settings: "restored" | "removed" | "edited" | "untouched";
}

interface Receipt {
  agent: AgentId;
  installedAt: number;
  binaryPath: string;
  settingsPath: string;
  existedBefore: boolean;
  backupPath: string | null;
  /** Hash of the settings file as we left it; equal means nobody changed it since. */
  installedSha256: string;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
// One receipt per settings file: several Claude Code profiles may share a data directory.
const profileKey = (settingsPath: string) => sha256(settingsPath).slice(0, 12);
const receiptPath = (dataDir: string, agent: AgentId, settingsPath: string) =>
  join(dataDir, "install", `${agent}-${profileKey(settingsPath)}.json`);

/** The file to read and write: the target, when the settings file is a symlink into dotfiles. */
function resolved(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
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
function withoutOurs(spec: HostSpec, settings: Json): { settings: Json; removed: number } {
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
      const others = group.hooks.filter((hook) => !spec.isOurs(hook));
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

function withOurs(spec: HostSpec, settings: Json, binaryPath: string): Json {
  const hooks: Json = { ...(isObject(settings.hooks) ? settings.hooks : {}) };
  for (const [hostEvent, event] of spec.events) {
    const groups = hooks[hostEvent];
    hooks[hostEvent] = [
      ...(Array.isArray(groups) ? groups : []),
      { hooks: [spec.entry(binaryPath, event)] },
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
  const temporary = `${path}.shibaox-mem-new`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}

function readReceipt(dataDir: string, agent: AgentId, settingsPath: string): Receipt | null {
  try {
    const receipt = JSON.parse(
      readFileSync(receiptPath(dataDir, agent, settingsPath), "utf8"),
    ) as Receipt;
    return receipt.agent === agent && receipt.settingsPath === settingsPath ? receipt : null;
  } catch {
    return null;
  }
}

export function installHooksFile(spec: HostSpec, context: InstallContext): InstallResult {
  const { settingsPath, dataDir, binaryPath } = context;
  const file = resolved(settingsPath);
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;
  // Validated before anything is changed or run.
  const settings = parseSettings(settingsPath, previous);
  const next = serialise(
    withOurs(spec, withoutOurs(spec, settings).settings, binaryPath),
    previous,
  );
  const changed = next !== previous;

  if (changed) {
    const installDir = join(dataDir, "install");
    mkdirSync(join(installDir, "backups"), { recursive: true, mode: 0o700 });

    // An earlier receipt still describes this file only if nobody has changed the file
    // since we wrote it. Otherwise its backup is of a file that no longer exists, and
    // restoring it later would throw away whatever was done in between.
    const earlier = readReceipt(dataDir, spec.agent, settingsPath);
    const earlierHolds =
      earlier !== null && previous !== null && sha256(previous) === earlier.installedSha256;
    let existedBefore: boolean;
    let backupPath: string | null;
    if (earlier !== null && earlierHolds) {
      ({ existedBefore, backupPath } = earlier);
    } else {
      if (earlier?.backupPath) rmSync(earlier.backupPath, { force: true });
      existedBefore = previous !== null;
      backupPath = null;
      // Only the user's own file, from before any install of ours, is worth putting back.
      if (earlier === null && previous !== null) {
        backupPath = join(
          installDir,
          "backups",
          `${spec.agent}-settings-${profileKey(settingsPath)}-${context.now()}.json`,
        );
        copyFileSync(file, backupPath);
        chmodSync(backupPath, 0o600);
      }
    }

    mkdirSync(dirname(file), { recursive: true });
    writeAtomically(file, next);
    const receipt: Receipt = {
      agent: spec.agent,
      installedAt: context.now(),
      binaryPath,
      settingsPath,
      existedBefore,
      backupPath,
      installedSha256: sha256(next),
    };
    writeFileSync(
      receiptPath(dataDir, spec.agent, settingsPath),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600 },
    );
  }

  // The MCP server is registered through the host's own command: its config file
  // holds unrelated state and is rewritten by the application itself.
  const mcpCommand = spec.mcpAdd(binaryPath);
  context.run(spec.mcpRemove);
  const mcp = context.run(mcpCommand).ok ? "registered" : "manual";
  return { settingsPath, changed, mcp, mcpCommand, notes: spec.notes };
}

export function uninstallHooksFile(spec: HostSpec, context: InstallContext): UninstallResult {
  const { settingsPath, dataDir } = context;
  const file = resolved(settingsPath);
  const receipt = readReceipt(dataDir, spec.agent, settingsPath);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
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
      writeAtomically(file, readFileSync(receipt.backupPath, "utf8"));
      outcome = "restored";
    } else {
      // The file has moved on: take out what is ours and keep everything else.
      const { settings, removed } = withoutOurs(spec, parseSettings(settingsPath, current));
      if (removed > 0) {
        writeAtomically(file, serialise(settings, current));
        outcome = "edited";
      }
    }
  }

  context.run(spec.mcpRemove);
  if (receipt?.backupPath) rmSync(receipt.backupPath, { force: true });
  rmSync(receiptPath(dataDir, spec.agent, settingsPath), { force: true });
  return { settingsPath, settings: outcome };
}

/** What of ours a hooks file holds: which events are hooked, and to which binaries. */
export function inspectHooksFile(
  spec: HostSpec,
  text: string,
): { events: string[]; binaries: string[] } {
  const settings = parseSettings("settings.json", text);
  const events: string[] = [];
  const binaries = new Set<string>();
  if (isObject(settings.hooks)) {
    for (const [hostEvent] of spec.events) {
      const groups = settings.hooks[hostEvent];
      for (const group of Array.isArray(groups) ? groups : []) {
        for (const hook of isObject(group) && Array.isArray(group.hooks) ? group.hooks : []) {
          if (spec.isOurs(hook)) {
            if (!events.includes(hostEvent)) events.push(hostEvent);
            binaries.add(spec.binaryOf(hook as Json));
          }
        }
      }
    }
  }
  return { events, binaries: [...binaries] };
}

export const MCP_NAME = "shibaox-mem";
export const HOOK_TIMEOUT_SECONDS = 5;
export type { Json as HookEntry };
