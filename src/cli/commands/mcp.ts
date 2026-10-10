import { runMcpServer } from "../../mcp/server.ts";

/**
 * `wizardingcode-mem mcp [--global]`: the MCP server on stdio. Returns once it is listening;
 * the process ends with its stdin. --global spans every project, for hosts with no project
 * folder (Claude Desktop's chat).
 */
export async function run(argv: string[] = []): Promise<number> {
  await runMcpServer({ global: argv.includes("--global") });
  return 0;
}
