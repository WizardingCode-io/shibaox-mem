import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseEnvFile,
  readEnvFile,
  renderEnvFile,
  writeEnvFile,
} from "../../src/settings/env-file.ts";

const SAMPLE = [
  "# wizardingcode-mem settings",
  "TYPESAFE_API_KEY=sk-live-abc",
  "",
  "export WIZARDINGCODE_MEM_RETENTION_DAYS = 30",
  'WIZARDINGCODE_MEM_STORE_DIR="C:\\Users\\ana\\mem"',
  "WIZARDINGCODE_MEM_BACKUP_TO='\\\\nas\\share\\mem'",
  "SOMETHING_ELSE=kept as is",
  "not a setting at all",
].join("\n");

describe("env file parsing", () => {
  test("reads KEY=value lines, with or without export and quotes", () => {
    expect(parseEnvFile(SAMPLE)).toEqual({
      TYPESAFE_API_KEY: "sk-live-abc",
      WIZARDINGCODE_MEM_RETENTION_DAYS: "30",
      WIZARDINGCODE_MEM_STORE_DIR: "C:\\Users\\ana\\mem",
      WIZARDINGCODE_MEM_BACKUP_TO: "\\\\nas\\share\\mem",
      SOMETHING_ELSE: "kept as is",
    });
  });

  test("the last of two lines with the same key wins", () => {
    expect(parseEnvFile("A=1\nA=2\n")).toEqual({ A: "2" });
  });

  test("a value may contain = and #", () => {
    expect(parseEnvFile("A=x=y#z")).toEqual({ A: "x=y#z" });
  });

  test("an empty value is an unset key", () => {
    expect(parseEnvFile("A=\nB=  \nC=''")).toEqual({});
  });

  test("a missing file reads as nothing", () => {
    expect(readEnvFile(join(tmpdir(), "wizardingcode-mem-no-such-dir", "env"))).toEqual({});
  });
});

describe("env file rendering", () => {
  test("replaces a key in place and keeps every other line, comments and order", () => {
    const out = renderEnvFile(SAMPLE, { WIZARDINGCODE_MEM_RETENTION_DAYS: "45" });
    expect(out.split("\n")).toEqual([
      "# wizardingcode-mem settings",
      "TYPESAFE_API_KEY=sk-live-abc",
      "",
      "WIZARDINGCODE_MEM_RETENTION_DAYS=45",
      'WIZARDINGCODE_MEM_STORE_DIR="C:\\Users\\ana\\mem"',
      "WIZARDINGCODE_MEM_BACKUP_TO='\\\\nas\\share\\mem'",
      "SOMETHING_ELSE=kept as is",
      "not a setting at all",
      "",
    ]);
  });

  test("appends a new key at the end, on its own line", () => {
    expect(renderEnvFile("A=1", { B: "2" })).toBe("A=1\nB=2\n");
    expect(renderEnvFile("", { B: "2" })).toBe("B=2\n");
  });

  test("null removes the key's line", () => {
    expect(renderEnvFile("A=1\nB=2\nC=3\n", { B: null })).toBe("A=1\nC=3\n");
    expect(renderEnvFile("A=1\n", { B: null })).toBe("A=1\n");
  });

  test("writes values raw, so backslashes survive a round trip", () => {
    const out = renderEnvFile("", { P: "C:\\Users\\ana", U: "\\\\nas\\share" });
    expect(parseEnvFile(out)).toEqual({ P: "C:\\Users\\ana", U: "\\\\nas\\share" });
  });

  test("a duplicate key is replaced once and the stale copy dropped", () => {
    expect(renderEnvFile("A=1\nA=2\n", { A: "3" })).toBe("A=3\n");
  });
});

describe("env file writing", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "wizardingcode-mem-env-"));

  test("creates the file and the directory, readable by the owner only", () => {
    const path = join(dir(), "data", "env");
    writeEnvFile(path, { TYPESAFE_API_KEY: "sk-test" });
    expect(readEnvFile(path)).toEqual({ TYPESAFE_API_KEY: "sk-test" });
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(path, "..")).mode & 0o777).toBe(0o700);
    }
  });

  test("keeps the lines it was not asked to change", () => {
    const path = join(dir(), "env");
    writeFileSync(path, "# mine\nTYPESAFE_API_KEY=sk-test\nOTHER=1\n");
    writeEnvFile(path, { WIZARDINGCODE_MEM_RETENTION_DAYS: "60", OTHER: null });
    expect(readFileSync(path, "utf8")).toBe(
      "# mine\nTYPESAFE_API_KEY=sk-test\nWIZARDINGCODE_MEM_RETENTION_DAYS=60\n",
    );
  });

  test("leaves no temporary file behind", () => {
    const base = dir();
    const path = join(base, "env");
    writeEnvFile(path, { A: "1" });
    writeEnvFile(path, { A: "2" });
    expect(readdirSync(base)).toEqual(["env"]);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });
});
