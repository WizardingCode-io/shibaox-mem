import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildArgs, TARGETS } from "../../scripts/build.ts";

const ROOT = new URL("../../", import.meta.url).pathname;

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  ms: number;
}

/**
 * Builds the release binary for this machine and returns its path. End-to-end tests
 * run what users run, not the source. AI_MEM_E2E_BINARY points at a prebuilt one.
 */
export function hostBinary(): string {
  const prebuilt = process.env.AI_MEM_E2E_BINARY;
  if (prebuilt !== undefined && prebuilt !== "") return prebuilt;

  const os = process.platform === "win32" ? "windows" : process.platform;
  const target = TARGETS.find((candidate) => candidate.file.includes(`${os}-${process.arch}`));
  if (target === undefined) throw new Error(`no build target for ${os}-${process.arch}`);

  const outDir = join(ROOT, "dist", "e2e");
  const proc = Bun.spawnSync([process.execPath, ...buildArgs(target, outDir, { bytecode: true })], {
    cwd: ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const binary = join(outDir, target.file);
  if (proc.exitCode !== 0 || !existsSync(binary)) {
    throw new Error(`building ${target.file} failed:\n${proc.stderr.toString()}`);
  }
  return binary;
}

export async function runBinary(
  binary: string,
  args: string[],
  options: { input?: string; env?: Record<string, string>; cwd?: string } = {},
): Promise<RunResult> {
  const started = performance.now();
  const proc = Bun.spawn([binary, ...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...process.env, ...options.env },
    stdin: options.input === undefined ? "ignore" : new TextEncoder().encode(options.input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode, ms: performance.now() - started };
}
