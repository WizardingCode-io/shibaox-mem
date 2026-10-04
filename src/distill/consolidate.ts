import type { Redacted } from "../core/redact.ts";
import type { MemoryKind } from "../core/types.ts";
import type { Judge } from "../judge/types.ts";
import type { Db } from "../store/db.ts";
import { findNeighbours } from "../store/memories.ts";
import { DUPLICATE, SUPERSEDE } from "./policy.ts";

export interface Draft {
  kind: MemoryKind;
  title: string;
  body: Redacted;
  importance: number;
  files: { path: string; role: "changed" | "read" }[];
}

/**
 * What to do with a draft. Consolidation never writes text: a draft is stored as it
 * is, or not stored because an existing memory already says it.
 */
export type Action =
  | { type: "insert"; supersedes: number[] }
  | { type: "duplicate"; targetId: number };

const MAX_NEIGHBOURS = 8;

export async function consolidate(
  deps: { db: Db; judge: Judge },
  projectId: number,
  draft: Draft,
): Promise<Action> {
  const neighbours = findNeighbours(
    deps.db,
    projectId,
    `${draft.title} ${draft.body}`,
    MAX_NEIGHBOURS,
  );
  if (neighbours.length === 0) return { type: "insert", supersedes: [] };

  const verdict = await deps.judge.consolidate({
    draft: {
      title: draft.title,
      body: draft.body,
      kind: draft.kind,
      files: draft.files.map((file) => file.path),
    },
    neighbours,
  });
  // A judge answers about the neighbours it was given, and about nothing else.
  const known = new Set(neighbours.map((neighbour) => neighbour.id));
  const answers = verdict.perNeighbour.filter((answer) => known.has(answer.id));

  // Replacement is checked first: a memory that is no longer true must not survive
  // just because the draft resembles it.
  const replaced = answers
    .filter(
      (answer) =>
        answer.contradicts >= SUPERSEDE.minContradiction &&
        answer.relationScore >= SUPERSEDE.minRelationScore,
    )
    .map((answer) => answer.id);
  if (replaced.length > 0) return { type: "insert", supersedes: replaced };

  const same = answers.find(
    (answer) =>
      answer.relationScore >= DUPLICATE.minRelationScore &&
      answer.contradicts < DUPLICATE.maxContradiction,
  );
  return same === undefined
    ? { type: "insert", supersedes: [] }
    : { type: "duplicate", targetId: same.id };
}
