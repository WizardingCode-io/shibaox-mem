import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installOpenCode,
  opencodePluginPath,
  uninstallOpenCode,
} from "../../src/install/opencode.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;
let pluginPath: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "shibaox-mem-install-opencode-"));
  pluginPath = join(home, ".config", "opencode", "plugins", "shibaox-mem.ts");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const BIN = "/opt/shibaox-mem/bin/shibaox-mem";

describe("install opencode", () => {
  test("writes the plugin, with the binary's path in it, creating the directory", () => {
    const result = installOpenCode({ pluginPath, binaryPath: BIN });
    expect(result).toEqual({ pluginPath, changed: true });
    expect(readFileSync(pluginPath, "utf8")).toContain(JSON.stringify(BIN));
  });

  test("installing again changes nothing; a new binary path rewrites it", () => {
    installOpenCode({ pluginPath, binaryPath: "/old/shibaox-mem" });
    expect(installOpenCode({ pluginPath, binaryPath: "/old/shibaox-mem" }).changed).toBe(false);
    expect(installOpenCode({ pluginPath, binaryPath: BIN }).changed).toBe(true);
    expect(readFileSync(pluginPath, "utf8")).not.toContain("/old/");
  });

  test("refuses to overwrite a file at that path that is not ours", () => {
    mkdirSync(join(home, ".config", "opencode", "plugins"), { recursive: true });
    writeFileSync(pluginPath, "export const Mine = async () => ({});\n");
    expect(() => installOpenCode({ pluginPath, binaryPath: BIN })).toThrow(
      /not written by shibaox-mem/,
    );
    expect(readFileSync(pluginPath, "utf8")).toContain("Mine");
  });
});

describe("uninstall opencode", () => {
  test("removes the plugin it wrote, and only that", () => {
    installOpenCode({ pluginPath, binaryPath: BIN });
    expect(uninstallOpenCode({ pluginPath })).toEqual({ pluginPath, plugin: "removed" });
    expect(existsSync(pluginPath)).toBe(false);
    expect(uninstallOpenCode({ pluginPath })).toEqual({ pluginPath, plugin: "absent" });
  });

  test("leaves a file that is not ours alone", () => {
    mkdirSync(join(home, ".config", "opencode", "plugins"), { recursive: true });
    writeFileSync(pluginPath, "export const Mine = async () => ({});\n");
    expect(uninstallOpenCode({ pluginPath })).toEqual({ pluginPath, plugin: "kept" });
    expect(existsSync(pluginPath)).toBe(true);
  });
});

describe("opencodePluginPath", () => {
  test("follows XDG_CONFIG_HOME, and otherwise ~/.config", () => {
    expect(opencodePluginPath({ XDG_CONFIG_HOME: "/x/cfg", HOME: "/h" })).toBe(
      "/x/cfg/opencode/plugins/shibaox-mem.ts",
    );
    expect(opencodePluginPath({ HOME: "/h" })).toBe("/h/.config/opencode/plugins/shibaox-mem.ts");
  });
});

describe("shibaox-mem install opencode / uninstall opencode", () => {
  const env = () => ({ HOME: home, XDG_CONFIG_HOME: join(home, ".config"), PATH: "/nonexistent" });

  test("installs with an explicit binary, then uninstalls", async () => {
    const binary = join(home, "shibaox-mem");
    writeFileSync(binary, "");
    const installed = await runCliWith({ env: env() }, "install", "opencode", "--binary", binary);
    expect(installed.stderr).toBe("");
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain("Installed shibaox-mem for OpenCode.");
    expect(installed.stdout).toContain(pluginPath);
    expect(installed.stdout).toContain("tools:  memory_search, memory_get, memory_save");
    expect(existsSync(pluginPath)).toBe(true);

    const removed = await runCliWith({ env: env() }, "uninstall", "opencode");
    expect(removed.exitCode).toBe(0);
    expect(removed.stdout).toContain("Removed shibaox-mem from OpenCode.");
    expect(existsSync(pluginPath)).toBe(false);
  });
});
