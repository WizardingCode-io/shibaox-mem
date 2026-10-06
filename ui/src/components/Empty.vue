<script setup lang="ts">
import Mascot from "./Mascot.vue";

defineProps<{ mood: "default" | "sleeping"; title: string; text: string }>();
</script>

<template>
  <div class="m-auto max-w-[360px] px-5 py-10 text-center text-sm leading-6 text-(--ink-muted)">
    <Mascot :mood="mood" />
    <h3 class="font-display mt-3 mb-2 text-2xl leading-8 font-bold text-(--ink)">{{ title }}</h3>
    <p class="m-0">{{ text }}</p>
    <slot />
  </div>
</template>
