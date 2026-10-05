import type { SpikeResult } from "../../spike/support.ts";
import { EXIT_USAGE } from "../exit.ts";

const DEFAULT_RUNS = 50;

function report(result: unknown, ok: boolean): number {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return ok ? 0 : 1;
}

function runsFrom(argv: string[]): number {
  const index = argv.indexOf("--runs");
  const value = index === -1 ? DEFAULT_RUNS : Number(argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_RUNS;
}

function required(argv: string[], index: number, name: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`__spike: missing <${name}>`);
  return value;
}

/** Platform probes for milestone 0. Hidden from --help; every probe prints one JSON line. */
export async function run(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  switch (name) {
    case "noop":
      return 0;
    case "open-db": {
      const { Database } = await import("bun:sqlite");
      const db = new Database(required(rest, 0, "path"), { create: true });
      db.run("PRAGMA busy_timeout = 100");
      db.run("PRAGMA journal_mode = WAL");
      db.run("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)");
      db.query("SELECT count(*) FROM t").get();
      db.close();
      return 0;
    }
    case "fts5": {
      const result = await (await import("../../spike/fts5.ts")).fts5Spike();
      return report(result, result.ok);
    }
    case "startup": {
      const result = await (await import("../../spike/startup.ts")).startupSpike(runsFrom(rest));
      return report(result, result.ok);
    }
    case "wal": {
      const result = await (await import("../../spike/wal.ts")).walSpike();
      return report(result, result.ok);
    }
    case "wal-writer": {
      const { walWriter } = await import("../../spike/wal.ts");
      return report(
        walWriter(
          required(rest, 0, "path"),
          Number(required(rest, 1, "writer")),
          Number(required(rest, 2, "transactions")),
        ),
        true,
      );
    }
    case "wal-reader": {
      const { walReader } = await import("../../spike/wal.ts");
      return report(walReader(required(rest, 0, "path"), Number(required(rest, 1, "reads"))), true);
    }
    case "detach": {
      const result = await (await import("../../spike/detach.ts")).detachSpike();
      return report(result, result.ok);
    }
    case "detach-parent":
      (await import("../../spike/detach.ts")).detachParent(required(rest, 0, "marker"));
      return 0;
    case "detach-child":
      await (await import("../../spike/detach.ts")).detachChild(required(rest, 0, "marker"));
      return 0;
    case "dotenv": {
      const result = await (await import("../../spike/dotenv.ts")).dotenvSpike();
      return report(result, result.ok);
    }
    case "env-probe": {
      const { envProbe } = await import("../../spike/dotenv.ts");
      process.stdout.write(`${envProbe(required(rest, 0, "name"))}\n`);
      return 0;
    }
    case "mcp": {
      const result = await (await import("../../spike/mcp.ts")).mcpSpike();
      return report(result, result.ok);
    }
    case "mcp-server":
      await (await import("../../spike/mcp.ts")).mcpServer();
      return 0;
    case "log-payload": {
      // Captures what a host really sends to a hook. Silent: hosts read hook output.
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dir = required(rest, 0, "dir");
      const label = required(rest, 1, "label");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${Date.now()}-${process.pid}-${label}.json`),
        await Bun.stdin.text(),
      );
      return 0;
    }
    case "all": {
      const { isCompiled } = await import("../../spike/support.ts");
      const results: SpikeResult[] = [
        await (await import("../../spike/fts5.ts")).fts5Spike(),
        await (await import("../../spike/startup.ts")).startupSpike(runsFrom(rest)),
        await (await import("../../spike/wal.ts")).walSpike(),
        await (await import("../../spike/detach.ts")).detachSpike(),
        await (await import("../../spike/dotenv.ts")).dotenvSpike(),
        await (await import("../../spike/mcp.ts")).mcpSpike(),
      ];
      return report(
        {
          platform: process.platform,
          arch: process.arch,
          bun: Bun.version,
          compiled: isCompiled(),
          results,
        },
        results.every((result) => result.ok),
      );
    }
    default:
      process.stderr.write(`shibaox-mem: unknown spike "${name ?? ""}"\n`);
      return EXIT_USAGE;
  }
}
