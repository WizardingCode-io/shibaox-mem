import { homedir } from "node:os";
import { isAbsolute, join, win32 } from "node:path";
import { ENV_FILE, readEnvFile } from "../settings/env-file.ts";

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

const absolute = (value: string) => isAbsolute(value) || win32.isAbsolute(value);

/**
 * Where the database lives. The data directory, unless the store was moved (an external
 * disk, a NAS): then `SHIBAOX_MEM_STORE_DIR`, from the environment or the settings file.
 * The binary, the settings and the logs stay in the data directory either way.
 */
export function storeDirOf(
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.SHIBAOX_MEM_STORE_DIR;
  if (set(fromEnv) && absolute(fromEnv)) return fromEnv;
  const fromFile = readEnvFile(join(dataDir, ENV_FILE)).SHIBAOX_MEM_STORE_DIR;
  if (fromFile !== undefined && absolute(fromFile)) return fromFile;
  return dataDir;
}

export function resolvePaths(env: Record<string, string | undefined> = process.env): {
  dataDir: string;
  storeDir: string;
} {
  const dataDir = defaultDataDir(env);
  return { dataDir, storeDir: storeDirOf(dataDir, env) };
}
