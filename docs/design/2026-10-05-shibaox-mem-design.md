# Plan: shibaox-mem — persistent memory for coding agents

> `shibaox-mem` is a provisional name (the directory's). Renaming before launch is cheap.

## Context

claude-mem (v13.x, Apache-2.0) keeps the local core free, but has built a funnel to "CMEM Pro" ($30/month after trial): a banner in every session, a button in the viewer, Pro pre-selected and mandatory login in the interactive installer, PostHog telemetry on by default. Pro sells the solution to a problem created by its own design: an LLM "observer" summarises every tool call **inside the user's subscription**.

Measurements taken on this machine during the analysis:

| Pain | Evidence |
|---|---|
| Burns the plan | ~47,700 model calls in 30 days (~139 per session), ≈19% of the calls and ≈29% of the user's own output; 77.8% of the recordings produced no observation at all |
| Heavy and unstable | Node + Bun + uv/Python + tree-sitter; 15 live processes (~2.4 GB RAM); ~9.2 GB on disk; ~130 thousand ERROR lines; 95% of sessions marked `failed`; ~67 issues about orphan processes |
| Memory of little use | Injects the 50 most recent observations in chronological order; search with no fusion or reranking; hard cut-off at 90 days; no semantic deduplication, staleness or branch; relevance counter never used |
| Upsell and privacy | Promotions injected into the session context; opt-out telemetry; no automatic secret redaction |

**Goal:** a direct, open-core competitor, clearly better on these four pains. Positioning: *memory that does not burn your plan, with no background processes, no advertising and no data leaving the machine.*

## Clean-room implementation rule (non-negotiable)

**shibaox-mem is written from scratch. It is not a fork.** claude-mem serves only as a feature reference and as a catalogue of mistakes to avoid.

- Copying code, database schema, prompts, texts or names from claude-mem is forbidden.
- Schema, memory taxonomy, injection format and tool names are ours.
- There is no existing code to reuse: the project directory is empty and claude-mem's code is off limits.
- The only interaction with claude-mem artefacts: the importer (M4) reads, read-only, the **user's own** database to migrate their memories. That is data interoperability, not code reuse.
- The rule is written down in `CLEAN-ROOM.md` in the repository and is checked in code review.

## Decisions taken

| Topic | Decision |
|---|---|
| Code origin | From scratch, no fork |
| Business model | Open-core: free and open local core (Apache-2.0 by default — confirm before the first commit); paid tier later (managed judgements without a key, sync between machines, team memory) |
| Stack | TypeScript, single binary via `bun build --compile`, SQLite with `bun:sqlite` |
| Memory engine | Extractive, **no generative LLM**; semantic judgements via TypeSafe |
| TypeSafe fallback | Mandatory: with no key, on error or on delay, the system uses local heuristic rules and never blocks the agent |
| Privacy | Local by default; TypeSafe is opt-in (`TYPESAFE_API_KEY`); no telemetry; no promotional text |
| Agents with full support in v1 | Claude Code, Codex CLI, Cursor, Gemini CLI, OpenCode |
| Google ecosystem | Gemini CLI in full; Antigravity CLI via MCP only in v1 |

## Architecture

One binary, several commands, **no resident process**:

| Command | Process lifetime | Role |
|---|---|---|
| `shibaox-mem hook <agent> <event>` | Milliseconds | Normalises the agent's payload, stores it, returns context to inject |
| `shibaox-mem distill` | Short, detached | Drains the turn queue and turns them into memories |
| `shibaox-mem mcp` | As long as the agent keeps it | Stdio MCP server: `memory_search`, `memory_get`, `memory_save` |
| `shibaox-mem install` / `uninstall` | One-off | Registers and removes hooks and MCP in each agent, with receipt and backup |
| `shibaox-mem doctor` / `status` | One-off | Diagnostics, latest failures, hook latency, actual cost of the judgements |
| `shibaox-mem search` / `forget` / `export` | One-off | Manual memory management |
| `shibaox-mem ui` (M4) | On demand, shuts down when idle | Local viewer |
| `shibaox-mem import claude-mem` (M4) | One-off | Migrates the user's existing memories |

### Flow per turn

1. **Session start** → injects a short summary: "where we left off" + top durable memories (~1,200 tokens, below the agent's cap). Does not re-inject on `resume`.
2. **Prompt submission** → opens a turn in state `open` with the prompt text; closes orphan `open` turns of the same session as interrupted; returns at most 5 relevant memories, only above an evidence threshold. Hard time budget; in case of doubt or failure, injects nothing.
3. **Turn end** → closes the turn as `pending` with the assistant's final message (it comes in the hook payload) and launches `distill` detached. **There is no per-tool-call hook.**
4. **Session end** → serves only as a drain trigger.

Opening the turn at the prompt, and not at the end, is what prevents losing interrupted turns or turns with an API error — precisely the ones where the user corrects the agent.

### Durable queue

- The `turns` table is the queue: `open → pending → processing → done | skipped | failed`. Nothing lives only in memory.
- A single process drains at a time (global lease in a `meta` row); each turn is claimed with `lease_until` and `attempts` (maximum 3).
- Inserting the memories and changing the state happen in the same transaction; `UNIQUE(source_turn_id, source_ordinal)` makes repetition idempotent.
- The system does not depend on the detached process surviving: any later invocation drains whatever is pending.
- The agent's transcript is read only in `distill`, never in the hook, and only for files, commands and errors. A turn without those details is still valid.

### Extractive distillation ("select instead of generate")

The code segments **the user's prompt and the assistant's final message** into candidate sentences (the most durable corrections and preferences are in the prompt). The body of each memory joins the selected sentences to a deterministic header (files, branch, prompt excerpt), so that no sentence is left without a referent.

| Judgement | TypeSafe primitive | Heuristic fallback (PT and EN rules) |
|---|---|---|
| Worth saving? | Noul | There were edits, error→fix pattern, correction markers in the prompt, decision cues |
| Type (decision, fix, gotcha, convention, change, discovery, none) | Choice | Rule cascade |
| Importance | 5-level Score | Rule-based scoring |
| Which sentences are durable facts that stand on their own? | Noul per sentence | Declarative sentence with an identifier, path or number, without offers or future tense |
| Which sentence serves as the title? | Choice among candidates | Highest-scoring durable sentence with ≤ 120 characters |
| Duplicate / related / supersedes? | Score + contradiction Noul, per BM25 neighbour | Token similarity + files in common; when in doubt, insert |

- The distillation judgements go in a single request per turn; consolidation in one request per new memory.
- Consolidation never generates text: the outputs are `insert`, `duplicate` (reinforces the evidence) or `supersede` (the old one becomes `superseded`, with a link).
- `memory_save` over MCP is the high-quality route: the agent itself writes the memory when the user asks, with no extra model call.
- Exact rules, thresholds, calculations and lookups stay in code. The thresholds are calibrated on the golden set.

### Judges and fallback

- Single `Judge` interface with `HeuristicJudge` (default and fallback) and `TypeSafeJudge` (opt-in), composed by `withFallback`.
- Direct HTTP call to the documented endpoint, instead of the SDK, to have a hard total deadline and a single point of secret redaction.
- Distillation and consolidation: 3 s per attempt, 2 retries only on 429/529/network, total deadline 8 s.
- Circuit breaker **persisted in `meta`** (processes live for milliseconds): 3 consecutive failures open it; a 401 opens it until the key changes.
- Each memory records which judge produced it, so it can be re-evaluated later.
- **Remote per-prompt reranking is off by default**, even with a key: a cold process pays DNS and TLS on every call. Spike 0.9 measures and decides.
- TypeSafe has English as its primary language; the evaluation must include turns in Portuguese.

### Retrieval

- **Query:** salient terms from the prompt (identifiers, paths, rare words) OR'ed together with per-column weights — never the raw prompt nor an exact phrase. A `terms` column expands camelCase, snake_case and path segments at write time.
- **Channels fused by RRF:** BM25, overlap with the files touched in the session, branch and recency (decay with no hard cut-off), importance, previous use.
- **Evidence threshold:** at least two distinct rare terms or one exact identifier.
- **No repetition:** deduplication by (session, context epoch); the epoch advances on `compact` and `clear`.
- **Staleness:** path, commit and branch anchors. "File disappeared" is a strong signal; "file changed" is a weak penalty. It is validated in `distill`; the hook only reads the flag.
- **No vectors in v1:** this eliminates Chroma, Python and ONNX. The recall@5 metric on the golden set decides whether they come back later.

### Privacy and security

- `Redacted` type as the only text accepted by storage and by the network client; rule-based secret redaction, plus `<private>` blocks.
- Binary compiled without automatic loading of `.env` or `bunfig.toml`: a hook runs in the user's project directory and must not absorb their secrets.
- Memories injected as dated notes with provenance, not as instructions, and strictly scoped per project — a defence against persistent prompt injection.
- No telemetry; latency metrics local only (`hook_runs`). No promotional text.
- `uninstall` removes exactly what the install receipt lists; nothing re-enables itself.
- Data files with 0600/0700 permissions; logs without payloads.

### Project identity

Canonical key: the `origin` remote, normalised and stripped of credentials; otherwise the git common dir (shared between worktrees); otherwise the real path. An alias table so the project keeps its identity if it gains a remote or changes directory. The hook reads `.git/HEAD` and `.git/config` as files, without launching `git`.

## Support per agent

The result of reading the current documentation. **Each adapter starts with a logging hook that records the real payload**, because the reading was done through automatic summaries and the exact field names have to be confirmed.

| Agent | Turn capture | Injection at startup | Injection per prompt | Installation |
|---|---|---|---|---|
| Claude Code | `UserPromptSubmit.prompt` + `Stop.last_assistant_message` | Yes (cap 10,000 characters) | Yes | M1: `~/.claude/settings.json` with an absolute path; M5: marketplace plugin |
| Codex CLI | `UserPromptSubmit.prompt` + `Stop.last_assistant_message` | Yes (~2,500 tokens) | Yes | Plugin or `~/.codex/hooks.json`; the user has to approve the hooks in `/hooks` |
| Cursor | `beforeSubmitPrompt.prompt` + `afterAgentResponse.text` | Yes | **Not supported by Cursor** — left to MCP | `~/.cursor/hooks.json` + `mcp.json` |
| Gemini CLI | `AfterAgent` (prompt + response) | Yes | Yes (`BeforeAgent`) | Extension |
| OpenCode v1 | `chat.message` + `session.idle` → messages API | Yes | To be confirmed in the spike | TS shim in `plugins/`, with native tools |
| Antigravity CLI | — | — | — | MCP only |

- The adapter declares a capability matrix; the core degrades instead of simulating (in Cursor: session summary + MCP).
- OpenCode v2 has an incompatible plugin API; it gets its own shim once it stabilises.
- Codex's and Cursor's transcripts are declared unstable or can be disabled: they are used on a best-effort basis only.

## Milestones

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| **M0 — Foundations** | Repository, licence, `CLEAN-ROOM.md`, CI that compiles the five binaries, platform spikes | Platform risks measured and recorded in an ADR |
| **M1 — Core + Claude Code (local mode)** | Storage, secret redaction, Claude Code adapter, heuristic judge, distillation, retrieval, injection, MCP, `install`, `doctor`/`status` | Real daily use in Claude Code, with no key at all |
| **M2 — TypeSafe judgements + fallback** | `TypeSafeJudge`, circuit breaker, judgement-based consolidation, extended golden set | Precision and recall measured, heuristic vs. TypeSafe, in PT and EN |
| **M3 — Multi-agent** | Codex CLI, Cursor, Gemini CLI, OpenCode adapters; `install` with automatic detection | A memory captured in one agent shows up in the others |
| **M4 — Viewer, importer, maintenance** | `ui`, `import claude-mem`, retention, compaction | Migration from a real claude-mem installation |
| **M5 — Launch** | Documentation, installers (script, npm, Homebrew), marketplace plugin, comparison page with measured numbers | Clean install on macOS, Linux and Windows |

Each milestone has its own specification → plan → implementation cycle. **This plan details M0 and M1**; the approval covers only those two.

## M0 — Foundations

Goal: eliminate the platform risks before writing product code. The spikes are hidden commands (`shibaox-mem __spike …`) that run from the compiled binary.

| # | Step | Exit criterion |
|---|---|---|
| 0.1 | `git init`; strict TypeScript, Biome, `bun test`, pinned Bun version, licence, `CLEAN-ROOM.md`, design document in `docs/`, `main.ts` with `--version` | Typecheck, lint and smoke test pass |
| 0.2 | `scripts/build.ts`: five targets (darwin arm64/x64, linux x64/arm64, windows x64), minified, no automatic loading of `.env`/`bunfig` (confirm the flag names in the Bun documentation) | Five artefacts; size reported and below 120 MB |
| 0.3 | CI: cross-compilation; darwin binaries signed on a macOS runner; native matrix that runs each binary | All five answer `--version` on the native runner |
| 0.4 | FTS5 spike: table with `remove_diacritics 2`, triggers, `bm25()`, `snippet()` | Passes on all five targets |
| 0.5 | Startup spike: 50 runs of `noop` and `open-db`, p50/p95 | Warm p95 ≤ 60 ms on macOS/Linux and ≤ 150 ms on Windows; otherwise, contingency plan |
| 0.6 | WAL spike: 8 processes with 200 `IMMEDIATE` transactions each, plus readers | Zero `SQLITE_BUSY`; `integrity_check` ok |
| 0.7 | Detached-process spike: the parent exits, the child writes a marker 2 s later | Marker present on all three operating systems |
| 0.8 | MCP spike: stdio server with the official SDK inside the compiled binary | `initialize`, `tools/list`, `tools/call` work; plan B is manual JSON-RPC |
| 0.9 | TypeSafe spike: cold process, 3 questions, latency with TLS (only with a key) | Number recorded; decides per-prompt reranking |
| 0.10 | Logging hook in Claude Code: records the real payloads of the four events, including an interrupted turn | Sanitised fixtures in `tests/fixtures/claude-code/` |
| 0.11 | ADR with the numbers and the decisions | Written and reviewed |

## M1 — Core and Claude Code in heuristic mode

Each step is done in TDD: the test in the right-hand column is written first.

| # | Step | Test |
|---|---|---|
| 1.1 | `core/redact` | Corpus of 40+ secrets and 30 negatives; `redact` is idempotent |
| 1.2 | `store/db` and migration 0001 | New DB ends up at version 1; 4 processes migrating at the same time; newer version refused; 0600 permissions |
| 1.3 | `core/git` and `core/project` | Two worktrees give the same project; remote credentials removed; new alias linked |
| 1.4 | `adapters/claude-code/payloads` | Fixtures of the 4 events; removing fields at random never throws |
| 1.5 | `adapters/claude-code/transcript` (tail by offset) | Truncated last line, unknown types, missing file gives empty detail |
| 1.6 | `hook prompt` — capture | Two prompts with no turn end: the first ends up `pending` and `interrupted` |
| 1.7 | `hook turn-end` | Turn closed as `pending`; `distill` launched with stdio ignored; exit 0, empty stdout; subagents ignored |
| 1.8 | `distill/segment` | Code blocks removed, lists, PT/EN abbreviations, URLs, candidate cap |
| 1.9 | `judge/heuristic` | Table per rule; filter precision on the initial golden set |
| 1.10 | `distill/queue` and `pipeline` | A crash after insertion does not duplicate; an expired lease is resumed; two drainers process each turn once; a poison turn ends up `failed` after 3 attempts |
| 1.11 | `distill/consolidate` | Duplicate reinforces evidence; supersession creates the link; unrelated inserts |
| 1.12 | `retrieve/*` | Query (identifiers, PT stopwords, short prompts); token budget never exceeded; deduplication per epoch |
| 1.13 | `hook session-start` | Injects on `startup`/`clear`/`compact`, not on `resume`; empty DB gives empty output; below 10,000 characters |
| 1.14 | `hook prompt` — injection | Maximum 5 above the threshold; no repetition within the epoch; with the DB locked it returns empty within budget and exit 0 |
| 1.15 | `mcp/server` | In-memory client and one test via subprocess; `memory_save` goes through secret redaction and consolidation |
| 1.16 | `install`/`uninstall` for Claude Code | Temporary HOME: idempotent, keys that are not ours preserved, uninstall restores the original; invalid JSON is not touched |
| 1.17 | `doctor`/`status` | Snapshots with a seeded DB; exit code ≠ 0 when a check fails |
| 1.18 | E2E harness, performance budgets and golden set in the CI | See "Verification" |
| 1.19 | Real use in Claude Code | Checklist below |

## Verification

**Automatic (CI):**
- `bun test` — unit (pure functions with case tables) and integration (SQLite in a temporary directory, injectable clock).
- E2E harness: runs the **compiled binary** and sends the sequence `session-start → prompt → turn-end → session-end` over stdin against a temporary data directory. Scenarios: normal session, interrupted turn, compaction, two concurrent sessions, `distill` killed midway, locked DB.
- Budgets as tests, with 5,000 memories: `hook prompt` p95 ≤ 80 ms (≤ 200 ms on Windows), `session-start` ≤ 150 ms, `turn-end` ≤ 60 ms; fails if it regresses by more than 25%.
- Golden set: labelled turns in PT and EN and prompt→relevant memories pairs. Metrics: filter precision and recall, recall@5, and injection rate on prompts with no relevant memory (target close to zero).

**Manual, at the end of M1 (in a test project, with claude-mem disabled so there are not two memories injecting):**
1. `shibaox-mem install claude-code` and `shibaox-mem doctor` with no failures.
2. A real session with three or four turns, one of them interrupted.
3. `shibaox-mem status` shows the distilled turns and the memories created.
4. New session: the summary appears at startup; a related prompt receives relevant memories; an unrelated prompt receives nothing.
5. With the session stopped, `pgrep -fl shibaox-mem` returns no resident processes.
6. No model call was made by shibaox-mem.
7. `shibaox-mem uninstall claude-code` restores `~/.claude/settings.json` byte for byte.

## Risks, by severity

| # | Risk | How it is reduced early |
|---|---|---|
| 1 | Extractive memories of little use (poor final messages, sentences without a referent) | Candidates from the prompt, deterministic header, `memory_save`, golden set from 1.9 on, real use at the end of M1 |
| 2 | Hook latency on Windows (binary of tens of MB, antivirus) | Spike 0.5 before any product code; MCP SDK out of the hooks' path |
| 3 | Lost turns and transcript format drift | Turn opened at the prompt; transcript best-effort only; versioned fixtures |
| 4 | Detached process killed by the agent on Windows | Spike 0.7; the queue is drained by any later invocation |
| 5 | Secret leakage | `Redacted` type, test corpus, binary without `.env`; rule-based redaction is fallible and that is documented |
| 6 | Recall with BM25 alone | Several channels with RRF; recall@5 measured in the CI |
| 7 | Dependency on TypeSafe (version 0.x, quality in Portuguese) | `Judge` interface, mandatory fallback, comparison on the golden set |
| 8 | Parity between agents | Capability matrix; logging hook before each adapter |
| 9 | Variation of the system SQLite on macOS | Conservative SQL; probe in `doctor` |

## After approval

1. `git init` in the project directory and first commit with licence, `CLEAN-ROOM.md` and the design document (`docs/design/2026-10-05-shibaox-mem-design.md`, derived from this plan).
2. M0 in the order of the table. The spike numbers may force decisions to be revisited; if any fails its criterion, I stop and bring you the alternative before moving on.
3. M1 in TDD, with small commits per step.

---

## Appendix A — Repository structure

```
src/cli/main.ts               argv dispatch; dynamic import per command
src/cli/commands/             hook, distill, mcp, install, uninstall, doctor, status, search, forget
src/core/                     types, budget (Deadline), redact, git, project
src/store/                    db (open, pragmas, migrate, withWrite), sessions, turns, memories, injections, meta
src/store/migrations/         0001_init.sql (embedded in the binary)
src/adapters/types.ts         AgentAdapter + capability matrix
src/adapters/claude-code/     payloads, transcript, install, adapter
src/distill/                  segment, pipeline, consolidate, queue
src/judge/                    types, heuristic, typesafe, client, breaker, fallback
src/retrieve/                 query, rank, budget, render, staleness
src/mcp/server.ts
src/util/                     spawn, log, tokens, paths
tests/                        unit, integration, e2e, perf, golden, fixtures/
scripts/                      build.ts, release.ts
.github/workflows/            ci.yml, release.yml
```

SQLite rules: `busy_timeout` set first on every connection (≈100 ms in the prompt hook, 2 s in `distill`); all writes in `BEGIN IMMEDIATE`; no transaction open during a network call; forward-only migrations, with `PRAGMA user_version` and a backup via `VACUUM INTO` before migrating data.

## Appendix B — Initial schema (0001_init.sql)

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE project_aliases (
  alias TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE) WITHOUT ROWID;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY, agent TEXT NOT NULL, agent_session_id TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id), cwd TEXT NOT NULL, branch TEXT,
  context_epoch INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ended_at INTEGER,
  UNIQUE (agent, agent_session_id));

