import { Database } from "bun:sqlite";
import { join } from "node:path";
import { percentile, round, type SpikeResult, selfCommand, withTempDir } from "./support.ts";

const WRITERS = 8;
const TRANSACTIONS_PER_WRITER = 200;
const READERS = 2;
const READS_PER_READER = 400;
const BUSY_TIMEOUT_MS = 2000;

interface WriterReport {
  busy: number;
  p99: number;
  max: number;
}

function open(path: string): Database {
  const db = new Database(path);
  // busy_timeout first: every later statement on this connection depends on it.
  db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.run("PRAGMA synchronous = NORMAL");
  return db;
}

export function walWriter(path: string, writer: number, transactions: number): WriterReport {
  const db = open(path);
  try {
    const insert = db.prepare("INSERT INTO events (writer, seq, at) VALUES (?, ?, ?)");
    const write = db.transaction((seq: number) => {
      insert.run(writer, seq, Date.now());
    });
    const samples: number[] = [];
    let busy = 0;
    for (let seq = 0; seq < transactions; seq++) {
      const started = performance.now();
      try {
        // IMMEDIATE takes the write lock up front, so busy_timeout applies.
        write.immediate(seq);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === "string" && code.startsWith("SQLITE_BUSY")) busy++;
        else throw error;
      }
      samples.push(performance.now() - started);
    }
    return { busy, p99: percentile(samples, 99), max: round(Math.max(...samples)) };
  } finally {
    db.close();
  }
}

export function walReader(path: string, reads: number): { reads: number } {
  const db = open(path);
  try {
    const count = db.query("SELECT count(*) AS n FROM events");
    for (let i = 0; i < reads; i++) count.get();
    return { reads };
  } finally {
    db.close();
  }
}

/** Several short-lived processes writing one database file at once: the hook workload. */
export function walSpike(): Promise<SpikeResult> {
  return withTempDir(async (dir) => {
    const path = join(dir, "wal.db");
    const setup = new Database(path, { create: true });
    setup.run("PRAGMA journal_mode = WAL");
    setup.run(
      "CREATE TABLE events (id INTEGER PRIMARY KEY, writer INTEGER NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL)",
    );
    setup.close();

    const spawn = (...args: string[]) => {
      const proc = Bun.spawn(selfCommand("__spike", ...args), {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      return Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]).then(([stdout, stderr, exitCode]) => ({ stdout, stderr, exitCode }));
    };

    const started = performance.now();
    const [writers, readers] = await Promise.all([
      Promise.all(
        Array.from({ length: WRITERS }, (_, id) =>
          spawn("wal-writer", path, String(id), String(TRANSACTIONS_PER_WRITER)),
        ),
      ),
      Promise.all(
        Array.from({ length: READERS }, () => spawn("wal-reader", path, String(READS_PER_READER))),
      ),
    ]);
    const elapsedMs = round(performance.now() - started);

    const failed = [...writers, ...readers].filter((child) => child.exitCode !== 0);
    const reports = writers
      .filter((child) => child.exitCode === 0)
      .map((child) => JSON.parse(child.stdout) as WriterReport);

    const check = new Database(path);
    const rows = check.query<{ n: number }, []>("SELECT count(*) AS n FROM events").get()?.n ?? 0;
    const integrity =
      check.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()
        ?.integrity_check ?? "unknown";
    check.close();

    const busyErrors = reports.reduce((sum, report) => sum + report.busy, 0);
    const expectedRows = WRITERS * TRANSACTIONS_PER_WRITER;
    return {
      spike: "wal",
      ok: failed.length === 0 && busyErrors === 0 && rows === expectedRows && integrity === "ok",
      writers: WRITERS,
      readers: READERS,
      transactionsPerWriter: TRANSACTIONS_PER_WRITER,
      busyTimeoutMs: BUSY_TIMEOUT_MS,
      rows,
      busyErrors,
      integrity,
      p99Ms: round(Math.max(0, ...reports.map((report) => report.p99))),
      maxMs: round(Math.max(0, ...reports.map((report) => report.max))),
      elapsedMs,
      failedChildren: failed.map((child) => child.stderr.trim().slice(0, 200)),
    };
  });
}
