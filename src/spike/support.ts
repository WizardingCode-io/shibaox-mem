import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export { isCompiled, selfCommand } from "../util/self.ts";

export interface SpikeResult {
  spike: string;
  ok: boolean;
  [detail: string]: unknown;
}

export async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "wizardingcode-mem-spike-"));
  try {
    return await fn(dir);
  } finally {
    // On Windows a database file just closed can stay locked for a moment (EBUSY).
    // A temporary directory left behind is not a failed probe, so this gives up quietly.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        Bun.sleepSync(100);
      }
    }
  }
}

export function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}

export function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return round(sorted[Math.min(index, sorted.length - 1)] ?? 0);
}

/** Rejects after `ms` unless `work` settles first. The timer never outlives the race. */
export async function within<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
