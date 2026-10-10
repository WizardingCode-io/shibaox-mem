<script setup lang="ts">
// What `doctor` sees, as Settings' Integrations table: a status pill (word and a dot whose
// shape changes), the check, what it found.
import { onMounted, ref } from "vue";
import { api, type Check } from "../../api";
import Card from "./Card.vue";

const checks = ref<Check[] | null>(null);
const failed = ref("");
const STATUS: Record<Check["status"], { label: string; bg: string; fg: string; shape: string }> = {
  ok: { label: "OK", bg: "var(--ok-soft)", fg: "var(--ok)", shape: "" },
  warn: { label: "Warning", bg: "var(--warn-soft)", fg: "var(--warn)", shape: "square" },
  fail: { label: "Failing", bg: "var(--danger-soft)", fg: "var(--danger)", shape: "diamond" },
  skip: { label: "Not here", bg: "var(--paper-sunken)", fg: "var(--ink-muted)", shape: "" },
};
async function load() {
  failed.value = "";
  try {
    checks.value = await api.doctor();
  } catch (error) {
    failed.value = error instanceof Error ? error.message : String(error);
  }
}
onMounted(load);
const COLS = "grid-template-columns: 172px 92px minmax(0, 1fr);";
</script>

<template>
  <Card id="agents" title="Agents and installation" :description="checks ? `${checks.filter((c) => c.status === 'ok').length} of ${checks.length} checks pass · what wizardingcode-mem doctor sees` : 'What wizardingcode-mem doctor sees'" flush>
    <template #aside>
      <button type="button" class="wz-icon-btn" aria-label="Check again" @click="load"><UIcon name="i-lucide-refresh-cw" class="size-[15px]" /></button>
    </template>
    <p v-if="failed" class="m-0 p-4 text-[13px] text-(--danger)">{{ failed }}</p>
    <template v-else-if="checks">
      <div class="wz-table-head" :style="COLS"><span>Check</span><span>Status</span><span>Found</span></div>
      <div v-for="c in checks" :key="c.name" class="grid min-h-8 items-center gap-x-2 border-t border-(--row-line) px-3 py-1.5" :style="COLS">
        <span class="wz-name">{{ c.name }}</span>
        <span><span class="wz-status" :class="STATUS[c.status].shape" :style="{ background: STATUS[c.status].bg, color: STATUS[c.status].fg }">{{ STATUS[c.status].label }}</span></span>
        <span class="min-w-0 text-xs leading-4 text-(--ink-muted) [overflow-wrap:anywhere]">{{ c.detail }}</span>
      </div>
    </template>
    <p v-else class="m-0 p-4 text-[13px] text-(--ink-muted)">Checking…</p>
  </Card>
</template>