CREATE TABLE turns (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  seq INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open','pending','processing','done','skipped','failed')),
  completeness TEXT NOT NULL DEFAULT 'full' CHECK (completeness IN ('full','payload-only','interrupted')),
  branch TEXT, commit_sha TEXT,
  prompt TEXT NOT NULL, final_text TEXT,
  files_read TEXT NOT NULL DEFAULT '[]', files_changed TEXT NOT NULL DEFAULT '[]',
  commands TEXT NOT NULL DEFAULT '[]', errors TEXT NOT NULL DEFAULT '[]',
  transcript_path TEXT, transcript_start INTEGER, transcript_end INTEGER,
  started_at INTEGER NOT NULL, ended_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER, last_error TEXT,
  UNIQUE (session_id, seq));
CREATE INDEX turns_queue ON turns(state, id) WHERE state IN ('open','pending','processing');
CREATE INDEX turns_project_time ON turns(project_id, started_at DESC);

CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('decision','fix','gotcha','convention','change','discovery')),
  title TEXT NOT NULL, body TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '',
  importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  superseded_by INTEGER REFERENCES memories(id),
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('project','branch')),
  branch TEXT, commit_sha TEXT, stale INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL CHECK (origin IN ('distilled','manual','imported')),
  judge TEXT NOT NULL, judge_version TEXT NOT NULL,
  source_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL,
  source_ordinal INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (source_turn_id, source_ordinal));
