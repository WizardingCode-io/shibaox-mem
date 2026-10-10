<script setup lang="ts">
// A memory in the 320px detail dock, built from Sales OS's DealDetail: a type chip and the
// id, the title, the stage pill and the importance flag, the body, a property grid (14px
// icon, muted label, value; 32px rows), files, and where it came from on the console.
import { reactive, ref, watch } from "vue";
import { api, KINDS, type Kind } from "../api";
import { asNote, describePrompt, IMPORTANCE_LABEL, KIND_TONE, when } from "../format";
import { closeDetail, refreshAfterChange, state } from "../viewer";
import Dock from "./Dock.vue";
import DockProps from "./DockProps.vue";
import Importance from "./Importance.vue";
import Markdown from "./Markdown.vue";

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
  Object.assign(form, { title: m.title, body: m.body, kind: m.kind, importance: m.importance });
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
      toast.add({ title: "Saved", description: "Edited by you, so no judge will change it.", color: "success" });
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
  <Dock v-if="state.detail" type="Memory" icon="i-lucide-sticky-note" :id="state.detail.id" label="Memory" @close="closeDetail">
    <template #actions>
      <template v-if="!editing">
        <UTooltip v-if="state.detail.status !== 'superseded'" text="Edit"><button type="button" class="wz-icon-btn" aria-label="Edit" @click="startEdit"><UIcon name="i-lucide-pencil" class="size-[15px]" /></button></UTooltip>
        <UTooltip text="Copy as a note"><button type="button" class="wz-icon-btn" aria-label="Copy as a note" @click="copy"><UIcon name="i-lucide-copy" class="size-[15px]" /></button></UTooltip>
      </template>
    </template>

    <template v-if="!editing" #head>
      <div class="flex flex-col gap-2">
        <h2 class="wz-title m-0 text-[15px] leading-5 font-semibold [overflow-wrap:anywhere]">{{ state.detail.title }}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <span class="wz-stage" :style="{ background: KIND_TONE[state.detail.kind].bg, color: KIND_TONE[state.detail.kind].fg }">{{ state.detail.kind }}</span>
          <Importance :value="state.detail.importance" />
          <span v-if="state.detail.stale" class="wz-status square" :style="{ background: 'var(--warn-soft)', color: 'var(--warn)' }">May be outdated</span>
          <span v-if="state.detail.status !== 'active'" class="wz-status" :style="{ background: 'var(--paper-sunken)', color: 'var(--ink-muted)' }">{{ state.detail.status === "archived" ? "Archived" : "Superseded" }}</span>
        </div>
      </div>
    </template>
    <template v-if="!editing" #props>
      <DockProps :rows="[
        { icon: 'i-lucide-scale', k: 'Judged by', v: `${state.detail.judge} v${state.detail.judgeVersion}` },
        { icon: 'i-lucide-git-branch', k: 'Origin', v: state.detail.branch ? `${state.detail.origin} · ${state.detail.branch}` : state.detail.origin },
        { icon: 'i-lucide-calendar', k: 'Created', v: when(state.detail.createdAt), mono: true },
        { icon: 'i-lucide-calendar-sync', k: 'Updated', v: when(state.detail.updatedAt), mono: true },
        { icon: 'i-lucide-layers', k: 'Evidence', v: `${state.detail.evidenceCount} turn${state.detail.evidenceCount === 1 ? '' : 's'}` },
        { icon: 'i-lucide-eye', k: 'Read', v: state.detail.useCount ? `${state.detail.useCount}× by agents` : 'not yet' },
        ...(state.detail.supersededBy ? [{ icon: 'i-lucide-replace', k: 'Replaced by', v: `#${state.detail.supersededBy}`, mono: true }] : []),
      ]" />
    </template>

    <template v-if="!editing">
      <Markdown v-if="state.detail.body" :source="state.detail.body" />
      <section v-if="state.detail.fileRoles.length" class="flex flex-col gap-1 border-t border-(--line) pt-3">
        <div class="flex h-5 items-center"><h3 class="m-0 flex-1 text-sm font-semibold">Files</h3><span class="wz-mono text-(--ink-muted)">{{ state.detail.fileRoles.length }}</span></div>
        <div v-for="f in state.detail.fileRoles" :key="f.path" class="flex h-7 min-w-0 items-center gap-2">
          <UIcon :name="f.role === 'read' ? 'i-lucide-file' : 'i-lucide-file-pen'" class="size-3.5 flex-none text-(--ink-muted)" />
          <span class="wz-mono" :title="f.path">{{ f.path }}</span>
          <span class="flex-1" />
          <span class="wz-meta flex-none">{{ f.role === "read" ? "read" : "changed" }}</span>
        </div>
      </section>

      <section v-if="state.detail.source" class="flex flex-col gap-2 border-t border-(--line) pt-3">
        <div class="flex h-5 items-center gap-2"><h3 class="m-0 flex-1 text-sm font-semibold">{{ { prompt: "From the prompt", task: "From a background task", subagent: "From a subagent's report" }[describePrompt(state.detail.source.prompt).kind] }}</h3><span class="wz-mono text-(--ink-muted)">{{ state.detail.source.agent }}</span></div>
        <p class="wz-console wz-clamp m-0 line-clamp-6 rounded-lg px-2.5 py-2 text-xs leading-[18px] [overflow-wrap:anywhere]">{{ describePrompt(state.detail.source.prompt).title }}</p>
        <button type="button" class="wz-link inline-flex items-center gap-1 self-start" @click="emit('openTurn', state.detail.source.turnId)">Open the turn<UIcon name="i-lucide-arrow-right" class="size-3.5" /></button>
      </section>
    </template>

    <template v-else>
      <UFormField label="Title"><UInput v-model="form.title" size="md" class="w-full" /></UFormField>
      <UFormField label="Body" hint="In full sentences"><UTextarea v-model="form.body" autoresize :rows="6" class="w-full" /></UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Kind"><USelectMenu v-model="form.kind" :items="kindItems" value-key="value" :search-input="false" size="md" class="w-full" /></UFormField>
        <UFormField label="Importance"><USelectMenu v-model="form.importance" :items="importanceItems" value-key="value" :search-input="false" size="md" class="w-full" /></UFormField>
      </div>
    </template>

    <template #footer>
      <template v-if="!editing">
        <UButton v-if="state.detail.status === 'active'" color="neutral" variant="outline" icon="i-lucide-archive" label="Archive" @click="setStatus('archived')" />
        <UButton v-else-if="state.detail.status === 'archived'" color="primary" icon="i-lucide-archive-restore" label="Restore" @click="setStatus('active')" />
        <span class="flex-1" />
        <span class="wz-meta">Never deleted</span>
      </template>
      <template v-else>
        <span class="flex-1" />
        <UButton color="neutral" variant="outline" label="Cancel" @click="editing = false" />
        <UButton color="primary" label="Save" :loading="saving" @click="save" />
      </template>
    </template>
  </Dock>
</template>
