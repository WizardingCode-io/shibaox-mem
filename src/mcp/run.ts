import { resolveProject } from "../core/project.ts";
import { makeJudge } from "../judge/index.ts";
import { openDb } from "../store/db.ts";
import { resolvePaths } from "../util/paths.ts";
import { getMemories, saveMemory, searchMemories, type ToolContext } from "./tools.ts";

// The three tools, reachable from the MCP server and from `shibaox-mem tool` alike.

export const TOOL_NAMES = ["memory_search", "memory_get", "memory_save"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Tool argument schemas; zod is loaded here and nowhere a hook runs. */
export async function toolSchemas() {
  const { z } = await import("zod");
  const { MEMORY_KINDS } = await import("../core/types.ts");
  const kind = z.enum(MEMORY_KINDS);
  return {
    memory_search: z.object({
      query: z
        .string()
        .describe("Words, symbols or file names. Empty lists the most important notes."),
      kind: kind.optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    memory_get: z.object({ ids: z.array(z.number().int()).min(1).max(20) }),
    memory_save: z.object({
      text: z.string().min(1).describe("Self-contained; the first sentence becomes the title."),
      kind,
      files: z.array(z.string()).max(10).optional().describe("Project-relative paths it is about."),
      importance: z.number().int().min(1).max(5).optional(),
    }),
  };
}

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  memory_search:
    "Search notes saved from earlier sessions in this project; returns one heading per note.",
  memory_get: "Read saved notes in full, by the ids that memory_search returned.",
  memory_save:
    "Save something worth knowing in later sessions: a decision and its reason, a rule the user stated, a pitfall, a fix.",
};

/**
 * Runs one validated tool call against a freshly opened database, for the project at
 * `projectDir`. Throws on failure; callers decide how to report it.
 */
export async function runTool(name: ToolName, args: unknown, projectDir: string): Promise<string> {
  const { dataDir, storeDir } = resolvePaths();
  const db = openDb({ dataDir: storeDir, busyTimeoutMs: 2000 });
  try {
    const now = Date.now();
    const project = resolveProject(db, projectDir, now);
    if (project.disabled) return "Memory is turned off for this project.";
    const context: ToolContext = {
      db,
      judge: makeJudge({ db, dataDir }),
      projectId: project.id,
      root: project.root,
      branch: project.branch,
      now,
    };
    switch (name) {
      case "memory_search":
        return searchMemories(context, args as Parameters<typeof searchMemories>[1]);
      case "memory_get":
        return getMemories(context, args as Parameters<typeof getMemories>[1]);
      case "memory_save":
        return await saveMemory(context, args as Parameters<typeof saveMemory>[1]);
    }
  } finally {
    db.close();
  }
}
