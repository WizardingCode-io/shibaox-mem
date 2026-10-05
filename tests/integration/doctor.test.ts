import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { resolveProject } from "../../src/core/project.ts";
import type { Redacted } from "../../src/core/redact.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { insertMemory } from "../../src/store/memories.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let project: string;
let dataDir: string;
let settingsPath: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "ai-mem-doctor-")));
  project = join(home, "demo");
  dataDir = join(home, ".ai-mem");
  mkdirSync(project);
  mkdirSync(join(home, ".claude"));
  settingsPath = join(home, ".claude", "settings.json");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const env = () => ({
  HOME: home,
  CLAUDE_CONFIG_DIR: join(home, ".claude"),
  AI_MEM_DATA_DIR: dataDir,
  PATH: "/nonexistent",
});
const cli = (...args: string[]) => {
  const main = new URL("../../src/cli/main.ts", import.meta.url).pathname;
  const proc = Bun.spawn([process.execPath, main, ...args], {
    cwd: project,
    env: { ...process.env, ...env() },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, exitCode]) => ({ stdout, stderr, exitCode }));
};

function seed(fn: (db: Db, projectId: number) => void): void {
  const db = openDb({ dataDir, busyTimeoutMs: 2000 });
  try {
    fn(db, resolveProject(db, project, 1_700_000_000_000).id);
  } finally {
    db.close();
  }
}

function memory(db: Db, projectId: number, title: string): number {
  return insertMemory(db, {
    projectId,
    kind: "decision",
    title,
    body: "" as Redacted,
    terms: "",
    importance: 2,
    branch: null,
    commit: null,
    origin: "manual",
    judge: "heuristic",
    judgeVersion: "1",
    sourceTurnId: null,
    files: [],
    now: 1_700_000_000_000,
  });
}

function installHooks(binary: string): void {
  const hook = (event: string) => ({
    hooks: [{ type: "command", command: binary, args: ["hook", "claude-code", event], timeout: 5 }],
  });
  writeFileSync(
    settingsPath,
    JSON.stringify({
      hooks: {
        SessionStart: [hook("session-start")],
        UserPromptSubmit: [hook("prompt")],
        Stop: [hook("turn-end")],
        SessionEnd: [hook("session-end")],
      },
    }),
  );
}

const line = (output: string, name: string) =>
  output.split("\n").find((candidate) => candidate.includes(name)) ?? "";

describe("ai-mem doctor", () => {
  test("a healthy installation passes every check", async () => {
    const binary = join(home, "ai-mem");
    writeFileSync(binary, "");
    installHooks(binary);
    seed(() => {});
    const result = await cli("doctor");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    for (const name of ["data directory", "database", "full-text search", "queue", "Claude Code"]) {
      expect(line(result.stdout, name)).toStartWith("ok");
    }
    expect(result.stdout).toEndWith("All checks passed.\n");
  });

  test("before first use there is nothing wrong, only nothing installed", async () => {
    const result = await cli("doctor");
    expect(result.exitCode).toBe(0);
    expect(line(result.stdout, "Claude Code")).toStartWith("warn");
    expect(line(result.stdout, "Claude Code")).toContain("ai-mem install claude-code");
    expect(result.stdout).toContain("1 warning");
  });

  test("a database from a newer version fails, and says what to do", async () => {
    seed((db) => db.run("PRAGMA user_version = 99"));
    const result = await cli("doctor");
    expect(result.exitCode).toBe(1);
    expect(line(result.stdout, "database")).toStartWith("FAIL");
    expect(line(result.stdout, "database")).toContain("upgrade ai-mem");
  });

  test("hooks that point at a binary that is gone fail", async () => {
    installHooks(join(home, "removed", "ai-mem"));
    seed(() => {});
    const result = await cli("doctor");
    expect(result.exitCode).toBe(1);
    expect(line(result.stdout, "Claude Code")).toStartWith("FAIL");
    expect(line(result.stdout, "Claude Code")).toContain(join(home, "removed", "ai-mem"));
  });

  test("turns that could not be distilled are a warning with a count", async () => {
    seed((db, projectId) => {
      db.run(
        "INSERT INTO sessions (agent, agent_session_id, project_id, cwd, started_at, last_seen_at) VALUES ('claude-code', 's', ?, ?, 1, 1)",
        [projectId, project],
      );
      for (let seq = 1; seq <= 2; seq++) {
        db.run(
          "INSERT INTO turns (session_id, project_id, seq, state, prompt, started_at, last_error) VALUES (1, ?, ?, 'failed', '', 1, 'Error: boom')",
          [projectId, seq],
        );
      }
    });
    const result = await cli("doctor");
    expect(result.exitCode).toBe(0);
    expect(line(result.stdout, "queue")).toStartWith("warn");
    expect(line(result.stdout, "queue")).toContain("2 failed");
  });

  test("a data directory inside a synced folder is a warning", async () => {
    const synced = join(home, "Dropbox", "ai-mem");
    const result = await runCliWith({ env: { ...env(), AI_MEM_DATA_DIR: synced } }, "doctor");
    expect(line(result.stdout, "data directory")).toStartWith("warn");
    expect(line(result.stdout, "data directory")).toContain("synced");
  });
});

