<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, KINDS, type ProjectStats } from "../api";
import { IMPORTANCE_COLOR, IMPORTANCE_LABEL, KIND_TONE, when } from "../format";
import Pill from "./Pill.vue";
import { project, state } from "../viewer";

const stats = ref<ProjectStats | null>(null);
watch(
  () => state.projectId,
  async (id) => {
    stats.value = id === null ? null : await api.stats(id);
  },
  { immediate: true },
);
const totalActive = computed(() => stats.value?.byStatus.active ?? 0);
const maxWeek = computed(() => Math.max(1, ...(stats.value?.weekly.map((w) => Math.max(w.memories, w.turns)) ?? [1])));
const turnStates = ["done", "skipped", "failed", "pending", "open"];
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
</script>

<template>
  <div v-if="stats" class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <div class="overline">Active</div>
        <div class="font-display mt-1 text-xl leading-6 font-bold tracking-[-0.03em] tabular-nums">{{ stats.byStatus.active.toLocaleString() }}</div>
        <div class="mt-0.5 text-xs leading-4 text-(--ink-muted)">{{ stats.stale }} stale</div>
      </div>
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <div class="overline">Archived</div>
        <div class="font-display mt-1 text-xl leading-6 font-bold tracking-[-0.03em] tabular-nums">{{ stats.byStatus.archived.toLocaleString() }}</div>
        <div class="mt-0.5 text-xs leading-4 text-(--ink-muted)">{{ stats.byStatus.superseded }} superseded</div>
      </div>
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <div class="overline">Turns</div>
        <div class="font-display mt-1 text-xl leading-6 font-bold tracking-[-0.03em] tabular-nums">{{ Object.values(stats.turns).reduce((a, b) => a + b, 0).toLocaleString() }}</div>
        <div class="mt-0.5 text-xs leading-4 text-(--ink-muted)">{{ stats.turns.done ?? 0 }} distilled · {{ stats.turns.skipped ?? 0 }} skipped · {{ stats.turns.failed ?? 0 }} failed</div>
      </div>
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <div class="overline">Judged by</div>
        <div class="mt-1 flex flex-col gap-0.5 text-sm">
          <div v-for="(n, judge) in stats.byJudge" :key="judge" class="flex justify-between"><span>{{ judge }}</span><span class="tabular-nums text-(--ink-muted)">{{ n.toLocaleString() }}</span></div>
          <div v-if="!Object.keys(stats.byJudge).length" class="text-(--ink-muted)">—</div>
        </div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <h2 class="m-0 mb-3 text-sm leading-5 font-semibold">By kind</h2>
        <div class="flex flex-col gap-2">
          <div v-for="k in KINDS" :key="k" class="grid grid-cols-[104px_minmax(0,1fr)_48px] items-center gap-3 text-[13px]">
            <Pill :tone="KIND_TONE[k]" :label="k" class="justify-self-start" />
            <div class="h-1.5 overflow-hidden rounded-full bg-(--surface-sunken)"><div class="h-full rounded-full bg-(--violet) transition-[width] duration-300" :style="{ width: pct(stats.byKind[k], totalActive) }" /></div>
            <span class="text-right font-mono text-xs text-(--ink-muted)">{{ stats.byKind[k].toLocaleString() }}</span>
          </div>
        </div>
      </div>
      <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
        <h2 class="m-0 mb-3 text-sm leading-5 font-semibold">By importance</h2>
        <div class="flex flex-col gap-2">
          <div v-for="n in [5, 4, 3, 2, 1]" :key="n" class="grid grid-cols-[104px_minmax(0,1fr)_48px] items-center gap-3 text-[13px]">
            <span class="text-xs font-medium" :style="{ color: IMPORTANCE_COLOR[n] }">{{ n }} · {{ IMPORTANCE_LABEL[n] }}</span>
            <div class="h-1.5 overflow-hidden rounded-full bg-(--surface-sunken)"><div class="h-full rounded-full bg-(--blue) transition-[width] duration-300" :style="{ width: pct(stats.byImportance[String(n) as '1'], totalActive) }" /></div>
            <span class="text-right font-mono text-xs text-(--ink-muted)">{{ stats.byImportance[String(n) as '1'].toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
      <div class="mb-3 flex items-center gap-3"><h2 class="m-0 text-sm leading-5 font-semibold">Last eight weeks</h2><span class="ml-auto flex items-center gap-3 text-xs text-(--ink-muted)"><span class="inline-flex items-center gap-1.5"><i class="size-2 rounded-sm bg-(--violet)" />memories</span><span class="inline-flex items-center gap-1.5"><i class="size-2 rounded-sm bg-(--line-strong)" />turns</span></span></div>
      <div class="grid h-32 grid-cols-8 items-end gap-2">
        <div v-for="w in stats.weekly" :key="w.weekStart" class="flex h-full flex-col justify-end gap-1" :title="`Week of ${when(w.weekStart)}: ${w.memories} memories, ${w.turns} turns`">
          <div class="flex h-full items-end justify-center gap-1">
            <div class="w-3 rounded-t bg-(--violet) transition-[height] duration-300" :style="{ height: pct(w.memories, maxWeek) }" />
            <div class="w-3 rounded-t bg-(--line-strong) transition-[height] duration-300" :style="{ height: pct(w.turns, maxWeek) }" />
          </div>
          <div class="text-center text-[10px] text-(--ink-muted)">{{ new Date(w.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }}</div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-(--line) bg-(--surface) px-3.5 py-3">
      <h2 class="m-0 mb-2 text-sm leading-5 font-semibold">Hooks <span class="text-xs font-normal text-(--ink-muted)">last 200 runs, all projects</span></h2>
      <table v-if="stats.hooks.length" class="w-full border-collapse text-[13px]">
        <thead><tr class="h-7 text-left font-mono text-[10px] tracking-[.05em] text-(--ink-muted) uppercase"><th class="font-normal">Event</th><th class="text-right font-normal">p50</th><th class="text-right font-normal">p95</th><th class="text-right font-normal">Runs</th></tr></thead>
        <tbody>
          <tr v-for="h in stats.hooks" :key="h.event" class="border-t border-(--line)"><td class="h-8 font-mono text-xs">{{ h.event }}</td><td class="h-8 text-right font-mono text-xs">{{ Math.round(h.p50) }} ms</td><td class="h-8 text-right font-mono text-xs" :class="h.p95 > 100 && h.event === 'prompt' ? 'text-(--warn)' : ''">{{ Math.round(h.p95) }} ms</td><td class="h-8 text-right font-mono text-xs text-(--ink-muted)">{{ h.runs }}</td></tr>
        </tbody>
      </table>
      <p v-else class="m-0 text-[13px] text-(--ink-muted)">No hook has run yet.</p>
    </div>
    <div class="mt-0.5 text-xs leading-4 text-(--ink-muted)">{{ project?.name }} · {{ Object.values(stats.turns).reduce((a, b) => a + b, 0) }} turns on record</div>
  </div>
</template>
