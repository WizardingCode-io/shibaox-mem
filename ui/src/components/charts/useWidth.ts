import { onBeforeUnmount, onMounted, type Ref, ref } from "vue";

/** The element's content width, kept current: charts draw to real pixels, never stretched. */
export function useWidth(el: Ref<HTMLElement | null>, fallback = 400): Ref<number> {
  const width = ref(fallback);
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    if (!el.value) return;
    observer = new ResizeObserver(([entry]) => {
      if (entry) width.value = Math.max(120, Math.floor(entry.contentRect.width));
    });
    observer.observe(el.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return width;
}

/** Clean ticks: 0 and three steps of 1, 2 or 5 × 10^n covering the maximum. */
export function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return [0, step, step * 2, step * 3];
}

export const short = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));
