import { homedir } from "node:os";
import { join } from "node:path";

const set = (value: string | undefined): value is string => value !== undefined && value !== "";

/**
 * Where all of shibaox-mem's state lives: `~/.shibaox/mem`, the memory product's corner
 * of the brand's home. Never inside a host agent's plugin directory, which is deleted
 * on uninstall. `SHIBAOX_HOME` moves the brand's home; `SHIBAOX_MEM_DATA_DIR` moves
 * only this product.
 */
export function defaultDataDir(env: Record<string, string | undefined> = process.env): string {
  if (set(env.SHIBAOX_MEM_DATA_DIR)) return env.SHIBAOX_MEM_DATA_DIR;
  const home = set(env.SHIBAOX_HOME) ? env.SHIBAOX_HOME : join(homedir(), ".shibaox");
  return join(home, "mem");
}
