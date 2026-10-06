# ADR 0006 — M3: one binary, five agents

Date: 2026-10-05 · Status: accepted.

## What exists

The same binary and the same database serve Claude Code, Codex CLI, Cursor, Gemini CLI and OpenCode. Each agent has an adapter (`src/adapters/<agent>/`) that translates the host's payload into the core's `HookInput` and the core's context into the output the host reads; the core does not know which agent it is. `shibaox-mem install <agent>` writes what each host needs; `shibaox-mem install` with no agent installs for every one it finds (command on the PATH or configuration directory); `doctor` checks all five, skipping those not on the machine.

| Agent | How we capture the turn | Injection | Installation | Confirmed |
|---|---|---|---|---|
| Claude Code | `UserPromptSubmit.prompt` + `Stop.last_assistant_message`; JSONL transcript | startup and per prompt (`hookSpecificOutput.additionalContext`) | `~/.claude/settings.json`, hooks in exec form | M1, in real use |
| Codex CLI 0.153 | same as Claude Code, turn in `turn_id`; JSONL rollout (`item_completed`: `CommandExecution`, `FileChange`, `McpToolCall`) | same as Claude Code; cap 8,000 characters (spill at ~2,500 tokens) | `$CODEX_HOME/hooks.json`, `command` as a shell string with the binary in single quotes; `codex mcp add`; the user approves in `/hooks` | `SessionStart`, `UserPromptSubmit`, `SessionEnd` captured; `Stop` from the docs (login expired) |
| Cursor | `beforeSubmitPrompt.prompt` + `afterAgentResponse.text`; session = `conversation_id`, cwd = `workspace_roots[0]` | startup only (`additional_context`); the prompt hook replies `{"continue": true}` | `~/.cursor/hooks.json` (flat layout, `version: 1`) + `~/.cursor/mcp.json` | nothing captured: there is no Cursor on this machine |
| Gemini CLI 0.26 | `BeforeAgent.prompt` + `AfterAgent.prompt_response`; no turn id | startup and per prompt (`hookSpecificOutput`, `hookEventName: BeforeAgent`) | `~/.gemini/settings.json`, hooks with `name` (trust list) and timeout in ms; `gemini mcp add -s user` | `SessionStart`, `SessionEnd` captured; `BeforeAgent`/`AfterAgent` from the docs (no login) |
| OpenCode 1.18 | our own TS plugin: `chat.message` → prompt, `session.idle` + `client.session.messages` → turn end, `session.created` → startup | `experimental.chat.system.transform` (brief + the turn's notes, on every request) | one file in `~/.config/opencode/plugins/`; native tools that run `shibaox-mem tool` — nothing in the user's `opencode.json` | plugin loads and `session-start`/`prompt` ran in real OpenCode; `turn-end` to be confirmed (the configured provider had no credit) |
| Antigravity | — | — | MCP only, configured by the user | — |

## Decisions

- **Claude Code's payload as the common form.** Codex speaks it natively; the OpenCode plugin produces it. One parser (`adapters/common/hook-json.ts`) serves all three; Gemini and Cursor have their own.
- **Generic installer driven by a specification** (`install/hooks-file.ts`, `HostSpec`): events, entry shape, recognition of what is ours, MCP registration by command or by file, grouped or flat layout. Receipts, backups and byte-for-byte restore are the same for all.
- **Nothing of the user's is edited in OpenCode.** The `opencode.json(c)` allows comments and is theirs; we write only our plugin file, recognised by a marker. The tools are native to the plugin and call `shibaox-mem tool <name> --project <dir>`, which shares code and schemas with the MCP server.
- **No transcript where we have not seen one.** Gemini (chat file), Cursor and OpenCode declare `transcript: false`; the core degrades (no files read/changed, no commands). Codex reads the rollout on a best-effort basis, like Claude Code.
- **Verdicts only from the host, never invented.** When a host gives no turn id (Gemini, Cursor), the turn is the session's open one; Cursor may have a stable `generation_id`, but without a capture it is not trusted.
- **Project hooks are not used.** Codex and Gemini ask for trust per hook; Gemini adds project hooks to its trust list in non-interactive mode with a warning. We always install at user level.

## Left to do

- Capture Codex's `Stop`, Gemini's `BeforeAgent`/`AfterAgent` and any Cursor payload in real sessions; fix the fixtures if they differ.
- Confirm `session.idle` → `turn-end` in OpenCode with a working provider; then pass the turn's files and commands in the payload (the plugin has the messages), so that retrieval and staleness work as in Claude Code.
- Read Gemini's chat file when there is a specimen.
- OpenCode's `system.transform` also receives the title-generation request; the notes go there needlessly (~2,000 tokens per turn).
