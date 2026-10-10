#!/bin/sh
# Packs the Gemini CLI extension for each platform: plugins/gemini plus that platform's
# binary in bin/, as {platform}.{arch}.wizardingcode-mem.tar.gz — the names `gemini extensions
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
  tar -czf "$out/$target.wizardingcode-mem.tar.gz" -C "$stage" .
  rm -rf "$stage"
  echo "$out/$target.wizardingcode-mem.tar.gz"
}

pack wizardingcode-mem-darwin-arm64 darwin.arm64 wizardingcode-mem
pack wizardingcode-mem-darwin-x64 darwin.x64 wizardingcode-mem
pack wizardingcode-mem-linux-x64 linux.x64 wizardingcode-mem
pack wizardingcode-mem-linux-arm64 linux.arm64 wizardingcode-mem
pack wizardingcode-mem-windows-x64.exe win32.x64 wizardingcode-mem.exe
