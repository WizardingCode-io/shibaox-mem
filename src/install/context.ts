import { homedir } from "node:os";
import { join } from "node:path";
import { defaultDataDir } from "../util/paths.ts";
import type { InstallContext } from "./claude-code.ts";

/** Runs a host command, treating "not installed" like any other failure. */
function run(command: string[]): { ok: boolean; output: string } {
  try {
    const proc = Bun.spawnSync(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    return { ok: proc.exitCode === 0, output: `${proc.stdout}${proc.stderr}`.trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

export function claudeCodeContext(binaryPath: string): InstallContext {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return {
    settingsPath: join(configDir, "settings.json"),
    dataDir: defaultDataDir(),
    binaryPath,
    run,
    now: Date.now,
  };
}
