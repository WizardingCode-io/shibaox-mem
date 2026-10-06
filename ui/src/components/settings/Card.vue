<script setup lang="ts">
defineProps<{ title: string; description?: string; soon?: boolean }>();
</script>

<template>
  <section class="rounded-xl border border-(--line) bg-(--surface) p-5">
    <div class="mb-4 flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="overline">{{ title }}</h2>
        <p v-if="description" class="mt-1 mb-0 text-[13px] leading-5 text-(--ink-muted)">{{ description }}</p>
      </div>
      <UBadge v-if="soon" color="primary" variant="soft" size="sm" label="Soon" />
      <slot name="aside" />
    </div>
    <slot />
  </section>
</template>
