import type { Db } from "../store/db.ts";
import { getMeta, setMeta } from "../store/meta.ts";
import type { ErrorKind } from "./client.ts";

export interface BreakerState {
  /** Fingerprint of the key the state is about; a new key starts afresh. */
  key: string;
  failures: number;
  openUntil: number | null;
  backoffMs: number;
  reason: ErrorKind | null;
}

const META_KEY = "breaker.typesafe";
const FAILURES_TO_OPEN = 3;
const FIRST_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

/**
 * Stops calling a service that keeps failing. Every process here lives for
 * milliseconds, so the state lives in the database, not in memory: three failures in a
 * row open the breaker for a minute, doubling up to fifteen; a rejected key opens it
 * until the key changes.
 */
export class Breaker {
  private current: BreakerState;

  constructor(
    private readonly db: Db,
    options: { keyFingerprint: string },
  ) {
    this.current = this.load(options.keyFingerprint);
  }

  state(): BreakerState {
    return { ...this.current };
  }

  allow(now: number): boolean {
    const { openUntil, reason } = this.current;
    if (reason === "auth") return false;
    return openUntil === null || now >= openUntil;
  }

  success(_now: number): void {
    if (this.current.failures === 0 && this.current.openUntil === null) return;
    this.current = { ...this.current, failures: 0, openUntil: null, reason: null };
    this.save();
  }

  failure(kind: ErrorKind, now: number): void {
    if (kind === "auth") {
      this.current = {
        ...this.current,
        failures: FAILURES_TO_OPEN,
        openUntil: null,
        reason: "auth",
      };
      this.save();
      return;
    }
    const failures = this.current.failures + 1;
    let { openUntil, backoffMs } = this.current;
    if (failures >= FAILURES_TO_OPEN) {
      // Already been open once in this streak: back off harder.
      backoffMs =
        this.current.openUntil === null
          ? FIRST_BACKOFF_MS
          : Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      openUntil = now + backoffMs;
    }
    this.current = { ...this.current, failures, openUntil, backoffMs, reason: kind };
    this.save();
  }

  private load(key: string): BreakerState {
    const fresh: BreakerState = {
      key,
      failures: 0,
      openUntil: null,
      backoffMs: FIRST_BACKOFF_MS,
      reason: null,
    };
    const raw = getMeta(this.db, META_KEY);
    if (raw === null) return fresh;
    try {
      const saved = JSON.parse(raw) as Partial<BreakerState>;
      if (saved.key !== key) return fresh;
      return {
        key,
        failures: typeof saved.failures === "number" ? saved.failures : 0,
        openUntil: typeof saved.openUntil === "number" ? saved.openUntil : null,
        backoffMs: typeof saved.backoffMs === "number" ? saved.backoffMs : FIRST_BACKOFF_MS,
        reason: (saved.reason as ErrorKind | undefined) ?? null,
      };
    } catch {
      return fresh;
    }
  }

  private save(): void {
    setMeta(this.db, META_KEY, JSON.stringify(this.current));
  }
}
