<script setup lang="ts">
// The turns as a dense list: two-line rows of 40px in one card, state pill first.
import { ago, TURN_TONE } from "../format";
import { state } from "../viewer";
import Empty from "./Empty.vue";
import Pill from "./Pill.vue";

defineEmits<{ open: [id: number]; openMemory: [id: number] }>();
const COLS = "grid-cols-[112px_minmax(0,1fr)_96px_96px]";
const muted = { bg: "var(--paper-sunken)", fg: "var(--ink-muted)" };
</script>

<template>
  <div class="flex h-10 flex-none items-center gap-2 px-4 text-xs text-(--ink-muted)">
    <span><span class="font-mono font-medium text-(--ink)">{{ state.turns.length.toLocaleString() }}</span> recent {{ state.turns.length === 1 ? "turn" : "turns" }}</span>
    <span class="text-(--line-strong)">·</span><span>newest first</span>
  </div>
  <template v-if="state.turns.length">
    <div role="row" class="grid h-7 flex-none items-center border-b border-(--line) px-7" :class="COLS">
      <span v-for="h in ['State', 'Prompt', 'Agent', 'When']" :key="h" role="columnheader" class="truncate font-mono text-[10px] leading-[14px] tracking-[.05em] text-(--ink-muted) uppercase">{{ h }}</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col overflow-auto px-4 pt-1 pb-4">
      <section class="flex flex-none flex-col overflow-hidden rounded-xl bg-(--surface) shadow-[0_0_0_1px_var(--line)]" role="rowgroup">
        <div
          v-for="t in state.turns"
          :key="t.id"
          role="row"
          tabindex="0"
          class="grid h-10 cursor-pointer items-center border-t border-(--paper-sunken) px-3 first:border-t-0 hover:bg-(--surface-hover)"
          :class="COLS"
          @click="$emit('open', t.id)"
          @keydown.enter="$emit('open', t.id)"
        >
          <span role="cell"><Pill :tone="TURN_TONE[t.state] ?? muted" :label="t.state" /></span>
          <span role="cell" class="flex min-w-0 flex-col">
            <span class="truncate text-[13px] leading-[18px]">{{ t.prompt || "(no prompt)" }}</span>
            <span class="flex min-w-0 items-center gap-1.5 truncate text-xs leading-4 text-(--ink-muted)">
              <template v-if="t.lastError"><span class="truncate text-(--danger)">{{ t.lastError }}</span></template>
              <template v-else-if="t.memoryIds.length">became
                <button v-for="id in t.memoryIds" :key="id" type="button" class="font-mono font-semibold text-(--violet-text) hover:underline" @click.stop="$emit('openMemory', id)">#{{ id }}</button>
              </template>
              <template v-else-if="t.completeness !== 'full'">{{ t.completeness }}</template>
            </span>
          </span>
          <span role="cell" class="truncate font-mono text-xs text-(--ink-muted)">{{ t.agent }}</span>
          <span role="cell" class="truncate font-mono text-xs text-(--ink-muted)">{{ ago(t.startedAt) }}</span>
        </div>
      </section>
    </div>
  </template>
  <Empty v-else icon="i-lucide-history" title="No turns yet" text="Every prompt and answer in this project lands here before it is distilled." />
</template>
