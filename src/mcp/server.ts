import pkg from "../../package.json" with { type: "json" };
import { resolveProject } from "../core/project.ts";
import { MEMORY_KINDS } from "../core/types.ts";
import { openDb } from "../store/db.ts";
import { logError } from "../util/log.ts";
import { getMemories, saveMemory, searchMemories, type ToolContext } from "./tools.ts";

// Tool descriptions are sent to the model in every session, so each is one sentence.

/**
 * The MCP server: three tools over stdio. It lives as long as the host keeps its
 * stdin open, and holds no database connection between calls.
 */
export async function runMcpServer(): Promise<void> {
  // The SDK is loaded here and nowhere else: hooks must never pay for it.
  const { McpServer } = await import("@modelcontextprotocol/server");
  const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
  const { z } = await import("zod");

  const answer = (text: string, isError = false) => ({
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  });

  /** Runs one tool call against a freshly opened database, for the project the host is in. */
  const call = async (name: string, run: (context: ToolContext) => string | Promise<string>) => {
    try {
      const db = openDb({ busyTimeoutMs: 2000 });
      try {
        const now = Date.now();
        const project = resolveProject(db, process.env.CLAUDE_PROJECT_DIR || process.cwd(), now);
        if (project.disabled) return answer("Memory is turned off for this project.");
        return answer(await run({ db, projectId: project.id, branch: project.branch, now }));
      } finally {
        db.close();
      }
    } catch (error) {
      logError(`mcp ${name}`, error);
      return answer(`ai-mem: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };

  const kind = z.enum(MEMORY_KINDS);
  const server = new McpServer({ name: "ai-mem", version: pkg.version });

  server.registerTool(
    "memory_search",
    {
      description:
        "Search notes saved from earlier sessions in this project; returns one heading per note.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Words, symbols or file names. Empty lists the most important notes."),
        kind: kind.optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
    },
    (args) => call("memory_search", (context) => searchMemories(context, args)),
  );

  server.registerTool(
    "memory_get",
    {
      description: "Read saved notes in full, by the ids that memory_search returned.",
      inputSchema: z.object({ ids: z.array(z.number().int()).min(1).max(20) }),
    },
    (args) => call("memory_get", (context) => getMemories(context, args)),
  );

  server.registerTool(
    "memory_save",
    {
      description:
        "Save something worth knowing in later sessions: a decision and its reason, a rule the user stated, a pitfall, a fix.",
      inputSchema: z.object({
        text: z.string().min(1).describe("Self-contained; the first sentence becomes the title."),
        kind,
        files: z
          .array(z.string())
          .max(10)
          .optional()
          .describe("Project-relative paths it is about."),
        importance: z.number().int().min(1).max(5).optional(),
      }),
    },
    (args) => call("memory_save", (context) => saveMemory(context, args)),
  );

  await server.connect(new StdioServerTransport());
}
