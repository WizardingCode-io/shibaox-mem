# shibaox-mem

Memory for coding agents. What one session learns, the next one is told — in Claude Code, Codex, Gemini CLI, OpenCode and Cursor, from the same memory. One local binary, no daemon, no model in the loop, nothing leaves your machine unless you ask.

This package is the binary's npm front door:

```sh
npx shibaox-mem install
```

fetches the binary for your platform from the matching GitHub release (checksum verified), keeps it in `~/.shibaox/mem/bin`, and sets it up for every supported agent found on the machine. Nothing runs at install time.

Most people will not need it: each agent installs shibaox-mem itself (`claude plugin install shibaox-mem@shibaox-plugins`, `codex plugin add shibaox-mem@shibaox-plugins`, `gemini extensions install https://github.com/WizardingCode-io/shibaox-mem`, `opencode plugin shibaox-mem-opencode --global`).

Everything else — what it remembers, what your agent sees, the viewer, privacy, the optional TypeSafe judge — is in the [repository README](https://github.com/WizardingCode-io/shibaox-mem#readme).

A shibaox product by [WizardingCode](https://wizardingcode.io). Apache-2.0.
