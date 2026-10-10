<script setup lang="ts">
// The global top bar (Sales OS TopBar): 40px, the darkest surface. The workspace on the
// left, the search in the middle, a few icon buttons on the right.
import { ref } from "vue";
import mark from "../../../src/ui/assets/wizardingcode-mark.svg?raw";
import { state, theme } from "../viewer";

const q = defineModel<string>({ required: true });
defineProps<{ searchable: boolean }>();
const emit = defineEmits<{ palette: [] }>();
const input = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <header class="flex h-10 flex-none items-center gap-2 border-b border-(--frame-line) bg-(--frame-0) pr-2 pl-2.5 text-(--frame-ink)">
    <div class="flex h-7 items-center gap-2 pr-2 pl-1 text-[13px] font-semibold">
      <span class="flex size-[22px] items-center justify-center rounded-md bg-(--frame-ink) [&>svg]:h-3.5 [&>svg]:w-auto" v-html="mark" />
      WizardingCode
    </div>
    <span class="rounded border border-(--frame-field-line) px-1.5 font-mono text-[10.5px] leading-4 text-(--frame-muted)">mem</span>
    <div class="flex-1" />
    <label class="flex h-7 w-[420px] min-w-0 items-center gap-2 rounded-lg border border-(--frame-field-line) bg-(--frame-field) pr-[3px] pl-2.5 text-(--frame-muted)" :class="{ invisible: !searchable }">
      <UIcon name="i-lucide-search" class="size-3.5 flex-none" />
      <input
        ref="input"
        v-model="q"
        type="search"
        placeholder="Search titles, bodies, file names"
        aria-label="Search memories"
        class="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-(--frame-ink) outline-none placeholder:text-(--frame-muted)"
      >
      <button v-if="q" type="button" aria-label="Clear the search" class="flex size-5 items-center justify-center rounded text-(--frame-muted) hover:text-(--frame-ink)" @click="q = ''"><UIcon name="i-lucide-x" class="size-3.5" /></button>
      <kbd v-else class="mr-1 rounded border border-(--frame-field-line) px-[5px] font-mono text-[10.5px] leading-4 text-(--frame-muted)">/</kbd>
    </label>
    <div class="flex-1" />
    <UTooltip text="Command palette" :kbds="['meta', 'K']">
      <button type="button" aria-label="Command palette" class="flex size-7 items-center justify-center rounded-lg text-(--frame-soft) hover:bg-(--frame-raised)" @click="emit('palette')"><UIcon name="i-lucide-command" class="size-4" /></button>
    </UTooltip>
    <UTooltip :text="theme === 'dark' ? 'Light theme' : 'Dark theme'">
      <button type="button" aria-label="Switch theme" class="flex size-7 items-center justify-center rounded-lg text-(--frame-soft) hover:bg-(--frame-raised)" @click="theme = theme === 'dark' ? 'light' : 'dark'"><UIcon :name="theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" /></button>
    </UTooltip>
    <span class="ml-1 font-mono text-[10.5px] text-(--frame-muted)" :title="`wizardingcode-mem ${state.version}`">v{{ state.version }}</span>
  </header>
</template>
