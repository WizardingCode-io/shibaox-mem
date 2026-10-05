import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../src/core/project.ts";
import { importClaudeMem } from "../../src/import/claude-mem.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { makeClaudeMemDb, SOURCE_EPOCH, type SourceObservation } from "../helpers/claude-mem-db.ts";

let base: string;
let db: Db;
let source: string;
const NOW = Date.UTC(2026, 9, 5);

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-import-")));
  db = openDb({ dataDir: join(base, "data"), busyTimeoutMs: 2000 });
  source = join(base, "claude-mem.db");
});
afterEach(() => {
  db.close();
  rmSync(base, { recursive: true, force: true });
});

const run = (observations: SourceObservation[]) => {
  makeClaudeMemDb(source, observations);
  return importClaudeMem(db, { sourcePath: source, now: NOW });
};

interface MemoryRow {
  kind: string;
  title: string;
  body: string;
  importance: number;
  origin: string;
  judge: string;
  created_at: number;
  updated_at: number;
  project: string;
}
const memories = () =>
  db
    .query<MemoryRow, []>(
      `SELECT m.kind, m.title, m.body, m.importance, m.origin, m.judge, m.created_at, m.updated_at, p.name AS project
         FROM memories m JOIN projects p ON p.id = m.project_id ORDER BY m.id`,
    )
    .all();

describe("import claude-mem", () => {
  test("an observation becomes a memory of the matching kind, with its date", () => {
    const report = run([
      {
        project: "shop",
        type: "bugfix",
        title: "Fixed the cart total rounding",
        facts: ["Totals are rounded once, at the end.", "Rounding per line caused drift."],
        filesModified: ["src/cart.ts"],
        filesRead: ["src/money.ts"],
        createdAtEpoch: SOURCE_EPOCH,
      },
    ]);
    expect(report).toMatchObject({
      imported: 1,
      skipped: { duplicate: 0, sensitive: 0, empty: 0 },
    });
    expect(memories()).toEqual([
      {
        kind: "fix",
        title: "Fixed the cart total rounding",
        body: "Totals are rounded once, at the end.\nRounding per line caused drift.",
        importance: 2,
        origin: "imported",
        judge: "claude-mem",
        created_at: SOURCE_EPOCH,
        updated_at: SOURCE_EPOCH,
        project: "shop",
      },
    ]);
    expect(db.query("SELECT path, role FROM memory_files ORDER BY role").all()).toEqual([
      { path: "src/cart.ts", role: "changed" },
      { path: "src/money.ts", role: "read" },
    ]);
    expect(db.query("SELECT key FROM projects").all()).toEqual([{ key: "imported:shop" }]);
  });

  test.each([
    ["bugfix", "fix", 2],
    ["feature", "change", 2],
    ["change", "change", 2],
    ["refactor", "change", 2],
    ["discovery", "discovery", 2],
    ["decision", "decision", 3],
    ["gotcha", "gotcha", 3],
    ["security_alert", "gotcha", 4],
    ["security_note", "gotcha", 4],
    ["pattern", "convention", 3],
    ["something-new", "discovery", 2],
  ])("type %s becomes kind %s with importance %d", (type, kind, importance) => {
    run([{ project: "p", type }]);
    expect(memories()[0]).toMatchObject({ kind, importance });
  });

  test("sensitive and bookkeeping observations are left out", () => {
    const report = run([
      { project: "p", type: "sensitive", title: "A customer's card number" },
      { project: "p", type: "task-boundary", title: "Starting task 3" },
      { project: "p", type: "decision", title: "We keep it." },
    ]);
    expect(report.skipped.sensitive).toBe(2);
    expect(memories().map((memory) => memory.title)).toEqual(["We keep it."]);
  });

  test("without facts the narrative is the body; a title alone is still a statement", () => {
    const report = run([
      {
        project: "p",
        type: "discovery",
        title: "The queue is in SQLite",
        facts: null,
        narrative: "Turns are rows. The state column is the queue.",
      },
      { project: "p", type: "discovery", title: "Only a title here", facts: null, narrative: null },
      { project: "p", type: "discovery", title: null, facts: ["A fact without a title."] },
      { project: "p", type: "discovery", title: null, facts: null, narrative: null },
    ]);
    expect(report.skipped.empty).toBe(1);
    expect(memories().map((memory) => [memory.title, memory.body])).toEqual([
      ["The queue is in SQLite", "Turns are rows. The state column is the queue."],
      ["Only a title here", ""],
      ["A fact without a title.", ""],
    ]);
  });

  test("long titles and bodies are bounded", () => {
    run([
      {
        project: "p",
        type: "discovery",
        title: "T".repeat(400),
        facts: Array.from({ length: 40 }, (_, i) => `Fact ${i} ${"x".repeat(300)}`),
      },
    ]);
    const [memory] = memories();
    expect(memory?.title.length).toBeLessThanOrEqual(120);
    expect(memory?.body.length).toBeLessThanOrEqual(2000);
  });

  test("secrets are removed on the way in", () => {
    const token = ["ghp_", "0123456789abcdefghijklmnopqrstuvwxyzAB"].join("");
    run([
      {
        project: "p",
        type: "discovery",
        title: `Deploy uses ${token}`,
        facts: [`The token is ${token} and rotates monthly.`],
        filesModified: [`config/${token}.env`],
      },
    ]);
    const all = JSON.stringify([
      db.query("SELECT * FROM memories").all(),
      db.query("SELECT * FROM memory_files").all(),
    ]);
    expect(all).not.toContain(token);
  });

  test("exact repeats within a project are kept once", () => {
    const twice = {
      project: "p",
      type: "decision",
      title: "Use pnpm.",
      facts: ["Faster installs."],
    };
    const report = run([twice, twice, { ...twice, project: "q" }]);
    expect(report.imported).toBe(2);
    expect(report.skipped.duplicate).toBe(1);
  });

  test("an observation merged into another project lands in that project", () => {
    run([
      { project: "shop-worktree", type: "decision", title: "Merged.", mergedIntoProject: "shop" },
    ]);
    expect(memories()[0]?.project).toBe("shop");
  });

  test("file anchors are kept relative, bounded, and free of anything that is not a path", () => {
    run([
      {
        project: "p",
        type: "change",
        title: "Touched files",
        filesModified: [
          "src/a.ts",
          "/etc/passwd",
          "../outside.ts",
          `src/${"x".repeat(400)}.ts`,
          "",
          "src\\win.ts",
        ],
      },
    ]);
    expect(db.query("SELECT path FROM memory_files ORDER BY path").all()).toEqual([
      { path: "src/a.ts" },
      { path: "src/win.ts" },
    ]);
  });

  test("running the import again imports only what is new", () => {
    run([{ project: "p", type: "decision", title: "First." }]);
    const again = importClaudeMem(db, { sourcePath: source, now: NOW });
    expect(again).toMatchObject({ imported: 0, scanned: 0 });

    const more = new Database(source);
    more.run(
      "INSERT INTO observations (memory_session_id, project, type, title, facts, created_at, created_at_epoch) VALUES ('m', 'p', 'decision', 'Second.', '[]', '2026-08-02T00:00:00.000Z', ?)",
      [SOURCE_EPOCH + 86_400_000],
    );
    more.close();
    expect(importClaudeMem(db, { sourcePath: source, now: NOW })).toMatchObject({
      imported: 1,
      scanned: 1,
    });
    expect(memories().map((memory) => memory.title)).toEqual(["First.", "Second."]);
  });

  test("works in batches and reports per project", () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({
      project: i % 3 === 0 ? "alpha" : "beta",
      type: "discovery",
      title: `Observation ${i} says something specific`,
      facts: [`Detail number ${i}.`],
    }));
    const report = run(many);
    expect(report.imported).toBe(1200);
    expect(report.projects).toEqual({ alpha: 400, beta: 800 });
    expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM memories").get()?.n).toBe(1200);
    // 1 200 inserts with their index entries: seconds on a shared CI runner, not a hang.
  }, 60_000);

  test("imported memories can be found", () => {
    run([
      {
        project: "p",
        type: "gotcha",
        title: "The pragma busy_timeout must come first.",
        facts: ["Otherwise the first query fails."],
      },
    ]);
    expect(
      db.query("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'pragma'").all(),
    ).toHaveLength(1);
  });

  test("the source is opened read-only and never changed", () => {
    makeClaudeMemDb(source, [{ project: "p", type: "decision", title: "x" }]);
    const before = statSync(source).mtimeMs;
    importClaudeMem(db, { sourcePath: source, now: NOW });
    expect(statSync(source).mtimeMs).toBe(before);
    expect(
      new Database(source, { readonly: true })
        .query("SELECT count(*) AS n FROM observations")
        .get(),
    ).toEqual({ n: 1 });
  });

  test("a missing source is an error that says where it looked", () => {
    expect(() => importClaudeMem(db, { sourcePath: join(base, "nope.db"), now: NOW })).toThrow(
      /nope\.db/,
    );
  });
});

