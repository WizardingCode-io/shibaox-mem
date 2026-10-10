<script setup lang="ts">
// Grouped columns per week (Reports' "Bookings by month"): one y-axis, hairline grid, mono
// ticks, columns ≤ 24px with a 4px rounded cap, a 2px gap between the pair, a per-week
// hover tooltip. Series colours were validated with the dataviz validator.
import { computed, ref } from "vue";
import { short, ticks, useWidth } from "./useWidth";

// One series per chart: two measures of different scale never share an axis.
const props = defineProps<{ weeks: { weekStart: number; value: number }[]; color: string; unit: string }>();
const box = ref<HTMLElement | null>(null);
const width = useWidth(box, 600);
const H = 152;
const TOP = 8;
const BOTTOM = 24;
const LEFT = 34;
const hover = ref<number | null>(null);

const scale = computed(() => {
  const max = Math.max(1, ...props.weeks.map((w) => w.value));
  const t = ticks(max);
  const top = t[t.length - 1] as number;
  const plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + plotH - (v / top) * plotH;
  const band = (width.value - LEFT - 4) / Math.max(1, props.weeks.length);
  const bar = Math.min(24, Math.max(6, band - 16));
  return { t, y, band, bar, base: TOP + plotH };
});
const column = (x: number, v: number) => {
  const { y, bar, base } = scale.value;
  const top = Math.min(y(v), base - 0.01);
  const r = Math.min(4, bar / 2, base - top);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${base} Z`;
};
const label = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
</script>

<template>
  <div ref="box" class="relative w-full">
    <svg :width="width" :height="H" role="img" :aria-label="`${unit} per week, ${weeks.length} weeks`" class="block">
      <template v-for="(t, i) in scale.t" :key="t">
        <line :x1="LEFT" :x2="width - 4" :y1="scale.y(t)" :y2="scale.y(t)" :stroke="i === 0 ? 'var(--axis-line)' : 'var(--grid-line)'" stroke-width="1" />
        <text :x="LEFT - 6" :y="scale.y(t) + 3.5" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-muted)">{{ short(t) }}</text>
      </template>
      <g v-for="(w, i) in weeks" :key="w.weekStart" @mouseenter="hover = i" @mouseleave="hover = null">
        <rect :x="LEFT + i * scale.band" :y="TOP" :width="scale.band" :height="H - TOP - BOTTOM" :fill="hover === i ? 'var(--paper-sunken)' : 'transparent'" opacity="0.6" />
        <path :d="column(LEFT + i * scale.band + scale.band / 2 - scale.bar / 2, w.value)" :fill="color" />
        <text :x="LEFT + i * scale.band + scale.band / 2" :y="H - 8" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" :fill="hover === i ? 'var(--ink)' : 'var(--ink-muted)'">{{ label(w.weekStart) }}</text>
      </g>
    </svg>
    <div
      v-if="hover !== null && weeks[hover]"
      class="pointer-events-none absolute top-0 z-10 rounded-md bg-(--console) px-2 py-1 text-xs whitespace-nowrap text-(--console-ink)"
      :style="{ left: `${Math.max(0, Math.min(width - 190, LEFT + hover * scale.band + scale.band / 2 - 70))}px` }"
    >
      <b class="font-semibold">{{ weeks[hover].value.toLocaleString("en-GB") }}</b> {{ unit }} · week of {{ label(weeks[hover].weekStart) }}
    </div>
  </div>
</template>
