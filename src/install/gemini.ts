import { homedir } from "node:os";
import { join } from "node:path";
import { defaultDataDir } from "../util/paths.ts";
import { run } from "./context.ts";
import {
  HOOK_TIMEOUT_SECONDS,
  type HostSpec,
  type InstallContext,
  type InstallResult,
  inspectHooksFile,
  installHooksFile,
  MCP_NAME,
  type UninstallResult,
  uninstallHooksFile,
} from "./hooks-file.ts";
import { ourShellHookBinary, shellHookCommand } from "./shell-hook.ts";

// Gemini CLI: hooks live in ~/.gemini/settings.json next to everything else, each with a
// `name` (its trust list is keyed by name and command) and a timeout in milliseconds.

export const GEMINI: HostSpec = {
  agent: "gemini",
  events: [
    ["SessionStart", "session-start"],
    ["BeforeAgent", "prompt"],
    ["AfterAgent", "turn-end"],
    ["SessionEnd", "session-end"],
  ],
  entry: (binaryPath, event) => ({
    name: MCP_NAME,
    type: "command",
    command: shellHookCommand(binaryPath, "gemini", event),
    timeout: HOOK_TIMEOUT_SECONDS * 1000,
  }),
  isOurs: (hook) => ourShellHookBinary(hook, "gemini") !== null,
  binaryOf: (hook) => ourShellHookBinary(hook, "gemini") ?? "",
  mcpAdd: (binaryPath) => ["gemini", "mcp", "add", "-s", "user", MCP_NAME, binaryPath, "mcp"],
  mcpRemove: ["gemini", "mcp", "remove", "-s", "user", MCP_NAME],
  notes: ["If Gemini CLI asks whether to trust the wizardingcode-mem hooks, accept."],
};

export const installGemini = (context: InstallContext): InstallResult =>
  installHooksFile(GEMINI, context);
export const uninstallGemini = (context: InstallContext): UninstallResult =>
  uninstallHooksFile(GEMINI, context);
export const inspectGeminiSettings = (text: string) => inspectHooksFile(GEMINI, text);

export function geminiContext(
  binaryPath: string,
  env: Record<string, string | undefined> = process.env,
): InstallContext & { configDir: string } {
  const configDir = env.GEMINI_CLI_HOME || join(env.HOME || homedir(), ".gemini");
  return {
    configDir,
    settingsPath: join(configDir, "settings.json"),
    dataDir: defaultDataDir(env),
    binaryPath,
    run,
    now: Date.now,
  };
}
