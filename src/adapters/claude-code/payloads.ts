import type { HookEvent } from "../../core/types.ts";
import { parseHookJson } from "../common/hook-json.ts";
import type { HookInput } from "../types.ts";

// Field names as captured from Claude Code 2.1.289; see tests/fixtures/claude-code/payloads.

export function parsePayload(event: HookEvent, stdin: string): HookInput | null {
  return parseHookJson("claude-code", { turnIdField: "prompt_id" }, event, stdin);
}
