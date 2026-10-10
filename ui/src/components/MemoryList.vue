<script setup lang="ts">
// The memories as Sales OS's grouped list: a toolbar row (40px), a column header (28px),
// then one card per kind with its pill and count, rows of 32px. Group: none shows the
// list in its own order (relevance when searching), in one card.
import { computed, reactive, ref, watchEffect } from "vue";
import { KINDS, type Kind, type MemoryItem } from "../api";
import { day, KIND_TONE } from "../format";
import { loadList, PAGE, project, select, state, type Status } from "../viewer";
import Empty from "./Empty.vue";
import Importance from "./Importance.vue";
import Pill from "./Pill.vue";

const grouped = ref(true);
const collapsed = reactive<Record<string, boolean>>({});
const groups = computed<{ kind: Kind | null; items: MemoryItem[] }[]>(() => {
  if (!grouped.value || state.q) return [{ kind: null, items: state.items }];
  return KINDS.map((kind) => ({ kind, items: state.items.filter((m) => m.kind === kind) })).filter((g) => g.items.length > 0);
});
watchEffect(() => {
  state.order = groups.value.flatMap((g) => (g.kind && collapsed[g.kind] ? [] : g.items.map((m) => m.id)));
});
const filtered = computed(() => Boolean(state.q || state.kind || state.minImportance > 1));

