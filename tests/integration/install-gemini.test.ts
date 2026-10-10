import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiContext, installGemini, uninstallGemini } from "../../src/install/gemini.ts";
import type { InstallContext } from "../../src/install/hooks-file.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let settingsPath: string;
let dataDir: string;
let commands: string[][];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wizardingcode-mem-install-gemini-"));
  mkdirSync(join(home, ".gemini"));
  settingsPath = join(home, ".gemini", "settings.json");
  dataDir = join(home, ".wizardingcode", "mem");
  commands = [];
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const BIN = "/opt/wizardingcode-mem/bin/wizardingcode-mem";
const context = (binaryPath = BIN): InstallContext => ({
  settingsPath,
  dataDir,
  binaryPath,
  now: () => 1_700_000_000_000,
  run: (command) => {
    commands.push(command);
    return { ok: true, output: "" };
  },
});
const settings = () => JSON.parse(readFileSync(settingsPath, "utf8"));
const ours = (event: string) => ({
  hooks: [
    {
      name: "wizardingcode-mem",
      type: "command",
      command: `'${BIN}' hook gemini ${event}`,
      timeout: 5000,
    },
  ],
});

describe("install gemini", () => {
  test("adds the four hooks to settings.json, named for Gemini's trust list, with the timeout in milliseconds", () => {
    writeFileSync(settingsPath, JSON.stringify({ theme: "Default", mcpServers: {} }, null, 2));
    const result = installGemini(context());
    expect(result.changed).toBe(true);
    expect(settings()).toEqual({
      theme: "Default",
      mcpServers: {},
      hooks: {
        SessionStart: [ours("session-start")],
        BeforeAgent: [ours("prompt")],
        AfterAgent: [ours("turn-end")],
        SessionEnd: [ours("session-end")],
      },
    });
  });

  test("registers the MCP server at user scope through Gemini's own command", () => {
    const result = installGemini(context());
    expect(result.mcp).toBe("registered");
    expect(commands).toContainEqual([
      "gemini",
      "mcp",
      "add",
      "-s",
      "user",
      "wizardingcode-mem",
      BIN,
      "mcp",
    ]);
  });

  test("leaves the user's own hooks and settings exactly as they were, and reinstalls cleanly", () => {
    const theirs = { hooks: [{ name: "lint", type: "command", command: "lint.sh" }] };
    writeFileSync(settingsPath, JSON.stringify({ hooks: { AfterAgent: [theirs] } }, null, 2));
    installGemini(context("/old/wizardingcode-mem"));
    installGemini(context());
    expect(settings().hooks.AfterAgent).toEqual([theirs, ours("turn-end")]);
    expect(readFileSync(settingsPath, "utf8")).not.toContain("/old/");
  });
});

describe("uninstall gemini", () => {
  test("puts the file back and unregisters the MCP server", () => {
    const original = '{\n  "theme": "Default"\n}\n';
    writeFileSync(settingsPath, original);
    installGemini(context());
    expect(uninstallGemini(context()).settings).toBe("restored");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
    expect(commands).toContainEqual(["gemini", "mcp", "remove", "-s", "user", "wizardingcode-mem"]);
  });
});

describe("geminiContext", () => {
  test("follows GEMINI_CLI_HOME, and otherwise ~/.gemini", () => {
    expect(geminiContext(BIN, { GEMINI_CLI_HOME: "/x/g", HOME: "/h" }).settingsPath).toBe(
      "/x/g/settings.json",
    );
    expect(geminiContext(BIN, { HOME: "/h" }).settingsPath).toBe("/h/.gemini/settings.json");
  });
});

describe("wizardingcode-mem install gemini / uninstall gemini", () => {
  const env = () => ({
    HOME: home,
    GEMINI_CLI_HOME: join(home, ".gemini"),
    WIZARDINGCODE_MEM_DATA_DIR: dataDir,
    PATH: "/nonexistent",
  });

  test("installs with an explicit binary, then uninstalls cleanly", async () => {
    const binary = join(home, "wizardingcode-mem");
    writeFileSync(binary, "");
    const installed = await runCliWith({ env: env() }, "install", "gemini", "--binary", binary);
    expect(installed.stderr).toBe("");
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain("Installed wizardingcode-mem for Gemini CLI.");
    expect(installed.stdout).toContain(`gemini mcp add -s user wizardingcode-mem ${binary} mcp`);
    expect(settings().hooks.AfterAgent[0].hooks[0].command).toBe(
      `'${binary}' hook gemini turn-end`,
    );

    const removed = await runCliWith({ env: env() }, "uninstall", "gemini");
    expect(removed.exitCode).toBe(0);
    // The file did not exist before: it goes away again.
    expect(existsSync(settingsPath)).toBe(false);
  });
});
