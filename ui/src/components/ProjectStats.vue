<script setup lang="ts">
// The project's overview as Sales OS's report page (AdminReports "Team performance"):
// a row of 96px KPI cards (mono label, Unbounded 20px value, sparkline, a 11.5px line),
// then chart cards with a 40px header (13px title, 11px subtitle, legend row).
import { computed, ref, watch } from "vue";
import { api, KINDS, type ProjectStats } from "../api";
import { compact, IMPORTANCE_LABEL, KIND_TONE } from "../format";
import { project, state } from "../viewer";
import Sparkline from "./charts/Sparkline.vue";
import WeeklyColumns from "./charts/WeeklyColumns.vue";

const stats = ref<ProjectStats | null>(null);
watch(
  () => state.projectId,
  async (id) => {
    stats.value = id === null ? null : await api.stats(id);
  },
  { immediate: true },
);
const PROMPT_BUDGET_MS = 100;
const n = (v: number) => v.toLocaleString("en-GB");
const k = computed(() => {
  const s = stats.value;
  if (!s) return null;
  const turnsTotal = Object.values(s.turns).reduce((a, b) => a + b, 0);
  const finished = (s.turns.done ?? 0) + (s.turns.skipped ?? 0) + (s.turns.failed ?? 0);
  const prompt = s.hooks.find((h) => h.event === "prompt");
  const judges = Object.entries(s.byJudge).sort((a, b) => b[1] - a[1]);
  return {
    active: s.byStatus.active,
    stale: s.stale,
    archived: s.byStatus.archived,
    superseded: s.byStatus.superseded,
    turns: turnsTotal,
    kept: finished ? Math.round(((s.turns.done ?? 0) / finished) * 100) : 0,
    done: s.turns.done ?? 0,
    finished,
    failed: s.turns.failed ?? 0,
    p95: prompt ? Math.round(prompt.p95) : null,
    judge: judges[0]?.[0] ?? "—",
    judgeShare: judges.length && s.byStatus.active ? Math.round(((judges[0]?.[1] ?? 0) / Object.values(s.byJudge).reduce((a, b) => a + b, 0)) * 100) : 0,
  };
});
const maxKind = computed(() => Math.max(1, ...KINDS.map((x) => stats.value?.byKind[x] ?? 0)));
const maxImp = computed(() => Math.max(1, ...[1, 2, 3, 4, 5].map((x) => stats.value?.byImportance[String(x) as "1"] ?? 0)));
// Importance is ordered, so its bars step one hue from light to dark (sequential), never categorical.
const IMP_STEP: Record<number, string> = { 1: "#D9C9FF", 2: "#B894FF", 3: "#9B5CFF", 4: "#6B35E0", 5: "#4A1FB0" };
const pct = (v: number, of: number) => `${of ? Math.max(v ? 2 : 0, (v / of) * 100) : 0}%`;
const share = (v: number) => (k.value?.active ? `${Math.round((v / k.value.active) * 100)}%` : "—");
</script>

