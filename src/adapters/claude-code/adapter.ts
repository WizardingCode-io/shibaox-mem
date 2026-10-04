import type { HookEvent } from "../../core/types.ts";
import { clip } from "../../util/text.ts";
import type { AgentAdapter } from "../types.ts";
import { parsePayload } from "./payloads.ts";
import { readTurnDetail } from "./transcript.ts";

// Claude Code moves hook output above this size into a file and shows the model a preview.
const MAX_INJECTION_CHARS = 10_000;

/** Events that may add context, and the name Claude Code expects back for each. */
const INJECTING: Partial<Record<HookEvent, string>> = {
  "session-start": "SessionStart",
  prompt: "UserPromptSubmit",
};

export const claudeCode: AgentAdapter = {
  id: "claude-code",
  capabilities: {
    sessionInjection: true,
    promptInjection: true,
    finalMessageInPayload: true,
    transcript: true,
    maxInjectionChars: MAX_INJECTION_CHARS,
  },
  parse: parsePayload,
  readTurnDetail,
  render(event, context) {
    const hookEventName = INJECTING[event];
    if (hookEventName === undefined || context === null || context === "") return "";
    // Always the JSON form: plain text that happens to start with "{" would be read as JSON.
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: clip(context, MAX_INJECTION_CHARS),
      },
    });
  },
};
