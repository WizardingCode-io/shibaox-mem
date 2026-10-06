<script setup lang="ts">
import Card from "./Card.vue";
</script>

<template>
  <Card title="Collaborative mode" description="A whole team sharing one project's memory, in real time. In design; this is the only place it is mentioned, and this build contains no client for it." soon>
    <div class="flex max-w-[72ch] flex-col gap-3 text-[13px] leading-6 text-(--ink-muted)">
      <p class="m-0">
        Today a memory belongs to one machine: what your agent learned about a project stays with you. The collaborative mode will let a team share that memory <strong class="font-medium text-(--ink)">per project</strong>. The key already exists: shibaox-mem identifies a project by its normalised git remote, the same in every clone and worktree, so two people on the same repository are on the same project without any setup.
      </p>
      <p class="m-0"><strong class="font-medium text-(--ink)">What it will be.</strong> A shared space per project where the memories each person's agent distils — locally, with the same redaction of secrets as now — are published and reach everyone else as they happen, with their author, kind, importance and state. Every agent on the team receives the session briefing with what the team knows, not only what one machine saw; archiving and editing are shared, with a history of who changed what; the viewer can filter by author and by date; a memory you mark private, and anything inside a <code class="font-mono text-xs">&lt;private&gt;</code> block, never leaves your machine.</p>
      <p class="m-0"><strong class="font-medium text-(--ink)">What will not change.</strong> Local first: your memory keeps working with no account and no network, exactly as today. Sharing is opt-in, project by project, and nothing leaves the machine until you turn it on for that project. No telemetry. The open core stays open; the team service is what pays for it.</p>
      <p class="m-0"><strong class="font-medium text-(--ink)">Where it stands.</strong> In design. There is no date, no waiting list and nothing to sign up for; when it exists, it will be announced in the release notes, and this card will become the switch.</p>
    </div>
  </Card>
</template>
