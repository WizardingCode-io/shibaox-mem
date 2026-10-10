<script setup lang="ts">
// The contextual sidebar (Sales OS Nav): 216px on the frame's second shade. The projects,
// each with a letter tile in one of the brand's hues and its count of active memories.
import { computed, ref } from "vue";
import { shortPath } from "../format";
import { selectProject, state } from "../viewer";

const filter = ref("");
const shown = computed(() => {
  const f = filter.value.trim().toLowerCase();
  return state.projects.filter((p) => !f || p.name.toLowerCase().includes(f) || p.key.toLowerCase().includes(f));
});
const HUES = ["#FF3DCB", "#9B5CFF", "#2E7BFF", "#FFC53D", "#2EE6C8"];
const hue = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
</script>

<template>
  <nav class="flex min-h-0 w-[216px] flex-none flex-col gap-3 bg-(--frame-1) p-2 text-(--frame-ink)" aria-label="Projects">
    <div class="flex h-8 items-center gap-2 pr-1 pl-2">
      <span class="flex-1 text-[15px] font-bold">Projects</span>
      <span class="font-mono text-[10.5px] text-(--frame-muted)">{{ state.projects.length }}</span>
    </div>
    <label class="flex h-7 items-center gap-2 rounded-lg border border-(--frame-field-line) bg-(--frame-field) px-2 text-(--frame-muted)">
      <UIcon name="i-lucide-filter" class="size-3.5 flex-none" />
      <input v-model="filter" type="search" placeholder="Filter projects" aria-label="Filter projects" class="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-(--frame-ink) outline-none placeholder:text-(--frame-muted)">
    </label>
    <div class="flex min-h-0 flex-1 flex-col overflow-auto [scrollbar-color:var(--frame-raised)_transparent]" role="list">
      <button
        v-for="p in shown"
        :key="p.id"
        type="button"
        role="listitem"
        class="flex h-7 w-full flex-none items-center gap-2 rounded-md px-2 text-left text-[13px] whitespace-nowrap"
        :class="p.id === state.projectId ? 'bg-(--frame-active) font-semibold text-(--frame-ink)' : 'text-(--frame-soft) hover:bg-(--frame-raised)'"
        :title="p.key"
        :aria-current="p.id === state.projectId ? 'page' : undefined"
        @click="selectProject(p.id)"
      >
        <span aria-hidden="true" class="flex size-4 flex-none items-center justify-center rounded font-display text-[8px] font-bold text-[#100E0D] uppercase" :style="{ background: hue(p.name) }">{{ p.name.charAt(0) }}</span>
        <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
        <span class="font-mono text-[10.5px] text-(--frame-muted) tabular-nums">{{ p.active.toLocaleString() }}</span>
      </button>
      <p v-if="shown.length === 0" class="m-0 px-2 py-1 text-xs text-(--frame-muted)">No project matches</p>
    </div>
    <div class="flex flex-col gap-0.5 px-2 pb-1 font-mono text-[10.5px] leading-[14px] text-(--frame-muted)">
      <span class="truncate" :title="state.dataDir">data {{ shortPath(state.dataDir) }}</span>
      <span v-if="state.storeDir && state.storeDir !== state.dataDir" class="truncate" :title="state.storeDir">db {{ shortPath(state.storeDir) }}</span>
    </div>
  </nav>
</template>