<template>
  <section v-if="stats && k" aria-label="Overview" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
    <!-- KPI row: six cards, 96px. -->
    <div class="grid flex-none grid-cols-3 gap-3 xl:grid-cols-6">
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Active memories</span>
        <div class="flex h-6 items-center gap-1.5"><span class="wz-kpi-value" :title="n(k.active)">{{ compact(k.active) }}</span><span class="flex-1" /><Sparkline :values="stats.weekly.map((w) => w.memories)" /></div>
        <div class="mt-2 flex h-4 items-center gap-1.5"><span class="wz-meta flex-1 !text-[11.5px]">{{ n(k.stale) }} may be outdated</span></div>
      </div>
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Turns</span>
        <div class="flex h-6 items-center gap-1.5"><span class="wz-kpi-value" :title="n(k.turns)">{{ compact(k.turns) }}</span><span class="flex-1" /><Sparkline :values="stats.weekly.map((w) => w.turns)" color="var(--series-1)" /></div>
        <div class="mt-2 flex h-4 items-center gap-1.5"><span class="wz-meta flex-1 !text-[11.5px]">{{ n(k.done) }} became memories</span></div>
      </div>
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Kept</span>
        <div class="flex h-6 items-baseline gap-1"><span class="wz-kpi-value">{{ k.kept }}%</span></div>
        <div class="mt-2 flex h-4 items-center gap-1.5"><span class="wz-meta flex-1 !text-[11.5px]">{{ n(k.done) }} of {{ n(k.finished) }} judged turns</span></div>
      </div>
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Archived</span>
        <div class="flex h-6 items-center"><span class="wz-kpi-value" :title="n(k.archived)">{{ compact(k.archived) }}</span></div>
        <div class="mt-2 flex h-4 items-center gap-1.5"><span class="wz-meta flex-1 !text-[11.5px]">{{ n(k.superseded) }} superseded</span></div>
      </div>
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Prompt hook p95</span>
        <div class="flex h-6 items-baseline gap-1"><span class="wz-kpi-value">{{ k.p95 ?? "—" }}</span><span v-if="k.p95 !== null" class="text-xs text-(--ink-muted)">ms</span></div>
        <div class="mt-2 flex h-4 items-center gap-1.5">
          <span class="wz-meta flex-1 !text-[11.5px]">of {{ PROMPT_BUDGET_MS }} ms</span>
          <span v-if="k.p95 !== null" class="wz-status" :class="k.p95 > PROMPT_BUDGET_MS ? 'square' : ''" :style="k.p95 > PROMPT_BUDGET_MS ? { background: 'var(--warn-soft)', color: 'var(--warn)' } : { background: 'var(--ok-soft)', color: 'var(--ok)' }">{{ k.p95 > PROMPT_BUDGET_MS ? "Over" : "Within" }}</span>
        </div>
      </div>
      <div class="wz-card wz-kpi">
        <span class="wz-label truncate">Judged by</span>
        <div class="flex h-6 items-center"><span class="wz-kpi-value truncate !text-[16px]">{{ k.judge }}</span></div>
        <div class="mt-2 flex h-4 items-center gap-1.5"><span class="wz-meta flex-1 !text-[11.5px]">{{ k.judgeShare }}% of memories</span></div>
      </div>
    </div>

    <!-- Two weekly charts: memories and turns differ by orders of magnitude, so never one axis. -->
    <div class="grid flex-none grid-cols-2 gap-3">
      <div class="wz-card flex flex-col">
        <header class="wz-card-head"><div class="flex min-w-0 flex-1 flex-col"><h2 class="wz-card-title">Memories created per week</h2><span class="wz-card-sub">Last eight weeks · imports count on the day they were first written</span></div></header>
        <div class="flex flex-col gap-1 px-3.5 pb-3">
          <div class="flex h-4 items-center"><span class="flex-1" /><span class="wz-legend">Period <b class="font-semibold text-(--ink)">{{ n(stats.weekly.reduce((a, w) => a + w.memories, 0)) }}</b></span></div>
          <WeeklyColumns :weeks="stats.weekly.map((w) => ({ weekStart: w.weekStart, value: w.memories }))" color="var(--series-2)" unit="memories" />
        </div>
      </div>
      <div class="wz-card flex flex-col">
        <header class="wz-card-head"><div class="flex min-w-0 flex-1 flex-col"><h2 class="wz-card-title">Turns per week</h2><span class="wz-card-sub">Last eight weeks · every prompt the hooks saw</span></div></header>
        <div class="flex flex-col gap-1 px-3.5 pb-3">
          <div class="flex h-4 items-center"><span class="flex-1" /><span class="wz-legend">Period <b class="font-semibold text-(--ink)">{{ n(stats.weekly.reduce((a, w) => a + w.turns, 0)) }}</b></span></div>
          <WeeklyColumns :weeks="stats.weekly.map((w) => ({ weekStart: w.weekStart, value: w.turns }))" color="var(--series-1)" unit="turns" />
        </div>
      </div>
    </div>

    <div class="grid flex-none grid-cols-2 gap-3">
      <!-- By kind, as Reports' "Stage conversion" bars. -->
      <div class="wz-card flex flex-col">
        <header class="wz-card-head"><div class="flex min-w-0 flex-1 flex-col"><h2 class="wz-card-title">By kind</h2><span class="wz-card-sub">Active memories · share of {{ n(k.active) }}</span></div></header>
        <div class="flex flex-col gap-1 px-3.5 pb-3.5">
          <div v-for="kind in KINDS" :key="kind" class="grid h-6 grid-cols-[112px_minmax(0,1fr)_64px_40px] items-center gap-2">
            <span class="wz-stage justify-self-start" :style="{ background: KIND_TONE[kind].bg, color: KIND_TONE[kind].fg }">{{ kind }}</span>
            <span class="h-3.5 overflow-hidden rounded-[3px] bg-(--paper-sunken)"><span class="block h-full rounded-[3px] bg-(--series-1)" :style="{ width: pct(stats.byKind[kind], maxKind) }" /></span>
            <span class="wz-mono text-right">{{ n(stats.byKind[kind]) }}</span>
            <span class="wz-mono text-right text-(--ink-muted)">{{ share(stats.byKind[kind]) }}</span>
          </div>
        </div>
      </div>
      <!-- By importance: a sequential ramp, darker means more important. -->
      <div class="wz-card flex flex-col">
        <header class="wz-card-head"><div class="flex min-w-0 flex-1 flex-col"><h2 class="wz-card-title">By importance</h2><span class="wz-card-sub">Active memories · 5 is critical</span></div></header>
        <div class="flex flex-col gap-1 px-3.5 pb-3.5">
          <div v-for="lvl in [5, 4, 3, 2, 1]" :key="lvl" class="grid h-6 grid-cols-[112px_minmax(0,1fr)_64px_40px] items-center gap-2">
            <span class="text-[13px]">{{ lvl }} · {{ IMPORTANCE_LABEL[lvl] }}</span>
            <span class="h-3.5 overflow-hidden rounded-[3px] bg-(--paper-sunken)"><span class="block h-full rounded-[3px]" :style="{ width: pct(stats.byImportance[String(lvl) as '1'], maxImp), background: IMP_STEP[lvl] }" /></span>
            <span class="wz-mono text-right">{{ n(stats.byImportance[String(lvl) as "1"]) }}</span>
            <span class="wz-mono text-right text-(--ink-muted)">{{ share(stats.byImportance[String(lvl) as "1"]) }}</span>
          </div>
          <div class="mt-1 flex h-4 items-center gap-2 text-[11px] text-(--ink-muted)">Less<span v-for="lvl in [1, 2, 3, 4, 5]" :key="lvl" class="size-2.5 rounded-[2px]" :style="{ background: IMP_STEP[lvl] }" />More</div>
        </div>
      </div>
    </div>

    <!-- Hooks, as Reports' leaderboard: a tinted header band, an in-cell bar against the budget. -->
    <div class="wz-card flex flex-none flex-col overflow-hidden">
      <header class="wz-card-head"><div class="flex min-w-0 flex-1 flex-col"><h2 class="wz-card-title">Hook latency</h2><span class="wz-card-sub">Last 200 runs, every project · the prompt hook's budget is {{ PROMPT_BUDGET_MS }} ms</span></div></header>
      <div class="wz-table-head border-t border-(--line)" style="grid-template-columns: minmax(0, 1fr) 72px minmax(0, 220px) 72px 56px">
        <span>Event</span><span class="text-right">p50</span><span>p95 against the budget</span><span class="text-right">p95</span><span class="text-right">Runs</span>
      </div>
      <div v-for="h in stats.hooks" :key="h.event" class="grid h-8 items-center gap-x-2 border-t border-(--row-line) px-3" style="grid-template-columns: minmax(0, 1fr) 72px minmax(0, 220px) 72px 56px">
        <span class="wz-mono">{{ h.event }}</span>
        <span class="wz-mono text-right text-(--ink-muted)">{{ Math.round(h.p50) }} ms</span>
        <span class="relative h-3.5 rounded-[3px] bg-(--paper-sunken)">
          <span class="absolute inset-y-0 left-0 rounded-[3px]" :style="{ width: `${Math.min(100, (h.p95 / 200) * 100)}%`, background: h.p95 > PROMPT_BUDGET_MS && h.event === 'prompt' ? 'var(--sun)' : 'var(--series-1)' }" />
          <span class="absolute inset-y-[-3px] w-0.5 bg-(--ink)" style="left: 50%" title="100 ms budget" />
        </span>
        <span class="wz-mono text-right" :class="h.p95 > PROMPT_BUDGET_MS && h.event === 'prompt' ? 'font-semibold text-(--warn)' : ''">{{ Math.round(h.p95) }} ms</span>
        <span class="wz-mono text-right text-(--ink-muted)">{{ n(h.runs) }}</span>
      </div>
      <p v-if="!stats.hooks.length" class="m-0 border-t border-(--row-line) px-3.5 py-3 text-[13px] text-(--ink-muted)">No hook has run yet.</p>
      <div class="wz-table-foot"><span class="inline-flex items-center gap-1.5"><span class="h-3 w-0.5 bg-(--ink)" />100 ms budget</span><span class="flex-1" /><span>Scale 0 to 200 ms</span></div>
    </div>
  </section>
  <section v-else class="grid flex-none grid-cols-3 gap-3 p-4 xl:grid-cols-6">
    <div v-for="i in 6" :key="i" class="wz-card wz-kpi"><span class="skeleton h-3 w-20" /><span class="skeleton mt-1 h-6 w-16" /></div>
  </section>
</template>
