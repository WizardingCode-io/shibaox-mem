import { chmodSync, copyFileSync, mkdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Copies the binary to a stable place inside the data directory and returns that path.
 * Host configuration points there, so it keeps working when the download is deleted,
 * a version manager switches, or a plugin directory moves.
 */
export function stageBinary(source: string, dataDir: string): string {
  const dir = join(dataDir, "bin");
  const target = join(dir, process.platform === "win32" ? "ai-mem.exe" : "ai-mem");
  if (resolve(source) === resolve(target)) return target;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temporary = `${target}.new`;
  copyFileSync(source, temporary);
  chmodSync(temporary, 0o755);
  renameSync(temporary, target);
  return target;
}
