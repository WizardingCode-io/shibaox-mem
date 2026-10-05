import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../src/core/project.ts";
import type { Redacted } from "../../src/core/redact.ts";
import { MEMORY_KINDS } from "../../src/core/types.ts";
import { openDb, withWrite } from "../../src/store/db.ts";
import { insertMemory } from "../../src/store/memories.ts";
import { hostBinary, runBinary } from "../helpers/binary.ts";

// A hook sits between the user and the model on every prompt. These budgets are for
// the compiled binary, measured from outside, against a project with 5,000 memories.

const MEMORIES = 5000;
const RUNS = 30;
const WINDOWS = process.platform === "win32";
const BUDGET_MS = {
  prompt: WINDOWS ? 200 : 80,
  "session-start": WINDOWS ? 300 : 150,
  "turn-end": WINDOWS ? 150 : 60,
};

const WORDS =
  "cache queue lease retry timeout migration index schema token session worker pool socket buffer parser render router handler adapter payload transcript hook judge memory branch commit merge rebase deploy build bundle binary signal process thread lock mutex pragma journal checkpoint vacuum trigger column table query cursor batch stream chunk header footer config setting flag option default override fallback breaker backoff jitter deadline budget latency throughput percentile sample metric counter gauge log trace span error warning failure crash restart shutdown startup install upgrade rollback snapshot backup restore export import".split(
    " ",
  );

let binary: string;
let base: string;
let dataDir: string;
let project: string;

/** Deterministic pseudo-random numbers: the same corpus on every run. */
function generator(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % max;
  };
}

beforeAll(() => {
  binary = hostBinary();
  base = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-perf-")));
  dataDir = join(base, "data");
  project = join(base, "project");
  mkdirSync(project);

  const db = openDb({ dataDir, busyTimeoutMs: 5000 });
  const projectId = resolveProject(db, project).id;
  const next = generator(42);
  const word = () => WORDS[next(WORDS.length)] as string;
  const now = Date.now();
  withWrite(db, () => {
    for (let i = 0; i < MEMORIES; i++) {
      const file = `src/${word()}/${word()}${i % 97}.ts`;
      insertMemory(db, {
        projectId,
        kind: MEMORY_KINDS[i % MEMORY_KINDS.length] as (typeof MEMORY_KINDS)[number],
        title: `The ${word()} ${word()} must ${word()} before the ${word()} ${word()}${i}.`,
        body: `Because the ${word()} ${word()} would otherwise ${word()} the ${word()}.\nContext: why does the ${word()} ${word()} fail` as Redacted,
        terms: file,
        importance: 1 + (i % 5),
        branch: null,
        commit: null,
        origin: "manual",
        judge: "heuristic",
        judgeVersion: "1",
        sourceTurnId: null,
        files: [{ path: file, role: "changed" }],
        now: now - next(200) * 86_400_000,
      });
    }
  });
  db.close();
}, 180_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] as number;
}

async function measure(
  event: keyof typeof BUDGET_MS,
  payload: (run: number) => Record<string, unknown>,
): Promise<{ p95: number; outputs: string[] }> {
  const samples: number[] = [];
  const outputs: string[] = [];
  // One run first, unmeasured: the first start of a new binary pays one-off costs.
  for (let run = -1; run < RUNS; run++) {
    const result = await runBinary(binary, ["hook", "claude-code", event], {
      input: JSON.stringify({ session_id: `perf-${event}`, cwd: project, ...payload(run) }),
      env: { SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_DISTILL: "off" },
    });
    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    if (run >= 0) {
      samples.push(result.ms);
      outputs.push(result.stdout);
    }
  }
  return { p95: p95(samples), outputs };
}

describe(`hook latency with ${MEMORIES} memories`, () => {
  test(`a prompt is answered within ${BUDGET_MS.prompt} ms (p95)`, async () => {
    const next = generator(7);
    const word = () => WORDS[next(WORDS.length)] as string;
    const result = await measure("prompt", (run) => ({
      prompt_id: `p${run}`,
      prompt: `why does the ${word()} ${word()} ${word()} when the ${word()} ${word()} is slow?`,
    }));
    console.log(`prompt p95: ${result.p95.toFixed(1)} ms`);
    // The measurement only means something if retrieval actually ran and found things.
    expect(result.outputs.filter((out) => out !== "").length).toBeGreaterThan(RUNS / 2);
    expect(result.p95).toBeLessThanOrEqual(BUDGET_MS.prompt);
  }, 120_000);

  test(`a session start is answered within ${BUDGET_MS["session-start"]} ms (p95)`, async () => {
    const result = await measure("session-start", () => ({ source: "startup" }));
    console.log(`session-start p95: ${result.p95.toFixed(1)} ms`);
    expect(result.outputs.every((out) => out.includes("Known about this project"))).toBe(true);
    expect(result.p95).toBeLessThanOrEqual(BUDGET_MS["session-start"]);
  }, 120_000);

  test(`a turn end returns within ${BUDGET_MS["turn-end"]} ms (p95)`, async () => {
    const result = await measure("turn-end", (run) => ({
      prompt_id: `end${run}`,
      last_assistant_message: "Fixed: the root cause was a missing release in src/pool.ts.",
    }));
    console.log(`turn-end p95: ${result.p95.toFixed(1)} ms`);
    expect(result.p95).toBeLessThanOrEqual(BUDGET_MS["turn-end"]);
  }, 120_000);
});
