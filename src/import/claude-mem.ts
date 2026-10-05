import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { type Redacted, redact } from "../core/redact.ts";
import type { MemoryKind } from "../core/types.ts";
import { TITLE_MAX_CHARS } from "../distill/policy.ts";
import { type Db, withWrite } from "../store/db.ts";
import { insertMemory } from "../store/memories.ts";
import { getMeta, setMeta } from "../store/meta.ts";
import { clip } from "../util/text.ts";
import { searchTerms } from "../util/words.ts";

// Imports the user's own claude-mem memories. The source database is theirs: it is
// opened read-only and nothing in it is ever changed. Only the columns read here are
// relied on; the import is data interoperability, not code reuse (see CLEAN-ROOM.md).

export interface ImportOptions {
  sourcePath: string;
  now: number;
  onBatch?: (done: number) => void;
}

export interface ImportReport {
  /** Observations looked at this run; earlier runs are not repeated. */
  scanned: number;
  imported: number;
  skipped: { duplicate: number; sensitive: number; empty: number };
  /** Memories imported per source project, this run. */
  projects: Record<string, number>;
}

/** Where a run stopped, so the next one carries on from there. */
const WATERMARK = "import.claude-mem.lastId";
const BATCH = 500;
const BODY_MAX_CHARS = 2000;
const MAX_FACTS = 12;
const MAX_FILES = 20;
const MAX_PATH_CHARS = 300;

/** Observation types that are not knowledge, or must not leave the source. */
const SKIPPED_TYPES = new Set(["sensitive", "task-boundary"]);

const KINDS: Record<string, { kind: MemoryKind; importance: number }> = {
  bugfix: { kind: "fix", importance: 2 },
  feature: { kind: "change", importance: 2 },
  change: { kind: "change", importance: 2 },
  refactor: { kind: "change", importance: 2 },
  discovery: { kind: "discovery", importance: 2 },
  decision: { kind: "decision", importance: 3 },
  gotcha: { kind: "gotcha", importance: 3 },
  security_alert: { kind: "gotcha", importance: 4 },
  security_note: { kind: "gotcha", importance: 4 },
  pattern: { kind: "convention", importance: 3 },
};
const DEFAULT_KIND = { kind: "discovery" as MemoryKind, importance: 2 };

interface SourceRow {
  id: number;
  project: string;
  type: string;
  title: string | null;
  facts: string | null;
  narrative: string | null;
  files_read: string | null;
  files_modified: string | null;
  created_at_epoch: number | null;
}

