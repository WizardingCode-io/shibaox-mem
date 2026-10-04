import { describe, expect, test } from "bun:test";
import { buildArgs, TARGETS, type Target } from "../../scripts/build.ts";

const targets: Target[] = [...TARGETS];

describe("build", () => {
  test("covers the five release platforms", () => {
    expect(TARGETS.map((target) => target.file).sort()).toEqual([
      "ai-mem-darwin-arm64",
      "ai-mem-darwin-x64",
      "ai-mem-linux-arm64",
      "ai-mem-linux-x64",
      "ai-mem-windows-x64.exe",
    ]);
  });

  // A hook runs inside the user's project: the binary must not absorb that project's secrets.
  test.each(targets)("$file never autoloads .env or bunfig.toml", (target) => {
    const args = buildArgs(target, "dist", { bytecode: true });
    expect(args).toContain("--no-compile-autoload-dotenv");
    expect(args).toContain("--no-compile-autoload-bunfig");
  });

  // A GUI-subsystem executable cannot print to an interactive console.
  test.each(targets)("$file stays a console application", (target) => {
    expect(buildArgs(target, "dist", { bytecode: true })).not.toContain("--windows-hide-console");
  });

  test("writes each binary into the output directory under its release name", () => {
    const [first] = TARGETS;
    const args = buildArgs(first, "out", { bytecode: false });
    expect(args).toContain(`--target=${first.target}`);
    expect(args).toContain(`--outfile=out/${first.file}`);
    expect(args).not.toContain("--bytecode");
  });
});
