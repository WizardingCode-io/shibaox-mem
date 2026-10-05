import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, runCliWithInput } from "../helpers/cli.ts";

async function spike(...args: string[]) {
  const r = await runCli("__spike", ...args);
  return { ...r, json: r.stdout.trim() === "" ? null : JSON.parse(r.stdout) };
}

describe("__spike", () => {
  test("fts5: full-text search works with diacritic folding, bm25 weights and no stale rows", async () => {
    const r = await spike("fts5");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.json).toMatchObject({
      spike: "fts5",
      ok: true,
      diacriticFolding: true,
      titleOutranksBody: true,
      snippet: true,
      staleAfterUpdate: 0,
    });
    expect(typeof r.json.sqliteVersion).toBe("string");
  });

  test("wal: concurrent writers lose no rows and never see SQLITE_BUSY", async () => {
    const r = await spike("wal");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.json).toMatchObject({
      spike: "wal",
      ok: true,
      busyErrors: 0,
      rows: r.json.writers * r.json.transactionsPerWriter,
      integrity: "ok",
    });
    expect(r.json.writers).toBeGreaterThanOrEqual(8);
  }, 60_000);

  test("detach: a detached child outlives the process that spawned it", async () => {
    const r = await spike("detach");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.json).toMatchObject({ spike: "detach", ok: true, childSurvived: true });
    expect(r.json.parentMs).toBeLessThan(1500);
  }, 30_000);

  test("startup: reports cold and warm percentiles for a no-op and for opening the database", async () => {
    const r = await spike("startup", "--runs", "5");
    expect(r.stderr).toBe("");
    expect(r.json.spike).toBe("startup");
    expect(r.json.runs).toBe(5);
    for (const key of ["noop", "openDb"]) {
      expect(r.json[key].p50).toBeGreaterThan(0);
      expect(r.json[key].p95).toBeGreaterThanOrEqual(r.json[key].p50);
    }
    expect(r.json.firstRunMs).toBeGreaterThan(0);
  }, 60_000);

  test("dotenv: reports whether a .env in the working directory leaks into the process", async () => {
    const r = await spike("dotenv");
    expect(r.stderr).toBe("");
    expect(r.json.spike).toBe("dotenv");
    expect(typeof r.json.leaked).toBe("boolean");
    // Source runs autoload .env by design; only a compiled binary can pass or fail this probe.
    expect(r.json.compiled).toBe(false);
    expect(r.json.ok).toBe(true);
  });

  test("mcp: a stdio server inside this program answers the protocol and exits when stdin closes", async () => {
    const started = performance.now();
    const r = await spike("mcp");
    // A pending timeout must not keep the process alive after the work is done.
    expect(performance.now() - started).toBeLessThan(5000);
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.json).toMatchObject({
      spike: "mcp",
      ok: true,
      initialize: true,
      toolsList: true,
      toolsCall: true,
      exitsOnStdinClose: true,
    });
  }, 30_000);

  test("log-payload: stores a hook payload verbatim and stays silent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shibaox-mem-test-"));
    try {
      const payload = '{"hook_event_name":"Stop","last_assistant_message":"feito — olá"}';
      const r = await runCliWithInput(payload, "__spike", "log-payload", dir, "Stop");
      expect(r.exitCode).toBe(0);
      // Anything a hook prints may be read by the host as context or as JSON.
      expect(r.stdout).toBe("");
      expect(r.stderr).toBe("");
      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toEndWith("-Stop.json");
      expect(readFileSync(join(dir, files[0] as string), "utf8")).toBe(payload);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unknown spike is a usage error, never exit code 2", async () => {
    const r = await spike("nope");
    expect(r.exitCode).not.toBe(0);
    expect(r.exitCode).not.toBe(2);
  });
});
