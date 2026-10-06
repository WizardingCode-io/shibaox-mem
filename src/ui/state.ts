// Where the running viewer is: a small file in the data directory, readable by its
// owner only, so that a session starting later can show the viewer that is already
// there instead of starting another. A viewer that died leaves a stale file; a probe
// tells the two apart, so the file is never trusted on its own.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const UI_STATE_FILE = "ui.json";

export interface UiState {
  pid: number;
  origin: string;
  token: string;
  startedAt: number;
}

export function readUiState(dataDir: string): UiState | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, UI_STATE_FILE), "utf8")) as Partial<UiState>;
    return typeof parsed.pid === "number" &&
      typeof parsed.origin === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.startedAt === "number"
      ? { pid: parsed.pid, origin: parsed.origin, token: parsed.token, startedAt: parsed.startedAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * Records this viewer. `exclusive` refuses when a file is already there, so that two
 * viewers racing to start leave exactly one on record; the other one stands down.
 */
export function writeUiState(dataDir: string, state: UiState, exclusive = false): boolean {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(dataDir, UI_STATE_FILE), JSON.stringify(state), {
      mode: 0o600,
      flag: exclusive ? "wx" : "w",
    });
    return true;
  } catch (error) {
    if (exclusive && (error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** Removes the record, but only the given viewer's own. */
export function clearUiState(dataDir: string, pid?: number): void {
  if (pid !== undefined && readUiState(dataDir)?.pid !== pid) return;
  rmSync(join(dataDir, UI_STATE_FILE), { force: true });
}

/** True when a viewer answers at the recorded address with the recorded token. */
export async function probeUi(state: UiState, timeoutMs = 300): Promise<boolean> {
  try {
    const response = await fetch(`${state.origin}/api/ping`, {
      headers: { Authorization: `Bearer ${state.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Asks a live viewer to show itself; it decides whether a tab is already there. */
export async function askToOpen(state: UiState, timeoutMs = 2000): Promise<boolean> {
  try {
    const response = await fetch(`${state.origin}/api/open`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}
