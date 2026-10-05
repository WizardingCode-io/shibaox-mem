import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DB_FILE, openDb } from "../../src/store/db.ts";
import { runCliWith } from "../helpers/cli.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;
const payload = (name: string, agent = "claude-code") =>
  readFileSync(join(FIXTURES, agent, "payloads", `${name}.json`), "utf8");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shibaox-mem-hook-cli-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const hook = (input: string, ...args: string[]) =>
  runCliWith(
    { input, env: { SHIBAOX_MEM_DATA_DIR: dir, SHIBAOX_MEM_DISTILL: "off" } },
    "hook",
    ...args,
  );

function rows<T>(sql: string): T[] {
  const db = new Database(join(dir, DB_FILE), { readonly: true });
  // A reader meeting a writer mid-checkpoint must wait, not fail.
  db.run("PRAGMA busy_timeout = 5000");
  try {
    return db.query<T, []>(sql).all();
  } finally {
    db.close();
  }
}

const SILENT_SUCCESS = { exitCode: 0, stdout: "", stderr: "" };

describe("shibaox-mem hook", () => {
  test("a prompt payload from Claude Code is stored, silently", async () => {
    expect(await hook(payload("user-prompt-submit"), "claude-code", "prompt")).toEqual(
      SILENT_SUCCESS,
    );
    expect(rows("SELECT agent_turn_id, state FROM turns")).toEqual([
      { agent_turn_id: "39fa363e-4bbd-4d72-b47f-3c439e8e291f", state: "open" },
    ]);
  });

  test("a whole turn: prompt then turn end leaves one queued turn", async () => {
    await hook(payload("user-prompt-submit"), "claude-code", "prompt");
    expect(await hook(payload("stop"), "claude-code", "turn-end")).toEqual(SILENT_SUCCESS);
    expect(rows("SELECT state, completeness, final_text FROM turns")).toEqual([
      { state: "pending", completeness: "full", final_text: "done" },
    ]);
  });

  test("a whole turn from Codex, through its own adapter, is stored the same way", async () => {
    await hook(payload("session-start.startup", "codex"), "codex", "session-start");
    await hook(payload("user-prompt-submit", "codex"), "codex", "prompt");
    expect(await hook(payload("stop", "codex"), "codex", "turn-end")).toEqual(SILENT_SUCCESS);
    expect(rows("SELECT agent FROM sessions")).toEqual([{ agent: "codex" }]);
    expect(rows("SELECT agent_turn_id, state, completeness, final_text FROM turns")).toEqual([
      {
        agent_turn_id: "01a10d0a-2d34-7fa2-9d91-bedf67023d6d",
        state: "pending",
        completeness: "full",
        final_text: "done",
      },
    ]);
  });

  test("a whole turn from Gemini CLI, which names no turn, closes the session's open one", async () => {
    await hook(payload("before-agent", "gemini"), "gemini", "prompt");
    expect(await hook(payload("after-agent", "gemini"), "gemini", "turn-end")).toEqual(
      SILENT_SUCCESS,
    );
    expect(rows("SELECT agent_turn_id, state, completeness, final_text FROM turns")).toEqual([
      { agent_turn_id: null, state: "pending", completeness: "full", final_text: "done" },
    ]);
  });

  test("a whole turn from Cursor: the prompt is let through, the response closes the turn", async () => {
    const common = { conversation_id: "conv-1", generation_id: "g1", workspace_roots: [dir] };
    const before = await hook(
      JSON.stringify({
        ...common,
        hook_event_name: "beforeSubmitPrompt",
        prompt: "why does it fail?",
      }),
      "cursor",
      "prompt",
    );
    expect(before).toEqual({ exitCode: 0, stdout: '{"continue":true}', stderr: "" });
    await hook(
      JSON.stringify({ ...common, hook_event_name: "afterAgentResponse", text: "Because of X." }),
      "cursor",
      "turn-end",
    );
    expect(rows("SELECT state, completeness, final_text FROM turns")).toEqual([
      { state: "pending", completeness: "full", final_text: "Because of X." },
    ]);
  });

  test("run as the Claude Code plugin while the direct install is also there, it stands down: one memory speaks", async () => {
    const config = join(dir, "claude");
    mkdirSync(config);
    const direct = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: "/opt/shibaox-mem/bin/shibaox-mem",
                args: ["hook", "claude-code", "prompt"],
              },
            ],
          },
        ],
      },
    };
    writeFileSync(join(config, "settings.json"), JSON.stringify(direct));
    const asPlugin = (input: string, ...args: string[]) =>
      runCliWith(
        {
          input,
          env: {
            SHIBAOX_MEM_DATA_DIR: dir,
            SHIBAOX_MEM_DISTILL: "off",
            CLAUDE_CONFIG_DIR: config,
            CLAUDE_PLUGIN_ROOT: "/plugins/shibaox-mem",
          },
        },
        "hook",
        ...args,
      );
    expect(await asPlugin(payload("user-prompt-submit"), "claude-code", "prompt")).toEqual(
      SILENT_SUCCESS,
    );
    expect(existsSync(join(dir, DB_FILE))).toBe(false);

    // Without the direct install, the plugin is the one that speaks.
    writeFileSync(join(config, "settings.json"), JSON.stringify({ hooks: {} }));
    await asPlugin(payload("user-prompt-submit"), "claude-code", "prompt");
    expect(rows("SELECT state FROM turns")).toEqual([{ state: "open" }]);
  });

  test("an interrupted turn is queued by the session end that follows it", async () => {
    await hook(payload("interrupted.user-prompt-submit"), "claude-code", "prompt");
    await hook(payload("interrupted.session-end"), "claude-code", "session-end");
    expect(rows("SELECT state, completeness FROM turns")).toEqual([
      { state: "pending", completeness: "interrupted" },
    ]);
  });

  test("each run records its latency, and nothing about its content", async () => {
    await hook(payload("user-prompt-submit"), "claude-code", "prompt");
    const runs = rows<{ agent: string; event: string; ms: number; outcome: string }>(
      "SELECT agent, event, ms, outcome FROM hook_runs",
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agent: "claude-code", event: "prompt", outcome: "ok" });
    expect(runs[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  test("events from inside a subagent are ignored", async () => {
    const inSubagent = JSON.stringify({
      ...JSON.parse(payload("user-prompt-submit")),
      agent_id: "sub-1",
    });
    expect(await hook(inSubagent, "claude-code", "prompt")).toEqual(SILENT_SUCCESS);
    expect(existsSync(join(dir, DB_FILE))).toBe(false);
  });

  // Whatever goes wrong, the host must see a successful, silent hook: exit code 2
  // would block the user's prompt, and stray output would be read as context.
  test.each([
    ["garbage on stdin", "this is not json", ["claude-code", "prompt"]],
    ["empty stdin", "", ["claude-code", "prompt"]],
    ["an unknown agent", "{}", ["some-future-agent", "prompt"]],
    ["an unknown event", "{}", ["claude-code", "some-future-event"]],
    ["no arguments", "{}", []],
  ])("%s is a silent success", async (_label, input, args) => {
    expect(await hook(input, ...args)).toEqual(SILENT_SUCCESS);
  });

  test("a database from a newer version is left alone: silent success, one log line, no payload", async () => {
    const db = openDb({ dataDir: dir, busyTimeoutMs: 2000 });
    db.run("PRAGMA user_version = 99");
    db.close();

    expect(await hook(payload("user-prompt-submit"), "claude-code", "prompt")).toEqual(
      SILENT_SUCCESS,
    );
    const log = readFileSync(join(dir, "logs", "shibaox-mem.log"), "utf8");
    expect(log.trim().split("\n")).toHaveLength(1);
    expect(log).toContain("hook claude-code prompt");
    expect(log).toContain("SchemaTooNewError");
    expect(log).not.toContain("hello.txt");
    expect(rows("SELECT count(*) AS n FROM turns")).toEqual([{ n: 0 }]);
  });

  test("a database locked by another process is a quick, silent success", async () => {
    const db = openDb({ dataDir: dir, busyTimeoutMs: 2000 });
    db.run("BEGIN IMMEDIATE");
    try {
      const started = performance.now();
      const result = await hook(payload("user-prompt-submit"), "claude-code", "prompt");
      expect(result).toEqual(SILENT_SUCCESS);
      // The prompt hook waits about a tenth of a second for the lock, never the user's patience.
      expect(performance.now() - started).toBeLessThan(2000);
    } finally {
      db.run("ROLLBACK");
      db.close();
    }
    expect(readFileSync(join(dir, "logs", "shibaox-mem.log"), "utf8")).toContain("SQLITE_BUSY");
  });

  test("an enormous, hostile prompt is handled quickly", async () => {
    const blob = "0123456789abcdef".repeat(20_000);
    const input = JSON.stringify({ ...JSON.parse(payload("user-prompt-submit")), prompt: blob });
    const started = performance.now();
    expect(await hook(input, "claude-code", "prompt")).toEqual(SILENT_SUCCESS);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(rows<{ n: number }>("SELECT length(prompt) AS n FROM turns")[0]?.n).toBeLessThanOrEqual(
      8192,
    );
  });

  // A host that never closes the pipe must not leave the hook waiting on it.
  test("gives up on a stdin that is never closed, silently", async () => {
    const main = new URL("../../src/cli/main.ts", import.meta.url).pathname;
    const proc = Bun.spawn([process.execPath, main, "hook", "claude-code", "prompt"], {
      env: { ...process.env, SHIBAOX_MEM_DATA_DIR: dir, SHIBAOX_MEM_DISTILL: "off" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const started = performance.now();
    const exit = await Promise.race([proc.exited, Bun.sleep(4000).then(() => "still running")]);
    const elapsed = performance.now() - started;
    if (exit === "still running") proc.kill();
    expect(exit).toBe(0);
    expect(elapsed).toBeLessThan(3000);
    expect(await new Response(proc.stdout).text()).toBe("");
  }, 15_000);

  test("an unusable data directory is still a silent success", async () => {
    const file = join(dir, "not-a-directory");
    writeFileSync(file, "");
    const result = await runCliWith(
      {
        input: payload("user-prompt-submit"),
        env: { SHIBAOX_MEM_DATA_DIR: file, SHIBAOX_MEM_DISTILL: "off" },
      },
      "hook",
      "claude-code",
      "prompt",
    );
    expect(result).toEqual(SILENT_SUCCESS);
  });
});
