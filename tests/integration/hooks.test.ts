import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode } from "../../src/adapters/claude-code/adapter.ts";
import type { HookInput } from "../../src/adapters/types.ts";
import type { HookEvent } from "../../src/core/types.ts";
import { handleHook } from "../../src/hooks/handle.ts";
import { type Db, openDb } from "../../src/store/db.ts";

let base: string;
let project: string;
let db: Db;
let clock: number;
let spawned: number;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "ai-mem-hooks-")));
  project = join(base, "project");
  mkdirSync(project);
  db = openDb({ dataDir: join(base, "data"), busyTimeoutMs: 2000 });
  clock = 1_000_000;
  spawned = 0;
});
afterEach(() => {
  db.close();
  rmSync(base, { recursive: true, force: true });
});

function hook(event: HookEvent, extra: Partial<HookInput> = {}): string {
  clock += 1000;
  return handleHook({ db, now: () => clock, spawnDistill: () => void spawned++ }, claudeCode, {
    agent: "claude-code",
    event,
    sessionId: "s1",
    cwd: project,
    turnId: null,
    transcriptPath: null,
    prompt: null,
    finalText: null,
    source: null,
    subagent: false,
    ...extra,
  });
}

interface TurnRow {
  seq: number;
  agent_turn_id: string | null;
  state: string;
  completeness: string;
  prompt: string;
  final_text: string | null;
}
const turns = () =>
  db
    .query<TurnRow, []>(
      "SELECT seq, agent_turn_id, state, completeness, prompt, final_text FROM turns ORDER BY id",
    )
    .all();

describe("hook: prompt", () => {
  test("a prompt opens a turn in a session", () => {
    hook("prompt", { turnId: "p1", prompt: "Fix the login bug" });
    expect(turns()).toEqual([
      {
        seq: 1,
        agent_turn_id: "p1",
        state: "open",
        completeness: "full",
        prompt: "Fix the login bug",
        final_text: null,
      },
    ]);
    expect(db.query("SELECT agent, agent_session_id, ended_at FROM sessions").all()).toEqual([
      { agent: "claude-code", agent_session_id: "s1", ended_at: null },
    ]);
    expect(spawned).toBe(0);
  });

  // No turn end arrives when the user interrupts or the API fails. Those are often
  // the turns where the user corrects the agent, so they must not be lost.
  test("a new prompt queues the previous turn as interrupted if it never ended", () => {
    hook("prompt", { turnId: "p1", prompt: "first" });
    hook("prompt", { turnId: "p2", prompt: "no, do it differently" });
    expect(turns().map((turn) => [turn.seq, turn.state, turn.completeness])).toEqual([
      [1, "pending", "interrupted"],
      [2, "open", "full"],
    ]);
    expect(spawned).toBe(1);
  });

  test("the same prompt delivered twice opens one turn", () => {
    hook("prompt", { turnId: "p1", prompt: "first" });
    hook("prompt", { turnId: "p1", prompt: "first" });
    expect(turns()).toHaveLength(1);
    expect(turns()[0]?.state).toBe("open");
  });

  test("sessions do not interrupt each other", () => {
    hook("prompt", { sessionId: "s1", turnId: "p1", prompt: "in one window" });
    hook("prompt", { sessionId: "s2", turnId: "p2", prompt: "in another" });
    expect(turns().map((turn) => turn.state)).toEqual(["open", "open"]);
  });

  test("a prompt with no text is not a turn", () => {
    hook("prompt", { turnId: "p1", prompt: null });
    expect(turns()).toEqual([]);
  });
});

