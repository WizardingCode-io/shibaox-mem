import { ADAPTERS } from "../../adapters/index.ts";
import type { HookEvent } from "../../core/types.ts";
import { handleHook } from "../../hooks/handle.ts";
import { type Db, openDb } from "../../store/db.ts";
import { logError } from "../../util/log.ts";
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

function spawnDistill(): void {
  // AI_MEM_DISTILL=off leaves queued turns for a later run, e.g. `ai-mem distill` by hand.
  if (process.env.AI_MEM_DISTILL !== "off") spawnDetached("distill");
}

/**
 * `ai-mem hook <agent> <event>`: reads the host's payload on stdin, may print context.
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
    const input = adapter.parse(event, await Bun.stdin.text());
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
    outcome = error instanceof Error ? error.name : "Error";
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
