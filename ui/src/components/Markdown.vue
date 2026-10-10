<script setup lang="ts">
// Markdown, formatted in the app's type scale (wz-md in wz.css). Safe by construction: see markdown.ts.
import { computed } from "vue";
import { renderMarkdown } from "../markdown";

const props = defineProps<{ source: string }>();
const html = computed(() => renderMarkdown(props.source));
</script>

<template>
  <div class="wz-md" v-html="html" />
</template>
