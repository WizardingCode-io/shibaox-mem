import type { Db } from "../store/db.ts";
import { getMeta, setMeta } from "../store/meta.ts";
import { logError } from "../util/log.ts";
import { Breaker } from "./breaker.ts";
import { withFallback } from "./fallback.ts";
import { heuristicJudge } from "./heuristic.ts";
import { keyFingerprint, readTypeSafeKey } from "./key.ts";
import type { Judge } from "./types.ts";
import { TypeSafeJudge } from "./typesafe.ts";

export interface JudgeOptions {
  db: Db;
  dataDir: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

/** Counters that make the cost of TypeSafe visible in `status`. */
export const USAGE_KEYS = { requests: "typesafe.requests", inputTokens: "typesafe.input_tokens" };

function count(db: Db, key: string, by: number): void {
  setMeta(db, key, String(Number(getMeta(db, key) ?? 0) + by));
}

/**
 * The judge this installation uses: the heuristic one alone, unless the user
 * configured a TypeSafe key, in which case TypeSafe answers first and the heuristic
 * judge whenever it cannot. Nothing leaves the machine without a key.
 */
export function makeJudge(options: JudgeOptions): Judge {
  const key = readTypeSafeKey(options.env ?? process.env, options.dataDir);
  if (key === null) return heuristicJudge;
  const { db } = options;
  const typesafe = new TypeSafeJudge({
    apiKey: key,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    onUsage: (inputTokens) => {
      count(db, USAGE_KEYS.requests, 1);
      count(db, USAGE_KEYS.inputTokens, inputTokens);
    },
  });
  return withFallback(
    typesafe,
    heuristicJudge,
    new Breaker(db, { keyFingerprint: keyFingerprint(key) }),
    {
      onError: (error) => logError("judge typesafe", error, options.dataDir),
    },
  );
}
