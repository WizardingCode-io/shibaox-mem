export function isCompiled(): boolean {
  return Bun.main.includes("$bunfs") || Bun.main.includes("~BUN");
}

/** Command line that re-invokes this program, whether compiled or run from source. */
export function selfCommand(...args: string[]): string[] {
  return isCompiled() ? [process.execPath, ...args] : [process.execPath, Bun.main, ...args];
}

/**
 * Starts this program again as a background process and returns at once.
 * The child must not share stdio with the caller, or it would be tied to its lifetime.
 */
export function spawnDetached(...args: string[]): void {
  Bun.spawn(selfCommand(...args), {
    detached: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).unref();
}
