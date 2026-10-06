<script setup lang="ts">
// The mascot, once per screen, in empty states only — as the brand book asks.
import shibaDefault from "../../../src/ui/assets/shiba-default.svg?raw";
import shibaSleeping from "../../../src/ui/assets/shiba-sleeping.svg?raw";

const props = defineProps<{ mood: "default" | "sleeping" }>();
const svg = (props.mood === "sleeping" ? shibaSleeping : shibaDefault).replace(
  "<svg ",
  `<svg data-mascot="${props.mood}" class="mascot" aria-hidden="true" `,
);
</script>

<template>
  <span v-html="svg" />
</template>
