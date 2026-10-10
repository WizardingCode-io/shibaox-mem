<script setup lang="ts">
// Settings as Sales OS's Settings artboard: a 200px secondary nav (mono label, 30px rows
// with an icon) beside the sections, each a header line and a bordered card.
import { onMounted, ref } from "vue";
import { shortPath } from "../format";
import { loadSettings, settingsState } from "../settings";
import About from "./settings/About.vue";
import Agents from "./settings/Agents.vue";
import Backups from "./settings/Backups.vue";
import Judge from "./settings/Judge.vue";
import Retention from "./settings/Retention.vue";
import Storage from "./settings/Storage.vue";
import Team from "./settings/Team.vue";
import Viewer from "./settings/Viewer.vue";

onMounted(() => {
  if (settingsState.view === null) void loadSettings();
});
const NAV = [
  { id: "judge", label: "Judge", icon: "i-lucide-scale" },
  { id: "viewer", label: "Viewer", icon: "i-lucide-monitor" },
  { id: "retention", label: "Retention", icon: "i-lucide-timer" },
  { id: "agents", label: "Agents", icon: "i-lucide-plug" },
  { id: "storage", label: "Storage", icon: "i-lucide-hard-drive" },
  { id: "backups", label: "Backups", icon: "i-lucide-archive" },
  { id: "team", label: "Collaborative mode", icon: "i-lucide-users" },
  { id: "about", label: "About", icon: "i-lucide-info" },
];
const current = ref("judge");
function go(id: string) {
  current.value = id;
  document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <nav aria-label="Settings" class="flex w-[200px] flex-none flex-col gap-0.5 border-r border-(--line) px-2 py-3">
      <p class="wz-label m-0 mb-1 px-2">This machine</p>
      <button
        v-for="n in NAV"
        :key="n.id"
        type="button"
        class="flex h-[30px] items-center gap-2 rounded-md px-2 text-left text-[13px]"
        :class="current === n.id ? 'bg-(--paper-sunken) font-semibold text-(--ink)' : 'text-(--ink) hover:bg-(--surface-hover)'"
        @click="go(n.id)"
      >
        <UIcon :name="n.icon" class="size-3.5 flex-none text-(--ink-muted)" />{{ n.label }}
      </button>
      <div class="flex-1" />
      <p v-if="settingsState.view" class="m-0 px-2 text-[11.5px] leading-4 text-(--ink-muted)">
        Kept in <span class="font-mono" :title="settingsState.view.dataDir">{{ shortPath(settingsState.view.dataDir) }}/env</span>, readable by you only. The environment always wins over the file.
      </p>
    </nav>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <p v-if="settingsState.view === null" class="m-0 text-[13px] text-(--ink-muted)">Loading…</p>
      <template v-else>
        <Judge />
        <Viewer />
        <Retention />
        <Agents />
        <Storage />
        <Backups />
        <Team />
        <About />
      </template>
    </div>
  </div>
</template>
