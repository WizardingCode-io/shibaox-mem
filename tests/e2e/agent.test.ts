import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DB_FILE, openDb } from "../../src/store/db.ts";
import { hostBinary, runBinary } from "../helpers/binary.ts";

// The compiled binary, driven the way a host agent drives it: one short process per
// event, a JSON payload on stdin, whatever it prints taken as context.

let binary: string;
beforeAll(() => {
  binary = hostBinary();
}, 120_000);

let base: string;
let dataDir: string;
let project: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "wizardingcode-mem-e2e-")));
  dataDir = join(base, "data");
  project = join(base, "project");
  mkdirSync(project);
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const env = () => ({
  WIZARDINGCODE_MEM_DATA_DIR: dataDir,
  WIZARDINGCODE_MEM_DISTILL: "off",
  WIZARDINGCODE_MEM_UI_AUTO_OPEN: "off",
});

/** One agent session against the binary. Each call is one hook invocation. */
function agent(sessionId: string) {
  let prompts = 0;
  const hook = async (event: string, payload: Record<string, unknown>) => {
    const result = await runBinary(binary, ["hook", "claude-code", event], {
      input: JSON.stringify({ session_id: sessionId, cwd: project, ...payload }),
      env: env(),
    });
    // Whatever happens inside, a hook is a silent success to its host.
    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    return result.stdout === ""
      ? null
      : (JSON.parse(result.stdout).hookSpecificOutput.additionalContext as string);
  };
  let current = "";
  return {
    start: (source = "startup") => hook("session-start", { source }),
    prompt: (prompt: string) => {
      current = `${sessionId}-p${++prompts}`;
      return hook("prompt", { prompt_id: current, prompt });
    },
    answer: (text: string) =>
      hook("turn-end", { prompt_id: current, last_assistant_message: text }),
    end: () => hook("session-end", {}),
  };
}

const distill = () => runBinary(binary, ["distill"], { env: env() });

function rows<T>(sql: string): T[] {
  const db = new Database(join(dataDir, DB_FILE), { readonly: true });
  // A reader meeting a writer mid-checkpoint must wait, not fail.
  db.run("PRAGMA busy_timeout = 5000");
  try {
    return db.query<T, []>(sql).all();
  } finally {
    db.close();
  }
}

const POOL_FIX =
  "Fixed: the root cause was that `workerPool` never released its connection after a timeout. The pool in src/pool.ts now releases it in a finally block.";
const POOL_TITLE = "the root cause was that `workerPool` never released its connection";

