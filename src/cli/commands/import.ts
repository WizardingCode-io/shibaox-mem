import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeMemDir, describeImport, importIntoDefaultStore } from "../../install/takeover.ts";
import { EXIT_USAGE } from "../exit.ts";

const SOURCES = ["claude-mem"];

/** `shibaox-mem import claude-mem [--db <path>]`: brings another tool's memories in. Safe to run again. */
export function run(argv: string[]): number {
  const [source, ...rest] = argv;
  if (source === undefined || !SOURCES.includes(source)) {
    process.stderr.write(
      `shibaox-mem import: unknown source "${source ?? ""}". Supported: ${SOURCES.join(", ")}\nUsage: shibaox-mem import claude-mem [--db <path>]\n`,
    );
    return EXIT_USAGE;
  }
  const flag = rest.indexOf("--db");
  const database = flag === -1 ? join(claudeMemDir(), "claude-mem.db") : (rest[flag + 1] ?? "");
  if (!existsSync(database)) {
    process.stderr.write(`shibaox-mem import: no claude-mem database at ${database}\n`);
    return 1;
  }
  try {
    const report = importIntoDefaultStore(database);
    process.stdout.write(`${describeImport(report).join("\n")}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(
      `shibaox-mem import: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
