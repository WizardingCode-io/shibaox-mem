import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { stageBinary } from "../../install/binary.ts";
import { installClaudeCode } from "../../install/claude-code.ts";
import { claudeCodeContext } from "../../install/context.ts";
import { defaultDataDir } from "../../util/paths.ts";
import { isCompiled } from "../../util/self.ts";
import { EXIT_USAGE } from "../exit.ts";

export const SUPPORTED_AGENTS = ["claude-code"];

/** `ai-mem install <agent> [--binary <path>]` */
export function run(argv: string[]): number {
  const [agent, ...rest] = argv;
  if (agent === undefined || !SUPPORTED_AGENTS.includes(agent)) {
    process.stderr.write(
      `ai-mem install: unknown agent "${agent ?? ""}". Supported: ${SUPPORTED_AGENTS.join(", ")}\n`,
    );
    return EXIT_USAGE;
  }

  const flag = rest.indexOf("--binary");
  const explicit = flag === -1 ? undefined : rest[flag + 1];
  let binaryPath: string;
  if (explicit !== undefined) {
    binaryPath = resolve(explicit);
    if (!existsSync(binaryPath)) {
      process.stderr.write(`ai-mem install: ${binaryPath} does not exist\n`);
      return 1;
    }
  } else if (isCompiled()) {
    binaryPath = stageBinary(process.execPath, defaultDataDir());
  } else {
    process.stderr.write(
      "ai-mem install: running from source. Build a binary with `bun run build` and pass it with --binary <path>.\n",
    );
    return 1;
  }

  try {
    const result = installClaudeCode(claudeCodeContext(binaryPath));
    const mcp =
      result.mcp === "registered"
        ? "registered"
        : `not registered. Run: ${result.mcpCommand.join(" ")}`;
    process.stdout.write(
      [
        "Installed ai-mem for Claude Code.",
        `  hooks:  ${result.settingsPath}${result.changed ? "" : " (already up to date)"}`,
        `  binary: ${binaryPath}`,
        `  MCP:    ${mcp}`,
        "Start a new Claude Code session for it to take effect.",
        "",
      ].join("\n"),
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `ai-mem install: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
