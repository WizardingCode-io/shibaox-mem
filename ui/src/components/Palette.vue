<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, type SearchHit } from "../api";
import { KIND_TONE } from "../format";
import Pill from "./Pill.vue";
import { selectProject, select, state, theme, type Tab } from "../viewer";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ tab: [tab: Tab] }>();
const term = ref("");
const hits = ref<SearchHit[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(term, (q) => {
  clearTimeout(timer);
  if (q.trim().length < 2) {
    hits.value = [];
    return;
  }
  loading.value = true;
  timer = setTimeout(async () => {
    try {
      hits.value = await api.search(q.trim(), 12);
    } finally {
      loading.value = false;
    }
  }, 120);
});
watch(open, (o) => {
  if (!o) term.value = "";
});

const groups = computed(() => [
  {
    id: "memories",
    label: term.value.trim().length >= 2 ? "Memories" : "Memories — type to search every project",
    items: hits.value.map((h) => ({
      label: h.title,
      suffix: h.projectName,
      icon: "i-lucide-sticky-note",
      kind: h.kind,
      onSelect: async () => {
        open.value = false;
        if (h.projectId !== state.projectId) await selectProject(h.projectId);
        emit("tab", "memories");
        await select(h.id);
      },
    })),
  },
  {
    id: "projects",
    label: "Projects",
    items: state.projects.map((p) => ({
      label: p.name,
      suffix: `${p.active.toLocaleString()} active`,
      icon: "i-lucide-folder",
      onSelect: async () => {
        open.value = false;
        await selectProject(p.id);
      },
    })),
  },
  {
    id: "actions",
    label: "Actions",
    items: [
      { label: "Show memories", icon: "i-lucide-sticky-note", kbds: ["1"], onSelect: () => { open.value = false; emit("tab", "memories"); } },
      { label: "Show turns", icon: "i-lucide-history", kbds: ["2"], onSelect: () => { open.value = false; emit("tab", "turns"); } },
      { label: "Show overview", icon: "i-lucide-chart-column", kbds: ["3"], onSelect: () => { open.value = false; emit("tab", "overview"); } },
      { label: "Open settings", icon: "i-lucide-settings", kbds: ["4"], onSelect: () => { open.value = false; emit("tab", "settings"); } },
      { label: theme.value === "dark" ? "Switch to light" : "Switch to dark", icon: theme.value === "dark" ? "i-lucide-sun" : "i-lucide-moon", onSelect: () => { open.value = false; theme.value = theme.value === "dark" ? "light" : "dark"; } },
    ],
  },
]);
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-xl' }" title="Command palette" description="Jump to a project, a memory or an action">
    <template #content>
      <UCommandPalette v-model:search-term="term" :groups="groups" :loading="loading" placeholder="Search memories across every project, or jump somewhere…" :fuse="{ resultLimit: 40 }" class="h-[420px]">
        <template #item-leading="{ item }">
          <Pill v-if="'kind' in item && item.kind" :tone="KIND_TONE[item.kind as keyof typeof KIND_TONE]" :label="String(item.kind)" />
          <UIcon v-else :name="String(item.icon)" class="size-4 text-(--ink-muted)" />
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
