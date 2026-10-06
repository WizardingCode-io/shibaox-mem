# ADR 0007 — M4: viewer and maintenance

Date: 2026-10-05 · Status: accepted.

## What exists

- **`shibaox-mem ui`**: a local page over the database, in the brand's design system (tokens, Bricolage Grotesque and Geist embedded in the binary, the mascot in empty states). Projects with their counts; memories by recency or through the same search the agent uses (`explicitMatch`, shared with `memory_search`); each memory in full, with its files and the prompt it came from; archive and restore. Nothing else changes from here. Deep links `#m<id>`.
- **`shibaox-mem compact [--dry-run]`**: finished turns older than 90 days that no memory came from, sessions left empty, latency records beyond the last 5 000; then `VACUUM`. Memories are never deleted here.
- **`status`** shows archived ones; **`rejudge`** (ADR 0005) and the MCP echo (ADR 0002, #4) also landed in this milestone.

## Decisions

- **Loopback only, a token in the URL, `Host` checked, stops after 30 min without a request.** A site open in another tab cannot reach the API (no token; a wrong `Host` gets 403); another user of the machine cannot guess the token.
- **Nothing comes from the network.** The fonts travel in the binary (`with { type: "file" }`, ≈ 100 KB) and are served under `/assets/`; the brand's `tokens.css` `@font-face` rules and utility classes are dropped when the page is generated — only the variables go in, because the classes (`.title`, `.body`) collided with the page's own.
- **Vue 3 + Tailwind 4 + Nuxt UI, built into one file** (replaces the earlier decision of "plain JavaScript, no framework"). The app lives in `ui/` and Vite (`vite-plugin-singlefile`) produces `src/ui/dist/index.html`, which the binary embeds with `with { type: "text" }`; `ui/dist` is not in git, and `bun run test`/`build`/`check` build it first. The API is still pure functions in `src/ui/api.ts`, tested over HTTP with `port: 0`. The two earlier versions, in vanilla with the brand's `components.css`, came out crooked (the focus ring in the wrong place, a native `select`) and could not grow: a command palette, edit forms and slideovers need real components. The brand's tokens (`--bg`, `--surface`, `--ink`, `--shiba`, …) are defined in `ui/src/app.css` and mapped onto Nuxt UI's semantic variables (`--ui-bg`, `--ui-text`, `--ui-primary`, …), so the components come out in the brand with no CSS of their own; the `shiba` palette is Nuxt UI's primary colour.
- **Nothing comes from the network, in Vue either.** The fonts stay in the binary, served under `/assets/` without a token; the Lucide icons the app and Nuxt UI use are bundled at build time (`icon.clientBundle.scan` in the Nuxt UI plugin) so that nothing is requested from iconify at run time. The build fails if a requested icon is not in the installed collection.
- **The theme is Nuxt UI's colour mode** (VueUse's `useDark`: a `dark` class on `<html>`, remembered by the browser, following the system by default); a script before first paint reads the same record so there is no flash; `?theme=light|dark` pins it. The first attempt to manage the theme separately fought the Nuxt UI plugin and light never won.
- **The detail is a column from 1280 px up and a sheet (slideover) below.** The choice is made by `matchMedia`, not CSS: hiding the sheet with `xl:hidden` left its scrim, teleported to `<body>`, dimming the wide page.
- **Short, discreet motion:** Nuxt UI's own (120–200 ms), plus transitions only on hover, selection and the panel's bars; off under `prefers-reduced-motion`.
- **Editing is allowed, within limits.** The title, body, kind and importance of an active or archived memory can be corrected in the viewer (`PATCH /api/memories/:id`); the memory becomes `judge = 'user'`, the text is redacted like any other and the FTS follows. A superseded memory is not edited: the correction is a new `memory_save`. Deleting stays out.
- **`vue-tsc` stays out** until it works with TypeScript 7 (`./lib/tsc` is no longer exported); Vite builds without type-checking, and the components are small enough for the server's `check` and the HTTP tests to catch what matters.

## Measurements

| What | Result |
|---|---|
| Page with 28 534 active memories in one project (the-burrow-hub) | list paged by 50, immediate response; total count by `count(*)` |
| darwin-arm64 binary with the viewer | 63.3 MB (63.1 MB before) |
| `compact --dry-run` on the real database right after the rejudge | 0 turns, 0 sessions, 0 records — nothing is 90 days old yet; 206 MB |

## What the viewer does (from the version after 0.2.1)

Project filter in the sidebar; search with `/`; **command palette** with ⌘K (memories of every project through FTS, projects, actions); filters by kind, status and minimum importance; **edit** title, body, kind and importance; a **Turns** tab with the recent turns, their state (`done`, `skipped`, `failed`, `pending`) and error, each opened in full (prompt, answer, files read and changed, commands, errors) and **linked to the memories it produced** — and each memory to the turn it came from; an **Overview** tab with the project's dashboard (active, archived, superseded, by kind, by importance, by judge, eight weeks of memories and turns, hook latency); keyboard navigation (↑/↓ or j/k, Esc); archive, restore and **copy as a note** (in the `<shibaox-mem-notes>` format); light/dark theme following the system, remembered by the browser, `?theme=` to pin it; links `#m<id>`, `#turns` and `#overview`. Development with `bun run ui:dev` (Vite on 5180, proxying `/api` and `/assets` to a running `shibaox-mem ui`).

## Left to do

- Staleness by branch (#16 of ADR 0002): the mark already clears on returning to the branch; labelling "only on branch X" instead of hiding is still missing.
- Viewer: type-check the components again once `vue-tsc` supports TypeScript 7.
