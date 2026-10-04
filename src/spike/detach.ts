import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { round, type SpikeResult, selfCommand, withTempDir } from "./support.ts";

const CHILD_DELAY_MS = 2000;
const WAIT_FOR_MARKER_MS = 8000;

/** What a hook does: start background work and leave without waiting for it. */
export function detachParent(marker: string): void {
  Bun.spawn(selfCommand("__spike", "detach-child", marker), {
    detached: true,
    // Any inherited or piped stdio would tie the child to this process.
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).unref();
}

export async function detachChild(marker: string): Promise<void> {
  await Bun.sleep(CHILD_DELAY_MS);
  writeFileSync(marker, String(process.pid));
}

export function detachSpike(): Promise<SpikeResult> {
  return withTempDir(async (dir) => {
    const marker = join(dir, "marker");
    const started = performance.now();
    const parent = Bun.spawnSync(selfCommand("__spike", "detach-parent", marker), {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const parentMs = round(performance.now() - started);

    const deadline = performance.now() + WAIT_FOR_MARKER_MS;
    while (!existsSync(marker) && performance.now() < deadline) await Bun.sleep(100);
    const childSurvived = existsSync(marker);

    return {
      spike: "detach",
      // The parent must be gone long before the child finishes, or nothing was detached.
      ok: parent.exitCode === 0 && childSurvived && parentMs < CHILD_DELAY_MS / 2,
      childSurvived,
      parentMs,
      childDelayMs: CHILD_DELAY_MS,
    };
  });
}
