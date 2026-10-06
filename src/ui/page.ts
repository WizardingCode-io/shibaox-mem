import components from "./assets/components.css" with { type: "text" };
import shibaDefault from "./assets/shiba-default.svg" with { type: "text" };
import shibaSleeping from "./assets/shiba-sleeping.svg" with { type: "text" };
import mark from "./assets/shibaox-mark.svg" with { type: "text" };
import tokens from "./assets/tokens.css" with { type: "text" };

// The viewer's one page, built from the brand's design system: its tokens, its component
// styles (`.sx-*`), its fonts served from the binary, its mascot in empty states. Plain
// JavaScript against /api. Working screens stay calm; the orange is for what is selected.

// Only the variables are taken from the tokens file: its @font-face rules point at a
// fonts/ folder (ours point at the binary) and its utility classes would collide.
const tokenVariables = [...tokens.matchAll(/^(?::root|\[data-theme)[^{]*\{[^}]*\}/gm)]
  .map((match) => match[0])
  .join("\n");

const mascot = (svg: string, mood: string) =>
  svg.replace("<svg ", `<svg data-mascot="${mood}" class="mascot" aria-hidden="true" `);

/** Lucide icons (ISC), drawn with currentColor. */
const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restore:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
};
const icon = (name: string, size = 16) =>
  `<svg class="sx-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** The chevron a native select shows, in the muted ink of each theme. */
const chevron = (stroke: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")`;

export function renderPage(input: { token: string; version: string }): string {
  const font = (name: string) => `/assets/${name}?token=${input.token}`;
  const icons = JSON.stringify({
    archive: icon("archive"),
    restore: icon("restore"),
    copy: icon("copy"),
    check: icon("check"),
    x: icon("x"),
    sun: icon("sun"),
    moon: icon("moon"),
    file: icon("file", 14),
  });
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
${components}

/* ---- Page ---- */
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
html { color-scheme: light; }
html[data-theme="dark"] { color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: var(--text-body); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }
a { color: var(--link); }
.mono { font-family: var(--font-mono); font-size: 12px; }

.app { display: grid; grid-template-columns: 264px minmax(0, 1fr) minmax(0, 460px); grid-template-rows: 100%; height: 100%; overflow: hidden; }
.app > * { min-height: 0; }
@media (max-width: 1180px) {
  .app { grid-template-columns: 232px minmax(0, 1fr); }
  .detail { position: fixed; inset: 0 0 0 auto; width: min(520px, 100%); box-shadow: var(--shadow-lg); transform: translateX(100%); transition: transform .2s cubic-bezier(.2,.8,.2,1); }
  .detail.is-open { transform: none; }
}

/* Sidebar */
.side { background: var(--surface-sunken); border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4) var(--space-3); overflow: hidden; }
.brand { display: flex; align-items: center; gap: 10px; padding: 2px var(--space-2); }
.brand svg { width: 26px; height: 24px; flex: none; }
.brand__name { font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: -0.02em; color: var(--ink); white-space: nowrap; }
.brand__version { margin-left: auto; font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
@media (max-width: 1180px) { .brand__version { display: none; } }
.side .sx-field__box { height: var(--control-sm); }
.side .sx-field__input { font-size: 13px; }
.overline { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); padding: 0 var(--space-2); }
.projects { display: flex; flex-direction: column; gap: 2px; overflow: auto; min-height: 0; }
.sx-nav { transition: background-color .12s; }
.sx-nav__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx-nav.is-active .sx-nav__count { color: var(--shiba-strong); }
.side__foot { margin-top: auto; padding: 0 var(--space-2); font-size: 11px; color: var(--ink-muted); line-height: 16px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.side__foot .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }

