<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { api, KINDS, type Kind } from "../api";
import { asNote, IMPORTANCE_LABEL, KIND_COLOR, when } from "../format";
import { closeDetail, refreshAfterChange, state } from "../viewer";
import Importance from "./Importance.vue";

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
  <!-- `isolate` keeps the sticky toolbar's z-index inside the column, so that Nuxt UI's
       overlays (which rely on coming last in the document) still cover it. -->
  <aside class="isolate flex min-h-0 flex-col overflow-auto border-(--line) bg-(--surface) xl:w-[460px]" :class="{ 'xl:border-l': state.detail }" aria-label="Memory">
    <template v-if="state.detail">
      <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-(--line) bg-(--surface) px-4 py-3">
        <template v-if="!editing">
          <UButton v-if="state.detail.status === 'active'" color="neutral" variant="outline" size="sm" icon="i-lucide-archive" label="Archive" @click="setStatus('archived')" />
          <UButton v-else-if="state.detail.status === 'archived'" color="primary" size="sm" icon="i-lucide-archive-restore" label="Restore" @click="setStatus('active')" />
          <UButton v-if="state.detail.status !== 'superseded'" color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" label="Edit" @click="startEdit" />
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-copy" label="Copy" title="Copy as a note" @click="copy" />
        </template>
        <template v-else>
          <UButton color="primary" size="sm" icon="i-lucide-check" label="Save" :loading="saving" @click="save" />
          <UButton color="neutral" variant="ghost" size="sm" label="Cancel" @click="editing = false" />
        </template>
        <span class="flex-1" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" aria-label="Close" @click="closeDetail" />
      </div>

      <div v-if="!editing" class="flex flex-col gap-5 px-5 pt-5 pb-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="KIND_COLOR[state.detail.kind]" variant="soft" size="sm" :label="state.detail.kind" />
          <UBadge v-if="state.detail.status !== 'active'" color="error" variant="soft" size="sm" :label="state.detail.status" />
          <UBadge v-if="state.detail.stale" color="warning" variant="soft" size="sm" label="stale" />
          <Importance :value="state.detail.importance" class="ml-0.5" />
        </div>
        <h2 class="font-display m-0 text-[22px] leading-7 font-bold [overflow-wrap:anywhere]">{{ state.detail.title }}</h2>
        <div v-if="state.detail.body" class="text-[15px] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{{ state.detail.body }}</div>
        <dl class="m-0 grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[18px]">
          <dt class="text-(--ink-muted)">Judged by</dt><dd class="m-0">{{ state.detail.judge }} <span class="text-(--ink-muted)">v{{ state.detail.judgeVersion }}</span></dd>
          <dt class="text-(--ink-muted)">Origin</dt><dd class="m-0">{{ state.detail.origin }} <span v-if="state.detail.branch" class="font-mono text-xs text-(--ink-muted)">{{ state.detail.branch }}</span></dd>
          <dt class="text-(--ink-muted)">Created</dt><dd class="m-0">{{ when(state.detail.createdAt) }} <span v-if="state.detail.updatedAt !== state.detail.createdAt" class="text-(--ink-muted)">· updated {{ when(state.detail.updatedAt) }}</span></dd>
          <dt class="text-(--ink-muted)">Evidence</dt><dd class="m-0">{{ state.detail.evidenceCount }} turn{{ state.detail.evidenceCount === 1 ? "" : "s" }} <span v-if="state.detail.useCount" class="text-(--ink-muted)">· read {{ state.detail.useCount }}×</span></dd>
          <template v-if="state.detail.supersededBy"><dt class="text-(--ink-muted)">Replaced by</dt><dd class="m-0">#{{ state.detail.supersededBy }}</dd></template>
          <dt class="text-(--ink-muted)">Id</dt><dd class="m-0 font-mono text-xs">#{{ state.detail.id }}</dd>
        </dl>
        <div v-if="state.detail.fileRoles.length" class="flex flex-col gap-2">
          <div class="overline">Files</div>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="f in state.detail.fileRoles" :key="f.path" class="flex items-center gap-2 font-mono text-xs leading-[18px]">
              <UIcon name="i-lucide-file" class="size-3.5 text-(--ink-muted)" /><span>{{ f.path }}</span>
              <UBadge v-if="f.role === 'read'" color="neutral" variant="soft" size="sm" label="read" />
            </li>
          </ul>
        </div>
        <div v-if="state.detail.source" class="flex flex-col gap-2">
          <div class="overline">From the prompt · {{ state.detail.source.agent }} · {{ when(state.detail.source.startedAt) }}</div>
          <div class="rounded-lg border border-(--line) bg-(--surface-sunken) p-3 text-[13px] leading-5 whitespace-pre-wrap text-(--ink-muted) [overflow-wrap:anywhere]">{{ state.detail.source.prompt }}</div>
          <UButton color="neutral" variant="link" size="sm" icon="i-lucide-history" label="Open the turn" class="self-start" @click="emit('openTurn', state.detail.source.turnId)" />
        </div>
      </div>

      <div v-else class="flex flex-col gap-4 px-5 pt-5 pb-6">
        <UFormField label="Title">
          <UInput v-model="form.title" class="w-full" />
        </UFormField>
        <UFormField label="Body" hint="What was said, in full sentences">
          <UTextarea v-model="form.body" autoresize :rows="6" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Kind">
            <USelectMenu v-model="form.kind" :items="kindItems" value-key="value" :search-input="false" class="w-full" />
          </UFormField>
          <UFormField label="Importance">
            <USelectMenu v-model="form.importance" :items="importanceItems" value-key="value" :search-input="false" class="w-full" />
          </UFormField>
        </div>
      </div>
    </template>

  </aside>
</template>
