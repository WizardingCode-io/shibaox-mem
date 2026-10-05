import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectClaudeMem,
  stopClaudeMem,
  type TakeoverContext,
} from "../../src/install/claude-mem.ts";
import { makeClaudeMemDb } from "../helpers/claude-mem-db.ts";

let home: string;
let configDir: string;
let settingsPath: string;
let claudeMemDir: string;
let commands: string[][];
let killed: [number, string][];
let processes: { pid: number; command: string }[];
let alive: Set<number>;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-takeover-")));
  configDir = join(home, ".claude");
  settingsPath = join(configDir, "settings.json");
  claudeMemDir = join(home, ".claude-mem");
  mkdirSync(configDir);
  commands = [];
  killed = [];
  processes = [];
  alive = new Set();
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const context = (): TakeoverContext => ({
  settingsPath,
  configDir,
  claudeMemDir,
  run: (command) => {
    commands.push(command);
    return { ok: true, output: "" };
  },
  listProcesses: () => processes.filter((process) => alive.has(process.pid)),
  kill: (pid, signal) => {
    killed.push([pid, signal]);
    // SIGTERM is obeyed by well-behaved processes; a stuck one needs SIGKILL.
    if (signal === "SIGKILL" || !stuck.has(pid)) alive.delete(pid);
  },
  sleep: () => {},
});
let stuck = new Set<number>();

function running(pid: number, command: string): void {
  processes.push({ pid, command });
  alive.add(pid);
}

const pluginPath = () => join(configDir, "plugins", "cache", "thedotmack", "claude-mem", "13.25.2");

describe("detectClaudeMem", () => {
  test("nothing installed, nothing found", () => {
    expect(detectClaudeMem(context())).toEqual({ plugin: null, database: null });
  });

  test("finds the enabled plugin and the database", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ enabledPlugins: { "claude-mem@thedotmack": true, "other@x": true } }),
    );
    mkdirSync(claudeMemDir);
    makeClaudeMemDb(join(claudeMemDir, "claude-mem.db"), [{ project: "p", type: "decision" }]);
    expect(detectClaudeMem(context())).toEqual({
      plugin: "claude-mem@thedotmack",
      database: join(claudeMemDir, "claude-mem.db"),
    });
  });

  test("a plugin that is installed but disabled does not count", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ enabledPlugins: { "claude-mem@thedotmack": false } }),
    );
    expect(detectClaudeMem(context()).plugin).toBeNull();
  });

  test("a database without the plugin is still worth importing", () => {
    mkdirSync(claudeMemDir);
    makeClaudeMemDb(join(claudeMemDir, "claude-mem.db"), []);
    expect(detectClaudeMem(context())).toEqual({
      plugin: null,
      database: join(claudeMemDir, "claude-mem.db"),
    });
  });

  test("unreadable settings do not stop detection", () => {
    writeFileSync(settingsPath, "{ not json");
    expect(detectClaudeMem(context()).plugin).toBeNull();
  });
});

describe("stopClaudeMem", () => {
  test("disables the plugin through the host, then stops its processes, and only its processes", () => {
    mkdirSync(claudeMemDir);
    writeFileSync(join(claudeMemDir, "worker.pid"), JSON.stringify({ pid: 20102, port: 37777 }));
    running(20102, `/Users/dev/.bun/bin/bun ${pluginPath()}/scripts/worker-service.cjs --daemon`);
    running(23300, `/usr/local/bin/node ${pluginPath()}/scripts/mcp-server.cjs`);
    running(
      24412,
      `/opt/homebrew/bin/uv tool uvx --from chroma-mcp==0.2.6 chroma-mcp --client-type persistent --data-dir ${claudeMemDir}/chroma`,
    );
    running(
      24429,
      `/opt/python3.13 /Users/dev/.cache/uv/bin/chroma-mcp --client-type persistent --data-dir ${claudeMemDir}/chroma`,
    );
    running(
      31772,
      "node -e const f=require('fs');/* hook runner */ ... plugins/cache/thedotmack/claude-mem ...",
    );
    running(999, "/usr/bin/node /Users/dev/other/chroma-mcp-fan-site/server.js");
    running(998, `/usr/bin/node /Users/dev/code/claude-mem-fork/scripts/worker-service.cjs`);
    running(997, "claude");
    running(process.pid, "shibaox-mem install claude-code");

    const report = stopClaudeMem(context(), "claude-mem@thedotmack");
    expect(commands).toEqual([["claude", "plugin", "disable", "claude-mem@thedotmack"]]);
    expect(report.disabled).toBe(true);
    expect(report.stopped.sort()).toEqual([20102, 23300, 24412, 24429, 31772]);
    expect(report.stillRunning).toEqual([]);
    expect(killed.map(([pid]) => pid).sort()).toEqual([20102, 23300, 24412, 24429, 31772]);
    expect(killed.every(([, signal]) => signal === "SIGTERM")).toBe(true);
    expect(alive.has(999) && alive.has(998) && alive.has(997)).toBe(true);
  });

  test("a process that ignores the polite signal gets the other one", () => {
    running(20102, `bun ${pluginPath()}/scripts/worker-service.cjs --daemon`);
    stuck = new Set([20102]);
    const report = stopClaudeMem(context(), "claude-mem@thedotmack");
    expect(killed).toEqual([
      [20102, "SIGTERM"],
      [20102, "SIGKILL"],
    ]);
    expect(report.stopped).toEqual([20102]);
    stuck = new Set();
  });

  test("the pid in worker.pid is only killed if it still is the worker", () => {
    mkdirSync(claudeMemDir);
    writeFileSync(join(claudeMemDir, "worker.pid"), JSON.stringify({ pid: 4242, port: 37777 }));
    running(4242, "/usr/bin/vim notes.md");
    const report = stopClaudeMem(context(), null);
    expect(killed).toEqual([]);
    expect(report.stopped).toEqual([]);
  });

  test("without the plugin, nothing is disabled but processes are still stopped", () => {
    running(20102, `bun ${pluginPath()}/scripts/worker-service.cjs --daemon`);
    const report = stopClaudeMem(context(), null);
    expect(commands).toEqual([]);
    expect(report.disabled).toBe(false);
    expect(report.stopped).toEqual([20102]);
  });

  test("a host command that fails is reported, and the processes are stopped anyway", () => {
    running(20102, `bun ${pluginPath()}/scripts/worker-service.cjs --daemon`);
    const failing = { ...context(), run: () => ({ ok: false, output: "command not found" }) };
    const report = stopClaudeMem(failing, "claude-mem@thedotmack");
    expect(report.disabled).toBe(false);
    expect(report.stopped).toEqual([20102]);
  });
});
