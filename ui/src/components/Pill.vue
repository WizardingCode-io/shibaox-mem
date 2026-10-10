<script setup lang="ts">
// A status pill (Sales OS stage pills): uppercase 11px semibold on its soft fill, with a
// ring before the word. 20px high, radius 4.
import type { Tone } from "../format";

defineProps<{ tone: Tone; label: string }>();
</script>

<template>
  <span
    class="inline-flex h-5 flex-none items-center gap-1 rounded px-1.5 text-[11px] leading-5 font-semibold tracking-[.04em] whitespace-nowrap uppercase"
    :style="{ background: tone.bg, color: tone.fg }"
  >
    <span aria-hidden="true" class="size-2 flex-none rounded-full border-2" :style="{ borderColor: tone.fg }" />
    {{ label }}
  </span>
</template>
