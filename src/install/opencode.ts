import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PLUGIN_MARKER, pluginSource } from "./opencode-plugin.ts";

// OpenCode: one plugin file of ours in its plugins directory. Nothing of the user's is
// edited, so there is no backup and no receipt: the file is recognised by its marker.

export interface OpenCodeInstallResult {
  pluginPath: string;
  changed: boolean;
}

export interface OpenCodeUninstallResult {
  pluginPath: string;
  /** removed: our plugin deleted. kept: a file not ours left alone. absent: nothing there. */
  plugin: "removed" | "kept" | "absent";
}

export function opencodePluginPath(env: Record<string, string | undefined> = process.env): string {
  const config = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(config, "opencode", "plugins", "wizardingcode-mem.ts");
}

const isOurs = (text: string) => text.includes(PLUGIN_MARKER);

export function installOpenCode(options: {
  pluginPath: string;
  binaryPath: string;
}): OpenCodeInstallResult {
  const { pluginPath, binaryPath } = options;
  const next = pluginSource(binaryPath);
  const previous = existsSync(pluginPath) ? readFileSync(pluginPath, "utf8") : null;
  if (previous !== null && !isOurs(previous)) {
    throw new Error(`${pluginPath} exists and was not written by wizardingcode-mem; move it first`);
  }
  if (previous === next) return { pluginPath, changed: false };
  mkdirSync(dirname(pluginPath), { recursive: true });
  const temp = `${pluginPath}.wizardingcode-mem-new`;
  writeFileSync(temp, next, { mode: 0o644 });
  renameSync(temp, pluginPath);
  return { pluginPath, changed: true };
}

export function uninstallOpenCode(options: { pluginPath: string }): OpenCodeUninstallResult {
  const { pluginPath } = options;
  if (!existsSync(pluginPath)) return { pluginPath, plugin: "absent" };
  if (!isOurs(readFileSync(pluginPath, "utf8"))) return { pluginPath, plugin: "kept" };
  rmSync(pluginPath);
  return { pluginPath, plugin: "removed" };
}
