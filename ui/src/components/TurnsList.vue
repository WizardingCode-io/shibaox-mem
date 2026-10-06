<script setup lang="ts">
import { ago, TURN_COLOR } from "../format";
import { state } from "../viewer";
import Empty from "./Empty.vue";

defineEmits<{ open: [id: number]; openMemory: [id: number] }>();
</script>

<template>
  <div class="flex items-center gap-2 px-5 pt-3 pb-2 text-xs leading-4 text-(--ink-muted)">
    <span>{{ state.turns.length.toLocaleString() }} recent {{ state.turns.length === 1 ? "turn" : "turns" }}</span>
    <span class="ml-auto">newest first</span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-1 pb-6" role="list">
    <template v-if="state.turns.length">
      <button
        v-for="t in state.turns"
        :key="t.id"
        role="listitem"
        class="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-lg border border-(--line) bg-(--surface) px-4 py-2.5 text-left text-[13px] leading-5 transition-colors hover:bg-(--surface-hover) focus-visible:outline-none focus-visible:shadow-(--focus-ring)"
        @click="$emit('open', t.id)"
      >
        <UBadge :color="TURN_COLOR[t.state] ?? 'neutral'" variant="soft" size="sm" :label="t.state" class="mt-px" />
        <span class="text-(--ink) [overflow-wrap:anywhere]">{{ t.prompt || "(no prompt)" }}</span>
        <span class="text-xs whitespace-nowrap text-(--ink-muted)">{{ t.agent }} · {{ ago(t.startedAt) }}</span>
        <span v-if="t.memoryIds.length" class="col-start-2 col-end-4 flex flex-wrap items-center gap-1.5 text-xs text-(--ink-muted)">
          became
          <UButton v-for="id in t.memoryIds" :key="id" color="primary" variant="link" size="xs" :label="`#${id}`" class="p-0" @click.stop="$emit('openMemory', id)" />
        </span>
        <span v-if="t.lastError" class="col-start-2 col-end-4 text-xs text-(--danger)">{{ t.lastError }}</span>
        <span v-else-if="t.completeness !== 'full'" class="col-start-2 col-end-4 text-xs text-(--ink-muted)">{{ t.completeness }}</span>
      </button>
    </template>
    <Empty v-else mood="default" title="No turns yet" text="Every prompt and answer in this project lands here before it is distilled." />
  </div>
</template>
