<script setup lang="ts">
// No mascot: the brand's image is the Overlap mark, large, where there is nothing else to show.
import mark from "../../../src/ui/assets/wizardingcode-mark.svg?raw";

defineProps<{ title: string; text: string }>();
</script>

<template>
  <div class="m-auto max-w-[360px] px-5 py-10 text-center text-sm leading-6 text-(--ink-muted)">
    <span class="mx-auto block w-fit [&>svg]:h-14 [&>svg]:w-auto" v-html="mark" />
    <h3 class="font-display mt-5 mb-2 text-xl leading-7 font-bold text-(--ink)">{{ title }}</h3>
    <p class="m-0">{{ text }}</p>
    <slot />
  </div>
</template>
