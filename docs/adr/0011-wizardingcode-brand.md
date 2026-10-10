# ADR 0011 — The shibaox brand is retired: wizardingcode-mem

Date: 2026-10-10 · Status: accepted. Supersedes ADR 0004.

## Context

WizardingCode is retiring the shibaox brand. The tools for coding agents now sit in the WizardingCode ecosystem, under its name and its brand system: tokens, type, logo and voice, kept in the rebrand repository's `01-brand/` and `02-design-system/`. Version 0.3.0 was published as `shibaox-mem` on npm, Homebrew and the `shibaox-plugins` marketplace. It has a handful of users, its author among them, with real data in `~/.shibaox/mem`.

## Decisions

| Topic | Until 0.3.0 | From 0.4.0 |
|---|---|---|
| Name (binary, MCP server, npm package, repository) | `shibaox-mem` | `wizardingcode-mem` |
| OpenCode package | `shibaox-mem-opencode` | `wizardingcode-mem-opencode` |
| Data | `~/.shibaox/mem` (`SHIBAOX_HOME`) | `~/.wizardingcode/mem` (`WIZARDINGCODE_HOME`) |
| Variables | `SHIBAOX_MEM_*` | `WIZARDINGCODE_MEM_*` |
| Files | `shibaox-mem.db`, backups `shibaox-mem-<time>-v<n>.db.gz` | `wizardingcode-mem.db`, `wizardingcode-mem-<time>-v<n>.db.gz` |
| Notes wrapper | `<shibaox-mem-notes>` | `<wizardingcode-mem-notes>` |
| Marketplace | `WizardingCode-io/shibaox-plugins` | `WizardingCode-io/wizardingcode-plugins` |
| Homebrew tap | `wizardingcode-io/shibaox` | `wizardingcode-io/wizardingcode` |

The repositories are renamed rather than recreated, so GitHub's redirects keep 0.3.0's download URLs working. The old npm packages are deprecated and point to the new ones.

For the brand's next products, the convention is `wizardingcode-<thing>` for the name, `WIZARDINGCODE_<THING>_*` for variables and `~/.wizardingcode/<thing>` for data. Data never lives inside an agent's plugin directory.

## Taking a 0.3.0 install over

This happens without the user doing anything, before any command (`src/util/legacy.ts`, called from `src/cli/main.ts`).

- **Variables.** Each `SHIBAOX_*` variable stands in for the matching `WIZARDINGCODE_*` one when that is unset. `doctor` points them out. They are honoured until 0.5.
- **Data directory.** `~/.shibaox/mem`, or `$SHIBAOX_HOME/mem`, is moved to the new directory.
  - If the new directory exists but is not in use (the new plugin fetches its binary into it first), the old one is merged into it, keeping the new binary.
  - If the old directory cannot be moved (another volume, a file held open on Windows), it is copied instead. The database is copied with `VACUUM INTO` so the copy is consistent, and the old directory stays.
  - An explicit `WIZARDINGCODE_MEM_DATA_DIR` is left alone.
- **Settings and database.** The settings file's keys are renamed. The database is renamed wherever the store lives, after a `wal_checkpoint(TRUNCATE)` so the WAL loses nothing.
- **Concurrency.** A lock file (`<data dir>.migrating`, taken over after 10 minutes) keeps two processes from migrating at once. A hook that meets the lock exits 0 with no output, so no command starts an empty memory beside the one being moved. Any other command says to try again.
- **Agent hooks.** `install` recognises shibaox-mem hooks and MCP entries as its own and replaces them.
- **Agent plugins.** `install` uninstalls shibaox-mem's agent plugins through the agent's own command, asking first unless `--yes` is given. That command exists for Claude Code (`claude plugin uninstall`), Codex (`codex plugin remove`) and Gemini CLI (`gemini extensions uninstall`). For the OpenCode npm plugin, it says what to do. `doctor` warns while any of them is still enabled.
- **Old text.** The old notes wrapper is still stripped from transcripts and made inert in stored text. Old backup names are still listed and restorable.

Tests set `WIZARDINGCODE_MEM_MIGRATE=off` (in `tests/preload.ts`), so a developer's real `~/.shibaox` is never touched. When there is nothing to migrate, the check costs about 0.06 ms per command.

## Consequences

- ADRs 0001–0010 and the design document keep the old names: they record what was decided at the time.
- The compatibility code (`src/util/legacy.ts`, `src/install/legacy-plugins.ts`, the `shibaox` alternatives in `render.ts` and `backup/target.ts`) can go at 0.5.
- The viewer moves to the WizardingCode brand system. The shiba mascot, its palette and the shibaox design system's files leave the binary.
