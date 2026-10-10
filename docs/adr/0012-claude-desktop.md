# ADR 0012 — Claude Desktop: one memory for coding and for the app

Date: 2026-10-10 · Status: accepted.

## Context

The user works in Claude Code, which reaches the memory through hooks and MCP, and also in Claude Desktop (chat, Cowork, the Code tab), for example to design. A decision taken in one place must be known in the other.

What Claude Desktop loads from a plugin, according to its documentation ([platform support](https://claude.com/docs/plugins/platform-support), [plugins](https://claude.com/docs/plugins/overview)) as of 2026-10-10:

| | Chat | Cowork | Code tab |
|---|---|---|---|
| Hooks | ignored | load | load |
| A plugin's local MCP server | ignored | loads when the session runs on the user's computer | loads |
| Skills | load | load | load |

Separately from plugins, the chat starts the local MCP servers listed in `claude_desktop_config.json`. A plugin added in the app (Customize → Plugins, from a Git marketplace) is saved to the account, so it also reaches Claude Code as a synced plugin.

## Decisions

- **Cowork and the Code tab use the plugin.** The user adds the existing `WizardingCode-io/wizardingcode-plugins` marketplace in the app. The plugin's hooks capture and inject in Cowork as they do in Claude Code. The Code tab already used the plugin.
- **The chat uses the MCP server.** `wizardingcode-mem install claude-desktop` writes our server into `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`, Linux `~/.config/Claude/`). It keeps every other key and server, refuses a file that is not valid JSON, and replaces a `shibaox-mem` entry. `install` with no agent includes Claude Desktop when its directory exists. `uninstall claude-desktop` removes the server, and `doctor` reports it.
- **The chat spans every project.** A chat has no project folder, so the server runs as `wizardingcode-mem mcp --global`:
  - `memory_search` searches every project (or only the one it names) and prefixes each heading with `[project]`.
  - `memory_get` reads any memory and names its project.
  - `memory_save` needs a `project` (name or key). Without one, nothing is saved and the answer lists the recent projects.
  - A fourth tool, `memory_projects`, lists the projects with the most recently active first.
  - The server sends MCP instructions that tell the model when to search and when to save.

  Reads are not recorded as injections in this mode, because there is no session to attach them to.
- **A `memory` skill ships in the plugin** (`skills/memory/SKILL.md`). The chat and Cowork load skills, so the model is told when to search (a conversation about one of the user's projects) and when to save (a decision with its reason, a stated rule, a pitfall).

## Not yet verified

- Cowork hook payloads in a live session. Cowork runs the same plugin hooks; the Claude Code adapter is expected to read them, but this has not been run.
- The chat calling the global tools inside the app. The tools are exercised through `wizardingcode-mem tool --global` and unit tests.
