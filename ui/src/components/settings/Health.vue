<script setup lang="ts">
// What `doctor` checks besides the agents: the data, the database, the queue, the hooks'
// speed, the judge, the backups. The same table as Agents.
import type { Check } from "../../api";
import Card from "./Card.vue";
import { CHECK_STATUS } from "./status";

defineProps<{ checks: Check[]; loaded: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const COLS = "grid-template-columns: 196px 104px minmax(0, 1fr);";
</script>

<template>
  <Card id="health" title="Health" :description="loaded ? `${checks.filter((c) => c.status === 'ok').length} of ${checks.length} checks pass · what wizardingcode-mem doctor sees` : 'What wizardingcode-mem doctor sees'" flush>
    <template #aside>
      <UTooltip text="Check again"><button type="button" class="wz-icon-btn" aria-label="Check again" @click="emit('refresh')"><UIcon name="i-lucide-refresh-cw" class="size-[15px]" /></button></UTooltip>
    </template>
    <div class="wz-table-head" :style="COLS"><span>Check</span><span>Status</span><span>Found</span></div>
    <div v-for="c in checks" :key="c.name" class="grid min-h-10 items-center gap-x-2 border-t border-(--row-line) px-3 py-1.5" :style="COLS">
      <span class="wz-name first-letter:uppercase">{{ c.name }}</span>
      <span><span class="wz-status" :class="CHECK_STATUS[c.status].shape" :style="{ background: CHECK_STATUS[c.status].bg, color: CHECK_STATUS[c.status].fg }">{{ CHECK_STATUS[c.status].label }}</span></span>
      <span class="min-w-0 text-xs leading-4 text-(--ink-muted) [overflow-wrap:anywhere]">{{ c.detail }}</span>
    </div>
    <p v-if="!loaded" class="m-0 border-t border-(--row-line) p-3 text-[13px] text-(--ink-muted)">Checking…</p>
  </Card>
</template>
