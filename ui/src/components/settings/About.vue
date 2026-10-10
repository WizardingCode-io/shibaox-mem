<script setup lang="ts">
// Who makes this, quietly: the version, where the code is, and WizardingCode's site.
import { state } from "../../viewer";
import { REPO, siteLink } from "../../site";
import Card from "./Card.vue";

const LINKS = [
  { label: "wizardingcode.io", sub: "Agents in production. Not in pilots.", href: siteLink("settings-about"), icon: "i-lucide-globe" },
  { label: "Source code", sub: "Apache-2.0, on GitHub", href: REPO, icon: "i-lucide-code-xml" },
  { label: "Report an issue", sub: "What broke, and what you expected", href: `${REPO}/issues/new`, icon: "i-lucide-message-square-warning" },
  { label: "Releases", sub: "What changed in each version", href: `${REPO}/releases`, icon: "i-lucide-tag" },
];
</script>

<template>
  <Card id="about" title="About" :description="`wizardingcode-mem ${state.version} · memory for coding agents, by WizardingCode`" flush>
    <a
      v-for="(l, i) in LINKS"
      :key="l.label"
      :href="l.href"
      target="_blank"
      rel="noopener noreferrer"
      class="flex h-11 items-center gap-3 px-4 hover:bg-(--surface-hover)"
      :class="{ 'border-t border-(--row-line)': i > 0 }"
    >
      <UIcon :name="l.icon" class="size-4 flex-none text-(--ink-muted)" />
      <span class="wz-name flex-none">{{ l.label }}</span>
      <span class="wz-meta flex-1">{{ l.sub }}</span>
      <UIcon name="i-lucide-arrow-up-right" class="size-3.5 flex-none text-(--ink-muted)" />
    </a>
  </Card>
</template>
