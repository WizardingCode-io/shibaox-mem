<script setup lang="ts">
// A turn's state: a dot and a word, always both. The dot's shape changes too (circle,
// square, diamond), so the state never depends on colour alone.
defineProps<{ state: string }>();
</script>

<template>
  <span class="inline-flex h-6 items-center gap-1.5 rounded-full border border-(--line) bg-(--surface) pr-2.5 pl-2 font-mono text-xs leading-4 font-medium whitespace-nowrap text-(--ink)">
    <i
      class="block size-[7px] flex-none"
      :class="{
        'rounded-full bg-(--ok)': state === 'done',
        'rotate-45 rounded-[1px] bg-(--danger)': state === 'failed',
        'rounded-full bg-(--blue-text)': state === 'open' || state === 'processing',
        'rounded-[1px] bg-(--warn)': state === 'pending',
        'rounded-full bg-(--ink-muted)': !['done', 'failed', 'open', 'processing', 'pending'].includes(state),
      }"
    />
    {{ state }}
  </span>
</template>
