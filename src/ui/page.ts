import shibaDefault from "./assets/shiba-default.svg" with { type: "text" };
import shibaSleeping from "./assets/shiba-sleeping.svg" with { type: "text" };
import mark from "./assets/shibaox-mark.svg" with { type: "text" };
import tokens from "./assets/tokens.css" with { type: "text" };

// The viewer's one page: the brand's tokens, its fonts from the binary, plain JavaScript
// against /api. Working screens stay calm (bg, surface, ink); the mascot appears once,
// in empty states, as the brand book asks.

// Only the variables are taken from the tokens file: its @font-face rules point at a
// fonts/ folder (ours point at the binary) and its utility classes would collide.
const tokenVariables = [...tokens.matchAll(/^(?::root|\[data-theme)[^{]*\{[^}]*\}/gm)]
  .map((match) => match[0])
  .join("\n");

const mascot = (svg: string, mood: string) =>
  svg.replace("<svg ", `<svg data-mascot="${mood}" class="mascot" aria-hidden="true" `);

export function renderPage(input: { token: string; version: string }): string {
  const font = (name: string) => `/assets/${name}?token=${input.token}`;
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>shibaox-mem</title>
<style>
${tokenVariables}
@font-face { font-family: "Bricolage Grotesque"; font-weight: 700; font-display: swap; src: url("${font("bricolage-grotesque-latin-700-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Geist"; font-weight: 400; font-display: swap; src: url("${font("geist-sans-latin-400-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Geist"; font-weight: 500; font-display: swap; src: url("${font("geist-sans-latin-500-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Geist Mono"; font-weight: 400; font-display: swap; src: url("${font("geist-mono-latin-400-normal.woff2")}") format("woff2"); }

*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--ink); font: var(--text-body); font-family: var(--font-sans); }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: var(--link); }
:focus-visible { outline: none; box-shadow: var(--focus-ring); }
code, .mono { font-family: var(--font-mono); font-size: 13px; }

.app { display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 480px); grid-template-rows: 100%; height: 100%; overflow: hidden; }
.app > * { min-height: 0; }
@media (max-width: 1100px) { .app { grid-template-columns: 220px minmax(0, 1fr); } .detail { position: fixed; inset: 0 0 0 auto; width: min(560px, 100%); box-shadow: var(--shadow-lg); transform: translateX(100%); transition: transform .2s; } .detail.open { transform: none; } }

.side { background: var(--surface-sunken); border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
.brand svg { width: 28px; height: 26px; }
.brand b { font: var(--text-heading); font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; }
.brand small { color: var(--ink-muted); font-size: 12px; margin-left: auto; }
.overline { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); padding: 0 8px; }
.projects { display: flex; flex-direction: column; gap: 2px; }
.project { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 8px; border: 0; background: none; border-radius: 8px; }
.project:hover { background: var(--surface-hover); }
.project[aria-current="true"] { background: var(--shiba-soft); color: var(--ink); }
.project .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.project .count { color: var(--ink-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.side footer { margin-top: auto; color: var(--ink-muted); font-size: 12px; padding: 0 8px; line-height: 1.5; word-break: break-all; }

.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 16px 20px 12px; border-bottom: 1px solid var(--line); }
.toolbar h1 { font: var(--text-title); margin: 0 auto 0 0; letter-spacing: -0.02em; }
.search { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; padding: 0 10px; height: 36px; }
.search input { flex: 1; border: 0; background: none; height: 100%; outline: none; }
.search kbd { color: var(--ink-muted); font-size: 11px; border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; }
select.quiet { height: 36px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 8px; padding: 0 8px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 20px 0; }
.chip { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 999px; padding: 3px 10px; font-size: 13px; }
.chip[aria-pressed="true"] { background: var(--shiba-soft); border-color: transparent; color: var(--shiba-strong); font-weight: 500; }
.summary { padding: 8px 20px 0; color: var(--ink-muted); font-size: 13px; }
.list { overflow: auto; min-height: 0; flex: 1; padding: 8px 12px 24px; display: flex; flex-direction: column; gap: 4px; }
.row { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; text-align: left; width: 100%; padding: 10px 12px; border: 1px solid transparent; background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-sm); }
.row:hover { background: var(--surface-hover); }
.row[aria-current="true"] { border-color: var(--shiba); }
.row .title { font-weight: 500; }
.row .meta { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; color: var(--ink-muted); font-size: 12px; flex-wrap: wrap; }
.badge { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 500; background: var(--surface-sunken); color: var(--ink-muted); }
.badge.decision { background: var(--info-soft); color: var(--info); }
.badge.fix { background: var(--matcha-soft); color: var(--matcha); }
.badge.gotcha { background: var(--warning-soft); color: var(--warning); }
.badge.convention { background: var(--shiba-soft); color: var(--shiba-strong); }
.badge.stale, .badge.archived, .badge.superseded { background: var(--danger-soft); color: var(--danger); }
.dots { letter-spacing: 2px; color: var(--shiba-strong); font-size: 11px; }
.more { align-self: center; margin: 8px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 8px; padding: 6px 14px; }

.detail { background: var(--surface); border-left: 1px solid var(--line); overflow: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.detail h2 { font: var(--text-heading); margin: 0; }
.detail .body { white-space: pre-wrap; line-height: 1.6; }
.detail dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.detail dt { color: var(--ink-muted); }
.detail dd { margin: 0; word-break: break-word; }
.detail ul { margin: 0; padding-left: 18px; }
.actions { display: flex; gap: 8px; }
.btn { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--surface); font-weight: 500; }
.btn.primary { background: var(--shiba); color: var(--on-shiba); border-color: transparent; }
.btn.danger { color: var(--danger); }
.source { background: var(--surface-sunken); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--ink-muted); white-space: pre-wrap; }

.empty { margin: auto; text-align: center; padding: 48px 24px; max-width: 420px; color: var(--ink-muted); }
.empty .mascot { width: 120px; height: 120px; }
.empty.hint { padding: 24px; font-size: 13px; }
.empty h3 { font: var(--text-display); font-size: 28px; line-height: 34px; color: var(--ink); margin: 12px 0 6px; }
.hidden { display: none !important; }
</style>
</head>
<body>
<div class="app">
  <nav class="side">
    <div class="brand">${mark}<b>shibaox-mem</b><small>v${input.version}</small></div>
    <div class="overline">Projects</div>
    <div class="projects" id="projects"></div>
    <footer id="footer"></footer>
  </nav>
  <main class="main">
    <div class="toolbar">
      <h1 id="projectName">Memories</h1>
      <label class="search"><input id="q" type="search" placeholder="Search titles, bodies, file names" autocomplete="off"><kbd>/</kbd></label>
      <select class="quiet" id="status" aria-label="Status">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="superseded">Superseded</option>
        <option value="all">All</option>
      </select>
    </div>
    <div class="chips" id="kinds"></div>
    <div class="summary" id="summary"></div>
    <div class="list" id="list"></div>
  </main>
  <aside class="detail" id="detail"></aside>
</div>
<template id="tpl-hint"><div class="empty hint"><p>Select a memory to read it in full, archive it or bring it back.</p></div></template>
<template id="tpl-empty-none">${mascot(shibaSleeping, "sleeping")}<h3>Nothing remembered yet</h3><p>Start a session in any of your agents. What is worth keeping shows up here.</p></template>
<template id="tpl-empty-search">${mascot(shibaDefault, "default")}<h3>No memories match</h3><p>Try fewer words, or another kind.</p></template>
<script>
(() => {
  const TOKEN = ${JSON.stringify(input.token)};
  const KINDS = ["decision", "fix", "gotcha", "convention", "change", "discovery"];
  const PAGE = 50;
  const $ = (id) => document.getElementById(id);
  const state = { projects: [], projectId: null, q: "", kind: null, status: "active", items: [], total: 0, selected: null };

  if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";

  const api = async (path, init) => {
    const res = await fetch(path, { ...init, headers: { Authorization: "Bearer " + TOKEN, ...(init && init.headers || {}) } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const when = (ms) => ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  const dots = (n) => "<span class=\\"dots\\" title=\\"importance " + n + "\\">" + "●".repeat(n) + "○".repeat(5 - n) + "</span>";

  async function loadOverview() {
    const overview = await api("/api/overview");
    state.projects = overview.projects;
    $("footer").textContent = overview.dataDir;
    renderProjects();
    if (state.projectId === null && state.projects.length) selectProject(state.projects[0].id);
    if (!state.projects.length) { $("list").innerHTML = ""; $("list").append(empty("none")); }
  }
  function renderProjects() {
    $("projects").innerHTML = state.projects.map((p) =>
      '<button class="project" data-id="' + p.id + '" aria-current="' + (p.id === state.projectId) + '">' +
      '<span class="name" title="' + esc(p.key) + '">' + esc(p.name) + '</span><span class="count">' + p.active + '</span></button>').join("");
    $("projects").querySelectorAll(".project").forEach((b) => b.onclick = () => selectProject(Number(b.dataset.id)));
    $("kinds").innerHTML = ['<button class="chip" data-kind="" aria-pressed="' + (state.kind === null) + '">All kinds</button>']
      .concat(KINDS.map((k) => '<button class="chip" data-kind="' + k + '" aria-pressed="' + (state.kind === k) + '">' + k + '</button>')).join("");
    $("kinds").querySelectorAll(".chip").forEach((b) => b.onclick = () => { state.kind = b.dataset.kind || null; renderProjects(); loadList(); });
  }
  function resetDetail() {
    const d = $("detail"); d.classList.remove("open"); d.innerHTML = ""; d.append($("tpl-hint").content.cloneNode(true));
  }
  function selectProject(id) {
    state.projectId = id; state.selected = null; resetDetail();
    const p = state.projects.find((x) => x.id === id);
    $("projectName").textContent = p ? p.name : "Memories";
    renderProjects(); loadList();
  }
  function empty(kind) {
    const div = document.createElement("div"); div.className = "empty";
    div.append($("tpl-empty-" + kind).content.cloneNode(true)); return div;
  }
  async function loadList(offset = 0) {
    if (state.projectId === null) return;
    const params = new URLSearchParams({ project: state.projectId, status: state.status, limit: PAGE, offset });
    if (state.q) params.set("q", state.q);
    if (state.kind) params.set("kind", state.kind);
    const page = await api("/api/memories?" + params);
    state.items = offset ? state.items.concat(page.items) : page.items; state.total = page.total;
    renderList();
  }
  function renderList() {
    const list = $("list"); list.innerHTML = "";
    const p = state.projects.find((x) => x.id === state.projectId);
    $("summary").textContent = state.total + (state.total === 1 ? " memory" : " memories") + (state.q ? ' matching "' + state.q + '"' : "") + (p && p.stale ? " · " + p.stale + " stale" : "");
    if (!state.items.length) { list.append(empty(state.q || state.kind ? "search" : "none")); return; }
    for (const m of state.items) {
      const b = document.createElement("button"); b.className = "row"; b.setAttribute("aria-current", String(state.selected === m.id));
      b.innerHTML = '<span class="title">' + esc(m.title) + '</span>' + dots(m.importance) +
        '<span class="meta"><span class="badge ' + m.kind + '">' + m.kind + '</span>' +
        (m.status !== "active" ? '<span class="badge ' + m.status + '">' + m.status + '</span>' : "") +
        (m.stale ? '<span class="badge stale">stale</span>' : "") +
        '<span>' + when(m.updatedAt) + '</span>' +
        (m.files.length ? '<span class="mono">' + esc(m.files[0]) + (m.files.length > 1 ? " +" + (m.files.length - 1) : "") + '</span>' : "") +
        (m.useCount ? '<span>used ' + m.useCount + '×</span>' : "") + '</span>';
      b.onclick = () => select(m.id);
      list.append(b);
    }
    if (state.items.length < state.total) {
      const more = document.createElement("button"); more.className = "more"; more.textContent = "Show more";
      more.onclick = () => loadList(state.items.length); list.append(more);
    }
  }
  async function select(id) {
    state.selected = id; renderList();
    history.replaceState(null, "", "#m" + id);
    const m = await api("/api/memories/" + id);
    const d = $("detail"); d.classList.add("open");
    d.innerHTML = '<div class="actions">' +
      (m.status === "active" ? '<button class="btn danger" id="archive">Archive</button>' : m.status === "archived" ? '<button class="btn primary" id="restore">Restore</button>' : "") +
      '<button class="btn" id="close">Close</button></div>' +
      '<h2>' + esc(m.title) + '</h2>' +
      '<div class="body">' + esc(m.body || "") + '</div>' +
      '<dl><dt>Kind</dt><dd><span class="badge ' + m.kind + '">' + m.kind + '</span></dd>' +
      '<dt>Importance</dt><dd>' + dots(m.importance) + '</dd>' +
      '<dt>Status</dt><dd>' + m.status + (m.stale ? " · stale" : "") + (m.supersededBy ? " · replaced by #" + m.supersededBy : "") + '</dd>' +
      '<dt>Judged by</dt><dd>' + esc(m.judge) + ' v' + esc(m.judgeVersion) + '</dd>' +
      '<dt>Origin</dt><dd>' + esc(m.origin) + (m.branch ? ' · ' + esc(m.branch) : "") + '</dd>' +
      '<dt>Created</dt><dd>' + when(m.createdAt) + '</dd>' +
      '<dt>Evidence</dt><dd>' + m.evidenceCount + ' turn' + (m.evidenceCount === 1 ? "" : "s") + (m.useCount ? ' · read ' + m.useCount + '×' : "") + '</dd>' +
      '<dt>Id</dt><dd class="mono">#' + m.id + '</dd></dl>' +
      (m.fileRoles.length ? '<div><div class="overline" style="padding:0">Files</div><ul>' + m.fileRoles.map((f) => '<li class="mono">' + esc(f.path) + (f.role === "read" ? ' <span class="badge">read</span>' : "") + '</li>').join("") + '</ul></div>' : "") +
      (m.source ? '<div><div class="overline" style="padding:0">From the prompt (' + esc(m.source.agent) + ', ' + when(m.source.startedAt) + ')</div><div class="source">' + esc(m.source.prompt) + '</div></div>' : "");
    const set = (status) => async () => { await api("/api/memories/" + id, { method: "POST", body: JSON.stringify({ status }) }); await loadOverview(); await loadList(); select(id); };
    if ($("archive")) $("archive").onclick = set("archived");
    if ($("restore")) $("restore").onclick = set("active");
    $("close").onclick = () => { state.selected = null; history.replaceState(null, "", "#"); resetDetail(); renderList(); };
  }

  let timer;
  $("q").oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.q = $("q").value.trim(); loadList(); }, 150); };
  $("status").onchange = () => { state.status = $("status").value; loadList(); };
  document.addEventListener("keydown", (e) => {
    if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); }
    if (e.key === "Escape" && state.selected !== null) $("close") && $("close").click();
  });
  resetDetail();
  loadOverview().then(() => {
    // A link to one memory opens it, in its own project.
    const deep = /^#m(\\d+)$/.exec(location.hash);
    if (deep) api("/api/memories/" + deep[1]).then((m) => { if (m.projectId !== state.projectId) selectProject(m.projectId); select(m.id); }).catch(() => {});
  }).catch((e) => { $("summary").textContent = "Could not reach shibaox-mem: " + e.message; });
})();
</script>
</body>
</html>
`;
}
