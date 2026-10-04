import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOG_MAX_BYTES, logError } from "../../src/util/log.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ai-mem-log-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const logFile = () => join(dir, "logs", "ai-mem.log");

describe("logError", () => {
  test("appends one line with a timestamp, the scope and the error", () => {
    logError("hook claude-code prompt", new TypeError("x is not a function"), dir);
    logError("distill", "a bare string", dir);
    const lines = readFileSync(logFile(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^\d{4}-\d\d-\d\dT[\d:.]+Z hook claude-code prompt TypeError: x is not a function$/,
    );
    expect(lines[1]).toEndWith("distill Error: a bare string");
  });

  test("keeps a message on one line, bounded, and free of secrets", () => {
    const token = ["ghp_", "0123456789abcdefghijklmnopqrstuvwxyzAB"].join("");
    logError("scope", new Error(`first\nsecond ${token} ${"z".repeat(2000)}`), dir);
    const log = readFileSync(logFile(), "utf8");
    expect(log.trim().split("\n")).toHaveLength(1);
    expect(log.length).toBeLessThan(500);
    expect(log).not.toContain(token);
  });

  test.skipIf(process.platform === "win32")("the log is readable only by its owner", () => {
    logError("scope", new Error("x"), dir);
    expect(statSync(logFile()).mode & 0o777).toBe(0o600);
  });

  test("a log that has grown too large is set aside, keeping one generation", () => {
    logError("scope", new Error("first"), dir);
    writeFileSync(logFile(), "x".repeat(LOG_MAX_BYTES + 1));
    logError("scope", new Error("after rotation"), dir);
    expect(statSync(`${logFile()}.1`).size).toBe(LOG_MAX_BYTES + 1);
    expect(readFileSync(logFile(), "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("never throws, even when nothing can be written", () => {
    const file = join(dir, "a-file");
    writeFileSync(file, "");
    expect(() => logError("scope", new Error("x"), file)).not.toThrow();
    expect(existsSync(join(file, "logs"))).toBe(false);
  });
});
