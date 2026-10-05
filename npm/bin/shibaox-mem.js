#!/usr/bin/env node
// shibaox-mem for npm: fetches the binary of this package's version on first use (from
// the GitHub release, checksum verified), keeps it in ~/.shibaox/mem/bin, and runs it.
// Nothing runs at install time; `npx shibaox-mem install` is the whole setup.
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { version } = require("../package.json");

const REPO = "WizardingCode-io/shibaox-mem";
const platform = { darwin: "darwin", linux: "linux", win32: "windows" }[process.platform];
const arch = { x64: "x64", arm64: "arm64" }[process.arch];
if (!platform || !arch || (platform === "windows" && arch !== "x64")) {
  console.error(`shibaox-mem: no binary for ${process.platform}/${process.arch}`);
  process.exit(1);
}
const file = `shibaox-mem-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`;
const home = process.env.SHIBAOX_HOME || path.join(os.homedir(), ".shibaox");
const data = process.env.SHIBAOX_MEM_DATA_DIR || path.join(home, "mem");
const binDir = path.join(data, "bin");
const binary = path.join(binDir, platform === "windows" ? "shibaox-mem.exe" : "shibaox-mem");
const base =
  process.env.SHIBAOX_MEM_RELEASE_BASE ||
  `https://github.com/${REPO}/releases/download/v${version}`;

function installedVersion() {
  try {
    const out = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10000 });
    return out.status === 0 ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function download() {
  process.stderr.write(`shibaox-mem: downloading ${file} ${version}\n`);
  const res = await fetch(`${base}/${file}`);
  if (!res.ok) throw new Error(`${base}/${file}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const line = (await fetchText(`${base}/checksums.txt`))
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .find((parts) => parts[1] === file);
  if (!line) throw new Error(`${file} is not in the release's checksums`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== line[0]) throw new Error(`checksum mismatch for ${file}`);
  fs.mkdirSync(binDir, { recursive: true });
  const temp = path.join(binDir, `.shibaox-mem.${process.pid}`);
  fs.writeFileSync(temp, bytes, { mode: 0o755 });
  fs.renameSync(temp, binary);
}

async function main() {
  if (installedVersion() !== version) {
    try {
      await download();
    } catch (error) {
      console.error(`shibaox-mem: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  const run = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
  if (run.error) {
    console.error(`shibaox-mem: ${run.error.message}`);
    process.exit(1);
  }
  process.exit(run.status === null ? 1 : run.status);
}

main();
