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
import manifest from "../../.claude-plugin/plugin.json" with { type: "json" };

// The Claude Code plugin's hook script, run as Claude Code runs it: CLAUDE_PLUGIN_ROOT at
// the repository, CLAUDE_PLUGIN_DATA in a temporary place, a stand-in binary and a
// stand-in release to fetch it from.

const ROOT = new URL("../../", import.meta.url).pathname;
const os = process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const FILE = `shibaox-mem-${os}-${arch}`;
const fake = (version: string) =>
  `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; exit 0; fi\ncat > "$(dirname "$0")/stdin.txt"\necho "ran: $*"\n`;

let data: string;
let server: ReturnType<typeof Bun.serve> | undefined;
let downloads = 0;

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "shibaox-mem-plugin-"));
  downloads = 0;
});
afterEach(async () => {
  // Awaited: a port still closing can be handed to the next test's server.
  await server?.stop(true);
  server = undefined;
  rmSync(data, { recursive: true, force: true });
});

function release(): string {
  const body = fake(manifest.version);
  const sha = new Bun.CryptoHasher("sha256").update(body).digest("hex");
  server = Bun.serve({
    // Loopback by name: on every interface, the port handed out may already be
    // another process's on 127.0.0.1, and the request would go to it.
    hostname: "127.0.0.1",
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
  return `http://127.0.0.1:${server.port}/download/v${manifest.version}`;
}

function place(version: string): void {
  mkdirSync(join(data, "bin"), { recursive: true });
  writeFileSync(join(data, "bin", "shibaox-mem"), fake(version));
  chmodSync(join(data, "bin", "shibaox-mem"), 0o755);
}

async function hook(event: string, base = "http://127.0.0.1:9/none") {
  const proc = Bun.spawn(["sh", join(ROOT, "plugin", "hook.sh"), event], {
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: ROOT,
      CLAUDE_PLUGIN_DATA: data,
      SHIBAOX_MEM_RELEASE_BASE: base,
    },
    stdin: new TextEncoder().encode('{"session_id":"s","cwd":"/p"}'),
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

describe("the plugin's manifest", () => {
  test("names the version the binary must have, and the hooks and MCP server point at the script and the data directory", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string; args: string[] }[] }[]>;
    };
    expect(Object.keys(hooks.hooks).sort()).toEqual([
      "SessionEnd",
      "SessionStart",
      "Stop",
      "UserPromptSubmit",
    ]);
    for (const groups of Object.values(hooks.hooks)) {
      for (const group of groups) {
        for (const entry of group.hooks) {
          expect(entry.command).toBe("sh");
          // Literal: Claude Code expands the placeholder, not JavaScript.
          expect(entry.args[0]).toBe(["$", "{CLAUDE_PLUGIN_ROOT}/plugin/hook.sh"].join(""));
        }
      }
    }
    // Declared in the manifest, not in a root .mcp.json: that file would also make the
    // server a project-scope one for anyone who opens this repository in Claude Code.
    expect(existsSync(join(ROOT, ".mcp.json"))).toBe(false);
    const mcp = manifest as unknown as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(mcp.mcpServers["shibaox-mem"]).toEqual({
      command: ["$", "{CLAUDE_PLUGIN_DATA}/bin/shibaox-mem"].join(""),
      args: ["mcp"],
    });
  });
});

describe("plugin/hook.sh", () => {
  test("with the right binary in place, runs it for the event with the payload", async () => {
    place(manifest.version);
    const result = await hook("prompt");
    expect(result).toEqual({ stdout: "ran: hook claude-code prompt\n", stderr: "", exitCode: 0 });
    expect(readFileSync(join(data, "bin", "stdin.txt"), "utf8")).toBe(
      '{"session_id":"s","cwd":"/p"}',
    );
  });

  test("without the binary, a prompt or stop hook does nothing and never waits on a download", async () => {
    for (const event of ["prompt", "turn-end", "session-end"]) {
      expect(await hook(event)).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    }
    expect(existsSync(join(data, "bin"))).toBe(false);
  });

  test("the first session start fetches the plugin's version of the binary, then runs it", async () => {
    const result = await hook("session-start", release());
    expect(result).toEqual({
      stdout: "ran: hook claude-code session-start\n",
      stderr: "",
      exitCode: 0,
    });
    expect(downloads).toBe(1);
    expect(await hook("prompt")).toMatchObject({ stdout: "ran: hook claude-code prompt\n" });
    expect(downloads).toBe(1);
  });

  test("a binary from another version of the plugin is replaced at the next session start", async () => {
    place("0.0.1");
    expect(await hook("prompt")).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    await hook("session-start", release());
    expect(downloads).toBe(1);
    expect((await hook("prompt")).stdout).toBe("ran: hook claude-code prompt\n");
  });

  test("when the download fails, the session starts anyway, silently", async () => {
    const result = await hook("session-start");
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });
});
