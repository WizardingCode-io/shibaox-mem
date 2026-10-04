import { homedir } from "node:os";
import { join } from "node:path";

/** Where all of ai-mem's state lives. Never inside a host agent's plugin directory. */
export function defaultDataDir(env: Record<string, string | undefined> = process.env): string {
  const override = env.AI_MEM_DATA_DIR;
  return override !== undefined && override !== "" ? override : join(homedir(), ".ai-mem");
}
