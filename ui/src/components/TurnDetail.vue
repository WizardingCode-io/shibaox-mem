<script setup lang="ts">
import { ref, watch } from "vue";
import { api, type TurnDetail } from "../api";
import { KIND_TONE, TURN_TONE, when } from "../format";
import Pill from "./Pill.vue";

const props = defineProps<{ turnId: number | null }>();
const emit = defineEmits<{ close: []; openMemory: [id: number] }>();
const turn = ref<TurnDetail | null>(null);
const open = ref(false);

watch(
  () => props.turnId,
  async (id) => {
    if (id === null) {
      open.value = false;
      return;
    }
    turn.value = await api.turn(id);
    open.value = true;
  },
  { immediate: true },
);
watch(open, (o) => {
  if (!o) emit("close");
});
</script>

<template>
  <USlideover v-model:open="open" title="Turn" :description="turn ? `${turn.agent} · ${when(turn.startedAt)}` : ''">
    <template #body>
      <div v-if="turn" class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="TURN_TONE[turn.state] ?? { bg: 'var(--paper-sunken)', fg: 'var(--ink-muted)' }" :label="turn.state" />
          <Pill v-if="turn.completeness !== 'full'" :tone="{ bg: 'var(--paper-sunken)', fg: 'var(--ink-muted)' }" :label="turn.completeness" />
          <span class="font-mono text-xs text-(--ink-muted)">#{{ turn.id }}</span>
        </div>
        <section class="flex flex-col gap-2">
          <div class="overline">Prompt</div>
          <div class="rounded-xl border border-(--console-line) bg-(--console) p-3 text-[13px] leading-5 whitespace-pre-wrap text-(--console-ink) [overflow-wrap:anywhere]">{{ turn.prompt }}</div>
        </section>
        <section v-if="turn.finalText" class="flex flex-col gap-2">
          <div class="overline">Answer</div>
          <div class="rounded-xl border border-(--console-line) bg-(--console) p-3 text-[13px] leading-5 whitespace-pre-wrap text-(--console-ink) [overflow-wrap:anywhere]">{{ turn.finalText }}</div>
        </section>
        <section class="flex flex-col gap-2">
          <div class="overline">Became</div>
          <div v-if="turn.memories.length" class="flex flex-col gap-1.5">
            <UButton v-for="m in turn.memories" :key="m.id" color="neutral" variant="outline" size="sm" class="justify-start text-left" @click="emit('openMemory', m.id)">
              <Pill :tone="KIND_TONE[m.kind]" :label="m.kind" /><span class="truncate">{{ m.title }}</span>
            </UButton>
          </div>
          <p v-else class="m-0 text-[13px] text-(--ink-muted)">
            {{ turn.state === "skipped" ? "Nothing worth keeping, by the judge." : turn.state === "failed" ? "Distillation failed." : turn.state === "done" ? "Reinforced an existing memory, or nothing stood alone." : "Not distilled yet." }}
          </p>
          <p v-if="turn.lastError" class="m-0 text-xs text-(--danger)">{{ turn.lastError }}</p>
        </section>
        <section v-if="turn.filesChanged.length || turn.filesRead.length" class="flex flex-col gap-2">
          <div class="overline">Files</div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs leading-[18px]">
            <li v-for="f in turn.filesChanged" :key="`c${f}`" class="flex items-center gap-2"><UIcon name="i-lucide-file-pen" class="size-3.5 text-(--ink-muted)" />{{ f }}</li>
            <li v-for="f in turn.filesRead" :key="`r${f}`" class="flex items-center gap-2 text-(--ink-muted)"><UIcon name="i-lucide-file" class="size-3.5" />{{ f }}</li>
          </ul>
        </section>
        <section v-if="turn.commands.length" class="flex flex-col gap-2">
          <div class="overline">Commands</div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs leading-[18px]">
            <li v-for="(c, i) in turn.commands" :key="i" class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ c }}</li>
          </ul>
        </section>
        <section v-if="turn.errors.length" class="flex flex-col gap-2">
          <div class="overline">Errors</div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs leading-[18px] text-(--danger)">
            <li v-for="(e, i) in turn.errors" :key="i" class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ e }}</li>
          </ul>
        </section>
      </div>
    </template>
  </USlideover>
</template>
