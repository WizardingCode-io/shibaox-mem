import { ADAPTERS } from "../../adapters/index.ts";
import type { HookEvent } from "../../core/types.ts";
import { handleHook } from "../../hooks/handle.ts";
import { type Db, openDb } from "../../store/db.ts";
import { errorLabel, logError } from "../../util/log.ts";
import { spawnDetached } from "../../util/self.ts";

// How long each event may wait for another process's database lock. The two events
// that sit between the user and the model get the least.
const BUSY_TIMEOUT_MS: Record<HookEvent, number> = {
  "session-start": 150,
  prompt: 100,
  "turn-end": 1000,
  "session-end": 1000,
};

function isHookEvent(value: string | undefined): value is HookEvent {
  return value !== undefined && value in BUSY_TIMEOUT_MS;
}

const STDIN_TIMEOUT_MS = 1500;

/** The payload, or null when the host does not finish sending it in time. */
async function readStdin(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), STDIN_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Bun.stdin.text(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function spawnDistill(): void {
  // SHIBAOX_MEM_DISTILL=off leaves queued turns for a later run, e.g. `shibaox-mem distill` by hand.
  if (process.env.SHIBAOX_MEM_DISTILL !== "off") spawnDetached("distill");
}

/**
 * `shibaox-mem hook <agent> <event>`: reads the host's payload on stdin, may print context.
 *
 * Fails open, always. The host must see a successful hook whatever happens here:
 * exit code 2 would block the user's action, and stray output would be read as context.
 */
export async function run(argv: string[]): Promise<number> {
  const started = performance.now();
  const [agent, event] = argv;
  let db: Db | undefined;
  let outcome = "ok";
  try {
    const adapter = agent === undefined ? undefined : ADAPTERS[agent];
    if (adapter === undefined || !isHookEvent(event) || process.stdin.isTTY) return 0;
    const payload = await readStdin();
    if (payload === null) {
      // The host never closed the pipe. Leaving at once matters more than this event;
      // the pending read would otherwise keep the process alive.
      logError(`hook ${agent} ${event}`, new Error("stdin was not closed by the host"));
      process.exit(0);
    }
    const input = adapter.parse(event, payload);
    if (input === null || input.subagent) return 0;

    db = openDb({ busyTimeoutMs: BUSY_TIMEOUT_MS[event] });
    const out = handleHook(
      {
        db,
        now: Date.now,
        spawnDistill,
        onError: (error) => logError(`hook ${agent} ${event} (lookup)`, error),
      },
      adapter,
      input,
    );
    if (out !== "") process.stdout.write(out);
  } catch (error) {
    outcome = errorLabel(error);
    logError(`hook ${agent} ${event}`, error);
  } finally {
    if (db !== undefined) {
      try {
        db.run("INSERT INTO hook_runs (at, agent, event, ms, outcome) VALUES (?, ?, ?, ?, ?)", [
          Date.now(),
          agent ?? "",
          event ?? "",
          Math.round(performance.now() - started),
          outcome,
        ]);
      } catch {
        // Metrics are best effort.
      }
      db.close();
    }
  }
  return 0;
}
