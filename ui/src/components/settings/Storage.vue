<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, type StorageInfo, type TargetReport } from "../../api";
import { shortPath } from "../../format";
import { loadOverview } from "../../viewer";
import Card from "./Card.vue";

const toast = useToast();
const info = ref<StorageInfo | null>(null);
const path = ref("");
const report = ref<TargetReport | null>(null);
const checking = ref(false);
const moving = ref(false);
const confirming = ref(false);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const moved = computed(() => info.value !== null && info.value.storeDir !== info.value.dataDir);
const canMove = computed(
  () => report.value !== null && report.value.writable && !report.value.hasDb && report.value.path === path.value.trim(),
);

async function load() {
  info.value = await api.storage();
}
onMounted(load);

async function check() {
  if (!path.value.trim()) return;
  checking.value = true;
  try {
    report.value = await api.inspectTarget(path.value.trim());
  } catch (error) {
    toast.add({ title: "Could not inspect", description: error instanceof Error ? error.message : String(error), color: "error" });
  } finally {
    checking.value = false;
  }
}

async function move() {
  if (!report.value) return;
  moving.value = true;
  try {
    const outcome = await api.moveStore(report.value.path);
    if (outcome.ok) {
      toast.add({ title: "Store moved", description: `The database now lives in ${outcome.to}. The old file was kept as ${shortPath(outcome.keptOld)}.`, color: "success" });
      confirming.value = false;
      path.value = "";
      report.value = null;
      await Promise.all([load(), loadOverview()]);
    } else {
      toast.add({ title: "Not moved", description: outcome.detail, color: "error" });
    }
  } catch (error) {
    toast.add({ title: "Not moved", description: error instanceof Error ? error.message : String(error), color: "error" });
  } finally {
    moving.value = false;
  }
}
</script>

<template>
  <Card id="storage" title="Storage" description="Where the database lives. The binary, settings and logs stay in the data directory.">
    <div v-if="info" class="flex flex-col gap-4">
      <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        <span class="text-(--ink-muted)">Data directory</span>
        <span class="font-mono text-xs [overflow-wrap:anywhere]">{{ info.dataDir }}</span>
        <span class="text-(--ink-muted)">Database</span>
        <span class="font-mono text-xs [overflow-wrap:anywhere]">{{ moved ? info.storeDir : "same directory" }} <span class="font-sans text-(--ink-muted)">· {{ mb(info.dbBytes) }}</span></span>
      </div>
      <UAlert v-if="info.recentSessions > 0" color="warning" variant="soft" icon="i-lucide-clock" title="Sessions are active" :description="`${info.recentSessions} session${info.recentSessions === 1 ? '' : 's'} in the last five minutes. Moving is safest between sessions: writers wait while the copy is taken, and a hook that waits too long gives up that one event.`" />
      <UFormField label="Move the database to" hint="An absolute path on a disk attached to this machine. The folder is created if needed; the old file is kept, renamed.">
        <div class="flex gap-2">
          <UInput v-model="path" placeholder="/Volumes/External/wizardingcode-mem" class="flex-1 font-mono" @keydown.enter="check" @input="report = null" />
          <UButton color="neutral" variant="outline" label="Check" :disabled="!path.trim()" :loading="checking" @click="check" />
        </div>
      </UFormField>
      <template v-if="report">
        <UAlert v-for="w in report.warnings" :key="w" :color="report.network || report.hasDb || !report.writable ? 'error' : 'warning'" variant="soft" icon="i-lucide-triangle-alert" :description="w" />
        <UAlert v-if="report.warnings.length === 0" color="success" variant="soft" icon="i-lucide-check" :description="`${report.exists ? 'The folder exists' : 'The folder will be created'}${report.fsType ? ` on ${report.fsType}` : ''}; it can be written.`" />
        <div class="flex gap-2">
          <UButton color="primary" icon="i-lucide-hard-drive" label="Move the database" :disabled="!canMove" @click="confirming = true" />
        </div>
      </template>
    </div>
    <UModal v-model:open="confirming" title="Move the database?" :description="`Every process will use ${report?.path} from now on. The current file stays where it is, renamed, in case you need it.`">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="confirming = false" />
          <UButton color="primary" label="Move" :loading="moving" @click="move" />
        </div>
      </template>
    </UModal>
  </Card>
</template>
