import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentId } from "../core/types.ts";

// Until 0.3.0 this product was shibaox-mem, installed as each agent's own plugin. Left
// enabled, it would keep running beside wizardingcode-mem: two memories injecting into
// the same session, and an empty ~/.shibaox recreated. Each agent removes its plugins
// itself; this finds them and says how (ADR 0011).

export interface LegacyPaths {
  /** Claude Code's settings.json. */
  settingsPath: string;
  /** Codex's hooks.json: config.toml sits beside it. */
  codexHooksPath: string;
  /** Gemini CLI's settings.json: extensions/ sits beside it. */
  geminiSettingsPath: string;
  /** Our plugin file in OpenCode's plugins directory. */
  opencodePluginPath: string;
}

export interface LegacyPlugin {
  agent: AgentId;
  name: string;
  /** The agent's own command that removes it, when it has one. */
  command: string[] | null;
  /** What to do by hand. */
  hint: string;
}

const LEGACY = "shibaox-mem";

const readText = (path: string): string | null => {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
};

function claudeCode(paths: LegacyPaths): LegacyPlugin | null {
  try {
    const settings = JSON.parse(readText(paths.settingsPath) ?? "{}") as {
      enabledPlugins?: Record<string, unknown>;
    };
    const name = Object.entries(settings.enabledPlugins ?? {}).find(
      ([key, enabled]) => key.startsWith(`${LEGACY}@`) && enabled === true,
    )?.[0];
    if (name === undefined) return null;
    const command = ["claude", "plugin", "uninstall", name];
    return { agent: "claude-code", name, command, hint: command.join(" ") };
  } catch {
    return null;
  }
}

function codex(paths: LegacyPaths): LegacyPlugin | null {
  const config = readText(join(dirname(paths.codexHooksPath), "config.toml")) ?? "";
  const section = /^\[plugins\."(shibaox-mem@[^"]+)"\]\s*\n((?:(?!\[)[^\n]*\n?)*)/m.exec(config);
  if (section === null || !/^enabled\s*=\s*true/m.test(section[2] ?? "")) return null;
  const name = section[1] as string;
  return {
    agent: "codex",
    name,
    command: null,
    hint: `in Codex, open /plugins and remove ${LEGACY}, or set enabled = false under [plugins."${name}"] in ~/.codex/config.toml`,
  };
}

function gemini(paths: LegacyPaths): LegacyPlugin | null {
  const manifest = join(
    dirname(paths.geminiSettingsPath),
    "extensions",
    LEGACY,
    "gemini-extension.json",
  );
  if (!existsSync(manifest)) return null;
  const command = ["gemini", "extensions", "uninstall", LEGACY];
  return { agent: "gemini", name: LEGACY, command, hint: command.join(" ") };
}

function opencode(paths: LegacyPaths): LegacyPlugin | null {
  const dir = dirname(dirname(paths.opencodePluginPath));
  for (const file of ["opencode.json", "opencode.jsonc"]) {
    const path = join(dir, file);
    if (!(readText(path) ?? "").includes(`"${LEGACY}-opencode`)) continue;
    return {
      agent: "opencode",
      name: `${LEGACY}-opencode`,
      command: null,
      hint: `replace "${LEGACY}-opencode" with "wizardingcode-mem-opencode" in the plugin list of ${path}`,
    };
  }
  return null;
}

/** The shibaox-mem plugins still enabled on this machine, agent by agent. */
export function findLegacyPlugins(paths: LegacyPaths): LegacyPlugin[] {
  return [claudeCode(paths), codex(paths), gemini(paths), opencode(paths)].filter(
    (found): found is LegacyPlugin => found !== null,
  );
}
