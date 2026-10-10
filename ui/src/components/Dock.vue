<script setup lang="ts">
// The one side panel of the app (Sales OS: side panels are 320px): a 40px header with the
// type chip, the id and icon buttons; a scrolling body; a 56px footer for actions. Memories
// and turns both open in it, so they read the same.
defineProps<{ type: string; icon: string; id: number | string; label: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside class="isolate flex min-h-0 w-80 flex-none flex-col border-l border-(--line) bg-(--paper-raised) motion-safe:animate-[dock-in_240ms_ease-out]" :aria-label="label">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--line) pr-2 pl-4">
      <span class="inline-flex h-5 items-center gap-1 rounded border border-(--line) px-1.5 text-[11px] font-semibold"><UIcon :name="icon" class="size-3" />{{ type }}</span>
      <span class="wz-mono text-(--ink-muted)">#{{ id }}</span>
      <span class="flex-1" />
      <slot name="actions" />
      <UTooltip text="Close"><button type="button" class="wz-icon-btn" aria-label="Close" @click="emit('close')"><UIcon name="i-lucide-x" class="size-[15px]" /></button></UTooltip>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"><slot /></div>
    <div v-if="$slots.footer" class="flex h-14 flex-none items-center gap-2 border-t border-(--line) px-4"><slot name="footer" /></div>
  </aside>
</template>
