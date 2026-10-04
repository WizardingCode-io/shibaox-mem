import { ADAPTERS } from "../../adapters/index.ts";
import { drainQueue } from "../../distill/queue.ts";
import { heuristicJudge } from "../../judge/heuristic.ts";
import { type Db, openDb } from "../../store/db.ts";
import { logError } from "../../util/log.ts";

const MAX_TURNS = 50;
const MAX_MS = 30_000;

/**
 * `ai-mem distill`: turns queued turns into memories. Hooks start it in the
 * background; it can also be run by hand. Only one instance works at a time.
 */
export async function run(): Promise<number> {
  let db: Db | undefined;
  try {
    db = openDb({ busyTimeoutMs: 2000 });
    const report = await drainQueue(
      { db, judge: heuristicJudge, adapters: ADAPTERS, now: Date.now },
      { owner: `${process.pid}-${crypto.randomUUID()}`, maxTurns: MAX_TURNS, maxMs: MAX_MS },
    );
    process.stdout.write(
      `distill: ${report.claimed} claimed, ${report.done} done, ${report.skipped} skipped, ${report.failed} failed\n`,
    );
    return 0;
  } catch (error) {
    logError("distill", error);
    process.stderr.write(`ai-mem: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    db?.close();
  }
}
