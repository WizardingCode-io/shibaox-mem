<script setup lang="ts">
import Card from "./Card.vue";
</script>

<template>
  <Card id="team" title="Collaborative mode" description="A team sharing one project's memory, in real time. In design; this build has no client for it." soon>
    <div class="flex flex-col gap-3 text-[13px] leading-5">
      <p class="m-0 text-(--ink-muted)">Today a memory belongs to one machine. Collaborative mode lets a team share it <strong class="font-semibold text-(--ink)">per project</strong>: projects are already identified by their git remote, so everyone on a repository lands on the same one.</p>
      <dl class="wz-kv">
        <dt>What it will be</dt>
        <dd>Each person's agent distils locally, with the same redaction, and the memories reach the team as they happen: author, kind, importance, state. Archiving and editing are shared, with a history.</dd>
        <dt>What stays</dt>
        <dd>Local first: no account and no network needed. Sharing is opt-in, per project. Anything marked private, or inside a <code class="font-mono text-xs">&lt;private&gt;</code> block, never leaves your machine. No telemetry.</dd>
        <dt>Where it stands</dt>
        <dd>In design. No date and nothing to sign up for; the release notes will say when, and this page becomes the switch.</dd>
      </dl>
    </div>
  </Card>
</template>
