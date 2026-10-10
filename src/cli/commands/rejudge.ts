import { join } from "node:path";
import { makeJudge, USAGE_KEYS } from "../../judge/index.ts";
import { rejudge } from "../../judge/rejudge.ts";
import { type Db, openDb } from "../../store/db.ts";
import { getMeta } from "../../store/meta.ts";
import { logError } from "../../util/log.ts";
import { resolvePaths } from "../../util/paths.ts";
import { EXIT_USAGE } from "../exit.ts";

const USAGE = "Usage: wizardingcode-mem rejudge [--limit <n>] [--concurrency <n>]\n";
/** TypeSafe's published input price, used only to show an estimate. */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

function positiveInt(argv: string[], flag: string): number | undefined | null {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = Number(argv[at + 1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * `wizardingcode-mem rejudge`: asks TypeSafe about every memory imported from another tool,
 * so that kind and importance stop being the importer's guess. Needs a key; safe to
 * interrupt and run again.
 */
export async function run(argv: string[]): Promise<number> {
  const limit = positiveInt(argv, "--limit");
  const concurrency = positiveInt(argv, "--concurrency");
  if (limit === null || concurrency === null) {
    process.stderr.write(
      `wizardingcode-mem rejudge: ${limit === null ? "--limit" : "--concurrency"} takes a whole number above zero\n${USAGE}`,
    );
    return EXIT_USAGE;
  }
  let db: Db | undefined;
  try {
    const { dataDir, storeDir } = resolvePaths();
    db = openDb({ dataDir: storeDir, busyTimeoutMs: 2000 });
    const judge = makeJudge({ db, dataDir });
    if (judge.versions.typesafe === undefined) {
      process.stderr.write(
        `wizardingcode-mem rejudge: needs a TypeSafe key. Set TYPESAFE_API_KEY in the environment or in ${join(dataDir, "env")}.\n`,
      );
      return EXIT_USAGE;
    }
    const tokensBefore = Number(getMeta(db, USAGE_KEYS.inputTokens) ?? 0);
    const started = Date.now();
    const report = await rejudge(db, {
      judge,
      now: started,
      ...(limit === undefined ? {} : { limit }),
      ...(concurrency === undefined ? {} : { concurrency }),
      onProgress: (progress) => {
        if (process.stderr.isTTY) {
          const seconds = Math.round((Date.now() - started) / 1000);
          process.stderr.write(
            `\r${progress.judged} judged, ${progress.failed} failed, ${progress.remaining} remaining · ${seconds}s`,
          );
        }
      },
    });
    if (process.stderr.isTTY) process.stderr.write("\n");
    const tokens = Number(getMeta(db, USAGE_KEYS.inputTokens) ?? 0) - tokensBefore;
    process.stdout.write(
      `rejudge: ${report.judged} judged, ${report.archived} archived, ${report.kindChanged} kind changed, ${report.failed} failed, ${report.remaining} remaining · ${tokens} input tokens (≈ $${(tokens * USD_PER_INPUT_TOKEN).toFixed(4)})\n`,
    );
    return 0;
  } catch (error) {
    logError("rejudge", error);
    process.stderr.write(
      `wizardingcode-mem: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  } finally {
    db?.close();
  }
}
