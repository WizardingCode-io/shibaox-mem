import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageBinary } from "../../src/install/binary.ts";
import {
  type InstallContext,
  installClaudeCode,
  uninstallClaudeCode,
} from "../../src/install/claude-code.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let settingsPath: string;
let dataDir: string;
let commands: string[][];
let hostCliWorks: boolean;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ai-mem-install-"));
  mkdirSync(join(home, ".claude"));
  settingsPath = join(home, ".claude", "settings.json");
  dataDir = join(home, ".ai-mem");
  commands = [];
  hostCliWorks = true;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const BIN = "/opt/ai-mem/bin/ai-mem";
const context = (binaryPath = BIN): InstallContext => ({
  settingsPath,
  dataDir,
  binaryPath,
  now: () => 1_700_000_000_000,
  run: (command) => {
    commands.push(command);
    return { ok: hostCliWorks, output: "" };
  },
});
const settings = () => JSON.parse(readFileSync(settingsPath, "utf8"));
const ours = (event: string) => ({
  hooks: [{ type: "command", command: BIN, args: ["hook", "claude-code", event], timeout: 5 }],
});

describe("install claude-code", () => {
  test("with no settings file, creates one holding the four hooks in exec form", () => {
    const result = installClaudeCode(context());
    expect(result.changed).toBe(true);
    expect(settings()).toEqual({
      hooks: {
        SessionStart: [ours("session-start")],
        UserPromptSubmit: [ours("prompt")],
        Stop: [ours("turn-end")],
        SessionEnd: [ours("session-end")],
      },
    });
  });

  test("leaves everything that is not ours exactly as it was", () => {
    const theirs = { hooks: [{ type: "command", command: "other-tool start" }] };
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          permissions: { allow: ["Bash(npm test:*)"] },
          hooks: { SessionStart: [theirs], PreToolUse: [{ matcher: "Bash", hooks: [] }] },
          model: "opus",
        },
        null,
        2,
      ),
    );
    installClaudeCode(context());
    const after = settings();
    expect(after.permissions).toEqual({ allow: ["Bash(npm test:*)"] });
    expect(after.model).toBe("opus");
    expect(after.hooks.PreToolUse).toEqual([{ matcher: "Bash", hooks: [] }]);
    expect(after.hooks.SessionStart).toEqual([theirs, ours("session-start")]);
    expect(Object.keys(after)).toEqual(["permissions", "hooks", "model"]);
  });

  test("installing twice changes nothing the second time", () => {
    installClaudeCode(context());
    const first = readFileSync(settingsPath, "utf8");
    const second = installClaudeCode(context());
    expect(second.changed).toBe(false);
    expect(readFileSync(settingsPath, "utf8")).toBe(first);
    expect(settings().hooks.Stop).toHaveLength(1);
  });

  test("installing a binary at a new path replaces the old entries", () => {
    installClaudeCode(context("/old/place/ai-mem"));
    installClaudeCode(context());
    const text = readFileSync(settingsPath, "utf8");
    expect(text).not.toContain("/old/place");
    expect(settings().hooks.UserPromptSubmit).toEqual([ours("prompt")]);
  });

  test("keeps the file's own indentation", () => {
    writeFileSync(settingsPath, '{\n\t"model": "opus"\n}\n');
    installClaudeCode(context());
    const text = readFileSync(settingsPath, "utf8");
    expect(text).toStartWith('{\n\t"model": "opus",\n\t"hooks": {\n\t\t"SessionStart"');
    expect(text).toEndWith("}\n");
  });

  test("a settings file that is not valid JSON is refused and left untouched", () => {
    const broken = '{ "model": "opus", }';
    writeFileSync(settingsPath, broken);
    expect(() => installClaudeCode(context())).toThrow(/not valid JSON/);
    expect(readFileSync(settingsPath, "utf8")).toBe(broken);
    expect(commands).toEqual([]);
  });

  test("a settings file whose hooks are not an object is refused", () => {
    writeFileSync(settingsPath, '{ "hooks": [] }');
    expect(() => installClaudeCode(context())).toThrow(/hooks/);
  });

  test("backs the file up before changing it, and records what it did", () => {
    const original = '{\n  "model": "opus"\n}\n';
    writeFileSync(settingsPath, original);
    installClaudeCode(context());
    const backups = readdirSync(join(dataDir, "install", "backups"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dataDir, "install", "backups", backups[0] as string), "utf8")).toBe(
      original,
    );
    const receipt = JSON.parse(readFileSync(join(dataDir, "install", "claude-code.json"), "utf8"));
    expect(receipt).toMatchObject({ agent: "claude-code", settingsPath, binaryPath: BIN });
  });

  test("registers the MCP server through the host's own command", () => {
    const result = installClaudeCode(context());
    expect(commands).toEqual([
      ["claude", "mcp", "remove", "--scope", "user", "ai-mem"],
      ["claude", "mcp", "add", "--scope", "user", "ai-mem", "--", BIN, "mcp"],
    ]);
    expect(result.mcp).toBe("registered");
  });

  test("when the host's command is unavailable, says what to run by hand", () => {
    hostCliWorks = false;
    const result = installClaudeCode(context());
    expect(result.changed).toBe(true);
    expect(result.mcp).toBe("manual");
    expect(result.mcpCommand.join(" ")).toBe(`claude mcp add --scope user ai-mem -- ${BIN} mcp`);
  });
});

