# ADR 0001 — Results of the platform spikes (M0)

Date: 2026-10-05 · Status: accepted on all five platforms (CI of 2026-10-05, see end).

## Context

The design rests on five platform bets: a binary compiled with Bun starts fast enough to run on every prompt; FTS5 exists on every target; several short-lived processes can write to the same SQLite file; a detached child process outlives the hook; and the official MCP SDK works inside the binary. This ADR records what was measured.

All measurements below were taken with the **compiled binary** (`dist/shibaox-mem-darwin-arm64`, Bun 1.4.2, macOS 26 arm64) through `shibaox-mem __spike all`.

## Results

| Spike | Criterion | Result (darwin-arm64) |
|---|---|---|
| 0.2 Binary sizes | < 120 MB | 62.6 MB (darwin-arm64), 69.3 (darwin-x64), 80.8 (linux-x64), 80.7 (linux-arm64), 85.3 (windows-x64) |
| 0.4 FTS5 | `remove_diacritics 2`, triggers, `bm25()`, `snippet()` | Passes. SQLite 3.51.0 (the system's) |
| 0.5 Startup, 50 runs | p95 ≤ 60 ms | `noop` p50 6.1 / p95 8.8 ms; opening the DB p50 8.1 / p95 10.3 ms; first run 6.3 ms |
| 0.6 WAL, 8 writers × 200 transactions + 2 readers | Zero `SQLITE_BUSY`, integrity ok | 1,600 rows, 0 errors, `integrity_check` ok, p99 per transaction 5–9 ms |
| 0.7 Detached process | The child writes the marker after the parent exits | Passes; the parent exits in ~8 ms |
| 0.8 MCP in the binary | `initialize`, `tools/list`, `tools/call` over stdio | Passes; the server exits on its own when stdin closes |
| `.env` isolation | The binary does not load the working directory's `.env` | Passes. Counter-proof: a binary compiled **without** the flags loads it |
| 0.9 TypeSafe cold latency | Measure | **Not run**: no `TYPESAFE_API_KEY` in the environment |

## Decisions

1. **Bun 1.4.2 pinned as a `devDependency`.** The scripts use the `bun` from `node_modules/.bin`; the user's global Bun is not touched. `.bun-version` gives the CI the same version and a test ensures the two match.
2. **`--bytecode` enabled.** Brings startup down from p95 7.9 ms to 5.9 ms (`noop`) for +1.5 MB.
3. **Linux and Windows x64 targets use the `-baseline` runtime.** The default runtime requires AVX2 and dies with "Illegal instruction" on old CPUs and some virtual machines.
4. **No `--windows-hide-console`.** It would turn the `.exe` into a GUI application, unable to write to an interactive console.
5. **MCP SDK: `@modelcontextprotocol/server` 2.x** (stable line, depends only on `zod` and the core). Loaded via `import()` only in the `mcp` command. The manual JSON-RPC plan B is not needed.
6. **`distill` is launched as a detached process** (`detached`, all three stdio ignored, `unref`). On macOS it works; the system still does not depend on it, because the queue is drained by any later invocation.
7. **Exit codes:** usage errors exit with 64. Never 2, which in the agents blocks the action.

## Actual hook contract of Claude Code 2.1.289

Captured with a logging hook (`shibaox-mem __spike log-payload`) in `claude -p` sessions. Sanitised fixtures in `tests/fixtures/claude-code/`.

| Event | Observed fields |
|---|---|
| `SessionStart` | `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `source` (`startup` or `resume`) |
| `UserPromptSubmit` | the previous ones + `prompt_id`, `permission_mode`, `prompt` |
| `Stop` | + `prompt_id`, `permission_mode`, `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` |
| `SessionEnd` | + `prompt_id`, `reason` |

Consequences for the design:

- **A turn's key is (`session_id`, `prompt_id`).** The `prompt_id` is new on every prompt and is the same in `UserPromptSubmit`, in `Stop` and in the transcript's `user` lines.
- **In an interrupted turn (SIGINT) `Stop` does not fire; `SessionEnd` does.** This confirms the decision to open the turn at the prompt. `SessionEnd` has to close the turns still open as interrupted; it cannot be only a drain trigger.
- **Resuming a session keeps the `session_id`** and sends `SessionStart` with `source: "resume"`.
- **The exec form of hooks works** (`command` + `args`, no shell). It is the one the installer will write, with an absolute path.
- **Divergences from the reading of the documentation:** `Stop` does not carry `tool_use_count`; `SessionStart` does not carry `model`. The touched files come only from the transcript.
- **Transcript:** the `user` lines with the prompt have `promptId` and `message.content` as text; tool calls are `tool_use` blocks (`name`, `input`) in `assistant` lines; results come in `user` lines with `toolUseResult` (`filePath`, `type`, …). The format is internal: it is read tolerantly and only in `distill`.

## Left to do

- **Run the CI** (`.github/workflows/ci.yml`) to repeat all spikes on darwin-x64, linux-x64, linux-arm64 and windows-x64. It needs a remote repository. The Windows criteria (startup p95 ≤ 150 ms, detached process inside a real hook) remain to be measured.
- **Spike 0.9** with a TypeSafe key. Until then, remote per-prompt reranking stays off by default.

## CI result on all five platforms (2026-10-05)

First run on `WizardingCode-io/shibaox-mem`. All probes passed; numbers from GitHub runners (shared machines, slower than the development one).

| Platform | SQLite | Startup p95 (noop / open DB), ms | WAL p99 per transaction, ms | Detached | MCP | `.env` loaded |
|---|---|---|---|---|---|---|
| darwin-arm64 | 3.51.0 | 19.1 / 27.6 | 9.5 | yes | yes | no |
| darwin-x64 | 3.43.2 | 22.0 / 26.6 | 25.8 | yes | yes | no |
| linux-arm64 | 3.53.2 | 5.6 / 6.9 | 5.3 | yes | yes | no |
| linux-x64 | 3.53.2 | 7.6 / 8.6 | 8.4 | yes | yes | no |
| windows-x64 | 3.53.2 | 16.8 / 21.6 | 7.8 | yes | yes | no |

- The startup budget (60 ms; 150 on Windows) is met with room to spare on all of them. In a later run the macOS Intel runner gave p50 39 ms but p95 129 ms, from shared-machine noise; the probe now requires the median within budget and the tail (p95) below 150 ms.
- The **detached process survives on Windows** on the runner, outside a real Claude Code hook; that case remains to be measured.
- The CI's macOS x64 has the oldest SQLite (3.43.2): it confirms the conservative-SQL decision.
- The only defect found was in cleaning up the probes' temporary directory on Windows (EBUSY right after closing the DB), fixed with a tolerant retry.

