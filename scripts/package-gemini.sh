#!/bin/sh
# Packs the Gemini CLI extension for each platform: plugins/gemini plus that platform's
# binary in bin/, as {platform}.{arch}.shibaox-mem.tar.gz — the names `gemini extensions
# install` looks for in a GitHub release. The manifest sits at the root of each archive.
#
#   sh scripts/package-gemini.sh <dir with the release binaries> [<output dir>]
set -eu

dist="${1:?usage: package-gemini.sh <binaries dir> [<output dir>]}"
out="${2:-$dist}"
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$out"

pack() {
  binary="$1"; target="$2"; name="$3"
  [ -f "$dist/$binary" ] || { echo "package-gemini: $dist/$binary is missing" >&2; exit 1; }
  stage="$(mktemp -d)"
  cp -R "$root/plugins/gemini/." "$stage/"
  mkdir -p "$stage/bin"
  cp "$dist/$binary" "$stage/bin/$name"
  chmod 755 "$stage/bin/$name"
  tar -czf "$out/$target.shibaox-mem.tar.gz" -C "$stage" .
  rm -rf "$stage"
  echo "$out/$target.shibaox-mem.tar.gz"
}

pack shibaox-mem-darwin-arm64 darwin.arm64 shibaox-mem
pack shibaox-mem-darwin-x64 darwin.x64 shibaox-mem
pack shibaox-mem-linux-x64 linux.x64 shibaox-mem
pack shibaox-mem-linux-arm64 linux.arm64 shibaox-mem
pack shibaox-mem-windows-x64.exe win32.x64 shibaox-mem.exe