function strings(json: string | null): string[] {
  if (json === null || json === "") return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

/** Project-relative paths only. Anything else is not an anchor. */
function paths(json: string | null): string[] {
  const kept = new Set<string>();
  for (const raw of strings(json)) {
    const path = raw
      .trim()
      .replaceAll("\\", "/")
      .replace(/^(?:\.\/)+/, "");
    if (path === "" || path.length > MAX_PATH_CHARS) continue;
    if (path.startsWith("/") || path.startsWith("../") || /^[A-Za-z]:\//.test(path)) continue;
    if (redact(path) !== path) continue;
    kept.add(path);
  }
  return [...kept].slice(0, MAX_FILES);
}

/** The id of the project an imported memory belongs to, created on first sight. */
function importedProject(db: Db, name: string, now: number, cache: Map<string, number>): number {
  const known = cache.get(name);
  if (known !== undefined) return known;
  const alias = `imported:${name}`;
  let id = db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE alias = ?",
    )
    .get(alias)?.project_id;
  if (id === undefined) {
    id = db
      .query<{ id: number }, [string, string, number]>(
        "INSERT INTO projects (key, name, created_at) VALUES (?, ?, ?) RETURNING id",
      )
      .get(alias, name, now)?.id as number;
    db.run("INSERT INTO project_aliases (alias, project_id) VALUES (?, ?)", [alias, id]);
  }
  cache.set(name, id);
  return id;
}

export function importClaudeMem(db: Db, options: ImportOptions): ImportReport {
  if (!existsSync(options.sourcePath)) {
    throw new Error(`no claude-mem database at ${options.sourcePath}`);
  }
  const source = new Database(options.sourcePath, { readonly: true });
  const report: ImportReport = {
    scanned: 0,
    imported: 0,
    skipped: { duplicate: 0, sensitive: 0, empty: 0 },
    projects: {},
  };
  try {
    const page = source.query<SourceRow, [number, number]>(
      `SELECT id, COALESCE(merged_into_project, project) AS project, type, title, facts, narrative,
              files_read, files_modified, created_at_epoch
         FROM observations WHERE id > ? ORDER BY id LIMIT ?`,
    );
    // What is already there, as hashes: a lookup by title and body has no index and
    // would scan the whole table once per observation (ten minutes for 90,000).
    const seen = new Set<string>();
    const fingerprint = (projectId: number, title: string, body: string) =>
      `${projectId}:${Bun.hash(`${title}\u0001${body}`)}`;
    for (const row of db
      .query<{ project_id: number; title: string; body: string }, []>(
        "SELECT project_id, title, body FROM memories WHERE origin = 'imported'",
      )
      .iterate()) {
      seen.add(fingerprint(row.project_id, row.title, row.body));
    }
    const projects = new Map<string, number>();
    let lastId = Number(getMeta(db, WATERMARK) ?? 0);

    for (;;) {
      const rows = page.all(lastId, BATCH);
      if (rows.length === 0) break;
      withWrite(db, () => {
        for (const row of rows) {
          report.scanned++;
          lastId = row.id;
          if (SKIPPED_TYPES.has(row.type)) {
            report.skipped.sensitive++;
            continue;
          }

          const facts = strings(row.facts)
            .slice(0, MAX_FACTS)
            .map((fact) => fact.replace(/\s+/g, " ").trim());
          const narrative = (row.narrative ?? "").replace(/\s+/g, " ").trim();
          let title = (row.title ?? "").replace(/\s+/g, " ").trim();
          let bodyLines = facts.length > 0 ? facts : narrative === "" ? [] : [narrative];
          if (title === "") {
            // No title: the first fact stands in for it.
            [title = "", ...bodyLines] = bodyLines;
          }
          if (title === "") {
            report.skipped.empty++;
            continue;
          }
          const redactedTitle = clip(redact(title), TITLE_MAX_CHARS, "…");
          const body = clip(redact(bodyLines.join("\n")), BODY_MAX_CHARS, "…") as Redacted;

          const projectId = importedProject(db, row.project, options.now, projects);
          const print = fingerprint(projectId, redactedTitle, body);
          if (seen.has(print)) {
            report.skipped.duplicate++;
            continue;
          }
          seen.add(print);

          const { kind, importance } = KINDS[row.type] ?? DEFAULT_KIND;
          const changed = paths(row.files_modified);
          const read = paths(row.files_read).filter((path) => !changed.includes(path));
          const files = [
            ...changed.map((path) => ({ path, role: "changed" as const })),
            ...read.map((path) => ({ path, role: "read" as const })),
          ];
          const when =
            row.created_at_epoch !== null && row.created_at_epoch > 0
              ? row.created_at_epoch
              : options.now;
          insertMemory(db, {
            projectId,
            kind,
            title: redactedTitle,
            body,
            terms: searchTerms(
              redactedTitle,
              body,
              files.map((file) => file.path),
            ),
            importance,
            branch: null,
            commit: null,
            origin: "imported",
            judge: "claude-mem",
            judgeVersion: "1",
            sourceTurnId: null,
            files,
            now: when,
          });
          report.imported++;
          report.projects[row.project] = (report.projects[row.project] ?? 0) + 1;
        }
        setMeta(db, WATERMARK, String(lastId));
      });
      options.onBatch?.(report.scanned);
    }
  } finally {
    source.close();
  }
  return report;
}
