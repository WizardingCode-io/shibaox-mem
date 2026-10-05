import { type Redacted, redact } from "../core/redact.ts";
import type { MemoryKind } from "../core/types.ts";
import { consolidate } from "../distill/consolidate.ts";
import { TITLE_MAX_CHARS } from "../distill/policy.ts";
import { splitSentences } from "../distill/segment.ts";
import { heuristicJudge } from "../judge/heuristic.ts";
import { MEMORY_COLUMNS, type MemoryRow, prior, ranks, toNote } from "../retrieve/notes.ts";
import { buildQuery, searchTokens } from "../retrieve/query.ts";
import { renderHeading, renderNote } from "../retrieve/render.ts";
import { type Db, withWrite } from "../store/db.ts";
import { insertMemory, supersede } from "../store/memories.ts";
import { clip } from "../util/text.ts";
import { anyOf, identifierParts } from "../util/words.ts";

// What the three MCP tools do, as plain functions over a database. The server in
// server.ts only adapts them to the protocol.

export interface ToolContext {
  db: Db;
  projectId: number;
  branch: string | null;
  now: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SEARCH_POOL = 50;
const MAX_IDS = 20;
const BODY_MAX_CHARS = 2000;
const MAX_FILES = 10;
const RRF_K = 60;

/**
 * Finds memories by words, symbols or file names and answers with one heading per
 * memory. Unlike injection, an explicit search asks for no evidence: one word is enough.
 */
export function searchMemories(
  context: ToolContext,
  args: { query: string; kind?: MemoryKind; limit?: number },
): string {
  const { db, projectId } = context;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(args.limit ?? DEFAULT_LIMIT)));
  const kind = args.kind ?? null;

  let rows: MemoryRow[];
  if (args.query.trim() === "") {
    rows = db
      .query<MemoryRow, [number, string | null, string | null, number]>(
        `SELECT ${MEMORY_COLUMNS} FROM memories m
          WHERE m.project_id = ? AND m.status = 'active' AND (? IS NULL OR m.kind = ?)
          ORDER BY m.importance DESC, m.updated_at DESC LIMIT ?`,
      )
      .all(projectId, kind, kind, SEARCH_POOL)
      .sort((a, b) => prior(b, context) - prior(a, context) || b.id - a.id);
  } else {
    const terms = searchTokens(args.query).filter((token) => token.length >= 2);
    const match = buildQuery(args.query)?.match ?? (terms.length > 0 ? anyOf(terms) : null);
    if (match === null) return "No memories match.";
    const found = db
      .query<MemoryRow & { bm25: number }, [string, number, string | null, string | null, number]>(
        `SELECT ${MEMORY_COLUMNS}, bm25(memories_fts, 4.0, 1.0, 2.0) AS bm25
           FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
          WHERE memories_fts MATCH ? AND m.project_id = ? AND m.status = 'active'
            AND (? IS NULL OR m.kind = ?)
          ORDER BY bm25 LIMIT ?`,
      )
      .all(match, projectId, kind, kind, SEARCH_POOL);
    const byText = ranks(found, (row) => -row.bm25);
    const byPrior = ranks(found, (row) => prior(row, context));
    const fused = (row: MemoryRow & { bm25: number }) =>
      1 / (RRF_K + (byText.get(row) ?? 0)) + 1 / (RRF_K + (byPrior.get(row) ?? 0));
    rows = found.sort((a, b) => fused(b) - fused(a) || b.id - a.id);
  }

  if (rows.length === 0) return "No memories match.";
  return rows
    .slice(0, limit)
    .map((row) => renderHeading(toNote(db, row)))
    .join("\n");
}

/** Returns memories in full. Being asked for by id is the one reliable sign a memory was useful. */
export function getMemories(context: ToolContext, args: { ids: number[] }): string {
  const { db, projectId, now } = context;
  const ids = [...new Set(args.ids)].slice(0, MAX_IDS);
  const find = db.query<MemoryRow & { supersededBy: number | null }, [number, number]>(
    `SELECT ${MEMORY_COLUMNS}, m.superseded_by AS supersededBy
       FROM memories m WHERE m.id = ? AND m.project_id = ?`,
  );

  const parts: string[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const row = find.get(id, projectId);
    if (row === null) {
      missing.push(id);
      continue;
    }
    db.run("UPDATE memories SET use_count = use_count + 1, last_used_at = ? WHERE id = ?", [
      now,
      id,
    ]);
    const note = renderNote(toNote(db, row));
    parts.push(row.supersededBy === null ? note : `${note}\n  (replaced by #${row.supersededBy})`);
  }
  if (missing.length > 0) {
    parts.push(`Not found in this project: ${missing.map((id) => `#${id}`).join(", ")}`);
  }
  return parts.join("\n");
}

/**
 * Stores what the agent was told to remember. The text is the agent's own; it is
 * redacted, split into a title and the rest, and consolidated like any other memory.
 */
export async function saveMemory(
  context: ToolContext,
  args: { text: string; kind: MemoryKind; files?: string[]; importance?: number },
): Promise<string> {
  const { db, projectId, now } = context;
  const text = redact(args.text.replace(/\s+/g, " ").trim());
  if (text === "") return "Nothing to save: the text is empty.";

  const [first = text, ...rest] = splitSentences(text);
  const draft = {
    kind: args.kind,
    title: clip(first.trim(), TITLE_MAX_CHARS, "…"),
    body: clip(
      rest
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence !== "")
        .join("\n"),
      BODY_MAX_CHARS,
      "…",
    ) as Redacted,
    importance: Math.min(5, Math.max(1, Math.trunc(args.importance ?? 3))),
    files: (args.files ?? [])
      .slice(0, MAX_FILES)
      .map((path) => ({ path, role: "changed" as const })),
  };

  const action = await consolidate({ db, judge: heuristicJudge }, projectId, draft);
  if (action.type === "duplicate") {
    db.run("UPDATE memories SET evidence_count = evidence_count + 1, updated_at = ? WHERE id = ?", [
      now,
      action.targetId,
    ]);
    return `Already known as #${action.targetId}; counted as further evidence.`;
  }

  const paths = draft.files.map((file) => file.path).join(" ");
  const id = withWrite(db, () => {
    const created = insertMemory(db, {
      projectId,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      terms: `${paths} ${identifierParts(`${draft.title} ${draft.body} ${paths}`)}`.trim(),
      importance: draft.importance,
      branch: context.branch,
      commit: null,
      origin: "manual",
      judge: "agent",
      judgeVersion: "1",
      sourceTurnId: null,
      files: draft.files,
      now,
    });
    for (const oldId of action.supersedes) supersede(db, oldId, created, now);
    return created;
  });
  return action.supersedes.length === 0
    ? `Saved as #${id}.`
    : `Saved as #${id}, replacing ${action.supersedes.map((old) => `#${old}`).join(", ")}.`;
}