describe("the compiled binary, driven as an agent drives it", () => {
  test("what one session learns, the next session is told", async () => {
    const first = agent("s1");
    expect(await first.start()).toBeNull();
    expect(await first.prompt("the server stops answering under load")).toBeNull();
    await first.answer(POOL_FIX);
    await first.end();
    expect((await distill()).stdout).toBe("distill: 1 claimed, 1 done, 0 skipped, 0 failed\n");

    const second = agent("s2");
    const brief = await second.start();
    expect(brief).toContain("Where things stood");
    expect(brief).toContain("the server stops answering under load");
    expect(brief).toContain(POOL_TITLE);
    // The brief names the note; its detail arrives when a prompt makes it relevant, once.
    expect(brief).not.toContain("Context: the server stops answering under load");
    const notes = await second.prompt("why does workerPool hold on to connections?");
    expect(notes).toContain(POOL_TITLE);
    expect(notes).toContain("Context: the server stops answering under load");
    expect(await second.prompt("so workerPool again?")).toBeNull();
    expect(await second.prompt("write a haiku about autumn leaves")).toBeNull();
  }, 60_000);

  test("a turn the user interrupted is still learned from", async () => {
    const session = agent("s1");
    await session.start();
    await session.prompt("Never commit directly to the main branch. Always open a pull request.");
    // No turn-end: the user pressed Ctrl+C. The session then ends.
    await session.end();
    expect(rows("SELECT state, completeness FROM turns")).toEqual([
      { state: "pending", completeness: "interrupted" },
    ]);
    await distill();
    expect(rows("SELECT kind, title FROM memories")).toEqual([
      { kind: "convention", title: "Never commit directly to the main branch." },
    ]);
  }, 60_000);

  test("after the context is compacted, what was shown before can be shown again", async () => {
    const earlier = agent("s0");
    await earlier.prompt("the server stops answering under load");
    await earlier.answer(POOL_FIX);
    await distill();

    const session = agent("s1");
    await session.start("resume");
    expect(await session.prompt("why does workerPool hold on to connections?")).toContain(
      POOL_TITLE,
    );
    expect(await session.prompt("and workerPool again?")).toBeNull();
    expect(await session.start("compact")).toContain(POOL_TITLE);
    expect(rows("SELECT event, context_epoch FROM injections ORDER BY id")).toEqual([
      { event: "prompt", context_epoch: 0 },
      { event: "session-start", context_epoch: 1 },
    ]);
  }, 60_000);

  test("two sessions working at once do not disturb each other", async () => {
    const a = agent("a");
    const b = agent("b");
    await Promise.all([a.start(), b.start()]);
    for (let round = 1; round <= 5; round++) {
      await Promise.all([
        a.prompt(`question ${round} from the first window`),
        b.prompt(`question ${round} from the second window`),
      ]);
      await Promise.all([a.answer(`answer ${round}`), b.answer(`answer ${round}`)]);
    }
    await Promise.all([a.end(), b.end()]);
    expect(
      rows(
        "SELECT s.agent_session_id AS session, count(*) AS turns, sum(t.state = 'pending') AS queued FROM turns t JOIN sessions s ON s.id = t.session_id GROUP BY s.id ORDER BY session",
      ),
    ).toEqual([
      { session: "a", turns: 5, queued: 5 },
      { session: "b", turns: 5, queued: 5 },
    ]);
    // On a loaded runner a hook may give up waiting for the other session's lock within
    // its budget (fail open); the counts above prove that cost nothing. Anything else did.
    const notOk = rows<{ outcome: string }>("SELECT outcome FROM hook_runs WHERE outcome <> 'ok'");
    expect(notOk.filter((r) => !/SQLITE_BUSY/.test(r.outcome))).toEqual([]);
  }, 60_000);

  test("work left half-done by a process that died is finished by the next one", async () => {
    const session = agent("s1");
    await session.prompt("the server stops answering under load");
    await session.answer(POOL_FIX);
    // What a distill killed mid-turn leaves behind: a claimed turn whose lease has run out.
    const db = openDb({ dataDir, busyTimeoutMs: 2000 });
    db.run(
      "UPDATE turns SET state = 'processing', attempts = 1, lease_owner = 'dead', lease_until = 1",
    );
    db.close();

    expect((await distill()).stdout).toBe("distill: 1 claimed, 1 done, 0 skipped, 0 failed\n");
    expect(rows("SELECT state, attempts FROM turns")).toEqual([{ state: "done", attempts: 2 }]);
    expect(rows("SELECT count(*) AS n FROM memories")).toEqual([{ n: 1 }]);
  }, 60_000);

  test("while another process holds the database, the agent is not held up", async () => {
    const session = agent("s1");
    await session.start();
    const db = openDb({ dataDir, busyTimeoutMs: 2000 });
    db.run("BEGIN IMMEDIATE");
    try {
      const started = performance.now();
      expect(await session.prompt("the server stops answering under load")).toBeNull();
      expect(performance.now() - started).toBeLessThan(1500);
    } finally {
      db.run("ROLLBACK");
      db.close();
    }
    // The next prompt, with the database free again, is captured normally.
    await session.prompt("and again");
    expect(rows("SELECT count(*) AS n FROM turns")).toEqual([{ n: 1 }]);
  }, 60_000);

  test.skipIf(process.platform === "win32")(
    "it leaves no process behind",
    async () => {
      const session = agent("s1");
      await session.start();
      await session.prompt("the server stops answering under load");
      const detached = await runBinary(binary, ["hook", "claude-code", "turn-end"], {
        input: JSON.stringify({
          session_id: "s1",
          cwd: project,
          prompt_id: "s1-p1",
          last_assistant_message: POOL_FIX,
        }),
        env: {
          WIZARDINGCODE_MEM_DATA_DIR: dataDir,
          WIZARDINGCODE_MEM_DISTILL: "",
          WIZARDINGCODE_MEM_UI_AUTO_OPEN: "off",
        },
      });
      expect(detached.exitCode).toBe(0);

      const deadline = Date.now() + 10_000;
      // By command line: the data directory is only in the environment, which pgrep cannot see.
      const running = () =>
        Bun.spawnSync(["pgrep", "-f", `${binary} distill`], { stdout: "pipe" })
          .stdout.toString()
          .trim();
      const distilled = () =>
        rows<{ state: string }>("SELECT state FROM turns")[0]?.state === "done";
      while (Date.now() < deadline && !(distilled() && running() === "")) await Bun.sleep(50);
      expect(distilled()).toBe(true);
      expect(running()).toBe("");
    },
    60_000,
  );
});

describe("the compiled binary's viewer", () => {
  test("serves the page and the brand fonts from inside the binary, then stops on request", async () => {
    openDb({ dataDir, busyTimeoutMs: 2000 }).close();
    const proc = Bun.spawn([binary, "ui", "--no-open"], {
      env: { ...process.env, ...env() },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const reader = proc.stdout.getReader();
      let banner = "";
      while (!banner.includes("\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        banner += new TextDecoder().decode(value);
      }
      const url = /wizardingcode-mem ui: (\S+)/.exec(banner)?.[1];
      if (url === undefined) throw new Error(`no URL in: ${banner}`);
      const token = new URL(url).searchParams.get("token") ?? "";
      const page = await fetch(url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>wizardingcode-mem</title>");
      const font = await fetch(
        `${new URL(url).origin}/assets/geist-sans-latin-400-normal.woff2?token=${token}`,
      );
      expect(font.status).toBe(200);
      expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
      const overview = await fetch(`${new URL(url).origin}/api/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(((await overview.json()) as { dataDir: string }).dataDir).toBe(dataDir);
    } finally {
      proc.kill("SIGINT");
      await proc.exited;
    }
  });
});