describe("uninstall claude-code", () => {
  test("puts back the original file, byte for byte, when nothing else changed since", () => {
    const original = '{\n    "model":   "opus",\n    "hooks": {"Stop": []}\n}';
    writeFileSync(settingsPath, original);
    installClaudeCode(context());
    expect(uninstallClaudeCode(context()).settings).toBe("restored");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  test("removes the file it created, when it is otherwise empty", () => {
    installClaudeCode(context());
    expect(uninstallClaudeCode(context()).settings).toBe("removed");
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("keeps changes made to the file after installing, removing only what is ours", () => {
    writeFileSync(settingsPath, JSON.stringify({ model: "opus" }, null, 2));
    installClaudeCode(context());
    const edited = settings();
    edited.model = "sonnet";
    edited.hooks.Stop.unshift({ hooks: [{ type: "command", command: "their-hook" }] });
    writeFileSync(settingsPath, JSON.stringify(edited, null, 2));

    expect(uninstallClaudeCode(context()).settings).toBe("edited");
    expect(settings()).toEqual({
      model: "sonnet",
      hooks: { Stop: [{ hooks: [{ type: "command", command: "their-hook" }] }] },
    });
  });

  test("works without a receipt, recognising its own entries by their shape", () => {
    installClaudeCode(context());
    rmSync(join(dataDir, "install"), { recursive: true });
    expect(uninstallClaudeCode(context()).settings).toBe("edited");
    expect(settings()).toEqual({});
  });

  test("with nothing installed, changes nothing", () => {
    const original = '{ "model": "opus" }';
    writeFileSync(settingsPath, original);
    expect(uninstallClaudeCode(context()).settings).toBe("untouched");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  test("unregisters the MCP server and forgets the receipt, but keeps the memories", () => {
    installClaudeCode(context());
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "ai-mem.db"), "data");
    commands = [];
    uninstallClaudeCode(context());
    expect(commands).toEqual([["claude", "mcp", "remove", "--scope", "user", "ai-mem"]]);
    expect(existsSync(join(dataDir, "install", "claude-code.json"))).toBe(false);
    expect(readFileSync(join(dataDir, "ai-mem.db"), "utf8")).toBe("data");
  });
});

describe("stageBinary", () => {
  test("copies the binary to a stable, executable place inside the data directory", () => {
    const source = join(home, "downloaded-ai-mem");
    writeFileSync(source, "#!/bin/sh\necho hi\n");
    const staged = stageBinary(source, dataDir);
    expect(staged).toBe(
      join(dataDir, "bin", process.platform === "win32" ? "ai-mem.exe" : "ai-mem"),
    );
    expect(readFileSync(staged, "utf8")).toBe("#!/bin/sh\necho hi\n");
    if (process.platform !== "win32") expect(statSync(staged).mode & 0o111).not.toBe(0);
  });

  test("a binary already in place is left alone", () => {
    const source = join(home, "downloaded-ai-mem");
    writeFileSync(source, "v1");
    const staged = stageBinary(source, dataDir);
    expect(stageBinary(staged, dataDir)).toBe(staged);
    expect(readFileSync(staged, "utf8")).toBe("v1");
  });
});

describe("ai-mem install / uninstall", () => {
  // PATH is emptied so that the host's real command can never run from a test.
  const env = () => ({
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    AI_MEM_DATA_DIR: dataDir,
    PATH: "/nonexistent",
  });

  test("installs with an explicit binary, then uninstalls cleanly", async () => {
    const binary = join(home, "ai-mem");
    writeFileSync(binary, "");
    const original = '{\n  "model": "opus"\n}\n';
    writeFileSync(settingsPath, original);
    const installed = await runCliWith(
      { env: env() },
      "install",
      "claude-code",
      "--binary",
      binary,
    );
    expect(installed.stderr).toBe("");
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain(settingsPath);
    expect(installed.stdout).toContain(`claude mcp add --scope user ai-mem -- ${binary} mcp`);
    expect(settings().hooks.Stop[0].hooks[0]).toEqual({
      type: "command",
      command: binary,
      args: ["hook", "claude-code", "turn-end"],
      timeout: 5,
    });

    const removed = await runCliWith({ env: env() }, "uninstall", "claude-code");
    expect(removed.exitCode).toBe(0);
    expect(removed.stdout).toContain(dataDir);
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  test("a --binary that does not exist is refused before anything is written", async () => {
    const result = await runCliWith({ env: env() }, "install", "claude-code", "--binary", BIN);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(BIN);
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("run from source without --binary, explains what is needed", async () => {
    const result = await runCliWith({ env: env() }, "install", "claude-code");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--binary");
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("an agent it does not know is a usage error", async () => {
    const result = await runCliWith({ env: env() }, "install", "some-agent");
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain("claude-code");
  });
});
