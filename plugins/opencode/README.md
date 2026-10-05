# shibaox-mem for OpenCode

```
opencode plugin shibaox-mem-opencode --global
```

Persistent memory for OpenCode sessions, shared with Claude Code, Codex, Cursor and Gemini CLI. The plugin fetches the [shibaox-mem](https://github.com/WizardingCode-io/shibaox-mem) binary of its own version on first use (checksum verified) and keeps it in `~/.shibaox/mem/bin`. Memories live in `~/.shibaox/mem`.
