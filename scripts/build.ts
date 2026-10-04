import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Target {
  /** Bun cross-compilation target. */
  target: string;
  /** Release file name. */
  file: string;
}

// x64 Linux and Windows use the baseline runtime: the default one needs AVX2 and
// dies with "Illegal instruction" on older CPUs and some virtual machines.
export const TARGETS = [
  { target: "bun-darwin-arm64", file: "ai-mem-darwin-arm64" },
  { target: "bun-darwin-x64", file: "ai-mem-darwin-x64" },
  { target: "bun-linux-x64-baseline", file: "ai-mem-linux-x64" },
  { target: "bun-linux-arm64", file: "ai-mem-linux-arm64" },
  { target: "bun-windows-x64-baseline", file: "ai-mem-windows-x64.exe" },
] as const satisfies readonly Target[];

const ENTRY = "src/cli/main.ts";

export function buildArgs(
  target: Target,
  outDir: string,
  options: { bytecode: boolean },
): string[] {
  return [
    "build",
    "--compile",
    "--minify",
    ...(options.bytecode ? ["--bytecode"] : []),
    // A hook runs inside the user's project: never read that project's .env or bunfig.toml.
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    `--target=${target.target}`,
    `--outfile=${join(outDir, target.file)}`,
    ENTRY,
  ];
}

if (import.meta.main) {
  const outDir = "dist";
  const bytecode = !process.argv.includes("--no-bytecode");
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const selected = TARGETS.filter((target) => only === undefined || target.file.includes(only));
  mkdirSync(outDir, { recursive: true });

  let failed = false;
  for (const target of selected) {
    const proc = Bun.spawnSync([process.execPath, ...buildArgs(target, outDir, { bytecode })], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      failed = true;
      console.error(`✗ ${target.file}\n${proc.stderr.toString()}`);
      continue;
    }
    const megabytes = statSync(join(outDir, target.file)).size / (1024 * 1024);
    console.log(`✓ ${target.file}  ${megabytes.toFixed(1)} MB`);
  }
  process.exitCode = failed ? 1 : 0;
}
