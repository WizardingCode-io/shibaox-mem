import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeDesktopConfigPath,
  installClaudeDesktop,
  uninstallClaudeDesktop,
} from "../../src/install/claude-desktop.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let config: string;
const BIN = "/Users/me/.wizardingcode/mem/bin/wizardingcode-mem";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wizardingcode-mem-desktop-"));
  config = join(home, "Claude", "claude_desktop_config.json");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const read = () => JSON.parse(readFileSync(config, "utf8"));

describe("Claude Desktop", () => {
  test("its config file is where each platform keeps it", () => {
    expect(claudeDesktopConfigPath({ HOME: "/Users/me" }, "darwin")).toBe(
      "/Users/me/Library/Application Support/Claude/claude_desktop_config.json",
    );
    expect(claudeDesktopConfigPath({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32")).toBe(
      join("C:\\Users\\me\\AppData\\Roaming", "Claude", "claude_desktop_config.json"),
    );
    expect(claudeDesktopConfigPath({ HOME: "/home/me" }, "linux")).toBe(
      "/home/me/.config/Claude/claude_desktop_config.json",
    );
  });

  test("adds the memory server, spanning every project, and leaves the user's servers alone", () => {
    mkdirSync(join(home, "Claude"));
    writeFileSync(
      config,
      JSON.stringify(
        { mcpServers: { obsidian: { command: "npx", args: ["vault"] } }, globalShortcut: "" },
        null,
        2,
      ),
    );
    expect(installClaudeDesktop({ configPath: config, binaryPath: BIN }).changed).toBe(true);
    expect(read()).toEqual({
      mcpServers: {
        obsidian: { command: "npx", args: ["vault"] },
        "wizardingcode-mem": { command: BIN, args: ["mcp", "--global"] },
      },
      globalShortcut: "",
    });
    expect(installClaudeDesktop({ configPath: config, binaryPath: BIN }).changed).toBe(false);
  });

  test("creates the file when Claude Desktop has none yet, and takes the place of shibaox-mem", () => {
    expect(installClaudeDesktop({ configPath: config, binaryPath: BIN }).changed).toBe(true);
    expect(Object.keys(read().mcpServers)).toEqual(["wizardingcode-mem"]);
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: { "shibaox-mem": { command: "/x/shibaox-mem", args: ["mcp"] } },
      }),
    );
    installClaudeDesktop({ configPath: config, binaryPath: BIN });
    expect(Object.keys(read().mcpServers)).toEqual(["wizardingcode-mem"]);
  });

  test("a file that is not valid JSON is refused and left as it is", () => {
    mkdirSync(join(home, "Claude"));
    writeFileSync(config, "{ not json");
    expect(() => installClaudeDesktop({ configPath: config, binaryPath: BIN })).toThrow(
      /not valid JSON/,
    );
    expect(readFileSync(config, "utf8")).toBe("{ not json");
  });

  test("uninstalling takes only our server out", () => {
    mkdirSync(join(home, "Claude"));
    writeFileSync(config, JSON.stringify({ mcpServers: { obsidian: { command: "npx" } } }));
    installClaudeDesktop({ configPath: config, binaryPath: BIN });
    expect(uninstallClaudeDesktop({ configPath: config })).toBe(true);
    expect(read()).toEqual({ mcpServers: { obsidian: { command: "npx" } } });
    expect(uninstallClaudeDesktop({ configPath: config })).toBe(false);
  });

  test("wizardingcode-mem install claude-desktop, and the install of everything picks it up", async () => {
    mkdirSync(join(home, "Claude"));
    const binary = join(home, "wizardingcode-mem");
    writeFileSync(binary, "");
    const env = {
      HOME: home,
      WIZARDINGCODE_MEM_CLAUDE_DESKTOP_CONFIG: config,
      WIZARDINGCODE_MEM_DATA_DIR: join(home, "data"),
      PATH: "/nonexistent",
    };
    const one = await runCliWith({ env }, "install", "claude-desktop", "--binary", binary);
    expect(one.exitCode).toBe(0);
    expect(one.stdout).toContain("Claude Desktop");
    expect(read().mcpServers["wizardingcode-mem"]).toEqual({
      command: binary,
      args: ["mcp", "--global"],
    });
    rmSync(config);
    const all = await runCliWith({ env }, "install", "--binary", binary);
    expect(all.stdout).toContain("Installed wizardingcode-mem for Claude Desktop");
    expect(existsSync(config)).toBe(true);
  });
});

describe("Claude Desktop in doctor and uninstall", () => {
  const env = () => ({
    HOME: home,
    WIZARDINGCODE_MEM_CLAUDE_DESKTOP_CONFIG: config,
    WIZARDINGCODE_MEM_DATA_DIR: join(home, "data"),
    PATH: "/nonexistent",
  });

  test("doctor says whether the chat has the memory, and how to give it", async () => {
    mkdirSync(join(home, "Claude"));
    const before = await runCliWith({ env: env() }, "doctor");
    expect(before.stdout).toMatch(
      /warn\s+Claude Desktop: .*wizardingcode-mem install claude-desktop/,
    );
    installClaudeDesktop({ configPath: config, binaryPath: process.execPath });
    const after = await runCliWith({ env: env() }, "doctor");
    expect(after.stdout).toMatch(/ok\s+Claude Desktop: .*every project/);
  });

  test("uninstall claude-desktop takes the server out", async () => {
    installClaudeDesktop({ configPath: config, binaryPath: BIN });
    const result = await runCliWith({ env: env() }, "uninstall", "claude-desktop");
    expect(result.exitCode).toBe(0);
    expect(read().mcpServers).toEqual({});
  });
});
