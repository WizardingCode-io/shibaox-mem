import { clip } from "../../util/text.ts";
import { CLAUDE_STYLE_EVENTS, renderHookJson } from "../common/hook-json.ts";
import type { AgentAdapter } from "../types.ts";
import { parsePayload } from "./payloads.ts";
import { readTurnDetail } from "./transcript.ts";

// Claude Code moves hook output above this size into a file and shows the model a preview.
const MAX_INJECTION_CHARS = 10_000;

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
  render: (event, context) =>
    renderHookJson(CLAUDE_STYLE_EVENTS, event, context, (s) => clip(s, MAX_INJECTION_CHARS)),
};
