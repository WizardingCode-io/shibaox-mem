<script setup lang="ts">
// The property grid of a side panel (DealDetail): 32px rows, a 14px icon, a muted label, the value.
defineProps<{ rows: { icon: string; k: string; v: string; mono?: boolean }[] }>();
</script>

<template>
  <dl class="m-0 flex flex-col">
    <div v-for="p in rows" :key="p.k" class="flex h-8 items-center gap-2">
      <UIcon :name="p.icon" class="size-3.5 flex-none text-(--ink-muted)" />
      <dt class="w-[76px] flex-none text-[12.5px] text-(--ink-muted)">{{ p.k }}</dt>
      <dd class="m-0 min-w-0 truncate text-[13px]" :class="{ 'font-mono text-xs': p.mono }" :title="p.v">{{ p.v }}</dd>
    </div>
  </dl>
</template>
