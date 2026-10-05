import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Finds the user's claude-mem installation and, when asked, retires it: the plugin is
// disabled through Claude Code's own command and its background processes are
// stopped. Nothing of its data is touched; the import reads it, this leaves it alone.

export interface TakeoverContext {
  /** Claude Code's user settings.json. */
  settingsPath: string;
  /** Claude Code's config directory: its plugin cache lives under it. */
  configDir: string;
  /** claude-mem's data directory, normally ~/.claude-mem. */
  claudeMemDir: string;
  run: (command: string[]) => { ok: boolean; output: string };
  listProcesses: () => { pid: number; command: string }[];
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  sleep: (ms: number) => void;
}

export interface Detection {
  /** The enabled plugin's key, as Claude Code names it. */
  plugin: string | null;
  database: string | null;
}

export interface StopReport {
  disabled: boolean;
  disableOutput: string;
  stopped: number[];
  stillRunning: number[];
}

const DB_FILE = "claude-mem.db";
const GRACE_MS = 3000;
const POLL_MS = 100;

export function detectClaudeMem(context: TakeoverContext): Detection {
  let plugin: string | null = null;
  try {
    const settings = JSON.parse(readFileSync(context.settingsPath, "utf8")) as {
      enabledPlugins?: Record<string, unknown>;
    };
    plugin =
      Object.entries(settings.enabledPlugins ?? {}).find(
        ([key, enabled]) => key.startsWith("claude-mem@") && enabled === true,
      )?.[0] ?? null;
  } catch {
    // No settings, or settings that cannot be read: no plugin is known to be enabled.
  }
  const database = join(context.claudeMemDir, DB_FILE);
  return { plugin, database: existsSync(database) ? database : null };
}

/** The pid claude-mem's worker recorded for itself, if any. */
function workerPid(claudeMemDir: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(join(claudeMemDir, "worker.pid"), "utf8")) as {
      pid?: unknown;
    };
    return typeof parsed.pid === "number" ? parsed.pid : null;
  } catch {
    return null;
  }
}

/**
 * Whether a running process belongs to claude-mem. Matched on the paths that are
 * specific to this installation, never on words alone: a command that merely mentions
 * "claude-mem" is not it.
 */
function isClaudeMemProcess(
  process: { pid: number; command: string },
  context: TakeoverContext,
  worker: number | null,
): boolean {
  if (process.pid === globalThis.process.pid) return false;
  const { command } = process;
  if (command.includes(join(context.configDir, "plugins", "cache", "thedotmack", "claude-mem"))) {
    return true;
  }
  // The hook runner is a one-liner that locates the plugin by its marketplace path.
  if (command.includes("plugins/cache/thedotmack/claude-mem")) return true;
  if (command.includes("chroma-mcp") && command.includes(context.claudeMemDir)) return true;
  // The recorded pid may have been reused by something else since.
  return process.pid === worker && /claude-mem|worker-service/.test(command);
}

/**
 * Disables the plugin and stops what it left running. Polite first; a process that is
 * still there after a grace period is killed. Returns what it did, for the report.
 */
export function stopClaudeMem(context: TakeoverContext, plugin: string | null): StopReport {
  let disabled = false;
  let disableOutput = "";
  if (plugin !== null) {
    // Disabled first, so that no hook starts the worker again while it is being stopped.
    const result = context.run(["claude", "plugin", "disable", plugin]);
    disabled = result.ok;
    disableOutput = result.output;
  }

  const worker = workerPid(context.claudeMemDir);
  const ours = (list: { pid: number; command: string }[]) =>
    list.filter((process) => isClaudeMemProcess(process, context, worker));

  const targets = ours(context.listProcesses()).map((process) => process.pid);
  for (const pid of targets) context.kill(pid, "SIGTERM");

  let remaining = targets;
  for (let waited = 0; remaining.length > 0 && waited < GRACE_MS; waited += POLL_MS) {
    context.sleep(POLL_MS);
    const alive = new Set(context.listProcesses().map((process) => process.pid));
    remaining = remaining.filter((pid) => alive.has(pid));
  }
  for (const pid of remaining) context.kill(pid, "SIGKILL");

  const alive = new Set(ours(context.listProcesses()).map((process) => process.pid));
  return {
    disabled,
    disableOutput,
    stopped: targets.filter((pid) => !alive.has(pid)),
    stillRunning: targets.filter((pid) => alive.has(pid)),
  };
}

/** Processes on this machine, as `ps` reports them. Empty where `ps` is unavailable. */
export function listProcesses(): { pid: number; command: string }[] {
  try {
    const proc = Bun.spawnSync(["ps", "-axo", "pid=,command="], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    return proc.stdout
      .toString()
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => ({ pid: Number(match[1]), command: match[2] ?? "" }));
  } catch {
    return [];
  }
}

export function killProcess(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone, or not ours to signal.
  }
}
