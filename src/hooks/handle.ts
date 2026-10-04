import type { AgentAdapter, HookInput } from "../adapters/types.ts";
import { resolveProject } from "../core/project.ts";
import { type Redacted, redact } from "../core/redact.ts";
import { type Db, withWrite } from "../store/db.ts";
import { drainActive } from "../store/meta.ts";
import { endSession, touchSession } from "../store/sessions.ts";
import {
  completeTurn,
  hasQueuedTurns,
  interruptOpenTurns,
  openTurn,
  type TurnContext,
} from "../store/turns.ts";
import { clip } from "../util/text.ts";

export interface HookDeps {
  db: Db;
  now: () => number;
  /** Starts background distillation and returns at once. */
  spawnDistill: () => void;
}

const PROMPT_MAX_CHARS = 8 * 1024;
const FINAL_TEXT_MAX_CHARS = 16 * 1024;

/** Redacts first, then cuts: cutting first could leave half a secret unrecognised. */
function stored(text: string, max: number): Redacted {
  return clip(redact(text), max, "…") as Redacted;
}

/**
 * Handles one hook event and returns exactly what to print to the host.
 * Throwing is allowed here; the command that calls this turns any failure into silence.
 */
export function handleHook(deps: HookDeps, adapter: AgentAdapter, input: HookInput): string {
  const { db } = deps;
  const now = deps.now();

  const project = resolveProject(db, input.cwd, now);
  if (project.disabled) return "";

  const session = touchSession(db, {
    agent: input.agent,
    agentSessionId: input.sessionId,
    projectId: project.id,
    cwd: input.cwd,
    branch: project.branch,
    now,
  });
  const turn: TurnContext = {
    sessionId: session.id,
    projectId: project.id,
    agentTurnId: input.turnId,
    transcriptPath: input.transcriptPath,
    branch: project.branch,
    commit: project.commit,
    now,
  };
  const context: string | null = null;

  switch (input.event) {
    case "session-start":
      break;
    case "prompt": {
      const prompt = input.prompt;
      if (prompt === null) break;
      withWrite(db, () => {
        interruptOpenTurns(db, session.id, now, input.turnId);
        openTurn(db, turn, stored(prompt, PROMPT_MAX_CHARS));
      });
      break;
    }
    case "turn-end":
      withWrite(db, () =>
        completeTurn(
          db,
          turn,
          input.finalText === null ? null : stored(input.finalText, FINAL_TEXT_MAX_CHARS),
        ),
      );
      break;
    case "session-end":
      // When the user interrupts, no turn-end arrives; this event still does.
      withWrite(db, () => {
        interruptOpenTurns(db, session.id, now);
        endSession(db, session.id, now);
      });
      break;
  }

  if (hasQueuedTurns(db) && !drainActive(db, now)) deps.spawnDistill();
  return adapter.render(input.event, context);
}
