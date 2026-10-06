<script setup lang="ts">
import { computed } from "vue";
import { fromEnvironment, saveSettings, valueOf } from "../../settings";
import { theme } from "../../viewer";
import Card from "./Card.vue";

const toast = useToast();
const autoOpen = computed({
  get: () => valueOf("SHIBAOX_MEM_UI_AUTO_OPEN") !== "off",
  set: async (on: boolean) => {
    if (await saveSettings({ SHIBAOX_MEM_UI_AUTO_OPEN: on ? "on" : "off" })) {
      toast.add({ title: on ? "Opens with each session" : "Stays closed", description: on ? "The viewer opens when an agent starts a session, once per machine." : "Open it yourself with shibaox-mem ui.", color: "success" });
    }
  },
});
const dark = computed({
  get: () => theme.value === "dark",
  set: (on: boolean) => {
    theme.value = on ? "dark" : "light";
  },
});
</script>

<template>
  <Card title="Viewer" description="This page: when it opens and how it looks.">
    <div class="flex flex-col gap-4">
      <USwitch v-model="autoOpen" :disabled="fromEnvironment('SHIBAOX_MEM_UI_AUTO_OPEN')" label="Open the viewer when a session starts" description="Any agent, any project. A viewer already open is reused; no second tab." />
      <USwitch v-model="dark" label="Dark theme" description="Remembered by this browser; the theme follows the system until you choose." />
    </div>
  </Card>
</template>
