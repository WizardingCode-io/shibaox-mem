import type { ProjectRef } from "../core/project.ts";
import { MEMORY_KINDS, type MemoryKind } from "../core/types.ts";
import { explicitMatch } from "../retrieve/query.ts";
import { type Db, withWrite } from "../store/db.ts";
import { inProject } from "../util/words.ts";

// What the viewer reads and the little it may change, as plain functions over the
// database. The server turns these into HTTP; nothing here knows about requests.

export interface ProjectSummary {
  id: number;
  name: string;
  key: string;
  active: number;
  archived: number;
  superseded: number;
  stale: number;
  lastActivity: number | null;
}

export function listProjects(db: Db): ProjectSummary[] {
  return db
    .query<ProjectSummary, []>(
      `SELECT p.id, p.name, p.key,
              (SELECT count(*) FROM memories m WHERE m.project_id = p.id AND m.status = 'active') AS active,
              (SELECT count(*) FROM memories m WHERE m.project_id = p.id AND m.status = 'archived') AS archived,
              (SELECT count(*) FROM memories m WHERE m.project_id = p.id AND m.status = 'superseded') AS superseded,
              (SELECT count(*) FROM memories m WHERE m.project_id = p.id AND m.status = 'active' AND m.stale = 1) AS stale,
              (SELECT max(x) FROM (SELECT max(last_seen_at) AS x FROM sessions s WHERE s.project_id = p.id
                                   UNION ALL SELECT max(updated_at) FROM memories m WHERE m.project_id = p.id)) AS lastActivity
         FROM projects p
        ORDER BY lastActivity DESC NULLS LAST, p.id`,
    )
    .all();
}

export interface MemoryItem {
  id: number;
  projectId: number;
  kind: MemoryKind;
  title: string;
  importance: number;
  status: string;
  stale: number;
  judge: string;
  origin: string;
  branch: string | null;
  useCount: number;
  createdAt: number;
  updatedAt: number;
  files: string[];
}

export interface MemoryDetail extends MemoryItem {
  body: string;
  judgeVersion: string;
  evidenceCount: number;
  supersededBy: number | null;
  fileRoles: { path: string; role: string }[];
  source: { agent: string; prompt: string; startedAt: number } | null;
}

const ITEM_COLUMNS = `m.id, m.project_id AS projectId, m.kind, m.title, m.importance, m.status, m.stale, m.judge, m.origin, m.branch,
  m.use_count AS useCount, m.created_at AS createdAt, m.updated_at AS updatedAt`;
const STATUSES = new Set(["active", "archived", "superseded", "all"]);
const MAX_LIMIT = 200;

type Row = Omit<MemoryItem, "files">;

function attachFiles(db: Db, rows: Row[]): MemoryItem[] {
  const files = db.query<{ path: string }, [number]>(
    "SELECT path FROM memory_files WHERE memory_id = ? AND role = 'changed' ORDER BY path",
  );
  return rows.map((row) => ({ ...row, files: files.all(row.id).map((f) => f.path) }));
}

export interface ListOptions {
  projectId: number;
  q?: string;
  kind?: string;
  status?: string;
  /** Only memories at least this important (1–5). */
  minImportance?: number;
  limit?: number;
  offset?: number;
}

