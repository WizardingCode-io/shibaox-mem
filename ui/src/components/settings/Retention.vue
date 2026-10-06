<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, type CompactReport } from "../../api";
import { fromEnvironment, saveSettings, settingsState, valueOf } from "../../settings";
import Card from "./Card.vue";

const toast = useToast();
const days = ref(valueOf("SHIBAOX_MEM_RETENTION_DAYS") ?? "90");
watch(
  () => valueOf("SHIBAOX_MEM_RETENTION_DAYS"),
  (v) => {
    if (v !== null) days.value = v;
  },
);
const changed = computed(() => days.value !== (valueOf("SHIBAOX_MEM_RETENTION_DAYS") ?? "90"));

async function saveDays() {
  if (await saveSettings({ SHIBAOX_MEM_RETENTION_DAYS: days.value })) {
    toast.add({ title: "Retention saved", description: `Finished turns older than ${days.value} days that no memory came from are removed by compact.`, color: "success" });
  }
}

const preview = ref<CompactReport | null>(null);
const busy = ref(false);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const summary = (r: CompactReport) =>
  `${plural(r.turns, "turn")}, ${plural(r.sessions, "session")}, ${plural(r.hookRuns, "hook run")}`;

async function run(dryRun: boolean) {
  busy.value = true;
  try {
    const report = await api.compact(dryRun);
    if (dryRun) {
      preview.value = report;
    } else {
      preview.value = null;
      toast.add({ title: "Compacted", description: `${summary(report)} removed · ${mb(report.bytesBefore)} → ${mb(report.bytesAfter)}`, color: "success" });
    }
  } catch (error) {
    toast.add({ title: "Compact failed", description: error instanceof Error ? error.message : String(error), color: "error" });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Card title="Retention" description="How long finished turns are kept when no memory came from them. Memories are never deleted by compact.">
    <div class="flex flex-col gap-4">
      <UFormField label="Keep turns for" :hint="fromEnvironment('SHIBAOX_MEM_RETENTION_DAYS') ? 'Set by the environment.' : '7 to 3650 days.'" :error="settingsState.errors.SHIBAOX_MEM_RETENTION_DAYS">
        <div class="flex items-center gap-2">
          <UInput v-model="days" type="number" min="7" max="3650" class="w-28" :disabled="fromEnvironment('SHIBAOX_MEM_RETENTION_DAYS')" @keydown.enter="saveDays" />
          <span class="text-[13px] text-(--ink-muted)">days</span>
          <UButton color="primary" label="Save" :disabled="!changed" :loading="settingsState.saving" @click="saveDays" />
        </div>
      </UFormField>
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-scan-search" label="Preview compact" :loading="busy && preview === null" @click="run(true)" />
          <UButton v-if="preview" color="primary" icon="i-lucide-broom" label="Run compact now" :loading="busy" @click="run(false)" />
        </div>
        <p v-if="preview" class="m-0 text-[13px] leading-5 text-(--ink-muted)">
          Would remove {{ summary(preview) }}; the database takes {{ mb(preview.bytesBefore) }} now. Memories stay.
        </p>
      </div>
    </div>
  </Card>
</template>
