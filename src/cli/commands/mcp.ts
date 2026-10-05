import { runMcpServer } from "../../mcp/server.ts";

/** `ai-mem mcp`: the MCP server on stdio. Returns once it is listening; the process ends with its stdin. */
export async function run(): Promise<number> {
  await runMcpServer();
  return 0;
}
