import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startUi, type UiServer } from "../../src/ui/server.ts";
import { readUiState, UI_STATE_FILE } from "../../src/ui/state.ts";
import { runCliWith } from "../helpers/cli.ts";

const MAIN = new URL("../../src/cli/main.ts", import.meta.url).pathname;

let base: string;
let dataDir: string;
let server: UiServer | undefined;
let opened: number;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-ui-cli-")));
  dataDir = join(base, "data");
  mkdirSync(dataDir, { recursive: true });
  opened = 0;
});
afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(base, { recursive: true, force: true });
});

describe("shibaox-mem ui --auto", () => {
  test("with a viewer already running, asks it to show itself and leaves, silently", async () => {
    server = await startUi({ dataDir, port: 0, open: false, openBrowser: () => void opened++ });
    const result = await runCliWith({ env: { SHIBAOX_MEM_DATA_DIR: dataDir } }, "ui", "--auto");
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(opened).toBe(1);
    // The running viewer is still the one on record.
    expect(readUiState(dataDir)?.pid).toBe(process.pid);
  });

  test("with a stale state file, starts a viewer of its own and records it", async () => {
    // A viewer that died: its port answers nobody.
    const dead = await startUi({ dataDir, port: 0, open: false });
    const { origin } = dead;
    await dead.stop();
    writeFileSync(
      join(dataDir, UI_STATE_FILE),
      JSON.stringify({ pid: 999_999, origin, token: "stale", startedAt: 0 }),
    );
    const proc = Bun.spawn([process.execPath, MAIN, "ui", "--auto"], {
      env: { ...process.env, SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_UI_BROWSER: "none" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      let state = readUiState(dataDir);
      for (let i = 0; i < 100 && state?.pid !== proc.pid; i++) {
        await Bun.sleep(50);
        state = readUiState(dataDir);
      }
      expect(state?.pid).toBe(proc.pid);
      expect(state?.origin).not.toBe(origin);
      const alive = await fetch(`${state?.origin}/api/ping`, {
        headers: { Authorization: `Bearer ${state?.token}` },
      });
      expect(alive.status).toBe(200);
    } finally {
      proc.kill();
      await proc.exited;
    }
    expect(await new Response(proc.stdout).text()).toBe("");
  }, 15_000);
});
