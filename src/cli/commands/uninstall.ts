import { uninstallClaudeCode } from "../../install/claude-code.ts";
import { claudeCodeContext } from "../../install/context.ts";
import { defaultDataDir } from "../../util/paths.ts";
import { EXIT_USAGE } from "../exit.ts";
import { SUPPORTED_AGENTS } from "./install.ts";

const OUTCOME = {
  restored: "put back exactly as it was",
  removed: "removed (ai-mem had created it)",
  edited: "ai-mem's entries removed, everything else kept",
  untouched: "had nothing of ai-mem's in it",
} as const;

/** `ai-mem uninstall <agent>`: removes what install wrote. Memories are never deleted. */
export function run(argv: string[]): number {
  const [agent] = argv;
  if (agent === undefined || !SUPPORTED_AGENTS.includes(agent)) {
    process.stderr.write(
      `ai-mem uninstall: unknown agent "${agent ?? ""}". Supported: ${SUPPORTED_AGENTS.join(", ")}\n`,
    );
    return EXIT_USAGE;
  }
  try {
    const result = uninstallClaudeCode(claudeCodeContext(""));
    process.stdout.write(
      [
        "Removed ai-mem from Claude Code.",
        `  ${result.settingsPath}: ${OUTCOME[result.settings]}`,
        `Your memories are still in ${defaultDataDir()}. Delete that folder to remove them.`,
        "",
      ].join("\n"),
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `ai-mem uninstall: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
