<script setup lang="ts">
// Importance as a priority flag (Sales OS rows): a flag and the word, in its colour.
import { IMPORTANCE_COLOR, IMPORTANCE_LABEL } from "../format";

defineProps<{ value: number }>();
</script>

<template>
  <span
    class="inline-flex h-5 items-center gap-1 text-xs leading-4 font-medium whitespace-nowrap"
    :style="{ color: IMPORTANCE_COLOR[value] }"
    :title="`Importance ${value} of 5`"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><path d="M5 4h11l-2 4 2 4H5z" fill="currentColor" /></svg>
    {{ IMPORTANCE_LABEL[value] }}
  </span>
</template>
