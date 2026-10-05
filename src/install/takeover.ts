import { homedir } from "node:os";
import { join } from "node:path";
import { type ImportReport, importClaudeMem } from "../import/claude-mem.ts";
import { type Db, openDb } from "../store/db.ts";
import { defaultDataDir } from "../util/paths.ts";
import {
  type Detection,
  detectClaudeMem,
  killProcess,
  listProcesses,
  type StopReport,
  stopClaudeMem,
  type TakeoverContext,
} from "./claude-mem.ts";

// The switch from claude-mem to ai-mem, as one step of `install`: import what the user
// has, then retire claude-mem so that two memories do not inject into the same session.

export function claudeMemDir(env: Record<string, string | undefined> = process.env): string {
  const override = env.AI_MEM_CLAUDE_MEM_DIR;
  return override !== undefined && override !== "" ? override : join(homedir(), ".claude-mem");
}

export function takeoverContext(settingsPath: string, configDir: string): TakeoverContext {
  return {
    settingsPath,
    configDir,
    claudeMemDir: claudeMemDir(),
    run: (command) => {
      try {
        const proc = Bun.spawnSync(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
        return { ok: proc.exitCode === 0, output: `${proc.stdout}${proc.stderr}`.trim() };
      } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : String(error) };
      }
    },
    listProcesses,
    kill: killProcess,
    sleep: (ms) => Bun.sleepSync(ms),
  };
}

export function importInto(db: Db, database: string, now: number): ImportReport {
  return importClaudeMem(db, { sourcePath: database, now });
}

export function importIntoDefaultStore(database: string): ImportReport {
  const db = openDb({ dataDir: defaultDataDir(), busyTimeoutMs: 5000 });
  try {
    return importInto(db, database, Date.now());
  } finally {
    db.close();
  }
}

export function describeImport(report: ImportReport): string[] {
  if (report.scanned === 0) return ["  import: nothing new to import from claude-mem"];
  const projects = Object.entries(report.projects).sort(([, a], [, b]) => b - a);
  const lines = [
    `  import: ${report.imported} memories from ${projects.length} projects (${report.skipped.duplicate} repeats and ${report.skipped.sensitive} sensitive left out)`,
  ];
  for (const [name, count] of projects.slice(0, 12)) lines.push(`    ${name}: ${count}`);
  if (projects.length > 12) lines.push(`    … and ${projects.length - 12} more`);
  return lines;
}

export function describeStop(detection: Detection, report: StopReport, home: string): string[] {
  const lines: string[] = [];
  if (detection.plugin !== null) {
    lines.push(
      report.disabled
        ? `  claude-mem: plugin ${detection.plugin} disabled (claude plugin enable ${detection.plugin} brings it back)`
        : `  claude-mem: could not disable the plugin; run: claude plugin disable ${detection.plugin}`,
    );
  }
  if (report.stopped.length > 0) {
    lines.push(`  claude-mem: stopped ${report.stopped.length} background process(es)`);
  }
  if (report.stillRunning.length > 0) {
    lines.push(
      `  claude-mem: ${report.stillRunning.length} process(es) would not stop: ${report.stillRunning.join(", ")}`,
    );
  }
  const dir = claudeMemDir().replace(home, "~");
  lines.push(
    `  claude-mem: its data in ${dir} was left as it was; delete that folder if you no longer want it`,
  );
  return lines;
}

export { detectClaudeMem, stopClaudeMem };
