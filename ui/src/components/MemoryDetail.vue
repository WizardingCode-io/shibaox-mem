<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { api, KINDS, type Kind } from "../api";
import { asNote, IMPORTANCE_LABEL, KIND_TONE, when } from "../format";
import { closeDetail, refreshAfterChange, state } from "../viewer";
import Importance from "./Importance.vue";
import Pill from "./Pill.vue";

const emit = defineEmits<{ openTurn: [id: number] }>();
const toast = useToast();

const editing = ref(false);
const saving = ref(false);
const form = reactive({ title: "", body: "", kind: "decision" as Kind, importance: 3 });
const kindItems = KINDS.map((k) => ({ label: k, value: k }));
const importanceItems = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} · ${IMPORTANCE_LABEL[n]}`, value: n }));

watch(
  () => state.detail?.id,
  () => {
    editing.value = false;
  },
);

function startEdit() {
  const m = state.detail;
  if (!m) return;
  form.title = m.title;
  form.body = m.body;
  form.kind = m.kind;
  form.importance = m.importance;
  editing.value = true;
}

async function save() {
  const m = state.detail;
  if (!m) return;
  saving.value = true;
  try {
    const changes: Partial<typeof form> = {};
    if (form.title.trim() !== m.title) changes.title = form.title.trim();
    if (form.body.trim() !== m.body) changes.body = form.body.trim();
    if (form.kind !== m.kind) changes.kind = form.kind;
    if (form.importance !== m.importance) changes.importance = form.importance;
    if (Object.keys(changes).length > 0) {
      await api.edit(m.id, changes);
      toast.add({ title: "Saved", description: "The memory is now yours, not a judge's.", color: "success" });
      await refreshAfterChange(m.id);
    }
    editing.value = false;
  } catch (error) {
    toast.add({ title: "Could not save", description: String(error instanceof Error ? error.message : error), color: "error" });
  } finally {
    saving.value = false;
  }
}

async function setStatus(status: "active" | "archived") {
  const m = state.detail;
  if (!m) return;
  await api.setStatus(m.id, status);
  toast.add({ title: status === "archived" ? "Archived" : "Back in use", color: "success" });
  await refreshAfterChange(m.id);
}

async function copy() {
  const m = state.detail;
  if (!m) return;
  try {
    await navigator.clipboard.writeText(asNote(m));
    toast.add({ title: "Copied as a note", color: "success" });
  } catch {
    toast.add({ title: "Could not copy", color: "error" });
  }
}
</script>

<template>
  <!-- The detail dock (Sales OS: side panels are 320px). `isolate` keeps its sticky bar
       under Nuxt UI's overlays. -->
  <aside class="isolate flex min-h-0 flex-col overflow-auto bg-(--surface)" aria-label="Memory">
    <template v-if="state.detail">
      <div class="sticky top-0 z-10 flex h-10 flex-none items-center gap-1 border-b border-(--line) bg-(--surface) px-2">
        <template v-if="!editing">
          <span class="ml-1 font-mono text-xs text-(--ink-muted)">#{{ state.detail.id }}</span>
          <span class="flex-1" />
          <UTooltip v-if="state.detail.status !== 'superseded'" text="Edit"><button type="button" aria-label="Edit" class="flex size-7 items-center justify-center rounded-md text-(--ink-muted) hover:bg-(--paper-sunken) hover:text-(--ink)" @click="startEdit"><UIcon name="i-lucide-pencil" class="size-[15px]" /></button></UTooltip>
          <UTooltip text="Copy as a note"><button type="button" aria-label="Copy as a note" class="flex size-7 items-center justify-center rounded-md text-(--ink-muted) hover:bg-(--paper-sunken) hover:text-(--ink)" @click="copy"><UIcon name="i-lucide-copy" class="size-[15px]" /></button></UTooltip>
          <UButton v-if="state.detail.status === 'active'" color="neutral" variant="outline" icon="i-lucide-archive" label="Archive" @click="setStatus('archived')" />
          <UButton v-else-if="state.detail.status === 'archived'" color="primary" icon="i-lucide-archive-restore" label="Restore" @click="setStatus('active')" />
        </template>
        <template v-else>
          <span class="ml-1 text-[13px] font-semibold">Edit memory</span>
          <span class="flex-1" />
          <UButton color="neutral" variant="outline" label="Cancel" @click="editing = false" />
          <UButton color="primary" label="Save" :loading="saving" @click="save" />
        </template>
        <UTooltip text="Close"><button type="button" aria-label="Close" class="flex size-7 items-center justify-center rounded-md text-(--ink-muted) hover:bg-(--paper-sunken) hover:text-(--ink)" @click="closeDetail"><UIcon name="i-lucide-x" class="size-[15px]" /></button></UTooltip>
      </div>

      <div v-if="!editing" class="flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="KIND_TONE[state.detail.kind]" :label="state.detail.kind" />
          <Pill v-if="state.detail.status !== 'active'" :tone="{ bg: 'var(--paper-sunken)', fg: 'var(--ink-muted)' }" :label="state.detail.status" />
          <Pill v-if="state.detail.stale" :tone="{ bg: 'var(--warn-soft)', fg: 'var(--warn)' }" label="stale" />
          <Importance :value="state.detail.importance" />
        </div>
        <h2 class="m-0 text-[15px] leading-5 font-semibold [overflow-wrap:anywhere]">{{ state.detail.title }}</h2>
        <div v-if="state.detail.body" class="text-[13px] leading-[18px] whitespace-pre-wrap [overflow-wrap:anywhere]">{{ state.detail.body }}</div>
        <dl class="m-0 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs leading-4">
          <dt class="text-(--ink-muted)">Judged by</dt><dd class="m-0">{{ state.detail.judge }} <span class="font-mono text-(--ink-muted)">v{{ state.detail.judgeVersion }}</span></dd>
          <dt class="text-(--ink-muted)">Origin</dt><dd class="m-0">{{ state.detail.origin }} <span v-if="state.detail.branch" class="font-mono text-(--ink-muted)">{{ state.detail.branch }}</span></dd>
          <dt class="text-(--ink-muted)">Created</dt><dd class="m-0 font-mono">{{ when(state.detail.createdAt) }}</dd>
          <template v-if="state.detail.updatedAt !== state.detail.createdAt"><dt class="text-(--ink-muted)">Updated</dt><dd class="m-0 font-mono">{{ when(state.detail.updatedAt) }}</dd></template>
          <dt class="text-(--ink-muted)">Evidence</dt><dd class="m-0">{{ state.detail.evidenceCount }} turn{{ state.detail.evidenceCount === 1 ? "" : "s" }}<span v-if="state.detail.useCount" class="text-(--ink-muted)"> · read {{ state.detail.useCount }}×</span></dd>
          <template v-if="state.detail.supersededBy"><dt class="text-(--ink-muted)">Replaced by</dt><dd class="m-0 font-mono">#{{ state.detail.supersededBy }}</dd></template>
        </dl>
        <div v-if="state.detail.fileRoles.length" class="flex flex-col gap-1.5">
          <div class="overline">Files</div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="f in state.detail.fileRoles" :key="f.path" class="flex min-w-0 items-center gap-2 font-mono text-xs leading-4">
              <UIcon name="i-lucide-file" class="size-3.5 flex-none text-(--ink-muted)" /><span class="truncate" :title="f.path">{{ f.path }}</span>
              <Pill v-if="f.role === 'read'" :tone="{ bg: 'var(--paper-sunken)', fg: 'var(--ink-muted)' }" label="read" />
            </li>
          </ul>
        </div>
        <div v-if="state.detail.source" class="flex flex-col gap-1.5">
          <div class="overline">From the prompt · {{ state.detail.source.agent }} · {{ when(state.detail.source.startedAt) }}</div>
          <div class="rounded-xl border border-(--console-line) bg-(--console) p-3 font-mono text-xs leading-[18px] whitespace-pre-wrap text-(--console-ink) [overflow-wrap:anywhere]">{{ state.detail.source.prompt }}</div>
          <button type="button" class="flex items-center gap-1.5 self-start text-[13px] font-semibold text-(--violet-text) hover:underline" @click="emit('openTurn', state.detail.source.turnId)"><UIcon name="i-lucide-history" class="size-3.5" />Open the turn</button>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3 p-4">
        <UFormField label="Title">
          <UInput v-model="form.title" size="md" class="w-full" />
        </UFormField>
        <UFormField label="Body" hint="In full sentences">
          <UTextarea v-model="form.body" autoresize :rows="6" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Kind">
            <USelectMenu v-model="form.kind" :items="kindItems" value-key="value" :search-input="false" size="md" class="w-full" />
          </UFormField>
          <UFormField label="Importance">
            <USelectMenu v-model="form.importance" :items="importanceItems" value-key="value" :search-input="false" size="md" class="w-full" />
          </UFormField>
        </div>
      </div>
    </template>
  </aside>
</template>
