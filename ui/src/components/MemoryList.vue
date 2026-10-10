<script setup lang="ts">
import { computed } from "vue";
import { KINDS } from "../api";
import { loadList, PAGE, project, select, state } from "../viewer";
import Empty from "./Empty.vue";
import MemoryCard from "./MemoryCard.vue";

const summary = computed(() => {
  const parts = [`${state.total.toLocaleString()} ${state.total === 1 ? "memory" : "memories"}`];
  if (state.q) parts.push(`matching "${state.q}"`);
  if (state.status !== "active") parts.push(state.status);
  if (project.value?.stale && state.status === "active") parts.push(`${project.value.stale.toLocaleString()} stale`);
  return parts.join(" · ");
});
const filtered = computed(() => Boolean(state.q || state.kind || state.minImportance > 1));
const importanceItems = [
  { label: "Any importance", value: 1 },
  { label: "Useful and up", value: 3 },
  { label: "Important and up", value: 4 },
  { label: "Critical only", value: 5 },
];
const kindItems = computed(() => [{ label: "All", value: "" }, ...KINDS.map((k) => ({ label: k, value: k }))]);
const kind = computed({
  get: () => state.kind ?? "",
  set: (v: string) => {
    state.kind = (v || null) as typeof state.kind;
    void loadList();
  },
});
const minImportance = computed({
  get: () => state.minImportance,
  set: (v: number) => {
    state.minImportance = v;
    void loadList();
  },
});
</script>

<template>
  <div class="flex items-center gap-3 px-5 pt-3">
    <UTabs v-model="kind" :items="kindItems" :content="false" variant="pill" size="sm" class="max-w-full overflow-x-auto" />
    <span class="flex-1" />
    <USelectMenu v-model="minImportance" :items="importanceItems" value-key="value" :search-input="false" size="sm" class="w-44" aria-label="Importance" />
  </div>
  <div class="flex items-center gap-2 px-5 pt-3 pb-2 text-xs leading-4 text-(--ink-muted)">
    <span>{{ summary }}</span>
    <span class="ml-auto inline-flex items-center gap-1.5"><UKbd value="↑" size="sm" /><UKbd value="↓" size="sm" /> move</span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-1 pb-6" role="list">
    <template v-if="state.items.length">
      <MemoryCard v-for="m in state.items" :key="m.id" :memory="m" :selected="m.id === state.selected" @select="select(m.id)" />
      <UButton
        v-if="state.items.length < state.total"
        class="mt-2 self-center"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="state.loading"
        :label="`Show ${Math.min(PAGE, state.total - state.items.length)} more`"
        @click="loadList(state.items.length)"
      />
    </template>
    <Empty v-else-if="filtered" title="No memories match" text="Try fewer words, another kind, or a lower importance." />
    <Empty v-else title="Nothing remembered yet" text="Start a session in any of your agents. What is worth keeping shows up here." />
  </div>
</template>
