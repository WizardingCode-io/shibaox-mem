<script setup lang="ts">
import { computed, ref } from "vue";
import mark from "../../../src/ui/assets/shibaox-mark.svg?raw";
import { shortPath } from "../format";
import { selectProject, state } from "../viewer";

const emit = defineEmits<{ settings: [] }>();
const filter = ref("");
const shown = computed(() => {
  const f = filter.value.trim().toLowerCase();
  return state.projects.filter((p) => !f || p.name.toLowerCase().includes(f) || p.key.toLowerCase().includes(f));
});
</script>

<template>
  <nav class="flex min-h-0 flex-col gap-4 border-r border-(--line) bg-(--surface-sunken) px-3 py-4" aria-label="Projects">
    <div class="flex items-center gap-2.5 px-2">
      <span class="[&>svg]:size-6" v-html="mark" />
      <span class="font-display text-lg font-bold whitespace-nowrap text-(--ink)">shibaox-mem</span>
      <span class="ml-auto text-[11px] tabular-nums text-(--ink-muted)">v{{ state.version }}</span>
    </div>
    <UInput v-model="filter" icon="i-lucide-search" size="sm" placeholder="Filter projects" aria-label="Filter projects" />
    <div class="overline px-2">Projects</div>
    <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto" role="list">
      <button
        v-for="p in shown"
        :key="p.id"
        role="listitem"
        class="flex h-[34px] w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium transition-colors"
        :class="p.id === state.projectId ? 'bg-(--shiba-soft) text-(--ink)' : 'text-(--ink-muted) hover:bg-(--surface-hover) hover:text-(--ink)'"
        :title="p.key"
        :aria-current="p.id === state.projectId ? 'page' : undefined"
        @click="selectProject(p.id)"
      >
        <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
        <span class="text-xs tabular-nums" :class="p.id === state.projectId ? 'text-(--shiba-strong)' : 'text-(--ink-muted)'">{{ p.active.toLocaleString() }}</span>
      </button>
      <div v-if="shown.length === 0" class="overline px-2 py-2">No project matches</div>
    </div>
    <div class="mt-auto flex flex-col gap-2">
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-settings" label="Settings" class="justify-start" :class="{ 'bg-(--shiba-soft) text-(--ink)': state.tab === 'settings' }" @click="emit('settings')" />
      <div class="px-2 text-[11px] leading-4 text-(--ink-muted)">
        <div>Data</div>
        <div class="truncate font-mono" :title="state.dataDir">{{ shortPath(state.dataDir) }}</div>
      </div>
    </div>
  </nav>
</template>