describe("ai-mem status", () => {
  test("before anything is stored, says so", async () => {
    const result = await cli("status");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No memories yet for this project.");
  });

  test("reports what is stored, how the queue stands and how fast the hooks are", async () => {
    seed((db, projectId) => {
      const old = memory(db, projectId, "The limit is three.");
      const current = memory(db, projectId, "The limit is five.");
      memory(db, projectId, "Never mock the database.");
      const stale = memory(db, projectId, "The gone module holds the limit.");
      db.run("UPDATE memories SET status = 'superseded', superseded_by = ? WHERE id = ?", [
        current,
        old,
      ]);
      db.run("UPDATE memories SET stale = 1 WHERE id = ?", [stale]);
      db.run(
        "INSERT INTO sessions (agent, agent_session_id, project_id, cwd, started_at, last_seen_at) VALUES ('claude-code', 's', ?, ?, 1, 1)",
        [projectId, project],
      );
      const states = ["done", "done", "done", "skipped", "failed", "pending"];
      states.forEach((state, index) => {
        db.run(
          "INSERT INTO turns (session_id, project_id, seq, state, prompt, started_at) VALUES (1, ?, ?, ?, '', 1)",
          [projectId, index + 1, state],
        );
      });
      for (let ms = 1; ms <= 20; ms++) {
        db.run(
          "INSERT INTO hook_runs (at, agent, event, ms, outcome) VALUES (1, 'claude-code', 'prompt', ?, ?)",
          [ms, ms === 20 ? "SQLiteError(SQLITE_BUSY)" : "ok"],
        );
      }
      db.run(
        "INSERT INTO hook_runs (at, agent, event, ms, outcome) VALUES (1, 'claude-code', 'turn-end', 4, 'ok')",
      );
    });

    const result = await cli("status");
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        `ai-mem ${pkg.version}`,
        `project   demo (path:${project})`,
        "memories  3 active (1 stale) · 1 superseded",
        "turns     3 distilled · 1 skipped · 1 failed · 1 queued",
        "hooks     prompt p50 10 ms, p95 19 ms · turn-end p50 4 ms, p95 4 ms · 21 runs, 1 error",
        "judge     heuristic, local · model calls made by ai-mem: 0",
        `data      ${dataDir}`,
        "",
      ].join("\n"),
    );
  });

  test("the same as JSON", async () => {
    seed((db, projectId) => void memory(db, projectId, "Never mock the database."));
    const result = await cli("status", "--json");
    expect(JSON.parse(result.stdout)).toMatchObject({
      version: pkg.version,
      project: { name: "demo" },
      memories: { active: 1, stale: 0, superseded: 0 },
      turns: { distilled: 0, skipped: 0, failed: 0, queued: 0 },
      modelCalls: 0,
    });
  });

  test("a database it cannot read is an error a person can read", async () => {
    seed((db) => db.run("PRAGMA user_version = 99"));
    const result = await cli("status");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("newer than this ai-mem supports");
  });
});
