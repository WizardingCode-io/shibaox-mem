import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../src/core/project.ts";
import type { Redacted } from "../../src/core/redact.ts";
import type { MemoryKind } from "../../src/core/types.ts";
import { retrieveForPrompt } from "../../src/retrieve/prompt.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { insertMemory } from "../../src/store/memories.ts";
import { searchTerms } from "../../src/util/words.ts";
import golden from "./retrieval.json" with { type: "json" };

// Hand-written, like the rest of the golden set: a regression baseline for retrieval,
// not a measure of how it behaves on real projects. Several prompts are paraphrases on
// purpose, so that what lexical search cannot do stays visible in the numbers.

const NOW = Date.UTC(2026, 9, 5);
let base: string;
let db: Db;
let projectId: number;
const ids = new Map<string, number>();

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "wizardingcode-mem-golden-")));
  const project = join(base, "project");
  mkdirSync(project);
  db = openDb({ dataDir: join(base, "data"), busyTimeoutMs: 2000 });
  projectId = resolveProject(db, project, NOW).id;
  for (const memory of golden.memories) {
    ids.set(
      memory.key,
      insertMemory(db, {
        projectId,
        kind: memory.kind as MemoryKind,
        title: memory.title,
        body: memory.body as Redacted,
        // As the distillation pipeline builds it.
        terms: searchTerms(memory.title, memory.body, memory.files),
        importance: 3,
        branch: null,
        commit: null,
        origin: "manual",
        judge: "heuristic",
        judgeVersion: "1",
        sourceTurnId: null,
        files: memory.files.map((path) => ({ path, role: "changed" as const })),
        now: NOW,
      }),
    );
  }
});
afterAll(() => {
  db.close();
  rmSync(base, { recursive: true, force: true });
});

/** Each prompt is asked in a session of its own, so nothing has been shown before. */
const retrieve = (prompt: string, sessionId: number) =>
  retrieveForPrompt(db, { projectId, sessionId, epoch: 0, prompt, branch: null, now: NOW }).map(
    (note) => note.id,
  );

describe("golden set: what a prompt is given", () => {
  test("recall: a prompt is given the memory that bears on it", () => {
    const missed: string[] = [];
    let found = 0;
    let expected = 0;
    golden.relevant.forEach((item, index) => {
      const got = retrieve(item.prompt, 1000 + index);
      for (const key of item.expect) {
        expected++;
        if (got.includes(ids.get(key) as number)) found++;
        else missed.push(key);
      }
    });
    console.log(`recall@5: ${found}/${expected} — missed: ${missed.join(", ") || "none"}`);
    expect(found / expected).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });

  test("precision: what is given is what was expected, or close to it", () => {
    let given = 0;
    let wanted = 0;
    golden.relevant.forEach((item, index) => {
      const got = retrieve(item.prompt, 2000 + index);
      given += got.length;
      wanted += got.filter((id) => item.expect.some((key) => ids.get(key) === id)).length;
    });
    console.log(`precision: ${wanted}/${given} notes given were the expected ones`);
    expect(wanted / Math.max(1, given)).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });

  test("silence: a prompt about something else is given nothing", () => {
    const noisy = golden.unrelated.filter(
      (prompt, index) => retrieve(prompt, 3000 + index).length > 0,
    );
    console.log(`false injections: ${noisy.length}/${golden.unrelated.length}`);
    expect(noisy).toEqual([]);
  });
});

// Floors sit just under what was measured when they were set (recall 19/24, precision
// 19/21); they catch regressions. What is still missed are paraphrases that share no
// word with the memory, which lexical search cannot find.
const RECALL_FLOOR = 0.75;
const PRECISION_FLOOR = 0.85;