/* Main */
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.toolbar { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto auto; gap: var(--space-3); align-items: center; padding: var(--space-4) var(--space-5) var(--space-3); border-bottom: 1px solid var(--line); }
.toolbar h1 { font-family: var(--font-display); font-weight: 700; font-size: 26px; line-height: 32px; letter-spacing: -0.02em; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 30vw; }
.sx-field__box .sx-icon { color: var(--ink-muted); }
.sx-field__input::placeholder { color: var(--ink-muted); opacity: 1; }
.sx-field__box { transition: border-color .12s, box-shadow .12s; }
.sx-field__box:focus-within { box-shadow: none; border-color: var(--focus); }
.sx-field__box:has(.sx-field__input:focus-visible) { box-shadow: var(--focus-ring); }
.sx-field__input:focus, .sx-field__input:focus-visible { outline: none; box-shadow: none; }
/* A native select dressed as the design system's trigger. */
select.sx-select { appearance: none; -webkit-appearance: none; padding-right: 32px; min-width: 0; width: 140px; background-image: ${chevron("%236b5a4c")}; background-repeat: no-repeat; background-position: right 10px center; transition: background-color .12s, border-color .12s, box-shadow .12s; }
html[data-theme="dark"] select.sx-select { background-image: ${chevron("%23b9a694")}; }
select.sx-select:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--focus); }
.sx-iconbtn--md { width: var(--control-md); height: var(--control-md); }
.sx-iconbtn--secondary { background: var(--surface); border-color: var(--line-strong); color: var(--ink-muted); }
.sx-iconbtn--secondary:hover:not(:disabled) { background: var(--surface-hover); color: var(--ink); }

.filters { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5) 0; }
.filters__spacer { flex: 1; }
.kinds { display: flex; align-items: center; padding: var(--space-3) var(--space-5) 0; overflow-x: auto; scrollbar-width: none; }
.kinds::-webkit-scrollbar { display: none; }
.kinds .sx-seg { flex: none; }
.sx-seg__item { transition: background-color .12s, color .12s, box-shadow .12s; white-space: nowrap; }
.sx-tab { transition: background-color .12s, color .12s; }
.summary { padding: var(--space-3) var(--space-5) var(--space-2); font-size: 12px; line-height: 16px; color: var(--ink-muted); display: flex; gap: var(--space-2); align-items: center; }
.summary__hint { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }

.list { overflow: auto; min-height: 0; flex: 1; padding: var(--space-1) var(--space-4) var(--space-6); display: flex; flex-direction: column; gap: var(--space-2); }
.card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px var(--space-4); align-items: start; width: 100%; text-align: left; padding: 12px var(--space-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); cursor: pointer; transition: background-color .12s, border-color .12s, box-shadow .15s; }
.card:hover { background: var(--surface-hover); border-color: var(--line-strong); }
.card:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.card.is-selected { border-color: var(--shiba); box-shadow: 0 0 0 1px var(--shiba), var(--shadow-sm); }
.card__title { font-size: 15px; line-height: 22px; font-weight: 500; color: var(--ink); overflow-wrap: anywhere; }
.card__meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--space-2); font-size: 12px; line-height: 16px; color: var(--ink-muted); }
.imp { display: inline-flex; gap: 3px; padding-top: 8px; }
.imp i { width: 6px; height: 6px; border-radius: 50%; background: var(--line); display: block; }
.imp i.on { background: var(--shiba); }
.more { align-self: center; margin-top: var(--space-2); }

.turn { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px var(--space-3); align-items: start; padding: 10px var(--space-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); font-size: 13px; line-height: 20px; }
.turn .sx-badge { margin-top: -1px; }
.turn__prompt { color: var(--ink); overflow-wrap: anywhere; }
.turn__when { color: var(--ink-muted); font-size: 12px; white-space: nowrap; }
.turn__note { grid-column: 2 / -1; font-size: 12px; color: var(--ink-muted); }
.turn__note.is-error { color: var(--danger); }

