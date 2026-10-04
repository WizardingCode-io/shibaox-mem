import { type Db, withWrite } from "./db.ts";

export function getMeta(db: Db, key: string): string | null {
  return (
    db.query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = ?").get(key)?.value ??
    null
  );
}

export function setMeta(db: Db, key: string, value: string): void {
  db.run(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

// --- The drain lease --------------------------------------------------------------
// Every turn-end starts a background `distill`. The lease lets one of them drain the
// queue while the rest leave at once, and lets hooks skip starting more.

const DRAIN_LEASE = "drain.lease";

interface Lease {
  owner: string;
  until: number;
}

function readLease(db: Db): Lease | null {
  const raw = getMeta(db, DRAIN_LEASE);
  if (raw === null) return null;
  try {
    const lease = JSON.parse(raw) as Partial<Lease>;
    return typeof lease.owner === "string" && typeof lease.until === "number"
      ? { owner: lease.owner, until: lease.until }
      : null;
  } catch {
    return null;
  }
}

/** True while some process holds an unexpired lease on the queue. */
export function drainActive(db: Db, now: number): boolean {
  const lease = readLease(db);
  return lease !== null && lease.until > now;
}

/** Takes or extends the lease. False when another process holds it. */
export function claimDrain(db: Db, owner: string, now: number, leaseMs: number): boolean {
  return withWrite(db, () => {
    const lease = readLease(db);
    if (lease !== null && lease.until > now && lease.owner !== owner) return false;
    setMeta(db, DRAIN_LEASE, JSON.stringify({ owner, until: now + leaseMs }));
    return true;
  });
}

export function releaseDrain(db: Db, owner: string): void {
  withWrite(db, () => {
    if (readLease(db)?.owner === owner) db.run("DELETE FROM meta WHERE key = ?", [DRAIN_LEASE]);
  });
}
