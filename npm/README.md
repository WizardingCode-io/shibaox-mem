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

shibaox-mem is installed from inside your agent, the way that agent installs anything else. The plugin fetches the binary for your platform on its first session (checksum verified) and keeps one copy for all agents in `~/.shibaox/mem/bin`.

**Claude Code**

```sh
claude plugin marketplace add WizardingCode-io/shibaox-plugins
claude plugin install shibaox-mem@shibaox-plugins
```

**Codex**

```sh
codex plugin marketplace add WizardingCode-io/shibaox-plugins
codex plugin add shibaox-mem@shibaox-plugins
```

Codex asks you to review a plugin's hooks before it runs them: open `/hooks` once and accept the shibaox-mem entries.

**Gemini CLI**

```sh
gemini extensions install https://github.com/WizardingCode-io/shibaox-mem
```

**OpenCode**

```sh
opencode plugin shibaox-mem-opencode --global
```

**Cursor**

The plugin is in `plugins/cursor`; add it from the Cursor marketplace once it is listed, or import this repository as a plugin source.

Start a new session afterwards. Memories live in `~/.shibaox/mem` whichever agent wrote them, so what Claude Code learns, Codex is told.

<details>
<summary>Without a plugin system: the installer</summary>

```sh
curl -fsSL https://raw.githubusercontent.com/WizardingCode-io/shibaox-mem/main/scripts/install.sh | sh
```

or `brew install wizardingcode-io/shibaox/shibaox-mem && shibaox-mem install`. This writes the hooks into each agent's own configuration instead (`shibaox-mem install claude-code`, `codex`, `cursor`, `gemini`, `opencode`), and `shibaox-mem uninstall <agent>` puts every file back as it was. If an agent has both this and the plugin, the plugin stands down. On Windows, download `shibaox-mem-windows-x64.exe` from the [releases](https://github.com/WizardingCode-io/shibaox-mem/releases) and run `shibaox-mem install`.

</details>

### Coming from claude-mem

`shibaox-mem import claude-mem` brings your claude-mem memories over (read-only; its database is never changed). Disable the claude-mem plugin afterwards (`claude plugin disable claude-mem@thedotmack`) so that only one memory speaks to Claude Code; `shibaox-mem install claude-code` does both for you. `shibaox-mem rejudge` then asks TypeSafe to judge the imported memories properly: on 89 000 real ones it archived a quarter as noise and corrected the kind of one in ten, for about $3.40.

## Use

Nothing to do: memories are captured at the end of each turn and shown at the start of sessions and alongside relevant prompts, inside a `<shibaox-mem-notes>` block the agent is told to treat as background.

The agent also gets three tools: `memory_search`, `memory_get` and `memory_save` — the last one for when you say "remember this".

The binary is at `~/.shibaox/mem/bin/shibaox-mem`; put that directory on your `PATH`, or call it by its full path:

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

| Agent | Installed as | Captures | Injects |
|---|---|---|---|
| Claude Code | plugin (marketplace) | hooks + transcript | session start, every prompt |
| Codex CLI | plugin (marketplace) | hooks + rollout | session start, every prompt |
| Gemini CLI | extension | hooks | session start, every prompt |
| OpenCode | npm plugin | plugin events | system prompt |
| Cursor | plugin | hooks | session start (Cursor takes no context per prompt) |

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
