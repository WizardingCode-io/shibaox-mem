import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The TypeSafe key, if the user configured one: `TYPESAFE_API_KEY` in the environment,
 * or the same line in `<data dir>/env`, a file only the user can read. Without a key the
 * heuristic judge does all the work and nothing leaves the machine.
 */
export function readTypeSafeKey(
  env: Record<string, string | undefined>,
  dataDir: string,
): string | null {
  const fromEnv = env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const line = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*)$/m.exec(
      readFileSync(join(dataDir, "env"), "utf8"),
    );
    const value = line?.[1]
      ?.trim()
      .replace(/^(["'])(.*)\1$/, "$2")
      .trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

/** A short, non-reversible name for a key: enough to notice that it changed. */
export function keyFingerprint(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key).digest("hex").slice(0, 16);
}
