// The settings file: `<data dir>/env`, one `KEY=value` per line, readable by its owner
// only. It is the same file users have written by hand since the TypeSafe key, so the
// format stays dotenv: `#` comments, blank lines and `export ` are fine, a pair of
// quotes around a value is dropped, and nothing else is interpreted — values are
// written raw, so Windows paths and UNC shares survive a round trip.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The file's name inside the data directory. */
export const ENV_FILE = "env";

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^(["'])(.*)\1$/, "$2");
}

function keyOf(line: string): string | null {
  return LINE.exec(line)?.[1] ?? null;
}

/** The keys set in the text; a later line replaces an earlier one, an empty value is unset. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (!match) continue;
    const key = match[1] as string;
    const value = unquote(match[2] as string);
    if (value === "") delete out[key];
    else out[key] = value;
  }
  return out;
}

/** The file's settings; a missing or unreadable file is simply empty. */
export function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * The text with `changes` applied: a key already present is replaced where it stands
 * (and stale duplicates dropped), a new one is appended, `null` removes it. Every other
 * line is kept as it was.
 */
export function renderEnvFile(text: string, changes: Record<string, string | null>): string {
  const pending = new Map(Object.entries(changes));
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const out: string[] = [];
  for (const line of lines) {
    const key = keyOf(line);
    if (key === null || !(key in changes)) {
      out.push(line);
      continue;
    }
    const value = pending.get(key);
    pending.delete(key);
    if (value !== null && value !== undefined) out.push(`${key}=${value}`);
  }
  for (const [key, value] of pending) {
    if (value !== null) out.push(`${key}=${value}`);
  }
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}

/** Applies `changes` to the file on disk, atomically, creating it (0600) if needed. */
export function writeEnvFile(path: string, changes: Record<string, string | null>): void {
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // A new file.
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, renderEnvFile(current, changes), { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // Filesystems without permissions (exFAT, vfat) keep the file readable; nothing to do.
  }
  renameSync(tmp, path);
}
