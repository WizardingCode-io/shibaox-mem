import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Db, withWrite } from "../store/db.ts";

/**
 * Marks the memories whose changed files all no longer exist, and clears the mark on
 * those whose files are back. Run after distilling, never in a hook: it touches the disk.
 *
 * Only disappearance is detected. A file that changed is not evidence that what was
 * said about it stopped being true.
 */
export function refreshStaleness(db: Db, projectId: number): void {
  const roots = db
    .query<{ alias: string }, [number]>(
      "SELECT alias FROM project_aliases WHERE project_id = ? AND alias LIKE 'path:%'",
    )
    .all(projectId)
    .map((row) => row.alias.slice("path:".length))
    .filter((root) => existsSync(root));
  // With no working tree on this machine there is nothing to check against.
  if (roots.length === 0) return;

  const anchors = db
    .query<{ id: number; stale: number; path: string }, [number]>(
      `SELECT m.id, m.stale, f.path FROM memories m JOIN memory_files f ON f.memory_id = m.id
        WHERE m.project_id = ? AND m.status = 'active' AND f.role = 'changed'`,
    )
    .all(projectId);

  const anyExists = new Map<number, boolean>();
  const current = new Map<number, number>();
  for (const anchor of anchors) {
    current.set(anchor.id, anchor.stale);
    const exists = roots.some((root) => existsSync(join(root, anchor.path)));
    anyExists.set(anchor.id, (anyExists.get(anchor.id) ?? false) || exists);
  }

  const changes = [...anyExists].filter(([id, exists]) => (exists ? 0 : 1) !== current.get(id));
  if (changes.length === 0) return;
  withWrite(db, () => {
    for (const [id, exists] of changes) {
      db.run("UPDATE memories SET stale = ? WHERE id = ?", [exists ? 0 : 1, id]);
    }
  });
}
