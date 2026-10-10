import pkg from "../../package.json" with { type: "json" };
import { logError } from "../util/log.ts";
import { runTool, TOOL_DESCRIPTIONS, TOOL_NAMES, toolSchemas } from "./run.ts";

// Tool descriptions are sent to the model in every session, so each is one sentence.

/**
 * The MCP server: three tools over stdio. It lives as long as the host keeps its
 * stdin open, and holds no database connection between calls.
 */
export async function runMcpServer(): Promise<void> {
  // The SDK is loaded here and nowhere else: hooks must never pay for it.
  const { McpServer } = await import("@modelcontextprotocol/server");
  const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");
  const schemas = await toolSchemas();

  const answer = (text: string, isError = false) => ({
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  });

  const server = new McpServer({ name: "wizardingcode-mem", version: pkg.version });
  for (const name of TOOL_NAMES) {
    server.registerTool(
      name,
      { description: TOOL_DESCRIPTIONS[name], inputSchema: schemas[name] },
      async (args: unknown) => {
        try {
          return answer(await runTool(name, args, process.env.CLAUDE_PROJECT_DIR || process.cwd()));
        } catch (error) {
          logError(`mcp ${name}`, error);
          return answer(
            `wizardingcode-mem: ${error instanceof Error ? error.message : String(error)}`,
            true,
          );
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
}
