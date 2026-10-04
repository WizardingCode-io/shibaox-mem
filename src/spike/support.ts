import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SpikeResult {
  spike: string;
  ok: boolean;
  [detail: string]: unknown;
}

export function isCompiled(): boolean {
  return Bun.main.includes("$bunfs") || Bun.main.includes("~BUN");
}

/** Command line that re-invokes this program, whether compiled or run from source. */
export function selfCommand(...args: string[]): string[] {
  return isCompiled() ? [process.execPath, ...args] : [process.execPath, Bun.main, ...args];
}

export async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ai-mem-spike-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