describe("hook: turn end", () => {
  test("queues the turn with the assistant's final message and prints nothing", () => {
    hook("prompt", { turnId: "p1", prompt: "Fix the login bug" });
    const out = hook("turn-end", {
      turnId: "p1",
      finalText: "Fixed: the session cookie was not renewed.",
    });
    expect(out).toBe("");
    expect(turns()).toEqual([
      {
        seq: 1,
        agent_turn_id: "p1",
        state: "pending",
        completeness: "full",
        prompt: "Fix the login bug",
        final_text: "Fixed: the session cookie was not renewed.",
      },
    ]);
    expect(spawned).toBe(1);
  });

  test("without a turn id, closes the most recent open turn of the session", () => {
    hook("prompt", { prompt: "no ids here" });
    hook("turn-end", { finalText: "done" });
    expect(turns().map((turn) => [turn.state, turn.final_text])).toEqual([["pending", "done"]]);
  });

  test("a turn whose prompt was never seen is still captured", () => {
    hook("turn-end", { turnId: "p9", finalText: "I renamed the module." });
    expect(turns()).toEqual([
      {
        seq: 1,
        agent_turn_id: "p9",
        state: "pending",
        completeness: "payload-only",
        prompt: "",
        final_text: "I renamed the module.",
      },
    ]);
  });

  test("a turn end delivered twice does not queue the turn twice", () => {
    hook("prompt", { turnId: "p1", prompt: "go" });
    hook("turn-end", { turnId: "p1", finalText: "done" });
    hook("turn-end", { turnId: "p1", finalText: "done" });
    expect(turns()).toHaveLength(1);
  });
});

describe("hook: session end", () => {
  test("queues what was left open and ends the session", () => {
    hook("prompt", { turnId: "p1", prompt: "count to a million" });
    expect(hook("session-end")).toBe("");
    expect(turns().map((turn) => [turn.state, turn.completeness])).toEqual([
      ["pending", "interrupted"],
    ]);
    expect(
      db.query<{ ended_at: number | null }, []>("SELECT ended_at FROM sessions").get(),
    ).toEqual({
      ended_at: clock,
    });
    expect(spawned).toBe(1);
  });

  test("with nothing queued, starts no background work", () => {
    hook("session-start", { source: "startup" });
    hook("session-end");
    expect(spawned).toBe(0);
  });
});

describe("hook: what is stored", () => {
  const token = ["ghp_", "0123456789abcdefghijklmnopqrstuvwxyzAB"].join("");

  test("secrets in prompts and answers never reach the database", () => {
    hook("prompt", { turnId: "p1", prompt: `deploy with ${token} please` });
    hook("turn-end", { turnId: "p1", finalText: ["Set DB_PASSWORD=", "hunter2-horse"].join("") });
    const stored = JSON.stringify(db.query("SELECT * FROM turns").all());
    expect(stored).not.toContain(token);
    expect(stored).not.toContain("hunter2-horse");
    expect(stored).toContain("[REDACTED:github-token]");
  });

  test("a secret is removed even where the size limit would have cut it", () => {
    hook("prompt", { turnId: "p1", prompt: `${"x".repeat(8180)} ${token}` });
    expect(JSON.stringify(turns())).not.toContain("ghp_");
  });

  test("long prompts and answers are stored within bounds", () => {
    hook("prompt", { turnId: "p1", prompt: "word ".repeat(20_000) });
    hook("turn-end", { turnId: "p1", finalText: "word ".repeat(20_000) });
    const [turn] = turns();
    expect(turn?.prompt.length).toBeLessThanOrEqual(8 * 1024);
    expect(turn?.final_text?.length).toBeLessThanOrEqual(16 * 1024);
  });

  test("a disabled project records nothing and prints nothing", () => {
    hook("session-start", { source: "startup" });
    db.run("UPDATE projects SET disabled = 1");
    expect(hook("prompt", { turnId: "p1", prompt: "private work" })).toBe("");
    hook("turn-end", { turnId: "p1", finalText: "done" });
    expect(turns()).toEqual([]);
  });

  test("a turn records the transcript it can be completed from", () => {
    hook("prompt", { turnId: "p1", prompt: "go", transcriptPath: "/tmp/t.jsonl" });
    expect(
      db.query<{ transcript_path: string }, []>("SELECT transcript_path FROM turns").get(),
    ).toEqual({ transcript_path: "/tmp/t.jsonl" });
  });
});
