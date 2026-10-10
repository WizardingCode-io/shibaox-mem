<script setup lang="ts">
// A KPI sparkline (Reports' KPI cards): a 2px line, a 10% wash under it, the last point
// as an 8px dot with a 2px surface ring.
import { computed } from "vue";

const props = defineProps<{ values: number[]; color?: string }>();
const W = 64;
const H = 22;
const path = computed(() => {
  const v = props.values.length > 1 ? props.values : [0, ...props.values, 0];
  const max = Math.max(1, ...v);
  const pts = v.map((y, i) => [3 + (i * (W - 7)) / (v.length - 1), H - 4 - (y / max) * (H - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] as readonly [number, number];
  return { line, area: `${line} L${last[0].toFixed(1)},${H - 4} L3,${H - 4} Z`, last };
});
</script>

<template>
  <svg :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" aria-hidden="true" class="flex-none">
    <path :d="path.area" :fill="color ?? 'var(--series-2)'" opacity="0.1" />
    <path :d="path.line" fill="none" :stroke="color ?? 'var(--series-2)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <circle :cx="path.last[0]" :cy="path.last[1]" r="4" :fill="color ?? 'var(--series-2)'" stroke="var(--paper-raised)" stroke-width="2" />
  </svg>
</template>
