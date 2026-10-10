<script setup lang="ts">
// The icon rail, as Sales OS's Nav artboard: 56px, 48×48 buttons radius 10, an icon and a
// 10px label; the active one on #25211E.
import type { Tab } from "../viewer";

defineProps<{ tab: Tab }>();
const emit = defineEmits<{ go: [tab: Tab] }>();
const items: { tab: Tab; label: string; icon: string }[] = [
  { tab: "memories", label: "Memories", icon: "i-lucide-sticky-note" },
  { tab: "turns", label: "Turns", icon: "i-lucide-history" },
  { tab: "overview", label: "Overview", icon: "i-lucide-chart-column" },
];
const cls = (on: boolean) => [
  "flex size-12 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[10px] leading-3",
  on ? "bg-[#25211E] font-semibold text-[#F4F1EC]" : "text-[#9A938B] hover:text-[#F4F1EC]",
];
</script>

<template>
  <nav aria-label="Main" class="flex w-14 flex-none flex-col items-center gap-1 border-r border-[#2B2724] bg-[#0B0A09] py-2">
    <button v-for="i in items" :key="i.tab" type="button" :aria-current="tab === i.tab ? 'page' : undefined" :class="cls(tab === i.tab)" @click="emit('go', i.tab)">
      <UIcon :name="i.icon" class="size-5" />{{ i.label }}
    </button>
    <div class="flex-1" />
    <button type="button" :aria-current="tab === 'settings' ? 'page' : undefined" :class="cls(tab === 'settings')" @click="emit('go', 'settings')">
      <UIcon name="i-lucide-settings" class="size-5" />Settings
    </button>
  </nav>
</template>
