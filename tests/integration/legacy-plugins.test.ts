import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLegacyPlugins, type LegacyPaths } from "../../src/install/legacy-plugins.ts";
import { installOpenCode } from "../../src/install/opencode.ts";

let home: string;
let paths: LegacyPaths;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wizardingcode-mem-legacy-plugins-"));
  paths = {
    settingsPath: join(home, ".claude", "settings.json"),
    codexHooksPath: join(home, ".codex", "hooks.json"),
    geminiSettingsPath: join(home, ".gemini", "settings.json"),
    opencodePluginPath: join(home, ".config", "opencode", "plugins", "wizardingcode-mem.ts"),
  };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const write = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

describe("findLegacyPlugins", () => {
  test("nothing on a machine that never had shibaox-mem", () => {
    expect(findLegacyPlugins(paths)).toEqual([]);
  });

  test("finds the Claude Code plugin and how to uninstall it", () => {
    write(
      paths.settingsPath,
      JSON.stringify({
        enabledPlugins: { "shibaox-mem@shibaox-plugins": true, "other@x": true },
      }),
    );
    expect(findLegacyPlugins(paths)).toEqual([
      {
        agent: "claude-code",
        name: "shibaox-mem@shibaox-plugins",
        command: ["claude", "plugin", "uninstall", "shibaox-mem@shibaox-plugins"],
        hint: "claude plugin uninstall shibaox-mem@shibaox-plugins",
      },
    ]);
  });

  test("a disabled Claude Code plugin does not run, so it is left alone", () => {
    write(
      paths.settingsPath,
      JSON.stringify({ enabledPlugins: { "shibaox-mem@shibaox-plugins": false } }),
    );
    expect(findLegacyPlugins(paths)).toEqual([]);
  });

  test("finds the Gemini CLI extension", () => {
    write(join(home, ".gemini", "extensions", "shibaox-mem", "gemini-extension.json"), "{}");
    expect(findLegacyPlugins(paths)).toEqual([
      {
        agent: "gemini",
        name: "shibaox-mem",
        command: ["gemini", "extensions", "uninstall", "shibaox-mem"],
        hint: "gemini extensions uninstall shibaox-mem",
      },
    ]);
  });

  test("finds the enabled Codex plugin; Codex removes it from its own /plugins menu", () => {
    write(
      join(home, ".codex", "config.toml"),
      '[plugins."shibaox-mem@shibaox-plugins"]\nenabled = true\n',
    );
    expect(findLegacyPlugins(paths)).toEqual([
      {
        agent: "codex",
        name: "shibaox-mem@shibaox-plugins",
        command: null,
        hint: 'in Codex, open /plugins and remove shibaox-mem, or set enabled = false under [plugins."shibaox-mem@shibaox-plugins"] in ~/.codex/config.toml',
      },
    ]);
  });

  test("finds the OpenCode npm plugin in the user's configuration", () => {
    write(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ plugin: ["shibaox-mem-opencode"] }),
    );
    const [found] = findLegacyPlugins(paths);
    expect(found?.agent).toBe("opencode");
    expect(found?.command).toBeNull();
    expect(found?.hint).toContain("wizardingcode-mem-opencode");
  });
});

describe("install opencode", () => {
  test("removes the plugin file shibaox-mem wrote, and only that", () => {
    const dir = join(home, ".config", "opencode", "plugins");
    write(
      join(dir, "shibaox-mem.ts"),
      "// written by shibaox-mem install opencode. @shibaox-mem-plugin\n",
    );
    installOpenCode({ pluginPath: paths.opencodePluginPath, binaryPath: "/bin/wizardingcode-mem" });
    expect(existsSync(join(dir, "shibaox-mem.ts"))).toBe(false);
    expect(existsSync(paths.opencodePluginPath)).toBe(true);
  });

  test("a file of the same name that shibaox-mem did not write is the user's", () => {
    const dir = join(home, ".config", "opencode", "plugins");
    write(join(dir, "shibaox-mem.ts"), "// mine\n");
    installOpenCode({ pluginPath: paths.opencodePluginPath, binaryPath: "/bin/wizardingcode-mem" });
    expect(existsSync(join(dir, "shibaox-mem.ts"))).toBe(true);
  });
});