/* Detail */
.detail { background: var(--surface); border-left: 1px solid var(--line); overflow: auto; display: flex; flex-direction: column; }
.detail__bar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--surface); z-index: 1; }
.detail__bar .grow { flex: 1; }
.detail__body { padding: var(--space-5) var(--space-5) var(--space-6); display: flex; flex-direction: column; gap: var(--space-5); animation: rise .18s cubic-bezier(.2,.8,.2,1); }
.detail__kicker { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.detail__kicker .imp { padding-top: 0; margin-left: 2px; }
.detail h2 { font-family: var(--font-display); font-weight: 700; font-size: 22px; line-height: 28px; letter-spacing: -0.015em; margin: 0; overflow-wrap: anywhere; }
.detail .body { white-space: pre-wrap; font-size: 15px; line-height: 24px; overflow-wrap: anywhere; }
.detail .body:empty { display: none; }
.kv { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 8px var(--space-3); font-size: 13px; line-height: 18px; margin: 0; }
.kv dt { color: var(--ink-muted); }
.kv dd { margin: 0; overflow-wrap: anywhere; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.kv .muted { color: var(--ink-muted); }
.section { display: flex; flex-direction: column; gap: var(--space-2); }
.section .overline { padding: 0; }
.files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.files li { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: 12px; line-height: 18px; color: var(--ink); }
.files li .sx-icon { color: var(--ink-muted); }
.source { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-3); font-size: 13px; line-height: 20px; color: var(--ink-muted); white-space: pre-wrap; overflow-wrap: anywhere; }

/* Empty states */
.empty { margin: auto; text-align: center; padding: var(--space-8) var(--space-5); max-width: 360px; color: var(--ink-muted); font-size: 14px; line-height: 22px; animation: rise .2s cubic-bezier(.2,.8,.2,1); }
.empty .mascot { width: 112px; height: 112px; }
.empty h3 { font-family: var(--font-display); font-weight: 700; font-size: 24px; line-height: 30px; letter-spacing: -0.02em; color: var(--ink); margin: var(--space-3) 0 var(--space-2); }
.empty p { margin: 0; }
.empty.hint { padding: var(--space-6) var(--space-5); font-size: 13px; }
.keys { display: inline-flex; gap: 6px; align-items: center; margin-top: var(--space-3); color: var(--ink-muted); font-size: 12px; }

.toast-host { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 50; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.toast-host .sx-toast { pointer-events: auto; animation: rise .18s cubic-bezier(.2,.8,.2,1); }

@keyframes rise { from { transform: translateY(6px); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
.hidden { display: none !important; }
</style>
</head>
<body>
<div class="app">
  <nav class="side" aria-label="Projects">
    <div class="brand">${mark}<span class="brand__name">shibaox-mem</span><span class="brand__version">v${input.version}</span></div>
    <label class="sx-field__box">${icon("search", 14)}<input id="pq" class="sx-field__input" type="search" placeholder="Filter projects" autocomplete="off" aria-label="Filter projects"></label>
    <div class="overline">Projects</div>
    <div class="projects sx-scroll" id="projects" role="list"></div>
    <div class="side__foot"><span>Data</span><span class="mono" id="footer" title=""></span></div>
  </nav>
  <main class="main">
    <div class="toolbar">
      <h1 id="projectName">Memories</h1>
      <label class="sx-field__box">${icon("search")}<input id="q" class="sx-field__input" type="search" placeholder="Search titles, bodies, file names" autocomplete="off" aria-label="Search memories"><kbd class="sx-kbd">/</kbd></label>
      <select class="sx-select" id="status" aria-label="Status">
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="superseded">Superseded</option>
        <option value="all">All</option>
      </select>
      <button class="sx-iconbtn sx-iconbtn--md sx-iconbtn--secondary" id="theme" aria-label="Switch theme" title="Switch theme">${icon("moon")}</button>
    </div>
    <div class="filters">
      <div class="sx-tabs" role="tablist" id="tabs">
        <button class="sx-tab is-active" role="tab" data-tab="memories" aria-selected="true">Memories</button>
        <button class="sx-tab" role="tab" data-tab="turns" aria-selected="false">Turns</button>
      </div>
      <span class="filters__spacer"></span>
      <select class="sx-select" id="importance" aria-label="Importance" style="width:172px">
        <option value="1">Any importance</option>
        <option value="3">Useful and up</option>
        <option value="4">Important and up</option>
        <option value="5">Critical only</option>
      </select>
    </div>
    <div class="kinds" id="kindsRow"><div class="sx-seg" role="group" aria-label="Kind" id="kinds"></div></div>
    <div class="summary" id="summary"></div>
    <div class="list sx-scroll" id="list" role="list"></div>
  </main>
  <aside class="detail sx-scroll" id="detail" aria-label="Memory"></aside>
</div>
<div class="toast-host" id="toasts"></div>
<template id="tpl-hint"><div class="empty hint"><p>Select a memory to read it in full, archive it or bring it back.</p><div class="keys"><kbd class="sx-kbd">↑</kbd><kbd class="sx-kbd">↓</kbd> move <kbd class="sx-kbd">Esc</kbd> close</div></div></template>
<template id="tpl-empty-none">${mascot(shibaSleeping, "sleeping")}<h3>Nothing remembered yet</h3><p>Start a session in any of your agents. What is worth keeping shows up here.</p></template>
<template id="tpl-empty-search">${mascot(shibaDefault, "default")}<h3>No memories match</h3><p>Try fewer words, another kind, or a lower importance.</p></template>
<template id="tpl-empty-turns">${mascot(shibaDefault, "default")}<h3>No turns yet</h3><p>Every prompt and answer in this project lands here before it is distilled.</p></template>
<script>
(() => {
  const TOKEN = ${JSON.stringify(input.token)};
  const KINDS = ["decision", "fix", "gotcha", "convention", "change", "discovery"];
  const TONE = { decision: "info", fix: "matcha", gotcha: "warning", convention: "shiba", change: "", discovery: "" };
  const TURN_TONE = { done: "matcha", skipped: "", failed: "danger", pending: "info", processing: "info", open: "info" };
  const PAGE = 50;
  const ICON = ${icons};
  const $ = (id) => document.getElementById(id);
  const state = { projects: [], projectFilter: "", projectId: null, tab: "memories", q: "", kind: null, status: "active", minImportance: 1, items: [], total: 0, turns: [], selected: null };

  // Theme: the system's, unless pinned by ?theme= or by the toggle (remembered per browser).
  const pinned = new URLSearchParams(location.search).get("theme");
  let saved = null;
  try { saved = localStorage.getItem("shibaox-mem.theme"); } catch (e) { saved = null; }
  const initial = pinned === "light" || pinned === "dark" ? pinned : saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; $("theme").innerHTML = t === "dark" ? ICON.sun : ICON.moon; };
  applyTheme(initial);
  $("theme").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyTheme(t); try { localStorage.setItem("shibaox-mem.theme", t); } catch (e) { /* a private window */ } };

  const api = async (path, init) => {
    const res = await fetch(path, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + TOKEN }, (init && init.headers) || {}) }));
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const when = (ms) => ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  const ago = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return when(ms); };
  const imp = (n) => '<span class="imp" title="importance ' + n + ' of 5" aria-label="importance ' + n + ' of 5">' + [1, 2, 3, 4, 5].map((i) => "<i" + (i <= n ? ' class="on"' : "") + "></i>").join("") + "</span>";
  const badge = (kind) => '<span class="sx-badge' + (TONE[kind] ? " sx-badge--" + TONE[kind] : "") + '">' + esc(kind) + "</span>";
  const sbadge = (status) => status === "active" ? "" : '<span class="sx-badge sx-badge--danger">' + esc(status) + "</span>";
  const stale = (m) => m.stale ? '<span class="sx-badge sx-badge--warning">stale</span>' : "";
  const toast = (text, tone) => { const el = document.createElement("div"); el.className = "sx-toast" + (tone ? " sx-toast--" + tone : ""); el.innerHTML = '<span class="sx-toast__icon">' + ICON.check + '</span><div class="sx-toast__text"><div class="sx-toast__title">' + esc(text) + "</div></div>"; $("toasts").append(el); setTimeout(() => el.remove(), 2200); };
  const empty = (kind) => { const div = document.createElement("div"); div.className = "empty"; div.append($("tpl-empty-" + kind).content.cloneNode(true)); return div; };
  const hint = (text) => '<span class="summary__hint">' + text + "</span>";

  async function loadOverview() {
    const overview = await api("/api/overview");
    state.projects = overview.projects;
    const parts = overview.dataDir.split(/[\\/]/).filter(Boolean);
    $("footer").textContent = (parts.length > 2 ? "…/" : "/") + parts.slice(-2).join("/"); $("footer").title = overview.dataDir;
    renderProjects();
    if (state.projectId === null && state.projects.length) selectProject(state.projects[0].id);
    if (!state.projects.length) { $("list").innerHTML = ""; $("list").append(empty("none")); $("summary").textContent = ""; }
  }
  function renderProjects() {
    const f = state.projectFilter.toLowerCase();
    const shown = state.projects.filter((p) => !f || p.name.toLowerCase().includes(f) || p.key.toLowerCase().includes(f));
    $("projects").innerHTML = shown.map((p) =>
      '<button class="sx-nav' + (p.id === state.projectId ? " is-active" : "") + '" role="listitem" data-id="' + p.id + '" title="' + esc(p.key) + '"' + (p.id === state.projectId ? ' aria-current="page"' : "") + ">" +
      '<span class="sx-nav__label">' + esc(p.name) + '</span><span class="sx-nav__count">' + p.active.toLocaleString() + "</span></button>").join("") ||
      '<div class="overline">No project matches</div>';
    $("projects").querySelectorAll(".sx-nav").forEach((b) => { b.onclick = () => selectProject(Number(b.dataset.id)); });
  }
  function renderKinds() {
    $("kinds").innerHTML = [["", "All"]].concat(KINDS.map((k) => [k, k])).map(([k, label]) =>
      '<button class="sx-seg__item' + ((state.kind || "") === k ? " is-active" : "") + '" data-kind="' + k + '" aria-pressed="' + ((state.kind || "") === k) + '">' + label + "</button>").join("");
    $("kinds").querySelectorAll(".sx-seg__item").forEach((b) => { b.onclick = () => { state.kind = b.dataset.kind || null; renderKinds(); loadList(); }; });
  }
  function selectProject(id) {
    state.projectId = id; state.selected = null; resetDetail();
    const p = state.projects.find((x) => x.id === id);
    $("projectName").textContent = p ? p.name : "Memories"; $("projectName").title = p ? p.key : "";
    renderProjects();
    if (state.tab === "turns") loadTurns(); else loadList();
  }
  function resetDetail() {
    const d = $("detail"); d.classList.remove("is-open"); d.innerHTML = ""; d.append($("tpl-hint").content.cloneNode(true));
    history.replaceState(null, "", "#");
  }

  async function loadList(offset) {
    offset = offset || 0;
    if (state.projectId === null) return;
    const params = new URLSearchParams({ project: state.projectId, status: state.status, limit: PAGE, offset: offset, minImportance: state.minImportance });
    if (state.q) params.set("q", state.q);
    if (state.kind) params.set("kind", state.kind);
    const page = await api("/api/memories?" + params);
    state.items = offset ? state.items.concat(page.items) : page.items; state.total = page.total;
    renderList();
  }
  function renderList() {
    const list = $("list"); list.innerHTML = "";
    const p = state.projects.find((x) => x.id === state.projectId);
    const parts = [state.total.toLocaleString() + (state.total === 1 ? " memory" : " memories")];
    if (state.q) parts.push('matching "' + state.q + '"');
    if (state.status !== "active") parts.push(state.status);
    if (p && p.stale && state.status === "active") parts.push(p.stale.toLocaleString() + " stale");
    $("summary").innerHTML = esc(parts.join(" · ")) + hint('<kbd class="sx-kbd">↑</kbd><kbd class="sx-kbd">↓</kbd> move');
    if (!state.items.length) { list.append(empty(state.q || state.kind || state.minImportance > 1 ? "search" : "none")); return; }
    state.items.forEach((m) => {
      const b = document.createElement("button"); b.className = "card" + (state.selected === m.id ? " is-selected" : ""); b.setAttribute("role", "listitem"); b.dataset.id = m.id;
      b.innerHTML = '<span class="card__title">' + esc(m.title) + "</span>" + imp(m.importance) +
        '<span class="card__meta">' + badge(m.kind) + sbadge(m.status) + stale(m) +
        "<span>" + when(m.updatedAt) + "</span>" +
        (m.files.length ? '<span class="mono">' + esc(m.files[0]) + (m.files.length > 1 ? " +" + (m.files.length - 1) : "") + "</span>" : "") +
        (m.useCount ? "<span>read " + m.useCount + "×</span>" : "") + "</span>";
      b.onclick = () => select(m.id);
      list.append(b);
    });
    if (state.items.length < state.total) {
      const more = document.createElement("button"); more.className = "sx-btn sx-btn--secondary sx-btn--sm more"; more.textContent = "Show " + Math.min(PAGE, state.total - state.items.length) + " more";
      more.onclick = () => loadList(state.items.length); list.append(more);
    }
  }

  async function loadTurns() {
    if (state.projectId === null) return;
    state.turns = await api("/api/turns?project=" + state.projectId + "&limit=100");
    const list = $("list"); list.innerHTML = "";
    const n = state.turns.length;
    $("summary").innerHTML = esc(n.toLocaleString() + (n === 1 ? " recent turn" : " recent turns")) + hint("newest first");
    if (!n) { list.append(empty("turns")); return; }
    for (const t of state.turns) {
      const el = document.createElement("div"); el.className = "turn"; el.setAttribute("role", "listitem");
      el.innerHTML = '<span class="sx-badge' + (TURN_TONE[t.state] ? " sx-badge--" + TURN_TONE[t.state] : "") + '">' + esc(t.state) + "</span>" +
        '<span class="turn__prompt">' + esc(t.prompt || "(no prompt)") + "</span>" +
        '<span class="turn__when">' + esc(t.agent) + " · " + ago(t.startedAt) + "</span>" +
        (t.lastError ? '<span class="turn__note is-error">' + esc(t.lastError) + "</span>" : "") +
        (t.completeness !== "full" ? '<span class="turn__note">' + esc(t.completeness) + "</span>" : "");
      list.append(el);
    }
  }

  function noteText(m) {
    const files = m.files.length ? " · " + m.files.join(", ") : "";
    return "- #" + m.id + " [" + m.kind + " · " + new Date(m.createdAt).toISOString().slice(0, 10) + files + "] " + m.title + (m.body ? "\\n  " + m.body.split("\\n").join("\\n  ") : "");
  }
  async function select(id) {
    state.selected = id; renderList();
    const card = $("list").querySelector('[data-id="' + id + '"]'); if (card) card.scrollIntoView({ block: "nearest" });
    history.replaceState(null, "", "#m" + id);
    const m = await api("/api/memories/" + id);
    const d = $("detail"); d.classList.add("is-open");
    const act = m.status === "active" ? '<button class="sx-btn sx-btn--secondary sx-btn--sm" id="archive">' + ICON.archive + "Archive</button>" : m.status === "archived" ? '<button class="sx-btn sx-btn--primary sx-btn--sm" id="restore">' + ICON.restore + "Restore</button>" : "";
    d.innerHTML = '<div class="detail__bar">' + act + '<button class="sx-btn sx-btn--quiet sx-btn--sm" id="copy" title="Copy as a note">' + ICON.copy + 'Copy</button><span class="grow"></span><button class="sx-iconbtn sx-iconbtn--sm" id="close" aria-label="Close">' + ICON.x + "</button></div>" +
      '<div class="detail__body">' +
      '<div class="detail__kicker">' + badge(m.kind) + sbadge(m.status) + stale(m) + imp(m.importance) + "</div>" +
      "<h2>" + esc(m.title) + "</h2>" +
      '<div class="body">' + esc(m.body || "") + "</div>" +
      '<dl class="kv">' +
      "<dt>Judged by</dt><dd>" + esc(m.judge) + '<span class="muted">v' + esc(m.judgeVersion) + "</span></dd>" +
      "<dt>Origin</dt><dd>" + esc(m.origin) + (m.branch ? '<span class="mono muted">' + esc(m.branch) + "</span>" : "") + "</dd>" +
      "<dt>Created</dt><dd>" + when(m.createdAt) + (m.updatedAt !== m.createdAt ? '<span class="muted">updated ' + when(m.updatedAt) + "</span>" : "") + "</dd>" +
      "<dt>Evidence</dt><dd>" + m.evidenceCount + " turn" + (m.evidenceCount === 1 ? "" : "s") + (m.useCount ? '<span class="muted">read ' + m.useCount + "×</span>" : "") + "</dd>" +
      (m.supersededBy ? "<dt>Replaced by</dt><dd>#" + m.supersededBy + "</dd>" : "") +
      '<dt>Id</dt><dd class="mono">#' + m.id + "</dd></dl>" +
      (m.fileRoles.length ? '<div class="section"><div class="overline">Files</div><ul class="files">' + m.fileRoles.map((f) => "<li>" + ICON.file + "<span>" + esc(f.path) + "</span>" + (f.role === "read" ? '<span class="sx-badge">read</span>' : "") + "</li>").join("") + "</ul></div>" : "") +
      (m.source ? '<div class="section"><div class="overline">From the prompt · ' + esc(m.source.agent) + " · " + when(m.source.startedAt) + '</div><div class="source">' + esc(m.source.prompt) + "</div></div>" : "") +
      "</div>";
    const set = (status, said) => async () => { await api("/api/memories/" + id, { method: "POST", body: JSON.stringify({ status: status }) }); toast(said, "matcha"); await loadOverview(); await loadList(); select(id); };
    if ($("archive")) $("archive").onclick = set("archived", "Archived");
    if ($("restore")) $("restore").onclick = set("active", "Back in use");
    $("copy").onclick = async () => { try { await navigator.clipboard.writeText(noteText(m)); toast("Copied as a note", "matcha"); } catch (e) { toast("Could not copy"); } };
    $("close").onclick = () => { state.selected = null; resetDetail(); renderList(); };
  }

  // Keyboard: / or ⌘K to search, ↑/↓ (or j/k) to move through the list, Esc to close.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");
    if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); $("q").focus(); $("q").select(); return; }
    if (e.key === "Escape") { if (typing) e.target.blur(); else if (state.selected !== null) { state.selected = null; resetDetail(); renderList(); } return; }
    if (typing || state.tab !== "memories" || !state.items.length) return;
    const move = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const i = state.items.findIndex((m) => m.id === state.selected);
    select(state.items[Math.min(state.items.length - 1, Math.max(0, i + move))].id);
  });
  $("q").addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && state.items.length) { e.preventDefault(); $("q").blur(); select(state.items[0].id); } });

  let timer;
  $("q").oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.q = $("q").value.trim(); if (state.tab === "memories") loadList(); }, 150); };
  $("pq").oninput = () => { state.projectFilter = $("pq").value.trim(); renderProjects(); };
  $("status").onchange = () => { state.status = $("status").value; loadList(); };
  $("importance").onchange = () => { state.minImportance = Number($("importance").value); loadList(); };
  $("tabs").querySelectorAll(".sx-tab").forEach((t) => { t.onclick = () => {
    state.tab = t.dataset.tab;
    $("tabs").querySelectorAll(".sx-tab").forEach((x) => { x.classList.toggle("is-active", x === t); x.setAttribute("aria-selected", String(x === t)); });
    const memories = state.tab === "memories";
    $("kindsRow").classList.toggle("hidden", !memories); $("importance").classList.toggle("hidden", !memories); $("status").classList.toggle("hidden", !memories);
    if (memories) loadList(); else loadTurns();
  }; });

  // Read before anything rewrites it: #m<id> opens one memory, #turns opens that tab.
  const deep = /^#m([0-9]+)$/.exec(location.hash);
  const wantsTurns = location.hash === "#turns";
  renderKinds();
  resetDetail();
  loadOverview().then(() => {
    if (wantsTurns) $("tabs").querySelector('[data-tab="turns"]').click();
    if (deep) api("/api/memories/" + deep[1]).then((m) => { if (m.projectId !== state.projectId) selectProject(m.projectId); select(m.id); }).catch(() => {});
  }).catch((e) => { $("summary").textContent = "Could not reach shibaox-mem: " + e.message; });
})();
</script>
</body>
</html>
`;
}
