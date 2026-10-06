# ADR 0004 — Brand and name: shibaox-mem

Date: 2026-10-05 · Status: accepted.

## Context

A strategic decision by WizardingCode: instead of yet another application with agents, build **for all agents** (Claude Code, Codex, Cursor, Gemini CLI, OpenCode…): plugins, skills and workflows, with authority and monetisation through associated services. These products live in the `WizardingCode-io` GitHub organisation under the **shibaox** brand, whose brand book and design system already exist. The "agentic OS" of the same name (`WizardingCode-io/shibaox`, npm `shibaox`) will be discontinued and deleted.

This product was called **ai-mem** during M0 and M1, as a provisional name. Nothing had been published and nobody had data in `~/.ai-mem`, so the change was mechanical.

## Decisions

| Topic | Decision |
|---|---|
| Name | `shibaox-mem`: binary, MCP server, npm package, repository `WizardingCode-io/shibaox-mem` |
| Data | `~/.shibaox/mem` — the brand's directory, respecting `SHIBAOX_HOME`; `SHIBAOX_MEM_DATA_DIR` moves only this product |
| Variables | `SHIBAOX_MEM_*` |
| Files | `shibaox-mem.db`, `logs/shibaox-mem.log`, binaries `shibaox-mem-<os>-<arch>` |
| Notes wrapper | `<shibaox-mem-notes>` |
| MCP tools | `memory_search`, `memory_get`, `memory_save` — the server name is already the brand (`mcp__shibaox-mem__memory_save`) |
| Licence and holder | Apache-2.0, open-core; NOTICE in WizardingCode's name |

## Convention for the brand's next products

- Name: `shibaox-<thing>` (product, plugin, skill, package).
- Environment variables: `SHIBAOX_<THING>_*`.
- Data: `~/.shibaox/<thing>`, never inside an agent's plugin directory (it is deleted on uninstall).
- Distribution: the brand's marketplace `WizardingCode-io/shibaox-plugins` for Claude Code; npm and our own installers for the binaries.
- Open core, paid services around it.
