<script setup lang="ts">
// Turns as Sales OS's "Runs & evals": a summary line, a table card (28px tinted header,
// 40px rows: time, tile + title + sub, status, became, took) and, for the selected turn,
// the dark trace panel (400px): stats strip, actions, a timeline of steps.
import { computed, nextTick, reactive, ref, watch } from "vue";
import { api, type TurnDetail, type TurnItem } from "../api";
import { AGENT_TILE, clock, describePrompt, took, TURN_STATUS } from "../format";
import { project, state } from "../viewer";
import Empty from "./Empty.vue";

const emit = defineEmits<{ openMemory: [id: number] }>();
const selected = computed({
  get: () => state.turnId,
  set: (id: number | null) => {
    state.turnId = id;
  },
});
const trace = ref<TurnDetail | null>(null);
watch(
  selected,
  async (id) => {
    trace.value = id === null ? null : await api.turn(id);
    if (id !== null) document.querySelector(`[data-turn="${id}"]`)?.scrollIntoView({ block: "nearest" });
  },
  { immediate: true },
);
watch(
  () => state.projectId,
  () => {
    selected.value = null;
  },
);

const COLS = "grid-template-columns: 52px minmax(0, 1fr) 92px 84px 52px;";

// Filters, as the Runs log's filter row: pills with a menu, a toggle, a period, a search.
type Source = "prompt" | "task" | "subagent";
const filter = reactive({ agent: null as string | null, state: null as string | null, source: null as Source | null, became: false, period: "all" as "today" | "week" | "all", text: "" });
const searching = ref(false);
const agents = computed(() => [...new Set(state.turns.map((t) => t.agent))].sort());
const SOURCE_LABEL: Record<Source, string> = { prompt: "Prompts", task: "Background tasks", subagent: "Subagent reports" };
const menu = <T extends string>(current: T | null, values: T[], label: (v: T) => string, set: (v: T | null) => void) => [
  [{ label: "Any", type: "checkbox" as const, checked: current === null, onUpdateChecked: () => set(null) }],
  values.map((v) => ({ label: label(v), type: "checkbox" as const, checked: current === v, onUpdateChecked: () => set(current === v ? null : v) })),
];
const agentMenu = computed(() => menu(filter.agent, agents.value, (v) => v, (v) => (filter.agent = v)));
const stateMenu = computed(() => menu(filter.state, ["done", "skipped", "failed", "pending", "open", "processing"], (v) => status(v).label, (v) => (filter.state = v)));
const sourceMenu = computed(() => menu(filter.source, ["prompt", "task", "subagent"] as Source[], (v) => SOURCE_LABEL[v], (v) => (filter.source = v)));

