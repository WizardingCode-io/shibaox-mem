# ADR 0003 — Import from claude-mem and retire it on install

Date: 2026-10-05 · Status: accepted.

## Context

Whoever swaps claude-mem for shibaox-mem has months of memories there and two systems injecting context into the same session. `install` now handles the swap: it imports first, then retires claude-mem.

## What was decided

- **Read-only on the user's database.** `~/.claude-mem/claude-mem.db` is opened in read-only mode and is never altered or deleted. The 9.2 GB stay where they are; the report says how to delete them. This is data interoperability, allowed by `CLEAN-ROOM.md`; claude-mem's code remains off limits.
- **Project by directory name.** claude-mem does not store paths, only the directory name. Each imported project gets the alias `imported:<name>`; the first directory seen with that name, with no project of its own yet, adopts it and gains the real aliases. Two directories with the same name: the first one keeps the memories.
- **Everything is imported**, except the `sensitive` and `task-boundary` types and exact repeats. An observation with only a title is a statement and stays. The 13,350 session summaries are not imported: the "where we left off" comes from our turns.
- **Type mapping:** bugfix→fix; feature/change/refactor→change; decision→decision (importance 3); discovery→discovery; gotcha and security_*→gotcha (3 and 4); pattern→convention; the rest→discovery. Importance 2 by default. The original date is kept, so age decay applies.
- **Retiring claude-mem** = `claude plugin disable` plus stopping the worker, Chroma and the MCP servers, identified by the installation's paths (plugin cache, data directory), never by words. It asks for confirmation in a terminal; `--yes` accepts, `--keep-claude-mem` declines, `--no-import` skips the import. Without a terminal and without `--yes`, it only imports and warns. End of input with no answer counts as no.
- **Idempotent:** a marker in `meta` stores the last imported id; running again imports only what is new. `shibaox-mem import claude-mem [--db]` exists on its own.

## Measurements (this user's real database, 89,530 observations)

| What | Result |
|---|---|
| Import | 89,449 memories, 72 projects, 3 sensitive ones left out, in 31 s (10 min before swapping the duplicate check for a set of hashes) |
| Size | 209 MB (claude-mem takes 9.2 GB) |
| Prompt hook, project with 36k memories | ~60 ms internal, p95 62 ms (budget 80); an unrelated prompt injects nothing |
| `distill` with staleness over 36k memories | 0.27 s |

## Known limits

- Running the import while claude-mem's worker is writing is safe for the source, but may read a half-way state; running again picks up the rest.
- The quality of the imported memories is claude-mem's: 70% are `change`/`discovery`, often noisy. Evidence-based retrieval and age decay are what keep them out of the way.
- Stopping claude-mem's MCP servers affects Claude Code sessions that are open: they lose its `mcp-search` tools until restarted. The sessions keep working.

## After the real import (2026-10-05)

With the 89k memories from 72 projects in the same database, the prompt hook in real Claude Code took **300–1,000 ms** (`doctor` caught it: p95 927 ms). Cause: the full-text index spanned all projects; a query in a project of 273 memories first walked 55–67 thousand rows from the others. The performance test did not see it because it seeded a single project.

Fix: migration `0002` adds `project_id` as a column of the index, and every query carries it inside the `MATCH` (`inProject` in `src/util/words.ts`). On the real database: retrieval from 115–127 ms to 12–25 ms; end-to-end hook 50–55 ms. The performance test now seeds six other projects (60k memories) and uses a paragraph-length prompt. Migrating the real database (209 MB) took 3.7 s, with backup.

