import { closeSync, fstatSync, openSync, readSync } from "node:fs";

// Hosts keep their transcripts as JSON lines. None of them is a contract: everything
// built on these helpers skips what it does not recognise.

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The current turn is at the end of the file, so only the tail is read. */
export function readTail(path: string, maxBytes: number): string {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    const tail = buffer.toString("utf8");
    // A tail that starts mid-file starts mid-line: drop the fragment.
    return start === 0 ? tail : tail.slice(tail.indexOf("\n") + 1);
  } finally {
    closeSync(fd);
  }
}

export function parseLines(raw: string): Json[] {
  const lines: Json[] = [];
  for (const line of raw.split("\n")) {
    if (line === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isObject(parsed)) lines.push(parsed);
    } catch {
      // A line still being written, or not JSON at all.
    }
  }
  return lines;
}
