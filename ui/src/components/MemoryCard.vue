<script setup lang="ts">
import type { MemoryItem } from "../api";
import { KIND_COLOR, when } from "../format";
import Importance from "./Importance.vue";

defineProps<{ memory: MemoryItem; selected: boolean }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <button
    :data-id="memory.id"
    role="listitem"
    class="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 rounded-xl border bg-(--surface) px-4 py-3 text-left shadow-(--shadow-sm) transition-[background-color,border-color,box-shadow] duration-150 hover:bg-(--surface-hover) focus-visible:outline-none focus-visible:shadow-(--focus-ring)"
    :class="selected ? 'border-(--primary) shadow-[0_0_0_1px_var(--primary)]' : 'border-(--line) hover:border-(--line-strong)'"
    @click="$emit('select')"
  >
    <span class="text-[15px] leading-[22px] font-medium text-(--ink) [overflow-wrap:anywhere]">{{ memory.title }}</span>
    <Importance :value="memory.importance" class="pt-2" />
    <span class="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-(--ink-muted)">
      <UBadge :color="KIND_COLOR[memory.kind]" variant="soft" size="sm" :label="memory.kind" />
      <UBadge v-if="memory.status !== 'active'" color="error" variant="soft" size="sm" :label="memory.status" />
      <UBadge v-if="memory.stale" color="warning" variant="soft" size="sm" label="stale" />
      <span>{{ when(memory.updatedAt) }}</span>
      <span v-if="memory.files.length" class="font-mono">{{ memory.files[0] }}<template v-if="memory.files.length > 1"> +{{ memory.files.length - 1 }}</template></span>
      <span v-if="memory.useCount">read {{ memory.useCount }}×</span>
    </span>
  </button>
</template>
