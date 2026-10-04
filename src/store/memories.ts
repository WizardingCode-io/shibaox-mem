import type { Redacted } from "../core/redact.ts";
import type { MemoryKind } from "../core/types.ts";
import { anyOf, tokens } from "../util/words.ts";
import type { Db } from "./db.ts";

export interface NewMemory {
  projectId: number;
  kind: MemoryKind;
  title: string;
  body: Redacted;
  /** Search-only words: file paths and the parts of identifiers. */
  terms: string;
  importance: number;
  branch: string | null;
  commit: string | null;
  origin: "distilled" | "manual" | "imported";
  judge: string;
  judgeVersion: string;
  sourceTurnId: number | null;
  files: { path: string; role: "changed" | "read" }[];
  now: number;
}

/**
 * Stores a memory with its file anchors. Storing the memory of a turn that already
 * has one changes nothing and returns the existing id.
 */
export function insertMemory(db: Db, memory: NewMemory): number {
  const inserted = db
    .query<{ id: number }, (string | number | null)[]>(
      `INSERT INTO memories (project_id, kind, title, body, terms, importance, branch, commit_sha,
                             origin, judge, judge_version, source_turn_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_turn_id, source_ordinal) DO NOTHING
       RETURNING id`,
    )
    .get(
      memory.projectId,
      memory.kind,
      memory.title,
      memory.body,
      memory.terms,
      memory.importance,
      memory.branch,
      memory.commit,
      memory.origin,
      memory.judge,
      memory.judgeVersion,
      memory.sourceTurnId,
      memory.now,
      memory.now,
    );
  if (inserted === null) {
    const existing = db
      .query<{ id: number }, [number | null]>(
        "SELECT id FROM memories WHERE source_turn_id = ? AND source_ordinal = 0",
      )
      .get(memory.sourceTurnId);
    if (existing === null) throw new Error("memory insert returned no row");
    return existing.id;
  }

  for (const file of memory.files) {
    // A file both read and changed is recorded once, as changed.
    db.run(
      `INSERT INTO memory_files (memory_id, path, role) VALUES (?, ?, ?)
       ON CONFLICT (memory_id, path) DO UPDATE SET role = 'changed' WHERE excluded.role = 'changed'`,
      [inserted.id, file.path, file.role],
    );
  }
  if (memory.sourceTurnId !== null) {
    db.run("INSERT INTO memory_sources (memory_id, turn_id, relation) VALUES (?, ?, 'origin')", [
      inserted.id,
      memory.sourceTurnId,
    ]);
  }
  return inserted.id;
}

/** Another turn taught the same thing. Counted once per turn, however often it is replayed. */
export function reinforce(db: Db, memoryId: number, turnId: number, now: number): void {
  const added = db.run(
    "INSERT OR IGNORE INTO memory_sources (memory_id, turn_id, relation) VALUES (?, ?, 'duplicate')",
    [memoryId, turnId],
  ).changes;
  if (added > 0) {
    db.run("UPDATE memories SET evidence_count = evidence_count + 1, updated_at = ? WHERE id = ?", [
      now,
      memoryId,
    ]);
  }
}

/** Keeps the old memory, for history, but takes it out of circulation. */
export function supersede(db: Db, oldId: number, newId: number, now: number): void {
  db.run(
    "UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ? AND status = 'active'",
    [newId, now, oldId],
  );
}

export interface Neighbour {
  id: number;
  title: string;
  body: Redacted;
  files: string[];
}

const NEIGHBOUR_QUERY_TERMS = 24;

/** Active memories of the project that share words with `text`, nearest first. */
export function findNeighbours(
  db: Db,
  projectId: number,
  text: string,
  limit: number,
): Neighbour[] {
  const terms = [...tokens(text)].slice(0, NEIGHBOUR_QUERY_TERMS);
  if (terms.length === 0) return [];
  const rows = db
    .query<{ id: number; title: string; body: string }, [string, number, number]>(
      `SELECT m.id, m.title, m.body
         FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
        WHERE memories_fts MATCH ? AND m.project_id = ? AND m.status = 'active'
        ORDER BY bm25(memories_fts, 4.0, 1.0, 2.0)
        LIMIT ?`,
    )
    .all(anyOf(terms), projectId, limit);
  const files = db.query<{ path: string }, [number]>(
    "SELECT path FROM memory_files WHERE memory_id = ? ORDER BY path",
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body as Redacted,
    files: files.all(row.id).map((file) => file.path),
  }));
}
