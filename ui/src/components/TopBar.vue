<script setup lang="ts">
// The global top bar, as Sales OS's TopBar artboard: 40px, #0B0A09, the workspace on the
// left (the mark on a 22px ivory tile, product chip), a 420px search in the middle that opens ⌘K, 28px
// icon buttons on the right.
import mark from "../../../src/ui/assets/wizardingcode-mark.svg?raw";

const emit = defineEmits<{ palette: [] }>();
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
    <button type="button" aria-label="Search (⌘K)" class="flex h-7 w-[420px] min-w-0 items-center gap-2 rounded-lg border border-[#332E2A] bg-[#1E1B18] pr-[3px] pl-2.5 text-left text-[12.5px] text-[#9A938B] hover:border-[#4A4440] hover:text-[#D9D4CD]" @click="emit('palette')">
      <UIcon name="i-lucide-search" class="size-3.5 flex-none" />
      <span class="min-w-0 flex-1 truncate">Search memories, projects, actions</span>
      <span class="mr-1 rounded border border-[#332E2A] px-[5px] font-mono text-[10.5px] leading-4">⌘K</span>
    </button>
    <div class="flex-1" />
    <!-- Balances the workspace on the left, so the search stays centred. -->
    <div class="w-[168px] flex-none" />
  </header>
</template>
