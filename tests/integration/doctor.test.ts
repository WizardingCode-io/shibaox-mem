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
  home = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-doctor-")));
  project = join(home, "demo");
  dataDir = join(home, ".shibaox-mem");
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
  SHIBAOX_MEM_DATA_DIR: dataDir,
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

describe("shibaox-mem doctor", () => {
  test("a healthy installation passes every check", async () => {
    const binary = join(home, "shibaox-mem");
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
    expect(line(result.stdout, "Claude Code")).toContain("shibaox-mem install claude-code");
    expect(result.stdout).toContain("1 warning");
  });

  test("a database from a newer version fails, and says what to do", async () => {
    seed((db) => db.run("PRAGMA user_version = 99"));
    const result = await cli("doctor");
    expect(result.exitCode).toBe(1);
    expect(line(result.stdout, "database")).toStartWith("FAIL");
    expect(line(result.stdout, "database")).toContain("upgrade shibaox-mem");
  });

  test("hooks that point at a binary that is gone fail", async () => {
    installHooks(join(home, "removed", "shibaox-mem"));
    seed(() => {});
    const result = await cli("doctor");
    expect(result.exitCode).toBe(1);
    expect(line(result.stdout, "Claude Code")).toStartWith("FAIL");
    expect(line(result.stdout, "Claude Code")).toContain(join(home, "removed", "shibaox-mem"));
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

  test("without a TypeSafe key, says the heuristic judge works alone and nothing leaves the machine", async () => {
    const result = await cli("doctor");
    expect(line(result.stdout, "TypeSafe")).toStartWith("ok");
    expect(line(result.stdout, "TypeSafe")).toContain("not configured");
  });

  test("with a key, says so without showing it", async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "env"), "TYPESAFE_API_KEY=apikey_test_0000000000000000\n");
    const result = await cli("doctor");
    expect(line(result.stdout, "TypeSafe")).toStartWith("ok");
    expect(result.stdout).not.toContain("apikey_test");
  });

  test("a key the service rejected is a failure that says where to fix it", async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "env"), "TYPESAFE_API_KEY=apikey_test_0000000000000000\n");
    seed((db) => {
      const { Breaker } = require("../../src/judge/breaker.ts");
      const { keyFingerprint } = require("../../src/judge/key.ts");
      new Breaker(db, { keyFingerprint: keyFingerprint("apikey_test_0000000000000000") }).failure(
        "auth",
        Date.now(),
      );
    });
    const result = await cli("doctor");
    expect(result.exitCode).toBe(1);
    expect(line(result.stdout, "TypeSafe")).toStartWith("FAIL");
    expect(line(result.stdout, "TypeSafe")).toContain("console.typesafe.ai");
  });

  test("a service that has been failing is a warning, and the heuristic judge is standing in", async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "env"), "TYPESAFE_API_KEY=apikey_test_0000000000000000\n");
    seed((db) => {
      const { Breaker } = require("../../src/judge/breaker.ts");
      const { keyFingerprint } = require("../../src/judge/key.ts");
      const breaker = new Breaker(db, {
        keyFingerprint: keyFingerprint("apikey_test_0000000000000000"),
      });
      for (let i = 0; i < 3; i++) breaker.failure("network", Date.now());
    });
    const result = await cli("doctor");
    expect(result.exitCode).toBe(0);
    expect(line(result.stdout, "TypeSafe")).toStartWith("warn");
  });

  // What was slow last week says nothing about today's binary.
  test("hook speed is judged on the most recent runs only", async () => {
    seed((db) => {
      db.run(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 300)
         INSERT INTO hook_runs (at, agent, event, ms, outcome)
         SELECT i, 'claude-code', 'prompt', CASE WHEN i <= 100 THEN 900 ELSE 20 END, 'ok' FROM n`,
      );
    });
    const result = await cli("doctor");
    expect(line(result.stdout, "hook speed")).toStartWith("ok");
    expect(line(result.stdout, "hook speed")).toContain("200 runs");
  });

  test("a data directory inside a synced folder is a warning", async () => {
    const synced = join(home, "Dropbox", "shibaox-mem");
    const result = await runCliWith({ env: { ...env(), SHIBAOX_MEM_DATA_DIR: synced } }, "doctor");
    expect(line(result.stdout, "data directory")).toStartWith("warn");
    expect(line(result.stdout, "data directory")).toContain("synced");
  });
});

describe("shibaox-mem status", () => {
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
        `shibaox-mem ${pkg.version}`,
        `project   demo (path:${project})`,
        "memories  3 active (1 stale) · 1 superseded",
        "turns     3 distilled · 1 skipped · 1 failed · 1 queued",
        "hooks     prompt p50 10 ms, p95 19 ms · turn-end p50 4 ms, p95 4 ms · 21 runs, 1 error",
        "judge     heuristic only (no TypeSafe key) · model calls made by shibaox-mem: 0",
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
      judge: { configured: "heuristic", requests: 0, inputTokens: 0, byJudge: { heuristic: 1 } },
    });
  });

  test("with a TypeSafe key, shows the judge, what it cost and who judged what", async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "env"), "TYPESAFE_API_KEY=apikey_test_0000000000000000\n");
    seed((db, projectId) => {
      memory(db, projectId, "Judged by rules.");
      db.run("UPDATE memories SET judge = 'typesafe'");
      memory(db, projectId, "Judged by rules too.");
      db.run(
        "INSERT INTO meta (key, value) VALUES ('typesafe.requests', '12'), ('typesafe.input_tokens', '17000')",
      );
    });
    const result = await cli("status");
    expect(result.stdout).toContain(
      "judge     typesafe, heuristic as fallback · 12 requests, 17000 input tokens (≈ $0.0007) · memories by judge: typesafe 1, heuristic 1",
    );
    expect(JSON.parse((await cli("status", "--json")).stdout).judge).toEqual({
      configured: "typesafe",
      requests: 12,
      inputTokens: 17000,
      byJudge: { typesafe: 1, heuristic: 1 },
    });
  });

  test("a database it cannot read is an error a person can read", async () => {
    seed((db) => db.run("PRAGMA user_version = 99"));
    const result = await cli("status");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("newer than this shibaox-mem supports");
  });
});
