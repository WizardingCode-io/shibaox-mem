import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { LEGACY_MCP_NAME, MCP_NAME } from "./hooks-file.ts";

// Claude Desktop: its chat runs no hooks and no plugin's local MCP server, but it starts
// the local servers listed in claude_desktop_config.json. Ours goes there with --global:
// a chat has no project folder, so the tools span every project. Cowork and the Code tab
// get the plugin instead, with its hooks (ADR 0012).

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where Claude Desktop keeps its configuration on each platform. */
export function claudeDesktopConfigPath(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.WIZARDINGCODE_MEM_CLAUDE_DESKTOP_CONFIG)
    return env.WIZARDINGCODE_MEM_CLAUDE_DESKTOP_CONFIG;
  const home = env.HOME || env.USERPROFILE || homedir();
  if (platform === "darwin")
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32")
    return join(
      env.APPDATA || join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude", "claude_desktop_config.json");
}

/** Claude Desktop is on this machine when its configuration directory exists. */
export const hasClaudeDesktop = (configPath: string): boolean => existsSync(dirname(configPath));

function read(configPath: string): { config: Json; text: string | null } {
  if (!existsSync(configPath)) return { config: {}, text: null };
  const text = readFileSync(configPath, "utf8");
  let parsed: unknown;
  try {
    parsed = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw new Error(
      `${configPath} is not valid JSON; fix it in Claude Desktop (Settings → Developer → Edit Config) first`,
    );
  }
  if (!isObject(parsed)) throw new Error(`${configPath} is not a JSON object`);
  return { config: parsed, text };
}

function write(configPath: string, config: Json, previous: string | null): void {
  const indent = previous?.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  const text = `${JSON.stringify(config, null, indent)}\n`;
  mkdirSync(dirname(configPath), { recursive: true });
  const mode = existsSync(configPath) ? statSync(configPath).mode & 0o777 : 0o644;
  const temporary = `${configPath}.wizardingcode-mem-new`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, configPath);
  if (process.platform !== "win32") chmodSync(configPath, mode);
}

/** Adds (or updates) our server; every other key and server is kept as it was. */
export function installClaudeDesktop(options: { configPath: string; binaryPath: string }): {
  changed: boolean;
  configPath: string;
} {
  const { configPath, binaryPath } = options;
  const { config, text } = read(configPath);
  const { [LEGACY_MCP_NAME]: _legacy, ...servers } = isObject(config.mcpServers)
    ? config.mcpServers
    : {};
  const entry = { command: binaryPath, args: ["mcp", "--global"] };
  const next = { ...config, mcpServers: { ...servers, [MCP_NAME]: entry } };
  if (text !== null && JSON.stringify(next) === JSON.stringify(config))
    return { changed: false, configPath };
  write(configPath, next, text);
  return { changed: true, configPath };
}

/** Takes our server (and shibaox-mem's) out; says whether there was anything to take. */
export function uninstallClaudeDesktop(options: { configPath: string }): boolean {
  const { configPath } = options;
  if (!existsSync(configPath)) return false;
  const { config, text } = read(configPath);
  if (
    !isObject(config.mcpServers) ||
    !(MCP_NAME in config.mcpServers || LEGACY_MCP_NAME in config.mcpServers)
  )
    return false;
  const { [MCP_NAME]: _ours, [LEGACY_MCP_NAME]: _legacy, ...servers } = config.mcpServers;
  write(configPath, { ...config, mcpServers: servers }, text);
  return true;
}

/** Whether our server is registered, for doctor and the viewer. */
export function claudeDesktopServer(
  configPath: string,
): { command: string; args: string[] } | null {
  try {
    const { config } = read(configPath);
    const entry = isObject(config.mcpServers) ? config.mcpServers[MCP_NAME] : undefined;
    return isObject(entry) && typeof entry.command === "string"
      ? { command: entry.command, args: Array.isArray(entry.args) ? (entry.args as string[]) : [] }
      : null;
  } catch {
    return null;
  }
}
