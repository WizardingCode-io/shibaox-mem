import { describe, expect, test } from "bun:test";
import pkg from "../../package.json" with { type: "json" };
import { runCli } from "../helpers/cli.ts";

describe("cli", () => {
  test("--version prints the package version", async () => {
    const r = await runCli("--version");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  test("no arguments prints usage", async () => {
    const r = await runCli();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage: wizardingcode-mem");
  });

  test("an unknown command fails, but never with exit code 2", async () => {
    const r = await runCli("definitely-not-a-command");
    expect(r.exitCode).not.toBe(0);
    expect(r.exitCode).not.toBe(2);
    expect(r.stderr).toContain("unknown command");
    expect(r.stdout).toBe("");
  });
});
