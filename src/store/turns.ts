import type { Redacted } from "../core/redact.ts";
import type { Db } from "./db.ts";

export interface TurnContext {
  sessionId: number;
  projectId: number;
  /** The host's id for the prompt, when it has one. */
  agentTurnId: string | null;
  transcriptPath: string | null;
  branch: string | null;
  commit: string | null;
  now: number;
}

function insertTurn(
  db: Db,
  turn: TurnContext,
  fields: {
    state: "open" | "pending";
    completeness: "full" | "payload-only";
    prompt: Redacted;
    finalText: Redacted | null;
  },
): number {
  const row = db
    .query<{ id: number }, (string | number | null)[]>(
      `INSERT INTO turns (session_id, project_id, seq, agent_turn_id, state, completeness, prompt, final_text,
                          transcript_path, branch, commit_sha, started_at, ended_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM turns WHERE session_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .get(
      turn.sessionId,
      turn.projectId,
      turn.sessionId,
      turn.agentTurnId,
      fields.state,
      fields.completeness,
      fields.prompt,
      fields.finalText,
      turn.transcriptPath,
      turn.branch,
      turn.commit,
      turn.now,
      fields.state === "pending" ? turn.now : null,
    );
  if (row === null) throw new Error("turn insert returned no row");
  return row.id;
}

/** Opens the turn a prompt starts. Delivering the same prompt twice opens it once. */
export function openTurn(db: Db, turn: TurnContext, prompt: Redacted): number {
  if (turn.agentTurnId !== null) {
    const existing = db
      .query<{ id: number }, [number, string]>(
        "SELECT id FROM turns WHERE session_id = ? AND agent_turn_id = ?",
      )
      .get(turn.sessionId, turn.agentTurnId);
    if (existing !== null) return existing.id;
  }
  return insertTurn(db, turn, {
    state: "open",
    completeness: "full",
    prompt,
    finalText: null,
  });
}

/**
 * Queues every turn of the session that is still open. A turn left open never got its
 * turn-end event: the user interrupted it, or the request failed.
 */
export function interruptOpenTurns(
  db: Db,
  sessionId: number,
  now: number,
  exceptAgentTurnId: string | null = null,
): number {
  return db.run(
    `UPDATE turns SET state = 'pending', completeness = 'interrupted', ended_at = ?
      WHERE session_id = ? AND state = 'open' AND (? IS NULL OR agent_turn_id IS NOT ?)`,
    [now, sessionId, exceptAgentTurnId, exceptAgentTurnId],
  ).changes;
}

/**
 * Queues the turn that just ended, with the assistant's final message. A turn whose
 * prompt was never seen (ai-mem installed mid-session) is captured from this event alone.
 */
export function completeTurn(db: Db, turn: TurnContext, finalText: Redacted | null): void {
  const target =
    turn.agentTurnId === null
      ? db
          .query<{ id: number; state: string }, [number]>(
            "SELECT id, state FROM turns WHERE session_id = ? AND state = 'open' ORDER BY seq DESC LIMIT 1",
          )
          .get(turn.sessionId)
      : db
          .query<{ id: number; state: string }, [number, string]>(
            "SELECT id, state FROM turns WHERE session_id = ? AND agent_turn_id = ?",
          )
          .get(turn.sessionId, turn.agentTurnId);

  if (target === null) {
    insertTurn(db, turn, {
      state: "pending",
      completeness: "payload-only",
      prompt: "" as Redacted,
      finalText,
    });
  } else if (target.state === "open") {
    db.run(
      `UPDATE turns SET state = 'pending', completeness = 'full', final_text = ?, ended_at = ?,
                        transcript_path = COALESCE(?, transcript_path)
        WHERE id = ?`,
      [finalText, turn.now, turn.transcriptPath, target.id],
    );
  }
  // Any other state: this turn-end was already handled.
}

export function hasQueuedTurns(db: Db): boolean {
  return db.query("SELECT 1 FROM turns WHERE state = 'pending' LIMIT 1").get() !== null;
}
