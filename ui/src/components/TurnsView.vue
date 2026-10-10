<script setup lang="ts">
// Turns as Sales OS's "Runs & evals": a summary line, a table card (28px tinted header,
// 40px rows: time, tile + title + sub, status, became, took) and, for the selected turn,
// the dark trace panel (400px): stats strip, actions, a timeline of steps.
import { computed, ref, watch } from "vue";
import { api, type TurnDetail, type TurnItem } from "../api";
import { AGENT_TILE, clock, describePrompt, took, TURN_STATUS } from "../format";
import { state } from "../viewer";
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

const COLS = "grid-template-columns: 44px minmax(0, 1fr) 84px 64px 44px;";
const summary = computed(() => {
  const by = (s: string) => state.turns.filter((t) => t.state === s).length;
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
async function copyId() {
  if (trace.value) await navigator.clipboard.writeText(String(trace.value.id)).catch(() => undefined);
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-4">
      <div class="flex h-5 flex-none items-center gap-3 whitespace-nowrap">
        <span class="text-[13px] leading-[18px] font-semibold">{{ state.turns.length.toLocaleString("en-GB") }} recent turns</span>
        <span class="wz-mono text-(--ink-muted)">{{ summary.done }} distilled · {{ summary.skipped }} skipped · {{ summary.failed }} failed<template v-if="summary.waiting"> · {{ summary.waiting }} waiting</template></span>
      </div>
      <div v-if="state.turns.length" role="table" aria-label="Turns" class="wz-table flex-none">
        <div role="row" class="wz-table-head" :style="COLS">
          <span>Time</span><span>Turn</span><span>Status</span><span>Became</span><span class="text-right">Took</span>
        </div>
        <button
          v-for="t in state.turns"
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
              <span class="wz-name" :class="{ 'font-medium text-(--ink-muted)': line(t).kind !== 'prompt' }">{{ line(t).title }}</span>
              <span class="wz-meta">{{ [line(t).sub, t.agent, `turn ${t.id}`].filter(Boolean).join(" · ") }}</span>
            </span>
          </span>
          <span role="cell"><span class="wz-status" :class="status(t.state).shape" :style="{ background: status(t.state).tone.bg, color: status(t.state).tone.fg }">{{ status(t.state).label }}</span></span>
          <span role="cell" class="wz-mono" :class="t.memoryIds.length ? 'font-medium text-(--violet-text)' : 'text-(--line-strong)'">{{ t.memoryIds.length ? `${t.memoryIds.length} memor${t.memoryIds.length === 1 ? "y" : "ies"}` : "—" }}</span>
          <span role="cell" class="wz-mono text-right text-(--ink-muted)">{{ took(t.startedAt, t.endedAt) }}</span>
        </button>
        <div class="wz-table-foot"><span>1–{{ state.turns.length }} · newest first · turns without a memory are pruned after the retention period</span></div>
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
