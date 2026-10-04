import type { HookEvent } from "../../core/types.ts";
import type { HookInput } from "../types.ts";

// Field names as captured from Claude Code 2.1.289; see tests/fixtures/claude-code/payloads.

const SOURCES = new Set(["startup", "resume", "clear", "compact"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function parsePayload(event: HookEvent, stdin: string): HookInput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;

  const sessionId = text(payload.session_id);
  const cwd = text(payload.cwd);
  if (sessionId === null || cwd === null) return null;

  const source = text(payload.source);
  return {
    agent: "claude-code",
    event,
    sessionId,
    cwd,
    turnId: text(payload.prompt_id),
    transcriptPath: text(payload.transcript_path),
    prompt: event === "prompt" ? text(payload.prompt) : null,
    finalText: event === "turn-end" ? text(payload.last_assistant_message) : null,
    source:
      event === "session-start"
        ? source !== null && SOURCES.has(source)
          ? (source as HookInput["source"])
          : "other"
        : null,
    subagent: text(payload.agent_id) !== null,
  };
}
