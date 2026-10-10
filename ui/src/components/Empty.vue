<script setup lang="ts">
// An empty state (Sales OS STATES.md): a 48px tile, a 14px title, one muted line.
defineProps<{ icon: string; title: string; text: string }>();
</script>

<template>
  <div class="m-auto flex max-w-[360px] flex-col items-center px-5 py-10 text-center">
    <span class="flex size-12 items-center justify-center rounded-xl bg-(--paper-sunken) text-(--ink-muted)"><UIcon :name="icon" class="size-5" /></span>
    <h3 class="mt-3 mb-1 text-sm leading-5 font-semibold text-(--ink)">{{ title }}</h3>
    <p class="m-0 text-[13px] leading-[18px] text-(--ink-muted)">{{ text }}</p>
    <slot />
  </div>
</template>
