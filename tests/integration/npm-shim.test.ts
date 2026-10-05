import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import npmPkg from "../../npm/package.json" with { type: "json" };
import rootPkg from "../../package.json" with { type: "json" };

// The npm package: a Node shim that fetches the binary of its own version on first use.
// Run with node, the way npx runs it, against a stand-in release.

const SHIM = new URL("../../npm/bin/shibaox-mem.js", import.meta.url).pathname;
const os = process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const FILE = `shibaox-mem-${os}-${arch}`;
const fake = (version: string) =>
  `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; exit 0; fi\necho "ran: $*"\nexit 3\n`;

let home: string;
let server: ReturnType<typeof Bun.serve> | undefined;
let downloads = 0;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "shibaox-mem-npm-"));
  downloads = 0;
});
afterEach(() => {
  server?.stop(true);
  server = undefined;
  rmSync(home, { recursive: true, force: true });
});

function release(options: { version?: string; checksum?: string } = {}): string {
  const body = fake(options.version ?? npmPkg.version);
  const sha = options.checksum ?? new Bun.CryptoHasher("sha256").update(body).digest("hex");
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith(`/${FILE}`)) {
        downloads++;
        return new Response(body);
      }
      if (path.endsWith("/checksums.txt")) return new Response(`${sha}  ${FILE}\n`);
      return new Response("", { status: 404 });
    },
  });
  return `http://127.0.0.1:${server.port}/download/v${npmPkg.version}`;
}

async function shim(base: string, ...args: string[]) {
  const node = Bun.which("node");
  if (node === null) throw new Error("node is needed to run the npm shim");
  const proc = Bun.spawn([node, SHIM, ...args], {
    env: {
      ...process.env,
      HOME: home,
      SHIBAOX_HOME: join(home, ".shibaox"),
      SHIBAOX_MEM_RELEASE_BASE: base,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("the npm package", () => {
  test("carries the same version as the binary it fetches, and nothing runs at install time", () => {
    expect(npmPkg.version).toBe(rootPkg.version);
    expect(npmPkg.name).toBe("shibaox-mem");
    expect(npmPkg.bin).toEqual({ "shibaox-mem": "bin/shibaox-mem.js" });
    const loose = npmPkg as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(loose.scripts?.postinstall).toBeUndefined();
    expect(loose.dependencies ?? {}).toEqual({});
  });

  test("on first use fetches the binary, checks it and runs it with the arguments and exit code passed through", async () => {
    const result = await shim(release(), "install", "--yes");
    expect(result.stderr).toContain("downloading");
    expect(result.stdout).toBe("ran: install --yes\n");
    expect(result.exitCode).toBe(3);
    expect(downloads).toBe(1);
    const binary = join(home, ".shibaox", "mem", "bin", "shibaox-mem");
    expect(existsSync(binary)).toBe(true);
    const again = await shim(release(), "status");
    expect(again.stdout).toBe("ran: status\n");
    expect(downloads).toBe(1);
  });

  test("a binary of another version in place is replaced by the package's", async () => {
    mkdirSync(join(home, ".shibaox", "mem", "bin"), { recursive: true });
    writeFileSync(join(home, ".shibaox", "mem", "bin", "shibaox-mem"), fake("0.0.1"));
    chmodSync(join(home, ".shibaox", "mem", "bin", "shibaox-mem"), 0o755);
    await shim(release(), "status");
    expect(downloads).toBe(1);
    expect(readFileSync(join(home, ".shibaox", "mem", "bin", "shibaox-mem"), "utf8")).toContain(
      npmPkg.version,
    );
  });

  test("a checksum that does not match stops everything", async () => {
    const result = await shim(release({ checksum: "f".repeat(64) }), "status");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("checksum");
    expect(existsSync(join(home, ".shibaox", "mem", "bin", "shibaox-mem"))).toBe(false);
  });
});
