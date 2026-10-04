const MAIN = new URL("../../src/cli/main.ts", import.meta.url).pathname;

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCli(...args: string[]): Promise<CliResult> {
  const proc = Bun.spawn([process.execPath, MAIN, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
