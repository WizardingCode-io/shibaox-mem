import { Database } from "bun:sqlite";

// A stand-in for the user's claude-mem database: the columns the importer reads, with
// invented data. The real file is only ever opened read-only.

export interface SourceObservation {
  project: string;
  type: string;
  title?: string | null;
  facts?: string[] | null;
  narrative?: string | null;
  filesModified?: string[];
  filesRead?: string[];
  createdAtEpoch?: number;
  mergedIntoProject?: string | null;
}

export const SOURCE_EPOCH = Date.UTC(2026, 7, 1); // 2026-08-01

export function makeClaudeMemDb(path: string, observations: SourceObservation[]): void {
  const db = new Database(path, { create: true });
  try {
    db.run(`CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, content_session_id TEXT NOT NULL,
      memory_session_id TEXT UNIQUE, project TEXT NOT NULL, started_at TEXT NOT NULL,
      started_at_epoch INTEGER NOT NULL)`);
    db.run(`CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, memory_session_id TEXT NOT NULL,
      project TEXT NOT NULL, text TEXT, type TEXT NOT NULL, title TEXT, subtitle TEXT,
      facts TEXT, narrative TEXT, concepts TEXT, files_read TEXT, files_modified TEXT,
      prompt_number INTEGER, created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL,
      content_hash TEXT, merged_into_project TEXT)`);
    db.run(`CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, memory_session_id TEXT NOT NULL,
      project TEXT NOT NULL, request TEXT, learned TEXT, created_at TEXT NOT NULL)`);
    db.run(
      "INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch) VALUES ('c', 'm', 'p', '2026-08-01T00:00:00.000Z', ?)",
      [SOURCE_EPOCH],
    );
    const insert = db.prepare(
      `INSERT INTO observations (memory_session_id, project, type, title, facts, narrative,
                                 files_read, files_modified, created_at, created_at_epoch, merged_into_project)
       VALUES ('m', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    observations.forEach((o, index) => {
      const epoch = o.createdAtEpoch ?? SOURCE_EPOCH + index * 60_000;
      insert.run(
        o.project,
        o.type,
        o.title === undefined ? `Observation ${index} about ${o.project}` : o.title,
        o.facts === undefined
          ? JSON.stringify([`Fact ${index} with detail`])
          : o.facts === null
            ? null
            : JSON.stringify(o.facts),
        o.narrative ?? null,
        JSON.stringify(o.filesRead ?? []),
        JSON.stringify(o.filesModified ?? []),
        new Date(epoch).toISOString(),
        epoch,
        o.mergedIntoProject ?? null,
      );
    });
  } finally {
    db.close();
  }
}
