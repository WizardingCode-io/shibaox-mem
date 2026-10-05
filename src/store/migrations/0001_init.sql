-- No STRICT tables: on macOS Bun uses the system SQLite, whose version varies.

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Every identity a project has had: 'remote:…', 'gitdir:…', 'path:…'.
CREATE TABLE project_aliases (
  alias TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  agent_session_id TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  cwd TEXT NOT NULL,
  branch TEXT,
  -- Advances when the agent's context is wiped; what was injected before is gone.
  context_epoch INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ended_at INTEGER,
  UNIQUE (agent, agent_session_id)
);

-- One row per user prompt. This table is also the durable work queue.
CREATE TABLE turns (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  seq INTEGER NOT NULL,
  agent_turn_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('open','pending','processing','done','skipped','failed')),
  completeness TEXT NOT NULL DEFAULT 'full' CHECK (completeness IN ('full','payload-only','interrupted')),
  branch TEXT,
  commit_sha TEXT,
  prompt TEXT NOT NULL,
  final_text TEXT,
  files_read TEXT NOT NULL DEFAULT '[]',
  files_changed TEXT NOT NULL DEFAULT '[]',
  commands TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]',
  transcript_path TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER,
  last_error TEXT,
  UNIQUE (session_id, seq)
);
CREATE UNIQUE INDEX turns_agent_turn ON turns(session_id, agent_turn_id) WHERE agent_turn_id IS NOT NULL;
CREATE INDEX turns_queue ON turns(state, id) WHERE state IN ('open','pending','processing');
CREATE INDEX turns_project_time ON turns(project_id, started_at DESC);

CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','fix','gotcha','convention','change','discovery')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Search-only expansion of identifiers and paths; never shown.
  terms TEXT NOT NULL DEFAULT '',
  importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  superseded_by INTEGER REFERENCES memories(id),
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('project','branch')),
  branch TEXT,
  commit_sha TEXT,
  stale INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL CHECK (origin IN ('distilled','manual','imported')),
  judge TEXT NOT NULL,
  judge_version TEXT NOT NULL,
  source_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL,
  source_ordinal INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Makes distilling the same turn twice a no-op.
  UNIQUE (source_turn_id, source_ordinal)
);
CREATE INDEX memories_rank ON memories(project_id, status, importance DESC, updated_at DESC);

CREATE TABLE memory_files (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('changed','read')),
  PRIMARY KEY (memory_id, path)
) WITHOUT ROWID;
CREATE INDEX memory_files_path ON memory_files(path, memory_id);

CREATE TABLE memory_sources (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('origin','duplicate','supersedes')),
  PRIMARY KEY (memory_id, turn_id)
) WITHOUT ROWID;

CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, body, terms,
  content='memories', content_rowid='id',
  tokenize = "unicode61 remove_diacritics 2"
);
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms);
END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms);
END;
CREATE TRIGGER memories_au AFTER UPDATE OF title, body, terms ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms);
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms);
END;

-- What was shown to the agent, and when. Also what stops a memory being shown twice:
-- once by name in a session brief, and once in full on a prompt, per context.
CREATE TABLE injections (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  context_epoch INTEGER NOT NULL,
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('session-start','prompt','mcp')),
  score REAL,
  tokens INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE UNIQUE INDEX injections_once ON injections(session_id, context_epoch, memory_id, event) WHERE event <> 'mcp';

-- Local latency record. No payloads. Without telemetry this is how regressions are seen.
CREATE TABLE hook_runs (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  agent TEXT NOT NULL,
  event TEXT NOT NULL,
  ms INTEGER NOT NULL,
  outcome TEXT NOT NULL
);