/** A project's memories, newest first, or by relevance when there is a query. */
export function listMemories(db: Db, options: ListOptions): { total: number; items: MemoryItem[] } {
  const status =
    options.status !== undefined && STATUSES.has(options.status) ? options.status : "active";
  const kind: string | null =
    options.kind !== undefined && (MEMORY_KINDS as readonly string[]).includes(options.kind)
      ? options.kind
      : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const floor = Math.min(5, Math.max(1, Math.trunc(options.minImportance ?? 1)));
  const where = `m.project_id = ? AND (? = 'all' OR m.status = ?) AND (? IS NULL OR m.kind = ?) AND m.importance >= ?`;
  const params: (string | number | null)[] = [options.projectId, status, status, kind, kind, floor];

  const q = (options.q ?? "").trim();
  if (q !== "") {
    const words = explicitMatch(q);
    if (words === null) return { total: 0, items: [] };
    const match = inProject(words, options.projectId);
    const total =
      db
        .query<{ n: number }, (string | number | null)[]>(
          `SELECT count(*) AS n FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid
            WHERE memories_fts MATCH ? AND ${where}`,
        )
        .get(match, ...params)?.n ?? 0;
    const rows = db
      .query<Row, (string | number | null)[]>(
        `SELECT ${ITEM_COLUMNS} FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid
          WHERE memories_fts MATCH ? AND ${where}
          ORDER BY bm25(memories_fts, 4.0, 1.0, 2.0, 0.0) LIMIT ? OFFSET ?`,
      )
      .all(match, ...params, limit, offset);
    return { total, items: attachFiles(db, rows) };
  }

  const total =
    db
      .query<{ n: number }, (string | number | null)[]>(
        `SELECT count(*) AS n FROM memories m WHERE ${where}`,
      )
      .get(...params)?.n ?? 0;
  const rows = db
    .query<Row, (string | number | null)[]>(
      `SELECT ${ITEM_COLUMNS} FROM memories m WHERE ${where}
        ORDER BY m.updated_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);
  return { total, items: attachFiles(db, rows) };
}

export function getMemory(db: Db, id: number): MemoryDetail | null {
  const row = db
    .query<
      Row & {
        body: string;
        judgeVersion: string;
        evidenceCount: number;
        supersededBy: number | null;
        sourceTurnId: number | null;
      },
      [number]
    >(
      `SELECT ${ITEM_COLUMNS}, m.body, m.judge_version AS judgeVersion, m.evidence_count AS evidenceCount,
              m.superseded_by AS supersededBy, m.source_turn_id AS sourceTurnId
         FROM memories m WHERE m.id = ?`,
    )
    .get(id);
  if (row === null) return null;
  const fileRoles = db
    .query<{ path: string; role: string }, [number]>(
      "SELECT path, role FROM memory_files WHERE memory_id = ? ORDER BY role, path",
    )
    .all(id);
  const source =
    row.sourceTurnId === null
      ? null
      : db
          .query<{ agent: string; prompt: string; startedAt: number }, [number]>(
            `SELECT s.agent, substr(t.prompt, 1, 400) AS prompt, t.started_at AS startedAt
               FROM turns t JOIN sessions s ON s.id = t.session_id WHERE t.id = ?`,
          )
          .get(row.sourceTurnId);
  const { sourceTurnId: _turn, ...rest } = row;
  return {
    ...rest,
    files: fileRoles.filter((f) => f.role === "changed").map((f) => f.path),
    fileRoles,
    source,
  };
}

/** The one change the viewer may make: put a memory away, or bring it back. */
export function setMemoryStatus(
  db: Db,
  id: number,
  status: string,
  now: number,
): "ok" | "not-found" | "invalid" {
  if (status !== "active" && status !== "archived") return "invalid";
  let outcome: "ok" | "not-found" | "invalid" = "not-found";
  withWrite(db, () => {
    const current = db
      .query<{ status: string }, [number]>("SELECT status FROM memories WHERE id = ?")
      .get(id);
    if (current === null) return;
    // A superseded memory has a successor; it is history, not something to bring back.
    if (current.status === "superseded") {
      outcome = "invalid";
      return;
    }
    db.run("UPDATE memories SET status = ?, updated_at = ? WHERE id = ?", [status, now, id]);
    outcome = "ok";
  });
  return outcome;
}

export interface TurnItem {
  id: number;
  agent: string;
  state: string;
  completeness: string;
  prompt: string;
  startedAt: number;
  endedAt: number | null;
  lastError: string | null;
}

export function recentTurns(db: Db, projectId: number, limit = 50): TurnItem[] {
  return db
    .query<TurnItem, [number, number]>(
      `SELECT t.id, s.agent, t.state, t.completeness, substr(t.prompt, 1, 200) AS prompt,
              t.started_at AS startedAt, t.ended_at AS endedAt, t.last_error AS lastError
         FROM turns t JOIN sessions s ON s.id = t.session_id
        WHERE t.project_id = ? ORDER BY t.started_at DESC, t.id DESC LIMIT ?`,
    )
    .all(projectId, Math.min(MAX_LIMIT, Math.max(1, limit)));
}

/** A project as the status report wants it; the viewer has no working tree to inspect. */
export function projectRef(db: Db, id: number): ProjectRef | null {
  const row = db
    .query<{ id: number; key: string; name: string; disabled: number }, [number]>(
      "SELECT id, key, name, disabled FROM projects WHERE id = ?",
    )
    .get(id);
  if (row === null) return null;
  const root =
    db
      .query<{ alias: string }, [number]>(
        "SELECT alias FROM project_aliases WHERE project_id = ? AND alias LIKE 'path:%' LIMIT 1",
      )
      .get(id)
      ?.alias.slice("path:".length) ?? "";
  return { ...row, root, branch: null, commit: null, disabled: row.disabled === 1 };
}
