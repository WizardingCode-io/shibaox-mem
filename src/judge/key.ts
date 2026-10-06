import { join } from "node:path";
import { ENV_FILE, readEnvFile } from "../settings/env-file.ts";

/**
 * The TypeSafe key, if the user configured one: `TYPESAFE_API_KEY` in the environment,
 * or the same line in `<data dir>/env`, the settings file only the user can read. Without
 * a key the heuristic judge does all the work and nothing leaves the machine.
 */
export function readTypeSafeKey(
  env: Record<string, string | undefined>,
  dataDir: string,
): string | null {
  const fromEnv = env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return readEnvFile(join(dataDir, ENV_FILE)).TYPESAFE_API_KEY ?? null;
}

/** A short, non-reversible name for a key: enough to notice that it changed. */
export function keyFingerprint(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key).digest("hex").slice(0, 16);
}
