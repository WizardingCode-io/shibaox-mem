<script setup lang="ts">
import { computed, ref } from "vue";
import { fromEnvironment, saveSettings, setting, settingsState, SOURCE_LABEL, valueOf } from "../../settings";
import Card from "./Card.vue";

const toast = useToast();
const key = computed(() => {
  const s = setting("TYPESAFE_API_KEY");
  return s !== null && "secret" in s ? s : null;
});
const enabled = computed({
  get: () => valueOf("WIZARDINGCODE_MEM_TYPESAFE") !== "off",
  set: async (on: boolean) => {
    if (await saveSettings({ WIZARDINGCODE_MEM_TYPESAFE: on ? "on" : "off" })) {
      toast.add({ title: on ? "TypeSafe on" : "TypeSafe off", description: on ? "TypeSafe judges first; the heuristic judge stands in when it cannot." : "The heuristic judge works alone; the key is kept.", color: "success" });
    }
  },
});
const draft = ref("");
const keyLocked = computed(() => fromEnvironment("TYPESAFE_API_KEY"));

async function saveKey() {
  if (!draft.value.trim()) return;
  if (await saveSettings({ TYPESAFE_API_KEY: draft.value })) {
    draft.value = "";
    toast.add({ title: "Key saved", description: "Kept in the settings file, readable by you only.", color: "success" });
  }
}
async function removeKey() {
  if (await saveSettings({ TYPESAFE_API_KEY: null })) {
    toast.add({ title: "Key removed", description: "The heuristic judge works alone; nothing leaves the machine.", color: "success" });
  }
}
</script>

<template>
  <Card title="Judge" description="What decides whether a turn is worth keeping, and as what. The heuristic judge always runs locally; with a TypeSafe key, TypeSafe answers first.">
    <template #aside>
      <UBadge v-if="key?.set && enabled" color="success" variant="soft" size="sm" label="TypeSafe" />
      <UBadge v-else color="neutral" variant="soft" size="sm" label="Heuristic" />
    </template>
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        <span class="text-(--ink-muted)">Key</span>
        <span v-if="key?.set" class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs">…{{ key.fingerprint?.slice(-8) }}</span>
          <span class="text-(--ink-muted)">{{ SOURCE_LABEL[key.source] }}</span>
          <UButton v-if="!keyLocked" color="neutral" variant="link" size="xs" label="Remove" :loading="settingsState.saving" @click="removeKey" />
        </span>
        <span v-else class="text-(--ink-muted)">none — the heuristic judge works alone</span>
      </div>
      <UFormField label="New key" :hint="keyLocked ? 'Set by TYPESAFE_API_KEY in the environment; the file cannot override it.' : 'Pasted once, kept in the settings file, never shown again.'" :error="settingsState.errors.TYPESAFE_API_KEY">
        <div class="flex gap-2">
          <UInput v-model="draft" type="password" autocomplete="off" placeholder="typesafe-…" class="flex-1" :disabled="keyLocked" @keydown.enter="saveKey" />
          <UButton color="primary" label="Save" :disabled="keyLocked || !draft.trim()" :loading="settingsState.saving" @click="saveKey" />
        </div>
      </UFormField>
      <USwitch v-model="enabled" :disabled="!key?.set || fromEnvironment('WIZARDINGCODE_MEM_TYPESAFE')" label="Use TypeSafe" :description="key?.set ? 'Off keeps the key but lets the heuristic judge work alone.' : 'Needs a key.'" />
    </div>
  </Card>
</template>
