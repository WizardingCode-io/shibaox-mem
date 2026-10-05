import { findProject } from "../../core/project.ts";
import { formatStatus, statusReport } from "../../status/report.ts";
import { type Db, openExisting } from "../../store/db.ts";
import { defaultDataDir } from "../../util/paths.ts";

/** `ai-mem status [--json]`: what is stored for this project, and how ai-mem is behaving. */
export function run(argv: string[]): number {
  const dataDir = defaultDataDir();
  let db: Db | null = null;
  try {
    db = openExisting(dataDir);
    const project = db === null ? null : findProject(db, process.cwd());
    const report = statusReport(db, project, dataDir);
    process.stdout.write(
      argv.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : formatStatus(report),
    );
    return 0;
  } catch (error) {
    process.stderr.write(`ai-mem: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    db?.close();
  }
}