CREATE INDEX memories_rank ON memories(project_id, status, importance DESC, updated_at DESC);

CREATE TABLE memory_files (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('changed','read')),
  PRIMARY KEY (memory_id, path)) WITHOUT ROWID;
CREATE INDEX memory_files_path ON memory_files(path, memory_id);

CREATE TABLE memory_sources (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('origin','duplicate','supersedes')),
  PRIMARY KEY (memory_id, turn_id)) WITHOUT ROWID;

CREATE VIRTUAL TABLE memories_fts USING fts5(
  title, body, terms, content='memories', content_rowid='id',
  tokenize = "unicode61 remove_diacritics 2");
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms); END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms); END;
CREATE TRIGGER memories_au AFTER UPDATE OF title, body, terms ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, body, terms) VALUES ('delete', old.id, old.title, old.body, old.terms);
  INSERT INTO memories_fts(rowid, title, body, terms) VALUES (new.id, new.title, new.body, new.terms); END;

CREATE TABLE injections (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  context_epoch INTEGER NOT NULL,
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('session-start','prompt','mcp')),
  score REAL, tokens INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE UNIQUE INDEX injections_once ON injections(session_id, context_epoch, memory_id) WHERE event <> 'mcp';

CREATE TABLE hook_runs (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, agent TEXT NOT NULL, event TEXT NOT NULL,
  ms INTEGER NOT NULL, outcome TEXT NOT NULL);
