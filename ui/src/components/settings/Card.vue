<script setup lang="ts">
// A settings card (Sales OS DENSITY.md): radius 12, padding 16, a 14px semibold title.
defineProps<{ title: string; description?: string; soon?: boolean }>();
</script>

<template>
  <section class="rounded-xl border border-(--line) bg-(--surface) p-4">
    <div class="mb-3 flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="m-0 text-sm leading-5 font-semibold">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 mb-0 text-xs leading-4 text-(--ink-muted)">{{ description }}</p>
      </div>
      <UBadge v-if="soon" color="primary" variant="soft" size="sm" label="Soon" />
      <slot name="aside" />
    </div>
    <slot />
  </section>
</template>
