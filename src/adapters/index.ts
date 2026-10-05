import { claudeCode } from "./claude-code/adapter.ts";
import { codex } from "./codex/adapter.ts";
import type { AgentAdapter } from "./types.ts";

export const ADAPTERS: Partial<Record<string, AgentAdapter>> = {
  [claudeCode.id]: claudeCode,
  [codex.id]: codex,
};
