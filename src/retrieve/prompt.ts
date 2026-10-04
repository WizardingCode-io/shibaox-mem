import type { Db } from "../store/db.ts";
import { anyOf } from "../util/words.ts";
import { MEMORY_COLUMNS, type MemoryRow, prior, toNote } from "./notes.ts";
import { buildQuery, type Query, searchTokens } from "./query.ts";
import { type Note, renderNote, renderNotes } from "./render.ts";

export { recordInjections } from "./notes.ts";

const CANDIDATES_PER_CHANNEL = 20;
const MAX_NOTES = 5;
/** About 700 tokens. */
const BUDGET_CHARS = 2400;
const RRF_K = 60;
const RECENT_TURNS = 5;
const MAX_SESSION_FILES = 50;

interface Candidate {
  row: MemoryRow;
  /** Lower is a better match; undefined when the full-text search did not return it. */
  bm25?: number;
  /** How many of its files were touched in this session. */
  overlap: number;
}

const NOT_YET_SHOWN = `m.id NOT IN (SELECT memory_id FROM injections
                                    WHERE session_id = ? AND context_epoch = ? AND event <> 'mcp')`;

function sessionFiles(db: Db, sessionId: number): string[] {
  const files = new Set<string>();
  const turns = db
    .query<{ files_changed: string; files_read: string }, [number, number]>(
      "SELECT files_changed, files_read FROM turns WHERE session_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(sessionId, RECENT_TURNS);
  for (const turn of turns) {
    for (const json of [turn.files_changed, turn.files_read]) {
      try {
        for (const path of JSON.parse(json) as unknown[]) {
          if (typeof path === "string" && files.size < MAX_SESSION_FILES) files.add(path);
        }
      } catch {
        // A malformed row contributes nothing.
      }
    }
  }
  return [...files];
}

/**
 * Whether a memory has enough in common with the prompt to be worth the model's
 * attention. Sharing one ordinary word is not enough; in doubt, nothing is injected.
 */
function hasEvidence(candidate: Candidate, query: Query, isRare: (word: string) => boolean) {
  const { row } = candidate;
  const tokens = searchTokens(`${row.title} ${row.body} ${row.terms}`);
  const set = new Set(tokens);
  const joined = ` ${tokens.join(" ")} `;

  const identifiers = query.identifiers.filter((identifier) =>
    joined.includes(` ${searchTokens(identifier).join(" ")} `),
  ).length;
  if (identifiers > 0) return true;

  const matched = query.words.filter((word) => set.has(searchTokens(word)[0] ?? ""));
  if (matched.length >= 3) return true;
  if (matched.filter(isRare).length >= 2) return true;
  return candidate.overlap > 0 && matched.length >= 1;
}

/** Ranks by `score`, best first. Equal scores share a rank, so that ties decide nothing. */
function ranks<T>(items: T[], score: (item: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  const result = new Map<T, number>();
  let rank = 0;
  let previous: number | undefined;
  for (const item of sorted) {
    const value = score(item);
    if (
      previous === undefined ||
      Math.abs(value - previous) > 1e-6 * Math.max(1, Math.abs(value))
    ) {
      rank++;
    }
    previous = value;
    result.set(item, rank);
  }
  return result;
}

/**
 * The memories worth showing for this prompt: at most five, best first, none that this
 * context has already seen, within the size budget. Often none at all.
 */
export function retrieveForPrompt(
  db: Db,
  input: {
    projectId: number;
    sessionId: number;
    epoch: number;
    prompt: string;
    branch: string | null;
    now: number;
  },
): Note[] {
  const query = buildQuery(input.prompt);
  if (query === null) return [];

  const candidates = new Map<number, Candidate>();
  const matched = db
    .query<MemoryRow & { bm25: number }, [string, number, number, number, number]>(
      `SELECT ${MEMORY_COLUMNS}, bm25(memories_fts, 4.0, 1.0, 2.0) AS bm25
         FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
        WHERE memories_fts MATCH ? AND m.project_id = ? AND m.status = 'active' AND ${NOT_YET_SHOWN}
        ORDER BY bm25 LIMIT ?`,
    )
    .all(query.match, input.projectId, input.sessionId, input.epoch, CANDIDATES_PER_CHANNEL);
  for (const { bm25, ...row } of matched) candidates.set(row.id, { row, bm25, overlap: 0 });

  const files = sessionFiles(db, input.sessionId);
  if (files.length > 0) {
    const touched = db
      .query<MemoryRow & { overlap: number }, (string | number)[]>(
        `SELECT ${MEMORY_COLUMNS}, count(*) AS overlap
           FROM memory_files f JOIN memories m ON m.id = f.memory_id
          WHERE f.path IN (${files.map(() => "?").join(", ")})
            AND m.project_id = ? AND m.status = 'active' AND ${NOT_YET_SHOWN}
          GROUP BY m.id ORDER BY overlap DESC LIMIT ?`,
      )
      .all(...files, input.projectId, input.sessionId, input.epoch, CANDIDATES_PER_CHANNEL);
    for (const { overlap, ...row } of touched) {
      const known = candidates.get(row.id);
      if (known === undefined) candidates.set(row.id, { row, overlap });
      else known.overlap = overlap;
    }
  }
  if (candidates.size === 0) return [];

  // A word is rare when few of the project's memories contain it.
  const total =
    db
      .query<{ n: number }, [number]>(
        "SELECT count(*) AS n FROM memories WHERE project_id = ? AND status = 'active'",
      )
      .get(input.projectId)?.n ?? 0;
  const rareLimit = Math.max(2, Math.ceil(total * 0.05));
  const frequency = db.query<{ n: number }, [string, number]>(
    `SELECT count(*) AS n FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH ? AND m.project_id = ? AND m.status = 'active'`,
  );
  const known = new Map<string, boolean>();
  const isRare = (word: string) => {
    let rare = known.get(word);
    if (rare === undefined) {
      rare = (frequency.get(anyOf([word]), input.projectId)?.n ?? 0) <= rareLimit;
      known.set(word, rare);
    }
    return rare;
  };

  const eligible = [...candidates.values()].filter((candidate) =>
    hasEvidence(candidate, query, isRare),
  );

  // Reciprocal rank fusion over three orderings: how well the text matches, how many
  // of the session's files it is about, and how much it matters regardless of the query.
  const byText = ranks(
    eligible.filter((candidate) => candidate.bm25 !== undefined),
    (candidate) => -(candidate.bm25 as number),
  );
  const byFiles = ranks(
    eligible.filter((candidate) => candidate.overlap > 0),
    (candidate) => candidate.overlap,
  );
  const byPrior = ranks(eligible, (candidate) => prior(candidate.row, input));
  const fused = (candidate: Candidate) =>
    [byText, byFiles, byPrior].reduce((sum, ranking) => {
      const rank = ranking.get(candidate);
      return rank === undefined ? sum : sum + 1 / (RRF_K + rank);
    }, 0);

  const notes: Note[] = [];
  let size = renderNotes([]).length;
  const overhead = renderNotes([
    { id: 0, kind: "fix", title: "", body: "", createdAt: 0, files: [], stale: false },
  ]).length;
  for (const candidate of eligible.sort((a, b) => fused(b) - fused(a) || b.row.id - a.row.id)) {
    if (notes.length === MAX_NOTES) break;
    const note = toNote(db, candidate.row);
    const cost = renderNote(note).length + 1 + (notes.length === 0 ? overhead : 0);
    if (size + cost > BUDGET_CHARS) continue;
    notes.push(note);
    size += cost;
  }
  return notes;
}
