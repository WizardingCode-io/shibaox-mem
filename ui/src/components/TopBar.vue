<script setup lang="ts">
// The global top bar, as Sales OS's TopBar artboard: 40px, #0B0A09, the workspace on the
// left (the mark on a 22px ivory tile, product chip), a 420px search in the middle, 28px
// icon buttons on the right.
import { ref } from "vue";
import mark from "../../../src/ui/assets/wizardingcode-mark.svg?raw";

const q = defineModel<string>({ required: true });
defineProps<{ searchable: boolean }>();
const emit = defineEmits<{ palette: [] }>();
const input = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <header class="flex h-10 flex-none items-center gap-2 border-b border-[#2B2724] bg-[#0B0A09] pr-2 pl-2.5 text-[#F4F1EC]">
    <div class="flex h-7 flex-none items-center gap-2 pr-2 pl-1 text-[13px] font-semibold">
      <!-- The mark sits on ivory in both themes, so it keeps the light blending. -->
      <span class="flex size-[22px] items-center justify-center rounded-md bg-[#F4F1EC] [--blend-overlap:multiply] [&>svg]:h-3.5 [&>svg]:w-auto" v-html="mark" />
      WizardingCode
    </div>
    <span class="flex-none rounded border border-[#332E2A] px-1.5 py-px font-mono text-[10.5px] leading-4 text-[#9A938B]">mem</span>
    <div class="flex-1" />
    <label class="flex h-7 w-[420px] min-w-0 items-center gap-2 rounded-lg border border-[#332E2A] bg-[#1E1B18] pr-[3px] pl-2.5 text-[13px] text-[#9A938B]" :class="{ invisible: !searchable }">
      <UIcon name="i-lucide-search" class="size-3.5 flex-none" />
      <input ref="input" v-model="q" type="search" placeholder="Search memories, files, decisions" aria-label="Search memories" class="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-[#F4F1EC] outline-none focus-visible:outline-none placeholder:text-[#9A938B]">
      <button v-if="q" type="button" aria-label="Clear the search" class="mr-1 flex size-5 items-center justify-center rounded text-[#9A938B] hover:text-[#F4F1EC]" @click="q = ''"><UIcon name="i-lucide-x" class="size-3.5" /></button>
      <button v-else type="button" aria-label="Open the command palette" class="mr-1 rounded border border-[#332E2A] px-[5px] font-mono text-[10.5px] leading-4 text-[#9A938B] hover:text-[#F4F1EC]" @click="emit('palette')">⌘K</button>
    </label>
    <div class="flex-1" />
    <!-- Balances the workspace on the left, so the search stays centred. -->
    <div class="w-[168px] flex-none" />
  </header>
</template>
