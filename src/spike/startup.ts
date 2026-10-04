import { join } from "node:path";
import {
  isCompiled,
  percentile,
  round,
  type SpikeResult,
  selfCommand,
  withTempDir,
} from "./support.ts";

// A hook runs on every prompt; these are the p95 budgets for a warm start.
const BUDGET_MS = process.platform === "win32" ? 150 : 60;

function time(...args: string[]): number {
  const started = performance.now();
  const proc = Bun.spawnSync(selfCommand("__spike", ...args), {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  const elapsed = performance.now() - started;
  if (proc.exitCode !== 0) {
    throw new Error(`__spike ${args[0]} exited ${proc.exitCode}: ${proc.stderr.toString()}`);
  }
  return elapsed;
}

function summarise(samples: number[]) {
  return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
}

/** Wall-clock cost of starting this program, measured from the outside. */
export function startupSpike(runs: number): Promise<SpikeResult> {
  return withTempDir((dir) => {
    const db = join(dir, "startup.db");
    const firstRunMs = round(time("noop"));
    const noop = summarise(Array.from({ length: runs }, () => time("noop")));
    time("open-db", db);
    const openDb = summarise(Array.from({ length: runs }, () => time("open-db", db)));
    return {
      spike: "startup",
      ok: noop.p95 <= BUDGET_MS && openDb.p95 <= BUDGET_MS,
      compiled: isCompiled(),
      runs,
      budgetMs: BUDGET_MS,
      firstRunMs,
      noop,
      openDb,
    };
  });
}
