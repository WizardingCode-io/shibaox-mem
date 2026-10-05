import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importClaudeMem } from "../../src/import/claude-mem.ts";
import { DB_FILE, openDb } from "../../src/store/db.ts";
import { makeClaudeMemDb } from "../helpers/claude-mem-db.ts";
import { runCliWith } from "../helpers/cli.ts";

let base: string;
let dataDir: string;
let server: ReturnType<typeof Bun.serve> | undefined;
const KEY = ["apikey_", "x".repeat(60)].join("");

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-rejudge-cli-")));
  dataDir = join(base, "data");
  const db = openDb({ dataDir, busyTimeoutMs: 2000 });
  const source = join(base, "claude-mem.db");
  makeClaudeMemDb(source, [
    {
      project: "shop",
      type: "discovery",
      title: "Totals are rounded once, at the end.",
      facts: [],
    },
    { project: "shop", type: "change", title: "Ran the formatter.", facts: [] },
    { project: "shop", type: "feature", title: "Never deploy on Fridays.", facts: [] },
  ]);
  importClaudeMem(db, { sourcePath: source, now: Date.now() });
  db.close();
});
afterEach(async () => {
  // Awaited: a port still closing can be handed to the next test's server.
  await server?.stop(true);
  server = undefined;
  rmSync(base, { recursive: true, force: true });
});

/** A stand-in TypeSafe that keeps what says "Never" or "rounded" and drops the rest. */
function serve(): string {
  server = Bun.serve({
    // Loopback by name: on every interface, the port handed out may already be
    // another process's on 127.0.0.1, and the request would go to it.
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const body = (await request.json()) as { state: { assistant_final_message: string } };
      const text = body.state.assistant_final_message;
      const keep = /Never|rounded/.test(text);
      return Response.json({
        model: "jev-latest",
        answers: {
          worth: { type: "noul", noul: keep ? 0.9 : 0.1 },
          kind: {
            type: "choice",
            choice: /Never/.test(text) ? "convention" : "decision",
            probabilities: {},
            confidence: 1,
          },
          importance: {
            type: "score",
            score: keep ? 3 : 0,
            legend: {},
            probabilities: {},
            confidence: 1,
          },
        },
        usage: { input_tokens: 400, output_tokens: 3 },
      });
    },
  });
  return `http://127.0.0.1:${server.port}/v1/systemone`;
}

function rows<T>(sql: string): T[] {
  const db = new Database(join(dataDir, DB_FILE), { readonly: true });
  db.run("PRAGMA busy_timeout = 5000");
  try {
    return db.query<T, []>(sql).all();
  } finally {
    db.close();
  }
}

describe("shibaox-mem rejudge", () => {
  test("without a TypeSafe key it refuses, and says where the key goes", async () => {
    const result = await runCliWith(
      { env: { SHIBAOX_MEM_DATA_DIR: dataDir, TYPESAFE_API_KEY: "" } },
      "rejudge",
    );
    expect(result.exitCode).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("TYPESAFE_API_KEY");
    expect(result.stderr).toContain(join(dataDir, "env"));
    expect(rows("SELECT judge FROM memories WHERE judge <> 'claude-mem'")).toEqual([]);
  });

  test("judges the imported memories again and reports what changed, with the cost", async () => {
    writeFileSync(join(dataDir, "env"), `TYPESAFE_API_KEY=${KEY}\n`);
    const result = await runCliWith(
      { env: { SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_TYPESAFE_URL: serve() } },
      "rejudge",
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout:
        "rejudge: 3 judged, 1 archived, 2 kind changed, 0 failed, 0 remaining · 1200 input tokens (≈ $0.0001)\n",
      stderr: "",
    });
    expect(rows("SELECT title, kind, importance, status FROM memories ORDER BY id")).toEqual([
      {
        title: "Totals are rounded once, at the end.",
        kind: "decision",
        importance: 4,
        status: "active",
      },
      { title: "Ran the formatter.", kind: "change", importance: 1, status: "archived" },
      { title: "Never deploy on Fridays.", kind: "convention", importance: 4, status: "active" },
    ]);
  });

  test("--limit judges only that many, and says how many are left", async () => {
    writeFileSync(join(dataDir, "env"), `TYPESAFE_API_KEY=${KEY}\n`);
    const result = await runCliWith(
      { env: { SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_TYPESAFE_URL: serve() } },
      "rejudge",
      "--limit",
      "1",
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1 judged");
    expect(result.stdout).toContain("2 remaining");
  });

  test("a bad --limit is a usage error", async () => {
    const result = await runCliWith(
      { env: { SHIBAOX_MEM_DATA_DIR: dataDir } },
      "rejudge",
      "--limit",
      "many",
    );
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain("--limit");
  });
});
