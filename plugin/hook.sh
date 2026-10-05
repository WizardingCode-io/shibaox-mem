#!/bin/sh
# The plugin's hook: runs the shibaox-mem binary kept in the plugin's data directory,
# fetching it first when it is missing or belongs to another version of the plugin.
# Fails open: whatever goes wrong, exit 0 with nothing on stdout, and the session goes on.
#
#   sh hook.sh <session-start|prompt|turn-end|session-end>   (payload on stdin)

event="$1"
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
data="${CLAUDE_PLUGIN_DATA:-${SHIBAOX_HOME:-$HOME/.shibaox}/mem/plugin-data}"
bin="$data/bin/shibaox-mem"
wanted="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$root/.claude-plugin/plugin.json" | head -1)"

have=""
if [ -x "$bin" ]; then
  have="$("$bin" --version 2>/dev/null || true)"
fi

if [ "$have" != "$wanted" ]; then
  # Only the session start fetches; a prompt or stop hook must not wait on a download.
  if [ "$event" != "session-start" ]; then
    exit 0
  fi
  SHIBAOX_MEM_VERSION="v$wanted" SHIBAOX_MEM_BIN_DIR="$data/bin" \
    sh "$root/scripts/install.sh" --download-only > /dev/null 2>&1 || exit 0
  [ -x "$bin" ] || exit 0
fi

exec "$bin" hook claude-code "$event"
