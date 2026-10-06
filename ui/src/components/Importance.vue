<script setup lang="ts">
import { IMPORTANCE_LABEL } from "../format";

defineProps<{ value: number }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-[3px]"
    :title="`Importance ${value} of 5 — ${IMPORTANCE_LABEL[value]}`"
    :aria-label="`Importance ${value} of 5`"
  >
    <i
      v-for="i in 5"
      :key="i"
      class="block size-1.5 rounded-full"
      :style="{ background: i <= value ? 'var(--shiba)' : 'var(--line)' }"
    />
  </span>
</template>
