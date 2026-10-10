<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "./api";
import MemoryDetail from "./components/MemoryDetail.vue";
import MemoryList from "./components/MemoryList.vue";
import Palette from "./components/Palette.vue";
import ProjectStats from "./components/ProjectStats.vue";
import Rail from "./components/Rail.vue";
import Settings from "./components/Settings.vue";
import Sidebar from "./components/Sidebar.vue";
import TopBar from "./components/TopBar.vue";
import TurnDetail from "./components/TurnDetail.vue";
import TurnsList from "./components/TurnsList.vue";
import { closeDetail, loadList, loadOverview, move, project, reload, select, selectProject, startHeartbeat, state, type Tab } from "./viewer";

// The view tabs (Sales OS page header, second row): a coloured square each, in the brand's hues.
const tabs: { label: string; value: Tab; hue: string }[] = [
  { label: "Memories", value: "memories", hue: "var(--violet)" },
  { label: "Turns", value: "turns", hue: "var(--blue)" },
  { label: "Overview", value: "overview", hue: "var(--aqua)" },
  { label: "Settings", value: "settings", hue: "var(--sun)" },
];
const tab = computed({
  get: () => state.tab,
  set: (t: Tab) => {
    state.tab = t;
    history.replaceState(null, "", t === "memories" ? "#" : `#${t}`);
    void reload();
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
const topBar = ref<{ focus: () => void } | null>(null);
// The detail is a 320px dock from 1280px up, a sheet below: decided here, not by CSS, so that
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
  // An overlay that took the key (Escape closing a sheet or the palette) keeps it.
  if (e.defaultPrevented) return;
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
    topBar.value?.focus();
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
  onBeforeUnmount(startHeartbeat());
  const deep = /^#m(\d+)$/.exec(location.hash);
  const hashTab = /^#(turns|overview|settings)$/.exec(location.hash)?.[1] as Tab | undefined;
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
  <UApp :toaster="{ position: 'bottom-left', duration: 5000 }">
    <div class="flex h-full flex-col overflow-hidden">
      <TopBar ref="topBar" v-model="q" :searchable="state.tab === 'memories'" @palette="palette = true" />
      <div class="flex min-h-0 flex-1">
        <Rail :tab="state.tab" @go="tab = $event" />
        <Sidebar />
        <main class="@container flex min-h-0 min-w-0 flex-1 flex-col">
          <!-- Row 1, 36px: where you are, and the project's numbers. -->
          <div class="flex h-9 flex-none items-center gap-2 px-4">
            <span aria-hidden="true" class="flex size-4 flex-none items-center justify-center rounded bg-(--primary) font-display text-[9px] font-bold text-(--on-primary)">M</span>
            <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1 text-[13px] leading-[18px] whitespace-nowrap">
              <span class="text-(--ink-muted)">Projects</span><span class="text-(--line-strong)">/</span>
              <h1 class="m-0 truncate text-[13px] font-semibold" :title="project?.key">{{ project?.name ?? "Memories" }}</h1>
            </nav>
            <span v-if="project" class="ml-2 flex min-w-0 items-center gap-2 overflow-hidden text-xs leading-4 whitespace-nowrap text-(--ink-muted)">
              <span><span class="font-mono font-medium text-(--ink)">{{ project.active.toLocaleString() }}</span> active</span>
              <span class="text-(--line-strong)">·</span>
              <span><span class="font-mono font-medium text-(--ink)">{{ project.archived.toLocaleString() }}</span> archived</span>
              <template v-if="project.stale"><span class="text-(--line-strong)">·</span><span><span class="font-mono font-medium text-(--warn)">{{ project.stale.toLocaleString() }}</span> stale</span></template>
            </span>
          </div>
          <!-- Row 2, 36px: the views. -->
          <div role="navigation" aria-label="Views" class="flex h-9 flex-none items-center gap-4 border-b border-(--line) px-4">
            <button
              v-for="t in tabs"
              :key="t.value"
              type="button"
              :aria-current="state.tab === t.value ? 'page' : undefined"
              class="flex h-9 items-center gap-2 border-b-2 pt-0.5 text-[12.5px] whitespace-nowrap"
              :class="state.tab === t.value ? 'border-(--ink) font-semibold text-(--ink)' : 'border-transparent text-(--ink-muted) hover:text-(--ink)'"
              @click="tab = t.value"
            >
              <span aria-hidden="true" class="size-2.5 rounded-[3px]" :style="{ background: t.hue }" />{{ t.label }}
            </button>
          </div>
          <div v-if="failed" class="m-4 rounded-xl border border-(--danger) bg-(--danger-soft) px-3.5 py-3 text-[13px] text-(--danger)">Could not reach wizardingcode-mem: {{ failed }}</div>
          <MemoryList v-else-if="state.tab === 'memories'" />
          <TurnsList v-else-if="state.tab === 'turns'" @open="turnId = $event" @open-memory="openMemory" />
          <Settings v-else-if="state.tab === 'settings'" />
          <ProjectStats v-else />
        </main>
        <MemoryDetail v-if="isWide && state.detail" class="w-80 flex-none border-l border-(--line) motion-safe:animate-[dock-in_240ms_ease-out]" @open-turn="turnId = $event" />
      </div>
    </div>
    <USlideover v-model:open="sheet" :ui="{ content: 'max-w-[360px]' }" title="Memory" :close="false">
      <template #content><MemoryDetail class="h-full" @open-turn="turnId = $event" /></template>
    </USlideover>
    <TurnDetail :turn-id="turnId" @close="turnId = null" @open-memory="openMemory" />
    <Palette v-model:open="palette" @tab="tab = $event" />
  </UApp>
</template>
