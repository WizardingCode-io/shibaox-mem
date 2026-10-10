<script setup lang="ts">
// The viewer: whether it opens with a session, and the theme as Settings' segmented control.
import { computed } from "vue";
import { fromEnvironment, saveSettings, valueOf } from "../../settings";
import { theme } from "../../viewer";
import Card from "./Card.vue";

const toast = useToast();
const autoOpen = computed({
  get: () => valueOf("WIZARDINGCODE_MEM_UI_AUTO_OPEN") !== "off",
  set: async (on: boolean) => {
    if (await saveSettings({ WIZARDINGCODE_MEM_UI_AUTO_OPEN: on ? "on" : "off" })) {
      toast.add({ title: on ? "Opens with each session" : "Stays closed", description: on ? "The viewer opens when an agent starts a session, once per machine." : "Open it yourself with wizardingcode-mem ui.", color: "success" });
    }
  },
});
</script>

<template>
  <Card id="viewer" title="Viewer" description="When this page opens and how it looks">
    <div class="flex flex-col gap-4">
      <USwitch v-model="autoOpen" :disabled="fromEnvironment('WIZARDINGCODE_MEM_UI_AUTO_OPEN')" label="Open the viewer when a session starts" description="Any agent, any project. A viewer already open is reused; no second tab." />
      <div class="flex items-center gap-3">
        <span class="wz-label">Theme</span>
        <div class="wz-segmented" role="group" aria-label="Theme">
          <button type="button" :aria-pressed="theme === 'light'" @click="theme = 'light'">Light</button>
          <button type="button" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">Dark</button>
        </div>
        <span class="text-xs text-(--ink-muted)">Remembered by this browser</span>
      </div>
    </div>
  </Card>
</template>
