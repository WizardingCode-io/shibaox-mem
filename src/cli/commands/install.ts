import { existsSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { stageBinary } from "../../install/binary.ts";
import { installClaudeCode } from "../../install/claude-code.ts";
import { codexContext, installCodex } from "../../install/codex.ts";
import { claudeCodeContext } from "../../install/context.ts";
import type { InstallResult } from "../../install/hooks-file.ts";
import {
  describeImport,
  describeStop,
  detectClaudeMem,
  importIntoDefaultStore,
  stopClaudeMem,
  takeoverContext,
} from "../../install/takeover.ts";
import { defaultDataDir } from "../../util/paths.ts";
import { isCompiled } from "../../util/self.ts";
import { EXIT_USAGE } from "../exit.ts";

export const SUPPORTED_AGENTS = ["claude-code", "codex"];
export const AGENT_NAMES: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

const USAGE = `Usage: shibaox-mem install <agent> [--binary <path>] [--yes] [--keep-claude-mem] [--no-import]

  <agent>             claude-code | codex
  --binary <path>     The shibaox-mem binary the hooks will run (needed when running from source)
  --yes               Retire claude-mem without asking (disable its plugin, stop its processes)
  --keep-claude-mem   Leave claude-mem installed and running
  --no-import         Do not import claude-mem's memories
`;

/** The lines every install ends with: where the hooks went, which binary, how MCP stands. */
function describeInstall(
  agent: string,
  result: InstallResult,
  binaryPath: string,
  lines: string[],
): string {
  const mcp =
    result.mcp === "registered"
      ? "registered"
      : `not registered. Run: ${result.mcpCommand.join(" ")}`;
  return [
    `Installed shibaox-mem for ${AGENT_NAMES[agent]}.`,
    `  hooks:  ${result.settingsPath}${result.changed ? "" : " (already up to date)"}`,
    `  binary: ${binaryPath}`,
    `  MCP:    ${mcp}`,
    ...lines,
    ...result.notes.map((note) => `  ${note}`),
    `Start a new ${AGENT_NAMES[agent]} session for it to take effect.`,
    "",
  ].join("\n");
}

/** Asks on the terminal. Without one, the answer is no: nothing is retired unasked. */
function confirm(question: string): boolean {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  process.stdout.write(`${question} [Y/n] `);
  const buffer = Buffer.alloc(64);
  let read = 0;
  try {
    read = readSync(0, buffer, 0, buffer.length, null);
  } catch {
    return false;
  }
  // Enter means yes; end of input, with nothing typed, does not.
  if (read === 0) return false;
  const answer = buffer.toString("utf8", 0, read).trim().toLowerCase();
  return answer === "" || answer === "y" || answer === "yes" || answer === "s" || answer === "sim";
}

/** `shibaox-mem install <agent> [options]` */
export function run(argv: string[]): number {
  const [agent, ...rest] = argv;
  if (agent === undefined || !SUPPORTED_AGENTS.includes(agent)) {
    process.stderr.write(
      `shibaox-mem install: unknown agent "${agent ?? ""}". Supported: ${SUPPORTED_AGENTS.join(", ")}\n${USAGE}`,
    );
    return EXIT_USAGE;
  }

  const flag = rest.indexOf("--binary");
  const explicit = flag === -1 ? undefined : rest[flag + 1];
  let binaryPath: string;
  if (explicit !== undefined) {
    binaryPath = resolve(explicit);
    if (!existsSync(binaryPath)) {
      process.stderr.write(`shibaox-mem install: ${binaryPath} does not exist\n`);
      return 1;
    }
  } else if (isCompiled()) {
    binaryPath = stageBinary(process.execPath, defaultDataDir());
  } else {
    process.stderr.write(
      "shibaox-mem install: running from source. Build a binary with `bun run build` and pass it with --binary <path>.\n",
    );
    return 1;
  }

  const lines: string[] = [];
  try {
    if (agent === "codex") {
      process.stdout.write(
        describeInstall(agent, installCodex(codexContext(binaryPath)), binaryPath, lines),
      );
      return 0;
    }
    const hostContext = claudeCodeContext(binaryPath);
    const takeover = takeoverContext(hostContext.settingsPath, hostContext.configDir);
    const detection = detectClaudeMem(takeover);
    const home = homedir();

    // What the user has in claude-mem comes over first, before anything of it is touched.
    if (detection.database !== null && !rest.includes("--no-import")) {
      lines.push(...describeImport(importIntoDefaultStore(detection.database)));
    }

    const present = detection.plugin !== null;
    if (present && !rest.includes("--keep-claude-mem")) {
      const agreed =
        rest.includes("--yes") ||
        confirm(
          `claude-mem is installed. Disable its plugin and stop its background processes, so that only one memory speaks to Claude Code?`,
        );
      if (agreed) {
        lines.push(...describeStop(detection, stopClaudeMem(takeover, detection.plugin), home));
      } else {
        lines.push(
          "  claude-mem: still enabled. Two memories will inject into the same session until you run:",
          `    claude plugin disable ${detection.plugin}`,
          "  or run this install again with --yes.",
        );
      }
    } else if (present) {
      lines.push(
        `  claude-mem: still enabled, as asked (claude plugin disable ${detection.plugin} turns it off)`,
      );
    }

    process.stdout.write(describeInstall(agent, installClaudeCode(hostContext), binaryPath, lines));
    return 0;
  } catch (error) {
    process.stderr.write(
      `shibaox-mem install: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
