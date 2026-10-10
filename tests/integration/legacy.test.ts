import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyLegacyEnv, migrateLegacyData } from "../../src/util/legacy.ts";
import { runCliWith } from "../helpers/cli.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wizardingcode-mem-legacy-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A 0.3.0 install: its data directory, its settings and a database with one row in its WAL. */
function legacyInstall(dir = join(home, ".shibaox", "mem"), env = "") {
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "ui.json"), "{}");
  if (env !== "") writeFileSync(join(dir, "env"), env, { mode: 0o600 });
  const db = new Database(join(dir, "shibaox-mem.db"));
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA wal_autocheckpoint = 0");
  db.run("CREATE TABLE t (v TEXT)");
  db.run("INSERT INTO t VALUES ('kept')");
  return { dir, db };
}

const rows = (path: string) => {
  const db = new Database(path, { readonly: true });
  try {
    return db.query<{ v: string }, []>("SELECT v FROM t").all();
  } finally {
    db.close();
  }
};

describe("applyLegacyEnv", () => {
  test("an old variable stands in for the new one when the new one is unset", () => {
    const env: Record<string, string | undefined> = {
      SHIBAOX_MEM_TYPESAFE: "off",
      SHIBAOX_HOME: "/srv/old",
      SHIBAOX_MEM_RETENTION_DAYS: "30",
      WIZARDINGCODE_MEM_RETENTION_DAYS: "90",
    };
    expect(applyLegacyEnv(env)).toEqual(["SHIBAOX_HOME", "SHIBAOX_MEM_TYPESAFE"]);
    expect(env.WIZARDINGCODE_MEM_TYPESAFE).toBe("off");
    expect(env.WIZARDINGCODE_HOME).toBe("/srv/old");
    expect(env.WIZARDINGCODE_MEM_RETENTION_DAYS).toBe("90");
  });

  test("an empty old variable is no variable", () => {
    const env: Record<string, string | undefined> = { SHIBAOX_MEM_DISTILL: "" };
    expect(applyLegacyEnv(env)).toEqual([]);
    expect(env.WIZARDINGCODE_MEM_DISTILL).toBeUndefined();
  });
});

