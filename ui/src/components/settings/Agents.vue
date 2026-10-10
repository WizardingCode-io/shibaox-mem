<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type Check } from "../../api";
import Card from "./Card.vue";

const checks = ref<Check[] | null>(null);
const failed = ref("");
const COLOR: Record<Check["status"], "success" | "warning" | "error" | "neutral"> = {
  ok: "success",
  warn: "warning",
  fail: "error",
  skip: "neutral",
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
</script>

<template>
  <Card title="Agents and installation" description="What wizardingcode-mem doctor sees: every agent, the database, the hooks' speed.">
    <template #aside>
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" aria-label="Check again" @click="load" />
    </template>
    <p v-if="failed" class="m-0 text-[13px] text-(--danger)">{{ failed }}</p>
    <div v-else-if="checks" class="flex flex-col divide-y divide-(--line)">
      <div v-for="c in checks" :key="c.name" class="grid grid-cols-[72px_150px_minmax(0,1fr)] items-start gap-3 py-2 text-[13px]">
        <UBadge :color="COLOR[c.status]" variant="soft" size="sm" :label="c.status" class="justify-self-start uppercase" />
        <span class="font-medium">{{ c.name }}</span>
        <span class="text-(--ink-muted) [overflow-wrap:anywhere]">{{ c.detail }}</span>
      </div>
    </div>
    <p v-else class="m-0 text-[13px] text-(--ink-muted)">Checking…</p>
  </Card>
</template>
