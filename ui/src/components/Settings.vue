<script setup lang="ts">
import { onMounted } from "vue";
import { loadSettings, settingsState } from "../settings";
import { shortPath } from "../format";
import Agents from "./settings/Agents.vue";
import Backups from "./settings/Backups.vue";
import Judge from "./settings/Judge.vue";
import Retention from "./settings/Retention.vue";
import Storage from "./settings/Storage.vue";
import Viewer from "./settings/Viewer.vue";

onMounted(() => {
  if (settingsState.view === null) void loadSettings();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6">
    <div v-if="settingsState.view === null" class="text-[13px] text-(--ink-muted)">Loading…</div>
    <template v-else>
      <Judge />
      <Viewer />
      <Retention />
      <Agents />
      <Storage />
      <Backups />
      <div class="text-xs text-(--ink-muted)">
        Settings live in <span class="font-mono" :title="settingsState.view.dataDir">{{ shortPath(settingsState.view.dataDir) }}/env</span>, readable by you only. A variable in the environment always wins over the file.
      </div>
    </template>
  </div>
</template>
