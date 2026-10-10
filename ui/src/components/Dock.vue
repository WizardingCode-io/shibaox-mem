<script setup lang="ts">
// The one detail surface of the app, in two sizes.
// Panel (Sales OS side panels): 320px, a 40px header with the type chip, the id and icon
// buttons; head, properties and sections stacked; a 56px footer.
// Dialog (STATES.md dialog system, wide): the same content at 960px for reading long
// prompts and answers; the properties move to a 264px column on the right. Expanding
// closes the panel; "back to panel" returns to it; Esc or the scrim close both.
import { ref, watch } from "vue";

const props = defineProps<{ type: string; icon: string; id: number | string; label: string }>();
const emit = defineEmits<{ close: [] }>();
const expanded = ref(false);
// A different item starts in the panel again.
watch(
  () => props.id,
  () => {
    expanded.value = false;
  },
);
function closeDialog(open: boolean) {
  if (!open) {
    expanded.value = false;
    emit("close");
  }
}
</script>

<template>
  <aside v-if="!expanded" class="isolate flex min-h-0 w-80 flex-none flex-col border-l border-(--line) bg-(--paper-raised) motion-safe:animate-[dock-in_240ms_ease-out]" :aria-label="label">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--line) pr-2 pl-4">
      <span class="inline-flex h-5 items-center gap-1 rounded border border-(--line) px-1.5 text-[11px] font-semibold"><UIcon :name="icon" class="size-3" />{{ type }}</span>
      <span class="wz-mono text-(--ink-muted)">#{{ id }}</span>
      <span class="flex-1" />
      <slot name="actions" />
      <UTooltip text="Expand"><button type="button" class="wz-icon-btn" aria-label="Expand" @click="expanded = true"><UIcon name="i-lucide-maximize-2" class="size-[15px]" /></button></UTooltip>
      <UTooltip text="Close"><button type="button" class="wz-icon-btn" aria-label="Close" @click="emit('close')"><UIcon name="i-lucide-x" class="size-[15px]" /></button></UTooltip>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <slot name="head" />
      <slot name="props" />
      <slot />
    </div>
    <div v-if="$slots.footer" class="flex h-14 flex-none items-center gap-2 border-t border-(--line) px-4"><slot name="footer" /></div>
  </aside>

  <UModal
    v-else
    :open="true"
    :title="`${type} #${id}`"
    :description="label"
    :ui="{ content: 'sm:max-w-[960px] max-h-[85vh] rounded-xl bg-(--paper-raised) ring-0 shadow-[0_0_0_1px_var(--line),0_24px_60px_-12px_rgba(16,14,13,.28)] overflow-hidden', overlay: 'bg-[rgba(16,14,13,.48)]' }"
    @update:open="closeDialog"
  >
    <template #content>
      <div class="flex max-h-[85vh] min-h-0 flex-col">
        <div class="flex h-[52px] flex-none items-center gap-2 border-b border-(--line) pr-3 pl-5">
          <span class="inline-flex h-5 items-center gap-1 rounded border border-(--line) px-1.5 text-[11px] font-semibold"><UIcon :name="icon" class="size-3" />{{ type }}</span>
          <span class="wz-mono text-(--ink-muted)">#{{ id }}</span>
          <span class="flex-1" />
          <slot name="actions" />
          <UTooltip text="Back to the panel"><button type="button" class="wz-icon-btn" aria-label="Back to the panel" @click="expanded = false"><UIcon name="i-lucide-minimize-2" class="size-[15px]" /></button></UTooltip>
          <UTooltip text="Close" :kbds="['esc']"><button type="button" class="wz-icon-btn" aria-label="Close" @click="closeDialog(false)"><UIcon name="i-lucide-x" class="size-[15px]" /></button></UTooltip>
        </div>
        <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_264px]">
          <div class="wz-wide flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
            <slot name="head" />
            <slot />
          </div>
          <div class="min-h-0 overflow-y-auto border-l border-(--line) px-4 py-4">
            <p class="wz-label m-0 mb-1">Properties</p>
            <slot name="props" />
          </div>
        </div>
        <div v-if="$slots.footer" class="flex h-14 flex-none items-center gap-2 border-t border-(--row-line) px-5"><slot name="footer" /></div>
      </div>
    </template>
  </UModal>
</template>
