import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { redact } from "../core/redact.ts";
import { defaultDataDir } from "./paths.ts";
import { clip } from "./text.ts";

export const LOG_MAX_BYTES = 1024 * 1024;
const MESSAGE_MAX_CHARS = 300;

/**
 * Appends one line to the local error log. Errors only, never payloads; one previous
 * generation is kept. Logging never fails its caller.
 */
export function logError(scope: string, error: unknown, dataDir: string = defaultDataDir()): void {
  try {
    const dir = join(dataDir, "logs");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, "ai-mem.log");
    if (existsSync(file) && statSync(file).size > LOG_MAX_BYTES) renameSync(file, `${file}.1`);

    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    const line = clip(redact(message.replace(/\s+/g, " ")), MESSAGE_MAX_CHARS, "…");
    appendFileSync(file, `${new Date().toISOString()} ${scope} ${name}: ${line}\n`, {
      mode: 0o600,
    });
  } catch {
    // Nowhere to write: there is nothing useful left to do.
  }
}
