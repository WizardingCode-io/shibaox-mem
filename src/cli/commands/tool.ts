import { runTool, TOOL_NAMES, type ToolName, toolSchemas } from "../../mcp/run.ts";
import { logError } from "../../util/log.ts";
import { EXIT_USAGE } from "../exit.ts";

const USAGE = `Usage: wizardingcode-mem tool <${TOOL_NAMES.join("|")}> --project <dir>  (JSON arguments on stdin)\n`;

/**
 * `wizardingcode-mem tool <name> --project <dir>`: one tool call outside MCP, for hosts whose
 * plugins define tools natively (OpenCode). Arguments come as JSON on stdin; the answer
 * is the tool's text.
 */
export async function run(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const at = rest.indexOf("--project");
  const projectDir = at === -1 ? undefined : rest[at + 1];
  if (name === undefined || !(TOOL_NAMES as readonly string[]).includes(name)) {
    process.stderr.write(`wizardingcode-mem tool: unknown tool "${name ?? ""}"\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (projectDir === undefined || projectDir === "") {
    process.stderr.write(`wizardingcode-mem tool: --project <dir> is required\n${USAGE}`);
    return EXIT_USAGE;
  }
  let args: unknown;
  try {
    const raw = await Bun.stdin.text();
    args = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    process.stderr.write("wizardingcode-mem tool: stdin must hold the arguments as JSON\n");
    return EXIT_USAGE;
  }
  const schemas = await toolSchemas();
  const parsed = schemas[name as ToolName].safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
      .join("; ");
    process.stderr.write(`wizardingcode-mem tool ${name}: ${issues}\n`);
    return EXIT_USAGE;
  }
  try {
    process.stdout.write(`${await runTool(name as ToolName, parsed.data, projectDir)}\n`);
    return 0;
  } catch (error) {
    logError(`tool ${name}`, error);
    process.stderr.write(
      `wizardingcode-mem: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
