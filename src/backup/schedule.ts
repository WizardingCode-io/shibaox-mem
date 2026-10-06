// What the hooks need to know about backups: when the last one was, and whether the
// next is due. Kept apart from the work itself so that the hook path loads nothing else.
import type { Db } from "../store/db.ts";
import { getMeta } from "../store/meta.ts";

export const BACKUP_LAST = "backup.last";

export interface LastBackup {
  name: string;
  bytes: number;
  at: number;
  /** The target's label at the time. */
  label: string;
}

export function lastBackup(db: Db): LastBackup | null {
  const raw = getMeta(db, BACKUP_LAST);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastBackup>;
    return typeof parsed.name === "string" && typeof parsed.at === "number"
      ? { name: parsed.name, bytes: parsed.bytes ?? 0, at: parsed.at, label: parsed.label ?? "" }
      : null;
  } catch {
    return null;
  }
}

/** True when a scheduled backup should happen now; never when the schedule is off. */
export function backupDue(db: Db, everyHours: number, now: number): boolean {
  if (everyHours <= 0) return false;
  const last = lastBackup(db);
  return last === null || now - last.at >= everyHours * 3_600_000;
}
