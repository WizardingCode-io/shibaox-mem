<script setup lang="ts">
// The contextual sidebar, as Sales OS's Nav artboard: 216px on #141210, a 15px title row,
// section labels (11.5px semibold, #9A938B), 28px rows with a 16px letter tile.
// Projects with activity in the last week come first, then everything else by name.
import { computed } from "vue";
import { compact, hue, shortPath } from "../format";
import { selectProject, state } from "../viewer";

const WEEK = 7 * 24 * 3600 * 1000;
const recent = computed(() =>
  state.projects
    .filter((p) => p.lastActivity !== null && Date.now() - p.lastActivity < WEEK)
    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)),
);
const rest = computed(() =>
  state.projects.filter((p) => !recent.value.includes(p)).sort((a, b) => a.name.localeCompare(b.name)),
);
const row = (on: boolean) => [
  "flex h-7 w-full flex-none items-center gap-2 rounded-md px-2 text-left text-[13px] whitespace-nowrap",
  on ? "bg-[#2B2724] font-semibold text-[#F4F1EC]" : "text-[#D9D4CD] hover:bg-[#1E1B18]",
];
</script>

<template>
  <nav aria-label="Projects" class="flex min-h-0 w-[216px] flex-none flex-col gap-3 bg-[#141210] p-2 text-[#F4F1EC]">
    <div class="flex h-8 flex-none items-center gap-2 pr-1 pl-2">
      <span class="flex-1 text-[15px] font-bold">Projects</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto [scrollbar-color:#2B2724_transparent]">
      <div v-for="section in [{ label: 'Active this week', items: recent }, { label: recent.length ? 'All projects' : 'Projects', items: rest }]" :key="section.label" v-show="section.items.length" class="flex flex-col">
        <p class="m-0 mb-0.5 h-5 px-2 text-[11.5px] leading-5 font-semibold text-[#9A938B]">{{ section.label }}</p>
        <button
          v-for="p in section.items"
          :key="p.id"
          type="button"
          :class="row(p.id === state.projectId)"
          :title="p.key"
          :aria-current="p.id === state.projectId ? 'page' : undefined"
          @click="selectProject(p.id)"
        >
          <span aria-hidden="true" class="flex size-4 flex-none items-center justify-center rounded font-display text-[8px] font-bold text-[#100E0D] uppercase" :style="{ background: hue(p.name) }">{{ p.name.charAt(0) }}</span>
          <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
          <span v-if="p.active" class="font-mono text-[10.5px] text-[#9A938B]">{{ compact(p.active) }}</span>
        </button>
      </div>
    </div>
    <p class="m-0 truncate px-2 font-mono text-[10.5px] leading-[14px] text-[#9A938B]" :title="state.dataDir">{{ shortPath(state.dataDir) }}</p>
  </nav>
</template>
