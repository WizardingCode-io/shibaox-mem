#!/bin/sh
# Installs shibaox-mem: downloads this platform's binary from the latest GitHub release
# (or SHIBAOX_MEM_VERSION), checks its SHA-256 against the release's checksums, puts it
# in ~/.shibaox/mem/bin and sets it up for every supported agent found on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/WizardingCode-io/shibaox-mem/main/scripts/install.sh | sh
#
# Arguments are passed on to `shibaox-mem install` (e.g. `sh install.sh claude-code --yes`);
# `--download-only` stops after placing the binary. SHIBAOX_MEM_BIN_DIR says where.
set -eu

download_only=0
if [ "${1:-}" = "--download-only" ]; then
  download_only=1
  shift
fi

repo="WizardingCode-io/shibaox-mem"
version="${SHIBAOX_MEM_VERSION:-latest}"
if [ "$version" = "latest" ]; then
  base="${SHIBAOX_MEM_RELEASE_BASE:-https://github.com/$repo/releases/latest/download}"
else
  base="${SHIBAOX_MEM_RELEASE_BASE:-https://github.com/$repo/releases/download/$version}"
fi

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "shibaox-mem: no binary for $os; on Windows, download shibaox-mem-windows-x64.exe from https://github.com/$repo/releases" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "shibaox-mem: no binary for $os/$arch" >&2; exit 1 ;;
esac
file="shibaox-mem-$os-$arch"

home="${SHIBAOX_HOME:-$HOME/.shibaox}"
data="${SHIBAOX_MEM_DATA_DIR:-$home/mem}"
bin="${SHIBAOX_MEM_BIN_DIR:-$data/bin}"
mkdir -p "$bin"
tmp="$(mktemp "$bin/.shibaox-mem.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

echo "shibaox-mem: downloading $file ($version)"
curl -fsSL "$base/$file" -o "$tmp"
expected="$(curl -fsSL "$base/checksums.txt" | awk -v f="$file" '$2 == f { print $1 }')"
if [ -z "$expected" ]; then
  echo "shibaox-mem: $file is not in the release's checksums" >&2
  exit 1
fi
if command -v sha256sum > /dev/null 2>&1; then
  actual="$(sha256sum "$tmp" | awk '{ print $1 }')"
else
  actual="$(shasum -a 256 "$tmp" | awk '{ print $1 }')"
fi
if [ "$actual" != "$expected" ]; then
  echo "shibaox-mem: checksum mismatch for $file (expected $expected, got $actual)" >&2
  exit 1
fi
chmod 755 "$tmp"
mv -f "$tmp" "$bin/shibaox-mem"
trap - EXIT
echo "shibaox-mem: installed $("$bin/shibaox-mem" --version) at $bin/shibaox-mem"

if [ "$download_only" = 1 ]; then
  exit 0
fi
exec "$bin/shibaox-mem" install "$@"
