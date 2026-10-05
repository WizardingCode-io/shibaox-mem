# Clean-room policy

shibaox-mem is written from scratch. It is not a fork of claude-mem or of any other
memory tool, and it never will be.

claude-mem is used only as a reference for what features users expect and as a
catalogue of failure modes to avoid.

## Rules

1. Do not copy code, database schema, prompts, user-facing text or names from
   claude-mem. This applies to every version of it, whatever its licence.
2. The schema, the memory taxonomy, the injection format and the tool names are
   our own designs.
3. Do not open claude-mem source files while implementing a feature. Design from
   the requirements in `docs/design/`.
4. Facts about how host agents behave (hook events, payload fields, config file
   locations) come from each host's official documentation and from payloads
   captured with our own logging hook.
5. The only permitted interaction with claude-mem artefacts is the importer,
   which reads the user's own database in read-only mode to migrate their
   memories. That is data interoperability, not code reuse.

## Review checklist

Every pull request is checked against these rules. A contribution that cannot
state where its design came from is not merged.
