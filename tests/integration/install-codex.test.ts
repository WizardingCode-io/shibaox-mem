import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexContext, installCodex, uninstallCodex } from "../../src/install/codex.ts";
import type { InstallContext } from "../../src/install/hooks-file.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let hooksPath: string;
let dataDir: string;
let commands: string[][];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wizardingcode-mem-install-codex-"));
  mkdirSync(join(home, ".codex"));
  hooksPath = join(home, ".codex", "hooks.json");
  dataDir = join(home, ".wizardingcode", "mem");
  commands = [];
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const BIN = "/opt/wizardingcode-mem/bin/wizardingcode-mem";
const context = (binaryPath = BIN): InstallContext => ({
  settingsPath: hooksPath,
  dataDir,
  binaryPath,
  now: () => 1_700_000_000_000,
  run: (command) => {
    commands.push(command);
    return { ok: true, output: "" };
  },
});
const hooks = () => JSON.parse(readFileSync(hooksPath, "utf8"));
const ours = (event: string) => ({
  hooks: [{ type: "command", command: `'${BIN}' hook codex ${event}`, timeout: 5 }],
});

describe("install codex", () => {
  test("with no hooks file, creates one holding the four hooks as shell commands with the binary quoted", () => {
    const result = installCodex(context());
    expect(result.changed).toBe(true);
    expect(hooks()).toEqual({
      hooks: {
        SessionStart: [ours("session-start")],
        UserPromptSubmit: [ours("prompt")],
        Stop: [ours("turn-end")],
        SessionEnd: [ours("session-end")],
      },
    });
  });

  test("a binary path with a quote in it is still one shell word", () => {
    installCodex(context("/Users/o'neil/.wizardingcode/mem/bin/wizardingcode-mem"));
    expect(hooks().hooks.Stop[0].hooks[0].command).toBe(
      `'/Users/o'\\''neil/.wizardingcode/mem/bin/wizardingcode-mem' hook codex turn-end`,
    );
  });

  test("leaves the user's own hooks exactly as they were", () => {
    const theirs = {
      matcher: "Edit|Write",
      hooks: [{ type: "command", command: 'node "/Users/dev/gate.mjs"' }],
    };
    writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [theirs] } }, null, 2));
    installCodex(context());
    expect(hooks().hooks.PreToolUse).toEqual([theirs]);
    expect(hooks().hooks.Stop).toEqual([ours("turn-end")]);
  });

  test("installing twice changes nothing the second time; a new binary path replaces the old entries", () => {
    installCodex(context("/old/place/wizardingcode-mem"));
    expect(installCodex(context("/old/place/wizardingcode-mem")).changed).toBe(false);
    installCodex(context());
    expect(readFileSync(hooksPath, "utf8")).not.toContain("/old/place");
    expect(hooks().hooks.UserPromptSubmit).toEqual([ours("prompt")]);
  });

  test("registers the MCP server through Codex's own command", () => {
    const result = installCodex(context());
    expect(result.mcp).toBe("registered");
    expect(commands).toContainEqual(["codex", "mcp", "add", "wizardingcode-mem", "--", BIN, "mcp"]);
  });

  test("tells the user that Codex will ask them to approve the hooks", () => {
    expect(installCodex(context()).notes).toEqual([
      "Codex asks you to approve new hooks the first time: run /hooks inside Codex and accept the wizardingcode-mem entries.",
    ]);
  });
});

describe("uninstall codex", () => {
  test("puts back the original file when nothing changed since, and unregisters the MCP server", () => {
    const original = '{"hooks": {"PreToolUse": []}}\n';
    writeFileSync(hooksPath, original);
    installCodex(context());
    const result = uninstallCodex(context());
    expect(result.settings).toBe("restored");
    expect(readFileSync(hooksPath, "utf8")).toBe(original);
    expect(commands).toContainEqual(["codex", "mcp", "remove", "wizardingcode-mem"]);
  });

  test("removes the file it created, and recognises its own entries without a receipt", () => {
    installCodex(context());
    rmSync(join(dataDir, "install"), { recursive: true, force: true });
    expect(uninstallCodex(context()).settings).toBe("edited");
    expect(existsSync(hooksPath)).toBe(true);
    expect(hooks()).toEqual({});
  });
});

describe("codexContext", () => {
  test("follows CODEX_HOME, and otherwise ~/.codex", () => {
    expect(codexContext(BIN, { CODEX_HOME: "/x/codex", HOME: "/h" }).settingsPath).toBe(
      "/x/codex/hooks.json",
    );
    expect(codexContext(BIN, { HOME: "/h" }).settingsPath).toBe("/h/.codex/hooks.json");
  });
});

describe("wizardingcode-mem install codex / uninstall codex", () => {
  // PATH is emptied so that the host's real command can never run from a test.
  const env = () => ({
    HOME: home,
    CODEX_HOME: join(home, ".codex"),
    WIZARDINGCODE_MEM_DATA_DIR: dataDir,
    PATH: "/nonexistent",
  });

  test("installs with an explicit binary, says what the user still has to do, then uninstalls cleanly", async () => {
    const binary = join(home, "wizardingcode-mem");
    writeFileSync(binary, "");
    const original = '{\n  "hooks": {}\n}\n';
    writeFileSync(hooksPath, original);
    const installed = await runCliWith({ env: env() }, "install", "codex", "--binary", binary);
    expect(installed.stderr).toBe("");
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain("Installed wizardingcode-mem for Codex.");
    expect(installed.stdout).toContain(hooksPath);
    expect(installed.stdout).toContain(`codex mcp add wizardingcode-mem -- ${binary} mcp`);
    expect(installed.stdout).toContain("/hooks");
    expect(hooks().hooks.Stop[0].hooks[0].command).toBe(`'${binary}' hook codex turn-end`);

    const removed = await runCliWith({ env: env() }, "uninstall", "codex");
    expect(removed.exitCode).toBe(0);
    expect(removed.stdout).toContain("Removed wizardingcode-mem from Codex.");
    expect(readFileSync(hooksPath, "utf8")).toBe(original);
  });
});