describe("migrateLegacyData", () => {
  test("nothing to do on a fresh machine", () => {
    expect(migrateLegacyData({ env: {}, home })).toBe("none");
    expect(existsSync(join(home, ".wizardingcode"))).toBe(false);
  });

  test("moves the 0.3.0 directory, renames the database and keeps what was in its WAL", () => {
    const { db } = legacyInstall(undefined, "SHIBAOX_MEM_TYPESAFE=off\nTYPESAFE_API_KEY=k\n");
    expect(migrateLegacyData({ env: {}, home })).toBe("migrated");
    db.close();
    const target = join(home, ".wizardingcode", "mem");
    expect(existsSync(join(home, ".shibaox", "mem"))).toBe(false);
    expect(existsSync(join(target, "ui.json"))).toBe(true);
    expect(existsSync(join(target, "shibaox-mem.db"))).toBe(false);
    expect(rows(join(target, "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
    expect(readFileSync(join(target, "env"), "utf8")).toBe(
      "WIZARDINGCODE_MEM_TYPESAFE=off\nTYPESAFE_API_KEY=k\n",
    );
    if (process.platform !== "win32")
      expect(statSync(join(target, "env")).mode & 0o777).toBe(0o600);
  });

  test("runs once: a second call finds nothing to do", () => {
    legacyInstall().db.close();
    expect(migrateLegacyData({ env: {}, home })).toBe("migrated");
    expect(migrateLegacyData({ env: {}, home })).toBe("none");
  });

  test("never touches a directory the new version already uses", () => {
    legacyInstall().db.close();
    const target = join(home, ".wizardingcode", "mem");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "wizardingcode-mem.db"), "");
    expect(migrateLegacyData({ env: {}, home })).toBe("none");
    expect(existsSync(join(home, ".shibaox", "mem", "shibaox-mem.db"))).toBe(true);
  });

  test("the new plugin fetched its binary first: the old data still comes over", () => {
    legacyInstall(undefined, "SHIBAOX_MEM_TYPESAFE=off\n").db.close();
    const target = join(home, ".wizardingcode", "mem");
    mkdirSync(join(target, "bin"), { recursive: true });
    writeFileSync(join(target, "bin", "wizardingcode-mem"), "new");
    expect(migrateLegacyData({ env: {}, home })).toBe("migrated");
    expect(rows(join(target, "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
    expect(readFileSync(join(target, "bin", "wizardingcode-mem"), "utf8")).toBe("new");
    expect(readFileSync(join(target, "env"), "utf8")).toBe("WIZARDINGCODE_MEM_TYPESAFE=off\n");
    expect(existsSync(join(target, "ui.json"))).toBe(true);
  });

  test("the same, when the old directory cannot be moved", () => {
    legacyInstall().db.close();
    const target = join(home, ".wizardingcode", "mem");
    mkdirSync(join(target, "bin"), { recursive: true });
    const result = migrateLegacyData({
      env: {},
      home,
      rename: () => {
        throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
      },
    });
    expect(result).toBe("migrated");
    expect(rows(join(target, "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
    expect(existsSync(join(target, "shibaox-mem.db"))).toBe(false);
  });

  test("follows an old SHIBAOX_HOME", () => {
    const old = join(home, "elsewhere");
    legacyInstall(join(old, "mem")).db.close();
    const env: Record<string, string | undefined> = { SHIBAOX_HOME: old };
    applyLegacyEnv(env);
    // The brand's home stays where the user put it: only the database changes name.
    expect(migrateLegacyData({ env, home })).toBe("migrated");
    expect(rows(join(old, "mem", "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
  });

  test("renames the database where the store was moved to", () => {
    const store = join(home, "nas");
    legacyInstall(store).db.close();
    legacyInstall(undefined, `SHIBAOX_MEM_STORE_DIR=${store}\n`).db.close();
    rmSync(join(home, ".shibaox", "mem", "shibaox-mem.db"));
    expect(migrateLegacyData({ env: {}, home })).toBe("migrated");
    expect(rows(join(store, "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
    expect(existsSync(join(store, "shibaox-mem.db"))).toBe(false);
  });

  test("another process migrating: says so instead of starting an empty memory", () => {
    legacyInstall().db.close();
    mkdirSync(join(home, ".wizardingcode"), { recursive: true });
    writeFileSync(join(home, ".wizardingcode", "mem.migrating"), "");
    expect(migrateLegacyData({ env: {}, home })).toBe("busy");
    expect(existsSync(join(home, ".wizardingcode", "mem"))).toBe(false);
  });

  test("a lock left by a process that died long ago is taken over", () => {
    legacyInstall().db.close();
    mkdirSync(join(home, ".wizardingcode"), { recursive: true });
    const lock = join(home, ".wizardingcode", "mem.migrating");
    writeFileSync(lock, "");
    const old = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(lock, old, old);
    expect(migrateLegacyData({ env: {}, home })).toBe("migrated");
    expect(existsSync(lock)).toBe(false);
  });

  test("copies instead when the directory cannot be moved, and leaves the old one", () => {
    legacyInstall().db.close();
    const result = migrateLegacyData({
      env: {},
      home,
      rename: () => {
        throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
      },
    });
    expect(result).toBe("migrated");
    const target = join(home, ".wizardingcode", "mem");
    expect(rows(join(target, "wizardingcode-mem.db"))).toEqual([{ v: "kept" }]);
    expect(existsSync(join(target, "ui.json"))).toBe(true);
    expect(existsSync(join(home, ".shibaox", "mem", "shibaox-mem.db"))).toBe(true);
  });

  test("an explicit data directory is the user's choice: no directory move", () => {
    legacyInstall().db.close();
    const mine = join(home, "mine");
    expect(migrateLegacyData({ env: { WIZARDINGCODE_MEM_DATA_DIR: mine }, home })).toBe("none");
    expect(existsSync(join(home, ".shibaox", "mem"))).toBe(true);
  });
});

describe("the CLI takes a 0.3.0 install over before any command", () => {
  const cli = (...args: string[]) =>
    runCliWith(
      {
        input: readFileSync(
          new URL("../fixtures/claude-code/payloads/session-start.startup.json", import.meta.url),
          "utf8",
        ),
        env: {
          HOME: home,
          USERPROFILE: home,
          WIZARDINGCODE_MEM_MIGRATE: "on",
          WIZARDINGCODE_MEM_DATA_DIR: "",
          WIZARDINGCODE_HOME: "",
          WIZARDINGCODE_MEM_DISTILL: "off",
        },
      },
      ...args,
    );

  test("status reads the memory that 0.3.0 left", async () => {
    legacyInstall().db.close();
    const result = await cli("status");
    expect(result.stderr).not.toContain("could not");
    expect(existsSync(join(home, ".wizardingcode", "mem", "wizardingcode-mem.db"))).toBe(true);
    expect(existsSync(join(home, ".shibaox", "mem"))).toBe(false);
  });

  test("a hook that meets a migration in progress stays silent and creates nothing", async () => {
    legacyInstall().db.close();
    mkdirSync(join(home, ".wizardingcode"), { recursive: true });
    writeFileSync(join(home, ".wizardingcode", "mem.migrating"), "");
    expect(await cli("hook", "claude-code", "session-start")).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    expect(existsSync(join(home, ".wizardingcode", "mem"))).toBe(false);
  });
});