// Sorting: one column at a time; a second click flips it.
type SortKey = "time" | "turn" | "status" | "became" | "took";
const sort = reactive({ key: "time" as SortKey, dir: "desc" as "asc" | "desc" });
function sortBy(key: SortKey) {
  if (sort.key === key) sort.dir = sort.dir === "asc" ? "desc" : "asc";
  else Object.assign(sort, { key, dir: key === "turn" || key === "status" ? "asc" : "desc" });
}
const duration = (t: TurnItem) => (t.endedAt ? t.endedAt - t.startedAt : Number.POSITIVE_INFINITY);
const rows = computed(() => {
  const since = filter.period === "today" ? new Date().setHours(0, 0, 0, 0) : filter.period === "week" ? Date.now() - 7 * 86_400_000 : 0;
  const text = filter.text.trim().toLowerCase();
  const list = state.turns.filter((t) => {
    if (filter.agent && t.agent !== filter.agent) return false;
    if (filter.state && t.state !== filter.state) return false;
    if (filter.source && line(t).kind !== filter.source) return false;
    if (filter.became && t.memoryIds.length === 0) return false;
    if (t.startedAt < since) return false;
    return !text || t.prompt.toLowerCase().includes(text);
  });
  const value = (t: TurnItem): number | string =>
    sort.key === "time" ? t.startedAt : sort.key === "turn" ? line(t).title.toLowerCase() : sort.key === "status" ? status(t.state).label : sort.key === "became" ? t.memoryIds.length : duration(t);
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x < y ? -1 : x > y ? 1 : b.startedAt - a.startedAt) * sign;
  });
});
const filtered = computed(() => Boolean(filter.agent || filter.state || filter.source || filter.became || filter.period !== "all" || filter.text.trim()));
function clearFilters() {
  Object.assign(filter, { agent: null, state: null, source: null, became: false, period: "all", text: "" });
  searching.value = false;
}
const HEADS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "time", label: "Time" },
  { key: "turn", label: "Turn" },
  { key: "status", label: "Status" },
  { key: "became", label: "Became" },
  { key: "took", label: "Took", right: true },
];
function exportCsv() {
  const quote = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = [
    ["id", "started", "agent", "status", "source", "title", "memories", "seconds"].join(","),
    ...rows.value.map((t) =>
      [t.id, new Date(t.startedAt).toISOString(), t.agent, t.state, line(t).kind, line(t).title, t.memoryIds.join(" "), t.endedAt ? Math.round((t.endedAt - t.startedAt) / 1000) : ""].map(quote).join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `turns-${project.value?.name ?? "project"}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
const summary = computed(() => {
  const by = (s: string) => rows.value.filter((t) => t.state === s).length;
  return { done: by("done"), skipped: by("skipped"), failed: by("failed"), waiting: by("pending") + by("open") + by("processing") };
});
const status = (s: string) => TURN_STATUS[s] ?? { label: s, tone: { bg: "var(--paper-sunken)", fg: "var(--ink-muted)" }, shape: "" as const };
const tile = (agent: string) => AGENT_TILE[agent] ?? { letter: agent.charAt(0), bg: "#D9D4CD" };
const line = (t: TurnItem) => describePrompt(t.prompt);
const traceLine = computed(() => (trace.value ? describePrompt(trace.value.prompt) : null));
// On the console the states take the console's own hues (Sales OS: live aqua, run blue, warn sun, danger).
const CONSOLE_FG: Record<string, string> = { done: "#2EE6C8", failed: "#FF6B85", open: "#7AA8FF", processing: "#7AA8FF", pending: "#FFC53D" };
const KIND_CONSOLE: Record<string, string> = { decision: "#7AA8FF", fix: "#2EE6C8", gotcha: "#FFC53D", convention: "#B894FF", change: "#9A938B", discovery: "#FF6FD8" };
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB");
const searchField = ref<HTMLInputElement | null>(null);
async function openSearch() {
  searching.value = !searching.value;
  if (!searching.value) filter.text = "";
  else {
    await nextTick();
    searchField.value?.focus();
  }
}
async function copyId() {
  if (trace.value) await navigator.clipboard.writeText(String(trace.value.id)).catch(() => undefined);
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Filter row, 40px, as the Runs log: pills with menus, a toggle, the period, search, export. -->
      <div class="flex h-10 flex-none items-center gap-2 px-4">
        <UDropdownMenu :items="agentMenu" :content="{ align: 'start' }"><button type="button" class="wz-pill" :aria-pressed="filter.agent !== null">Agent: <b class="font-semibold text-(--ink)">{{ filter.agent ?? "Any" }}</b><UIcon name="i-lucide-chevron-down" class="size-3" /></button></UDropdownMenu>
        <UDropdownMenu :items="stateMenu" :content="{ align: 'start' }"><button type="button" class="wz-pill" :aria-pressed="filter.state !== null">Status: <b class="font-semibold text-(--ink)">{{ filter.state ? status(filter.state).label : "Any" }}</b><UIcon name="i-lucide-chevron-down" class="size-3" /></button></UDropdownMenu>
        <UDropdownMenu :items="sourceMenu" :content="{ align: 'start' }"><button type="button" class="wz-pill" :aria-pressed="filter.source !== null">Source: <b class="font-semibold text-(--ink)">{{ filter.source ? SOURCE_LABEL[filter.source] : "Any" }}</b><UIcon name="i-lucide-chevron-down" class="size-3" /></button></UDropdownMenu>
        <button type="button" class="wz-pill" :aria-pressed="filter.became" @click="filter.became = !filter.became">Became a memory</button>
        <div class="wz-segmented ml-1" role="group" aria-label="Period">
          <button v-for="p in [{ k: 'today', l: 'Today' }, { k: 'week', l: '7 days' }, { k: 'all', l: 'All' }] as const" :key="p.k" type="button" :aria-pressed="filter.period === p.k" @click="filter.period = p.k">{{ p.l }}</button>
        </div>
        <button v-if="filtered" type="button" class="wz-link ml-1" @click="clearFilters">Clear</button>
        <div class="flex-1" />
        <label v-if="searching" class="flex h-7 w-52 items-center gap-1.5 rounded-lg border border-(--btn-secondary-line) bg-(--paper-raised) px-2">
          <UIcon name="i-lucide-search" class="size-3.5 flex-none text-(--ink-muted)" />
          <input ref="searchField" v-model="filter.text" type="search" placeholder="Search prompts" aria-label="Search prompts" class="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] outline-none focus-visible:outline-none" @keydown.esc="openSearch">
        </label>
        <button type="button" class="wz-icon-btn" :aria-pressed="searching" aria-label="Search prompts" @click="openSearch"><UIcon name="i-lucide-search" class="size-[15px]" /></button>
        <UButton color="neutral" variant="outline" label="Export CSV" :disabled="!rows.length" @click="exportCsv" />
      </div>
      <div class="flex h-6 flex-none items-center gap-3 px-4 whitespace-nowrap">
        <span class="text-[13px] leading-[18px] font-semibold">{{ rows.length.toLocaleString("en-GB") }} {{ filtered ? `of ${state.turns.length.toLocaleString("en-GB")} ` : "recent " }}turns</span>
        <span class="wz-mono text-(--ink-muted)">{{ summary.done }} distilled · {{ summary.skipped }} skipped · {{ summary.failed }} failed<template v-if="summary.waiting"> · {{ summary.waiting }} waiting</template></span>
      </div>
      <!-- The table: its header stays; only the rows scroll. -->
      <div v-if="state.turns.length" role="table" aria-label="Turns" class="wz-table mx-4 mt-2 mb-4 flex min-h-0 flex-col">
        <div role="row" class="wz-table-head flex-none" :style="COLS">
          <button
            v-for="h in HEADS"
            :key="h.key"
            type="button"
            role="columnheader"
            :aria-sort="sort.key === h.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
            class="flex min-w-0 items-center gap-1 hover:text-(--ink)"
            :class="[h.right ? 'justify-end' : '', sort.key === h.key ? 'text-(--ink)' : '']"
            @click="sortBy(h.key)"
          >
            {{ h.label }}<UIcon :name="sort.key === h.key ? (sort.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'" class="size-3 flex-none" :class="sort.key === h.key ? '' : 'opacity-40'" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <button
            v-for="t in rows"
            :key="t.id"
            :data-turn="t.id"
            type="button"
            role="row"
            class="wz-row two"
            :style="COLS"
            :aria-selected="t.id === selected"
            @click="selected = selected === t.id ? null : t.id"
          >
            <span role="cell" class="wz-mono text-(--ink-muted)">{{ clock(t.startedAt) }}</span>
            <span role="cell" class="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" class="wz-tile" :style="{ background: tile(t.agent).bg }">{{ tile(t.agent).letter }}</span>
              <span class="flex min-w-0 flex-col">
                <span class="wz-name" :class="{ 'font-medium text-(--ink-muted)': line(t).kind !== 'prompt' && (line(t).title === 'Subagent report' || line(t).title === 'Background task') }">{{ line(t).title }}</span>
                <span class="wz-meta">{{ [line(t).sub, t.agent, `turn ${t.id}`].filter(Boolean).join(" · ") }}</span>
              </span>
            </span>
            <span role="cell"><span class="wz-status" :class="status(t.state).shape" :style="{ background: status(t.state).tone.bg, color: status(t.state).tone.fg }">{{ status(t.state).label }}</span></span>
            <span role="cell" class="wz-mono" :class="t.memoryIds.length ? 'font-medium text-(--violet-text)' : 'text-(--line-strong)'">{{ t.memoryIds.length ? `${t.memoryIds.length} memor${t.memoryIds.length === 1 ? "y" : "ies"}` : "—" }}</span>
            <span role="cell" class="wz-mono text-right text-(--ink-muted)">{{ took(t.startedAt, t.endedAt) }}</span>
          </button>
          <p v-if="!rows.length" class="m-0 flex h-10 items-center gap-2 border-t border-(--row-line) px-3 text-[13px] text-(--ink-muted)">No turn matches these filters.<button type="button" class="wz-link" @click="clearFilters">Clear filters</button></p>
        </div>
        <div class="wz-table-foot flex-none"><span>The last {{ state.turns.length }} turns of this project · turns that became nothing are pruned after the retention period</span></div>
      </div>
      <Empty v-else icon="i-lucide-history" title="No turns yet" text="Every prompt and answer in this project lands here before it is distilled." />
    </div>

    <!-- The trace (Runs & evals): 400px, the console surface in both themes. -->
    <aside v-if="trace && traceLine" class="wz-console flex w-[400px] flex-none flex-col gap-3 overflow-y-auto border-l border-(--console-line) p-4 motion-safe:animate-[dock-in_240ms_ease-out]" aria-label="Turn trace">
      <div class="flex h-6 flex-none items-center gap-2">
        <span class="wz-label">Trace · turn {{ trace.id }}</span>
        <span class="wz-status wz-console-status" :class="status(trace.state).shape" :style="{ color: CONSOLE_FG[trace.state] ?? 'var(--console-muted)' }">{{ status(trace.state).label }}</span>
        <span class="flex-1" />
        <button type="button" aria-label="Copy the turn id" class="flex size-6 items-center justify-center rounded-md text-(--console-muted) hover:text-(--console-ink)" @click="copyId"><UIcon name="i-lucide-copy" class="size-3.5" /></button>
        <button type="button" aria-label="Close the trace" class="flex size-6 items-center justify-center rounded-md text-(--console-muted) hover:text-(--console-ink)" @click="selected = null"><UIcon name="i-lucide-x" class="size-3.5" /></button>
      </div>
      <div class="flex min-w-0 flex-none items-center gap-2">
        <span aria-hidden="true" class="wz-tile" :style="{ background: tile(trace.agent).bg }">{{ tile(trace.agent).letter }}</span>
        <span class="min-w-0 truncate text-sm leading-5 font-semibold">{{ traceLine.title }}</span>
      </div>
      <div class="wz-console-box grid flex-none grid-cols-4 gap-2 px-2.5 py-2">
        <div v-for="s in [
          { k: 'Took', v: took(trace.startedAt, trace.endedAt) },
          { k: 'Read', v: `${trace.filesRead.length} files` },
          { k: 'Changed', v: `${trace.filesChanged.length} files` },
          { k: 'Commands', v: String(trace.commands.length) },
        ]" :key="s.k" class="flex min-w-0 flex-col">
          <span class="wz-label">{{ s.k }}</span><span class="wz-mono text-(--console-ink)">{{ s.v }}</span>
        </div>
      </div>
      <div v-if="trace.memories.length" class="flex flex-none items-center gap-2">
        <button v-for="m in trace.memories.slice(0, 2)" :key="m.id" type="button" class="wz-console-btn" @click="emit('openMemory', m.id)">Open #{{ m.id }}</button>
        <span class="flex-1" />
      </div>

      <div class="flex flex-none flex-col gap-0.5">
        <div class="wz-step">
          <span class="wz-step-icon"><UIcon name="i-lucide-message-square" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">{{ traceLine.kind === "task" ? "Task notification" : traceLine.kind === "subagent" ? "Subagent report" : "Prompt" }}</span><span class="flex-1" /><span class="wz-mono text-(--console-muted)">{{ time(trace.startedAt) }}</span></div>
            <span class="wz-meta">{{ trace.agent }}<template v-if="trace.completeness !== 'full'"> · {{ trace.completeness }}</template></span>
            <pre class="wz-code max-h-48 overflow-y-auto">{{ trace.prompt }}</pre>
          </div>
        </div>
        <div v-if="trace.filesRead.length || trace.filesChanged.length" class="wz-step">
          <span class="wz-step-icon"><UIcon name="i-lucide-files" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">Files</span><span class="flex-1" /><span class="wz-mono text-(--console-muted)">{{ trace.filesChanged.length }} changed · {{ trace.filesRead.length }} read</span></div>
            <span v-for="f in trace.filesChanged" :key="`c${f}`" class="wz-mono text-(--console-ink)" :title="f">{{ f }}</span>
            <span v-for="f in trace.filesRead.slice(0, 6)" :key="`r${f}`" class="wz-mono text-(--console-muted)" :title="f">{{ f }}</span>
            <span v-if="trace.filesRead.length > 6" class="wz-meta">+{{ trace.filesRead.length - 6 }} more read</span>
          </div>
        </div>
        <div v-if="trace.commands.length" class="wz-step">
          <span class="wz-step-icon"><UIcon name="i-lucide-terminal" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">Commands</span><span class="flex-1" /><span class="wz-mono text-(--console-muted)">{{ trace.commands.length }}</span></div>
            <pre class="wz-code max-h-40 overflow-y-auto">{{ trace.commands.join("\n") }}</pre>
          </div>
        </div>
        <div v-if="trace.errors.length || trace.lastError" class="wz-step">
          <span class="wz-step-icon text-(--console-danger)"><UIcon name="i-lucide-triangle-alert" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">Errors</span></div>
            <pre class="wz-code max-h-32 overflow-y-auto text-[#FF6B85]">{{ [...trace.errors, trace.lastError].filter(Boolean).join("\n") }}</pre>
          </div>
        </div>
        <div v-if="trace.finalText" class="wz-step">
          <span class="wz-step-icon"><UIcon name="i-lucide-reply" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">Answer</span><span class="flex-1" /><span v-if="trace.endedAt" class="wz-mono text-(--console-muted)">{{ time(trace.endedAt) }}</span></div>
            <p class="m-0 mt-1 text-xs leading-4 whitespace-pre-wrap text-(--console-ink) [overflow-wrap:anywhere]">{{ trace.finalText }}</p>
          </div>
        </div>
        <div class="wz-step">
          <span class="wz-step-icon" :class="trace.memories.length ? 'text-[#2EE6C8]' : ''"><UIcon name="i-lucide-sparkles" class="size-3.5" /></span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-[18px] items-center gap-2"><span class="text-[13px] font-semibold">Judged</span></div>
            <template v-if="trace.memories.length">
              <button v-for="m in trace.memories" :key="m.id" type="button" class="flex min-w-0 items-center gap-2 py-0.5 text-left" @click="emit('openMemory', m.id)">
                <span class="wz-stage" :style="{ background: 'var(--console-raised)', color: KIND_CONSOLE[m.kind] }">{{ m.kind }}</span>
                <span class="min-w-0 truncate text-xs text-(--console-ink) hover:underline">{{ m.title }}</span>
              </button>
            </template>
            <span v-else class="wz-meta">{{ trace.state === "skipped" ? "Nothing worth keeping." : trace.state === "failed" ? "Distillation failed." : trace.state === "done" ? "Reinforced what was already known." : "Not distilled yet." }}</span>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
