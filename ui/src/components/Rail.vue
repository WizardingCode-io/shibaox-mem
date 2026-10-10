<script setup lang="ts">
// The icon rail (Sales OS Nav): 56px, an icon and a tiny label per view.
import type { Tab } from "../viewer";

defineProps<{ tab: Tab }>();
const emit = defineEmits<{ go: [tab: Tab] }>();
const items: { tab: Tab; label: string; icon: string }[] = [
  { tab: "memories", label: "Memories", icon: "i-lucide-sticky-note" },
  { tab: "turns", label: "Turns", icon: "i-lucide-history" },
  { tab: "overview", label: "Overview", icon: "i-lucide-chart-column" },
];
const base = "flex size-12 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[10px] leading-3";
</script>

<template>
  <nav aria-label="Views" class="flex w-14 flex-none flex-col items-center gap-1 border-r border-(--frame-line) bg-(--frame-0) py-2">
    <button
      v-for="i in items"
      :key="i.tab"
      type="button"
      :aria-current="tab === i.tab ? 'page' : undefined"
      :class="[base, tab === i.tab ? 'bg-(--frame-raised) font-semibold text-(--frame-ink)' : 'text-(--frame-muted) hover:text-(--frame-ink)']"
      @click="emit('go', i.tab)"
    >
      <UIcon :name="i.icon" class="size-[18px]" />{{ i.label }}
    </button>
    <div class="flex-1" />
    <button
      type="button"
      :aria-current="tab === 'settings' ? 'page' : undefined"
      :class="[base, tab === 'settings' ? 'bg-(--frame-raised) font-semibold text-(--frame-ink)' : 'text-(--frame-muted) hover:text-(--frame-ink)']"
      @click="emit('go', 'settings')"
    >
      <UIcon name="i-lucide-settings" class="size-[18px]" />Settings
    </button>
  </nav>
</template>
