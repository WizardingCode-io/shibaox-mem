import type { HookEvent } from "../../core/types.ts";
import { clip } from "../../util/text.ts";
import { parseHookJson } from "../common/hook-json.ts";
import type { AgentAdapter, TurnDetail } from "../types.ts";

// OpenCode has no hooks of its own: a plugin we install (src/install/opencode-plugin.ts)
// turns its events into calls to this binary, with payloads in the Claude Code shape.
// Whatever a prompt or session-start hook prints goes into the system prompt as it is.

const MAX_INJECTION_CHARS = 10_000;
const INJECTING = new Set<HookEvent>(["session-start", "prompt"]);

const EMPTY: TurnDetail = {
  filesRead: [],
  filesChanged: [],
  commands: [],
  errors: [],
  savedMemory: false,
};

export const opencode: AgentAdapter = {
  id: "opencode",
  capabilities: {
    sessionInjection: true,
    promptInjection: true,
    finalMessageInPayload: true,
    // Sessions live in OpenCode's own store, not in a file the plugin can point at.
    transcript: false,
    maxInjectionChars: MAX_INJECTION_CHARS,
  },
  parse: (event, stdin) => parseHookJson("opencode", { turnIdField: "turn_id" }, event, stdin),
  readTurnDetail: () => ({ ...EMPTY }),
  render: (event, context) =>
    INJECTING.has(event) && context !== null && context !== ""
      ? clip(context, MAX_INJECTION_CHARS)
      : "",
};
