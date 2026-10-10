import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../src/core/project.ts";
import { redact } from "../../src/core/redact.ts";
import { openDb } from "../../src/store/db.ts";
import { insertMemory } from "../../src/store/memories.ts";
import { runCliWith } from "../helpers/cli.ts";

let base: string;
let dataDir: string;
let project: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "wizardingcode-mem-tool-cli-")));
  dataDir = join(base, "data");
  project = join(base, "project");
  mkdirSync(project);
  const db = openDb({ dataDir, busyTimeoutMs: 2000 });
  const { id } = resolveProject(db, project, 1_700_000_000_000);
  insertMemory(db, {
    projectId: id,
    kind: "convention",
    title: "The request limit is five per minute.",
    body: redact("Raised from three after the outage.", { env: {} }),
    terms: "",
    importance: 3,
    branch: null,
    commit: null,
    origin: "manual",
    judge: "heuristic",
    judgeVersion: "1",
    sourceTurnId: null,
    files: [],
    now: 1_700_000_000_000,
  });
  db.close();
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const tool = (name: string, args: unknown, ...flags: string[]) =>
  runCliWith(
    { input: JSON.stringify(args), env: { WIZARDINGCODE_MEM_DATA_DIR: dataDir } },
    "tool",
    name,
    "--project",
    project,
    ...flags,
  );

describe("wizardingcode-mem tool", () => {
  test("memory_search answers like the MCP tool, for the project given", async () => {
    const result = await tool("memory_search", { query: "limit" });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("The request limit is five per minute.");
  });

  test("memory_get reads notes in full, and memory_save stores one", async () => {
    const saved = await tool("memory_save", {
      text: "Never deploy on Fridays. Support is thin at the weekend.",
      kind: "convention",
    });
    expect(saved.exitCode).toBe(0);
    expect(saved.stdout).toMatch(/saved/i);
    const got = await tool("memory_get", { ids: [1] });
    expect(got.stdout).toContain("Raised from three after the outage.");
  });

  test("arguments that do not fit the tool are a usage error that names the problem", async () => {
    const result = await tool("memory_get", { ids: "one" });
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain("ids");
  });

  test("an unknown tool, or no --project, is a usage error", async () => {
    expect((await tool("memory_forget", {})).exitCode).toBe(64);
    const noProject = await runCliWith(
      { input: "{}", env: { WIZARDINGCODE_MEM_DATA_DIR: dataDir } },
      "tool",
      "memory_search",
    );
    expect(noProject.exitCode).toBe(64);
    expect(noProject.stderr).toContain("--project");
  });
});