```

No `STRICT` on purpose: on macOS Bun uses the system SQLite, whose version varies. Caps per field: prompt 8 KB, final text 16 KB. `hook_runs` is pruned to the last 2,000 rows.

## Appendix C — Judge interface

```ts
export type Source = "typesafe" | "heuristic";
export type MemoryKind = "decision" | "fix" | "gotcha" | "convention" | "change" | "discovery";
export type Redacted = string & { readonly __redacted: unique symbol };

export interface DistillInput {
  prompt: Redacted; finalText: Redacted;
  candidates: { idx: number; text: Redacted }[];
  filesChanged: string[]; commands: Redacted[]; hadErrors: boolean;
}
export interface DistillVerdict {
  worthSaving: number;                 // P(yes)
  kind: MemoryKind | "none"; kindConfidence: number;
  importance: 1 | 2 | 3 | 4 | 5;
  durable: number[];                   // P per candidate, aligned by idx
  titleIdx: number | null; source: Source;
}
export interface ConsolidateInput {
  draft: { title: string; body: Redacted; kind: MemoryKind; files: string[] };
  neighbours: { id: number; title: string; body: Redacted; files: string[] }[];   // ≤ 8, from BM25
}
export interface ConsolidateVerdict {
  perNeighbour: { id: number; relation: "different" | "related" | "same"; relationScore: number; contradicts: number }[];
  source: Source;
}
export interface Judge {
  readonly name: Source | "fallback";
  distill(i: DistillInput, d: Deadline): Promise<DistillVerdict>;
  consolidate(i: ConsolidateInput, d: Deadline): Promise<ConsolidateVerdict>;
  rerank(i: RerankInput, d: Deadline): Promise<RerankVerdict>;
}
export function withFallback(primary: Judge, fallback: Judge, breaker: Breaker, policy: FallbackPolicy): Judge;
```

In M1 only the `HeuristicJudge` exists, already behind this interface. The exact text of the TypeSafe questions is defined in M2, after re-reading the current pages on the primitives, on `confidence` and the reranking and entity-alignment cookbooks at docs.typesafe.ai.
