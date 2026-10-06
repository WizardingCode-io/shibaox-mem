<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "./api";
import MemoryDetail from "./components/MemoryDetail.vue";
import MemoryList from "./components/MemoryList.vue";
import Palette from "./components/Palette.vue";
import ProjectStats from "./components/ProjectStats.vue";
import Sidebar from "./components/Sidebar.vue";
import TurnDetail from "./components/TurnDetail.vue";
import TurnsList from "./components/TurnsList.vue";
import { closeDetail, loadList, loadOverview, move, project, reload, select, selectProject, state, theme, type Tab } from "./viewer";

const tabs = [
  { label: "Memories", value: "memories", icon: "i-lucide-sticky-note" },
  { label: "Turns", value: "turns", icon: "i-lucide-history" },
  { label: "Overview", value: "overview", icon: "i-lucide-chart-column" },
];
const statusItems = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "Superseded", value: "superseded" },
  { label: "All", value: "all" },
];
const tab = computed({
  get: () => state.tab,
  set: (t: Tab) => {
    state.tab = t;
    history.replaceState(null, "", t === "memories" ? "#" : `#${t}`);
    void reload();
  },
});
const status = computed({
  get: () => state.status,
  set: (s: typeof state.status) => {
    state.status = s;
    void loadList();
  },
});
const q = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.q = value.trim();
    if (state.tab === "memories") void loadList();
  }, 150);
});
const search = ref<{ inputRef?: HTMLInputElement } | null>(null);
// The detail is a column from 1280px up, a sheet below: decided here, not by CSS, so that
// the sheet's scrim never covers a page that already shows the column.
const wide = matchMedia("(min-width: 1280px)");
const isWide = ref(wide.matches);
const onWide = (e: MediaQueryListEvent) => { isWide.value = e.matches; };
wide.addEventListener("change", onWide);
onBeforeUnmount(() => wide.removeEventListener("change", onWide));
const sheet = computed({
  get: () => !isWide.value && state.detail !== null,
  set: (open: boolean) => { if (!open) closeDetail(); },
});
const palette = ref(false);
const turnId = ref<number | null>(null);
const failed = ref("");

async function openMemory(id: number) {
  turnId.value = null;
  const m = await api.memory(id);
  if (m.projectId !== state.projectId) await selectProject(m.projectId);
  tab.value = "memories";
  await select(id);
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName ?? "") || target?.isContentEditable;
  if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    palette.value = !palette.value;
    return;
  }
  if (palette.value || turnId.value !== null) return;
  if (e.key === "/" && !typing) {
    e.preventDefault();
    search.value?.inputRef?.focus();
    return;
  }
  if (e.key === "Escape") {
    if (typing) (target as HTMLElement).blur();
    else if (state.selected !== null) closeDetail();
    return;
  }
  if (typing || state.tab !== "memories") return;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    move(-1);
  }
}

onMounted(async () => {
  document.addEventListener("keydown", onKey);
  const deep = /^#m(\d+)$/.exec(location.hash);
  const hashTab = /^#(turns|overview)$/.exec(location.hash)?.[1] as Tab | undefined;
  if (hashTab) state.tab = hashTab;
  try {
    await loadOverview();
    if (deep) await openMemory(Number(deep[1]));
  } catch (error) {
    failed.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <UApp :toaster="{ position: 'bottom-center', duration: 2200 }">
    <div class="grid h-full grid-cols-[264px_minmax(0,1fr)] overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)_minmax(0,460px)]">
      <Sidebar class="min-h-0" />
      <main class="flex min-h-0 min-w-0 flex-col">
        <div class="grid grid-cols-[auto_minmax(220px,1fr)_auto_auto_auto] items-center gap-3 border-b border-(--line) px-5 pt-4 pb-3">
          <h1 class="font-display m-0 max-w-[30vw] truncate text-[26px] leading-8 font-bold" :title="project?.key">{{ project?.name ?? "Memories" }}</h1>
          <UInput ref="search" v-model="q" icon="i-lucide-search" placeholder="Search titles, bodies, file names" aria-label="Search memories" :ui="{ trailing: 'pe-1.5' }">
            <template #trailing>
              <UButton v-if="q" color="neutral" variant="link" size="xs" icon="i-lucide-x" aria-label="Clear" @click="q = ''" />
              <UKbd v-else value="/" size="sm" />
            </template>
          </UInput>
          <USelectMenu v-model="status" :items="statusItems" value-key="value" :search-input="false" class="w-36" aria-label="Status" :class="{ invisible: state.tab !== 'memories' }" />
          <UTooltip text="Command palette" :kbds="['meta', 'K']">
            <UButton color="neutral" variant="outline" icon="i-lucide-command" aria-label="Command palette" @click="palette = true" />
          </UTooltip>
          <UTooltip :text="theme === 'dark' ? 'Light theme' : 'Dark theme'">
            <UButton color="neutral" variant="outline" :icon="theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" aria-label="Switch theme" @click="theme = theme === 'dark' ? 'light' : 'dark'" />
          </UTooltip>
        </div>
        <div class="px-5 pt-3">
          <UTabs v-model="tab" :items="tabs" :content="false" variant="pill" size="sm" class="w-fit" />
        </div>
        <div v-if="failed" class="m-5 rounded-lg border border-(--danger) bg-(--danger-soft) p-3 text-sm text-(--danger)">Could not reach shibaox-mem: {{ failed }}</div>
        <MemoryList v-else-if="state.tab === 'memories'" />
        <TurnsList v-else-if="state.tab === 'turns'" @open="turnId = $event" @open-memory="openMemory" />
        <ProjectStats v-else />
      </main>
      <MemoryDetail v-if="isWide" @open-turn="turnId = $event" />
    </div>
    <USlideover v-model:open="sheet" :ui="{ content: 'max-w-[520px]' }" title="Memory" :close="false">
      <template #content><MemoryDetail class="h-full border-l-0" @open-turn="turnId = $event" /></template>
    </USlideover>
    <TurnDetail :turn-id="turnId" @close="turnId = null" @open-memory="openMemory" />
    <Palette v-model:open="palette" @tab="tab = $event" />
  </UApp>
</template>
