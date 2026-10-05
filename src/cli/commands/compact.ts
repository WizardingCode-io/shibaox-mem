import { compact } from "../../store/compact.ts";
import { type Db, openDb } from "../../store/db.ts";
import { logError } from "../../util/log.ts";
import { defaultDataDir } from "../../util/paths.ts";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

/**
 * `shibaox-mem compact [--dry-run]`: removes old records no memory depends on and gives
 * the space back. Memories are never deleted here.
 */
export function run(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  let db: Db | undefined;
  try {
    db = openDb({ dataDir: defaultDataDir(), busyTimeoutMs: 5000 });
    const report = compact(db, { now: Date.now(), dryRun });
    const what = `${plural(report.turns, "turn")}, ${plural(report.sessions, "session")}, ${plural(report.hookRuns, "hook run")}`;
    process.stdout.write(
      dryRun
        ? `compact: would remove ${what} (${size(report.bytesBefore)} now)\n`
        : `compact: ${what} removed · ${size(report.bytesBefore)} → ${size(report.bytesAfter)}\n`,
    );
    return 0;
  } catch (error) {
    logError("compact", error);
    process.stderr.write(
      `shibaox-mem: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  } finally {
    db?.close();
  }
}