const statusItems = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "Superseded", value: "superseded" },
  { label: "All", value: "all" },
];
const importanceItems = [
  { label: "Any importance", value: 1 },
  { label: "Useful and up", value: 3 },
  { label: "Important and up", value: 4 },
  { label: "Critical only", value: 5 },
];
const status = computed({
  get: () => state.status,
  set: (s: Status) => {
    state.status = s;
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
function setKind(kind: Kind | null) {
  state.kind = kind;
  void loadList();
}
// Five columns when the list has room; with the detail dock open, the title keeps it.
const COLS = "grid-cols-[minmax(0,1fr)_96px_92px] @3xl:grid-cols-[minmax(0,1fr)_104px_minmax(0,200px)_104px_44px]";
const kindItems = [{ label: "All kinds", value: "" }, ...KINDS.map((k) => ({ label: k, value: k }))];
const kindModel = computed({
  get: () => state.kind ?? "",
  set: (v: string) => setKind((v || null) as Kind | null),
});
const pill = "flex h-6 flex-none items-center rounded-full px-2.5 text-xs whitespace-nowrap";
</script>

<template>
  <!-- Row 3 of the page header, 40px: grouping and filters on the left, scope on the right. -->
  <div class="flex h-10 flex-none items-center gap-2 overflow-hidden px-4">
    <button type="button" :class="[pill, 'gap-1 bg-(--paper-sunken) text-(--ink)']" :aria-pressed="grouped" @click="grouped = !grouped">
      <UIcon name="i-lucide-layers" class="size-3.5" />Group: {{ grouped && !state.q ? "Kind" : "None" }}
    </button>
    <span class="mx-1 h-4 w-px flex-none bg-(--line)" />
    <USelectMenu v-model="kindModel" :items="kindItems" value-key="value" :search-input="false" size="sm" class="w-32 flex-none @3xl:hidden" aria-label="Kind" />
    <button type="button" :class="[pill, 'hidden @3xl:flex', state.kind === null ? 'bg-(--ink) font-semibold text-(--paper)' : 'border border-(--line) text-(--ink-muted) hover:text-(--ink)']" :aria-pressed="state.kind === null" @click="setKind(null)">All</button>
    <button
      v-for="k in KINDS"
      :key="k"
      type="button"
      :class="[pill, 'hidden @3xl:flex', state.kind === k ? 'bg-(--ink) font-semibold text-(--paper)' : 'border border-(--line) text-(--ink-muted) hover:text-(--ink)']"
      :aria-pressed="state.kind === k"
      @click="setKind(k)"
    >{{ k }}</button>
    <div class="flex-1" />
    <USelectMenu v-model="minImportance" :items="importanceItems" value-key="value" :search-input="false" size="sm" class="w-36 flex-none" aria-label="Importance" />
    <USelectMenu v-model="status" :items="statusItems" value-key="value" :search-input="false" size="sm" class="w-28 flex-none" aria-label="Status" />
  </div>

  <template v-if="state.items.length">
    <div role="row" class="grid h-7 flex-none items-center border-b border-(--line) px-7" :class="COLS">
      <span v-for="h in ['Memory', 'Importance', 'Files', 'Updated', 'Reads']" :key="h" role="columnheader" class="truncate font-mono text-[10px] leading-[14px] tracking-[.05em] text-(--ink-muted) uppercase" :class="{ 'pl-5': h === 'Memory', 'text-right': h === 'Reads', 'hidden @3xl:block': h === 'Files' || h === 'Reads' }">{{ h }}</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-1 pb-4" role="rowgroup">
      <section v-for="g in groups" :key="g.kind ?? 'all'" class="flex flex-none flex-col overflow-hidden rounded-xl bg-(--surface) shadow-[0_0_0_1px_var(--line)]" :aria-label="g.kind ?? 'Memories'">
        <div v-if="g.kind" class="flex h-7 flex-none items-center gap-2 pr-2 pl-1">
          <button type="button" class="flex size-5 items-center justify-center rounded text-(--ink-muted)" :aria-expanded="!collapsed[g.kind]" :aria-label="`Show or hide ${g.kind}`" @click="collapsed[g.kind] = !collapsed[g.kind]">
            <UIcon name="i-lucide-chevron-down" class="size-3.5 motion-safe:transition-transform motion-safe:duration-150" :class="{ '-rotate-90': collapsed[g.kind] }" />
          </button>
          <Pill :tone="KIND_TONE[g.kind]" :label="g.kind" />
          <span class="font-mono text-xs text-(--ink-muted)">{{ g.items.length }}</span>
        </div>
        <template v-if="!g.kind || !collapsed[g.kind]">
          <button
            v-for="m in g.items"
            :key="m.id"
            :data-id="m.id"
            type="button"
            role="row"
            class="relative grid h-8 w-full items-center border-t border-(--paper-sunken) px-3 text-left first:border-t-0 focus-visible:z-10"
            :class="[COLS, m.id === state.selected ? 'bg-(--violet-soft)' : 'hover:bg-(--surface-hover)', g.kind ? 'first:border-t' : '']"
            :aria-selected="m.id === state.selected"
            @click="select(m.id)"
          >
            <span v-if="m.id === state.selected" aria-hidden="true" class="absolute inset-y-0 left-0 w-0.5 bg-(--primary)" />
            <span role="cell" class="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" class="size-3 flex-none rounded-full border-2" :style="{ borderColor: KIND_TONE[m.kind].fg }" :title="m.kind" />
              <span class="truncate text-[13px] leading-[18px]" :class="{ 'text-(--ink-muted) line-through': m.status === 'superseded' }">{{ m.title }}</span>
              <Pill v-if="m.status === 'archived'" :tone="{ bg: 'var(--paper-sunken)', fg: 'var(--ink-muted)' }" label="archived" />
              <Pill v-if="m.stale" :tone="{ bg: 'var(--warn-soft)', fg: 'var(--warn)' }" label="stale" />
            </span>
            <span role="cell"><Importance :value="m.importance" /></span>
            <span role="cell" class="hidden truncate font-mono text-xs text-(--ink-muted) @3xl:block" :title="m.files.join('\n')">{{ m.files[0] ?? "—" }}<template v-if="m.files.length > 1"> +{{ m.files.length - 1 }}</template></span>
            <span role="cell" class="font-mono text-xs text-(--ink-muted)">{{ day(m.updatedAt) }}</span>
            <span role="cell" class="hidden text-right font-mono text-xs text-(--ink-muted) @3xl:block">{{ m.useCount || "—" }}</span>
          </button>
        </template>
      </section>
      <button
        v-if="state.items.length < state.total"
        type="button"
        class="flex h-7 flex-none items-center gap-2 rounded-lg px-3 text-xs text-(--ink-muted) hover:bg-(--surface-hover)"
        :disabled="state.loading"
        @click="loadList(state.items.length)"
      >
        <UIcon name="i-lucide-chevrons-down" class="size-3.5" />Show {{ Math.min(PAGE, state.total - state.items.length) }} more of {{ state.total.toLocaleString() }}
      </button>
      <p class="m-0 flex-none px-1 pt-1 text-xs text-(--ink-muted)">
        {{ state.total.toLocaleString() }} {{ state.total === 1 ? "memory" : "memories" }}<template v-if="state.q"> matching “{{ state.q }}”</template> in {{ project?.name }} ·
        <kbd class="font-mono text-[10.5px]">↑</kbd> <kbd class="font-mono text-[10.5px]">↓</kbd> to move, <kbd class="font-mono text-[10.5px]">esc</kbd> to close
      </p>
    </div>
  </template>
  <div v-else-if="state.loading" class="flex flex-col gap-2 px-4 pt-2">
    <div v-for="n in 6" :key="n" class="skeleton h-8" />
  </div>
  <Empty v-else-if="filtered" icon="i-lucide-search-x" title="No memories match" text="Try fewer words, another kind, or a lower importance." />
  <Empty v-else icon="i-lucide-sticky-note" title="Nothing remembered yet" text="Start a session in any of your agents. What is worth keeping shows up here." />
</template>
