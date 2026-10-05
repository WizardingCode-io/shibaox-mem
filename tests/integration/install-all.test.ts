import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAgents } from "../../src/install/detect.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let binary: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "shibaox-mem-install-all-"));
  binary = join(home, "shibaox-mem");
  writeFileSync(binary, "");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const env = () => ({
  HOME: home,
  CLAUDE_CONFIG_DIR: join(home, ".claude"),
  CODEX_HOME: join(home, ".codex"),
  GEMINI_CLI_HOME: join(home, ".gemini"),
  XDG_CONFIG_HOME: join(home, ".config"),
  SHIBAOX_MEM_DATA_DIR: join(home, "data"),
  PATH: join(home, "bin"),
});

describe("detectAgents", () => {
  test("an agent counts as present when its command is on PATH or its configuration directory exists", () => {
    mkdirSync(join(home, ".codex"));
    mkdirSync(join(home, "bin"));
    writeFileSync(join(home, "bin", "gemini"), "", { mode: 0o755 });
    const detected = detectAgents({
      env: env(),
      which: (command) => (command === "gemini" ? join(home, "bin", "gemini") : null),
    });
    expect(detected).toEqual(["codex", "gemini"]);
  });

  test("with nothing on the machine, nothing is detected", () => {
    expect(detectAgents({ env: env(), which: () => null })).toEqual([]);
  });
});

describe("shibaox-mem install (no agent)", () => {
  test("installs for every agent found, says which were not found, and leaves nothing else behind", async () => {
    mkdirSync(join(home, ".codex"));
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    const result = await runCliWith({ env: env() }, "install", "--binary", binary);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installed shibaox-mem for Codex.");
    expect(result.stdout).toContain("Installed shibaox-mem for OpenCode.");
    expect(result.stdout).toContain("Not found on this machine: Claude Code, Cursor, Gemini CLI");
    expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(true);
    expect(existsSync(join(home, ".config", "opencode", "plugins", "shibaox-mem.ts"))).toBe(true);
    expect(existsSync(join(home, ".gemini"))).toBe(false);
    expect(existsSync(join(home, ".cursor"))).toBe(false);
  });

  test("with no agent found, says so and how to install one by name", async () => {
    const result = await runCliWith({ env: env() }, "install", "--binary", binary);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No supported agent found");
    expect(result.stderr).toContain("shibaox-mem install <agent>");
  });
});
