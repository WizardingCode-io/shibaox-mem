import { clip } from "../../util/text.ts";
import { CLAUDE_STYLE_EVENTS, parseHookJson, renderHookJson } from "../common/hook-json.ts";
import type { AgentAdapter } from "../types.ts";
import { readTurnDetail } from "./transcript.ts";

// Codex spills model-visible hook output above ~2 500 tokens into a file; stay under it.
const MAX_INJECTION_CHARS = 8_000;

export const codex: AgentAdapter = {
  id: "codex",
  capabilities: {
    sessionInjection: true,
    promptInjection: true,
    finalMessageInPayload: true,
    transcript: true,
    maxInjectionChars: MAX_INJECTION_CHARS,
  },
  parse: (event, stdin) => parseHookJson("codex", { turnIdField: "turn_id" }, event, stdin),
  readTurnDetail,
  render: (event, context) =>
    renderHookJson(CLAUDE_STYLE_EVENTS, event, context, (s) => clip(s, MAX_INJECTION_CHARS)),
};
