import { realpathSync } from "node:fs";
import type { AgentAdapter, TurnDetail } from "../adapters/types.ts";
import { readGitInfo } from "../core/git.ts";
import { type Redacted, redact } from "../core/redact.ts";
import type { DistillCandidate, DistillVerdict, Judge } from "../judge/types.ts";
import { type Db, withWrite } from "../store/db.ts";
import { insertMemory, reinforce, supersede } from "../store/memories.ts";
import { clip } from "../util/text.ts";
import { searchTerms } from "../util/words.ts";
import { consolidate, type Draft } from "./consolidate.ts";
import { DURABLE_THRESHOLD, MAX_FACTS, SAVE_THRESHOLD, TITLE_MAX_CHARS } from "./policy.ts";
import { candidates } from "./segment.ts";

export interface DistillDeps {
  db: Db;
  judge: Judge;
  adapters: Partial<Record<string, AgentAdapter>>;
  now: () => number;
}

/** A queued turn, as claimed from the queue. Its text was redacted when it was stored. */
export interface QueuedTurn {
  id: number;
  projectId: number;
  agent: string;
  cwd: string;
  agentTurnId: string | null;
  prompt: Redacted;
  finalText: Redacted | null;
  transcriptPath: string | null;
  branch: string | null;
  commit: string | null;
  attempts: number;
}

const MAX_CHANGED_FILES = 10;
const MAX_READ_FILES = 5;
const CONTEXT_MAX_CHARS = 160;
const EMPTY: TurnDetail = { filesRead: [], filesChanged: [], commands: [], errors: [] };

function realpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Project-relative paths with forward slashes. Files outside the project are not anchors. */
function relativeTo(roots: string[], paths: string[]): string[] {
  const relative = new Set<string>();
  for (const path of paths) {
    const normalised = path.replaceAll("\\", "/");
    const root = roots.find((candidate) => normalised.startsWith(`${candidate}/`));
    if (root !== undefined) relative.add(normalised.slice(root.length + 1));
  }
  return [...relative];
}

function readDetail(deps: DistillDeps, turn: QueuedTurn): TurnDetail {
  const adapter = deps.adapters[turn.agent];
  if (adapter === undefined || turn.transcriptPath === null) return EMPTY;
  const raw = adapter.readTurnDetail(turn.transcriptPath, turn.agentTurnId);
  const cwd = realpath(turn.cwd);
  const roots = [...new Set([readGitInfo(cwd)?.root ?? cwd, cwd, turn.cwd])].map((root) =>
    root.replaceAll("\\", "/"),
  );
  return {
    filesRead: relativeTo(roots, raw.filesRead),
    filesChanged: relativeTo(roots, raw.filesChanged),
    commands: raw.commands.map((command) => redact(command)),
    errors: raw.errors.map((error) => redact(error)),
  };
}

function buildDraft(
  turn: QueuedTurn,
  cands: DistillCandidate[],
  verdict: DistillVerdict,
  detail: TurnDetail,
): Draft | null {
  if (verdict.worthSaving < SAVE_THRESHOLD || verdict.kind === "none") return null;
  const durability = (candidate: DistillCandidate) => verdict.durable[candidate.idx] ?? 0;
  const durable = cands.filter((candidate) => durability(candidate) >= DURABLE_THRESHOLD);
  const title = cands.find((candidate) => candidate.idx === verdict.titleIdx) ?? durable[0];
  if (title === undefined) return null;

  // The strongest facts, shown in the order they were written.
  const facts = [...durable]
    .sort((a, b) => durability(b) - durability(a) || a.idx - b.idx)
    .slice(0, MAX_FACTS)
    .sort((a, b) => a.idx - b.idx)
    .filter((candidate) => candidate.idx !== title.idx)
    .map((candidate) => candidate.text as string);

  // What the user had asked gives the assistant's sentences their referent. A rule
  // taken from the prompt itself needs none.
  const asked = turn.prompt.replace(/\s+/g, " ").trim();
  if (title.source === "final" && asked !== "") {
    facts.push(`Context: ${clip(asked, CONTEXT_MAX_CHARS, "…")}`);
  }

  const changed = detail.filesChanged.slice(0, MAX_CHANGED_FILES);
  const read = detail.filesRead.filter((path) => !changed.includes(path)).slice(0, MAX_READ_FILES);
  return {
    kind: verdict.kind,
    title: clip(title.text, TITLE_MAX_CHARS, "…"),
    body: facts.join("\n") as Redacted,
    importance: verdict.importance,
    files: [
      ...changed.map((path) => ({ path, role: "changed" as const })),
      ...read.map((path) => ({ path, role: "read" as const })),
    ],
  };
}

/**
 * Turns one queued turn into at most one memory. Judgments are asked for outside any
 * transaction; the memory and the turn's new state are then written together, so a
 * crash at any point either repeats the work or loses nothing.
 */
export async function distillTurn(
  deps: DistillDeps,
  turn: QueuedTurn,
): Promise<"done" | "skipped"> {
  const { db } = deps;
  const detail = readDetail(deps, turn);
  db.run(
    "UPDATE turns SET files_read = ?, files_changed = ?, commands = ?, errors = ? WHERE id = ?",
    [
      JSON.stringify(detail.filesRead),
      JSON.stringify(detail.filesChanged),
      JSON.stringify(detail.commands),
      JSON.stringify(detail.errors),
      turn.id,
    ],
  );

  // Sentences cut from redacted text are themselves redacted.
  const cands = candidates(turn.prompt, turn.finalText).map((candidate) => ({
    ...candidate,
    text: candidate.text as Redacted,
  }));
  const verdict = await deps.judge.distill({
    prompt: turn.prompt,
    finalText: turn.finalText ?? ("" as Redacted),
    candidates: cands,
    filesChanged: detail.filesChanged,
    commands: detail.commands as Redacted[],
    hadErrors: detail.errors.length > 0,
  });

  const draft = buildDraft(turn, cands, verdict, detail);
  const finish = (state: "done" | "skipped") =>
    db.run(
      "UPDATE turns SET state = ?, lease_owner = NULL, lease_until = NULL, last_error = NULL WHERE id = ?",
      [state, turn.id],
    );
  if (draft === null) {
    finish("skipped");
    return "skipped";
  }

  const action = await consolidate(deps, turn.projectId, draft);
  const now = deps.now();
  withWrite(db, () => {
    if (action.type === "duplicate") {
      reinforce(db, action.targetId, turn.id, now);
    } else {
      const id = insertMemory(db, {
        projectId: turn.projectId,
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        terms: searchTerms(
          draft.title,
          draft.body,
          draft.files.map((file) => file.path),
        ),
        importance: draft.importance,
        branch: turn.branch,
        commit: turn.commit,
        origin: "distilled",
        judge: verdict.source,
        judgeVersion: deps.judge.version,
        sourceTurnId: turn.id,
        files: draft.files,
        now,
      });
      for (const oldId of action.supersedes) if (oldId !== id) supersede(db, oldId, id, now);
    }
    finish("done");
  });
  return "done";
}