describe("adopting an imported project", () => {
  test("the first directory with the imported name becomes that project", () => {
    run([{ project: "shop", type: "decision", title: "We use pnpm in the shop." }]);
    const dir = join(base, "code", "shop");
    mkdirSync(dir, { recursive: true });
    const project = resolveProject(db, dir, NOW);
    expect(project.key).toBe("imported:shop");
    expect(project.name).toBe("shop");
    expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM projects").get()?.n).toBe(1);
    expect(
      db
        .query("SELECT alias FROM project_aliases WHERE project_id = ? ORDER BY alias")
        .all(project.id),
    ).toEqual([{ alias: "imported:shop" }, { alias: `path:${dir}` }]);
    // The second time, it is found by its path like any other project.
    expect(resolveProject(db, dir, NOW).id).toBe(project.id);
  });

  test("a directory with another name is not adopted", () => {
    run([{ project: "shop", type: "decision", title: "x" }]);
    const dir = join(base, "code", "warehouse");
    mkdirSync(dir, { recursive: true });
    expect(resolveProject(db, dir, NOW).key).toBe(`path:${dir}`);
  });

  test("a directory that already is a project is not adopted", () => {
    const dir = join(base, "code", "shop");
    mkdirSync(dir, { recursive: true });
    const before = resolveProject(db, dir, NOW);
    run([{ project: "shop", type: "decision", title: "x" }]);
    expect(resolveProject(db, dir, NOW).id).toBe(before.id);
    expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM projects").get()?.n).toBe(2);
  });
});
