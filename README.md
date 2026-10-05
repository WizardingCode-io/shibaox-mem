# shibaox-mem

Persistent memory for coding agents. What one session learns, the next session is told — in Claude Code, Codex CLI, Cursor, Gemini CLI and OpenCode, from the same memory.

One local binary. No daemon, no LLM in the loop, nothing leaves your machine unless you ask it to.

## Why

Most agent memories work by having a model summarise every tool call, inside your subscription. That costs tokens on every turn, adds a resident process, and tends to remember what happened rather than what matters.

shibaox-mem is **extractive**: at the end of each turn it looks at what you asked and what the agent concluded, keeps the sentences that would help a later session (a decision and its reason, a rule you stated, a pitfall and its fix), and throws the rest away. The judgement is made by rules, or — if you give it a key — by [TypeSafe](https://typesafe.ai)'s System One model, which judges rather than generates and costs about $0.00006 per turn. Either way your agent's plan is never spent on memory.

- **Fast.** The hook that runs on every prompt takes tens of milliseconds and reads one SQLite file. Distillation runs afterwards, in a short-lived background process.
- **Useful.** Notes are retrieved for the prompt at hand (full-text search with light stemming, fused with the files you touched, recency, importance and prior use), never repeated within a session, and marked stale when the files they describe disappear.
- **Private.** Secrets are redacted before anything is stored. There is no telemetry and no account. With a TypeSafe key, only the text of the turn being judged is sent; without one, nothing is.
- **Yours.** `shibaox-mem ui` opens a local viewer over your memories; `shibaox-mem uninstall` puts every file it touched back as it was.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/WizardingCode-io/shibaox-mem/main/scripts/install.sh | sh
```

This downloads the binary for your platform into `~/.shibaox/mem/bin`, checks its checksum, and sets it up for every supported agent found on the machine. To set up one agent only:

```sh
shibaox-mem install claude-code     # also: codex, cursor, gemini, opencode
```

On Windows, download `shibaox-mem-windows-x64.exe` from the [releases](https://github.com/WizardingCode-io/shibaox-mem/releases) and run `shibaox-mem install`.

### As a Claude Code plugin

```
/plugin marketplace add WizardingCode-io/shibaox-plugins
/plugin install shibaox-mem@shibaox-plugins
```

The plugin fetches the matching binary on its first session and keeps it in the plugin's data directory. Memories live in `~/.shibaox/mem` either way.

### Coming from claude-mem

`shibaox-mem install claude-code` imports your claude-mem memories (read-only; its database is never changed) and offers to disable the claude-mem plugin and stop its processes, so that only one memory speaks to Claude Code. `shibaox-mem rejudge` then asks TypeSafe to judge the imported memories properly: on 89 000 real ones it archived a quarter as noise and corrected the kind of one in ten, for about $3.40.

## Use

Nothing to do: memories are captured at the end of each turn and shown at the start of sessions and alongside relevant prompts, inside a `<shibaox-mem-notes>` block the agent is told to treat as background.

The agent also gets three tools: `memory_search`, `memory_get` and `memory_save` — the last one for when you say "remember this".

```
shibaox-mem status      # what is stored, how the queue stands, how fast the hooks are
shibaox-mem doctor      # checks the installation and says what to do about anything wrong
shibaox-mem ui          # the viewer: search, read, archive, restore
shibaox-mem compact     # removes old records no memory depends on
shibaox-mem uninstall <agent>
```

### TypeSafe (optional)

Put `TYPESAFE_API_KEY=…` in `~/.shibaox/mem/env` (or the environment). Distillation and consolidation are then judged by `jev-latest`; when the service is unreachable the rules take over, and `status` shows what it cost.

## Agents

| Agent | Captures | Injects | Notes |
|---|---|---|---|
| Claude Code | hooks + transcript | session start, every prompt | direct install or plugin |
| Codex CLI | hooks + rollout | session start, every prompt | approve the hooks once in `/hooks` |
| Cursor | hooks | session start | Cursor takes no context per prompt |
| Gemini CLI | hooks | session start, every prompt | |
| OpenCode | plugin | system prompt | tools are native to the plugin |

## Data

`~/.shibaox/mem/shibaox-mem.db` (SQLite, WAL). `SHIBAOX_HOME` moves the whole `~/.shibaox`; `SHIBAOX_MEM_DATA_DIR` moves only this product's data. Delete the folder to delete everything.

## Development

```sh
bun install
bun run check     # typecheck, lint, 880+ tests including end-to-end over the compiled binary
bun run build     # the five release binaries, in dist/
```

Design and the decisions measured along the way are in `docs/`. This project is written from scratch; `CLEAN-ROOM.md` says what that means.

## Licence

Apache-2.0. © 2026 WizardingCode. shibaox-mem is part of the [shibaox](https://github.com/WizardingCode-io) family of tools for coding agents.
