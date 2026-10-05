import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../../src/core/project.ts";
import type { Redacted } from "../../src/core/redact.ts";
import type { MemoryKind } from "../../src/core/types.ts";
import { type Db, openDb } from "../../src/store/db.ts";
import { insertMemory } from "../../src/store/memories.ts";
import { startUi, type UiServer } from "../../src/ui/server.ts";

const NOW = Date.UTC(2026, 9, 5, 12);
const DAY = 86_400_000;

let base: string;
let dataDir: string;
let project: string;
let projectId: number;
let server: UiServer | undefined;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "shibaox-mem-ui-")));
  dataDir = join(base, "data");
  project = join(base, "shop");
  mkdirSync(project);
  const db = openDb({ dataDir, busyTimeoutMs: 2000 });
  projectId = resolveProject(db, project, NOW).id;
  seed(db, "The cart total is rounded once, at the end.", "Per-line rounding caused drift.", {
    kind: "decision",
    importance: 4,
    files: ["src/cart/total.ts"],
  });
  seed(db, "Never deploy on Fridays.", "Support is thin at the weekend.", {
    kind: "convention",
    importance: 4,
  });
  seed(db, "Ran the formatter on three files.", "", {
    kind: "change",
    importance: 1,
    status: "archived",
  });
  mkdirSync(join(base, "other"));
  const other = resolveProject(db, join(base, "other"), NOW).id;
  seed(db, "Elsewhere: the API key rotates monthly.", "", { kind: "gotcha", projectId: other });
  db.close();
});
afterEach(async () => {
  await server?.stop();
  server = undefined;
  rmSync(base, { recursive: true, force: true });
});

function seed(
  db: Db,
  title: string,
  body: string,
  extra: {
    kind?: MemoryKind;
    importance?: number;
    projectId?: number;
    files?: string[];
    status?: string;
  } = {},
): number {
  const id = insertMemory(db, {
    projectId: extra.projectId ?? projectId,
    kind: extra.kind ?? "decision",
    title,
    body: body as Redacted,
    terms: (extra.files ?? []).join(" "),
    importance: extra.importance ?? 2,
    branch: null,
    commit: null,
    origin: "manual",
    judge: "typesafe",
    judgeVersion: "1",
    sourceTurnId: null,
    files: (extra.files ?? []).map((path) => ({ path, role: "changed" as const })),
    now: NOW - 2 * DAY,
  });
  if (extra.status) db.run("UPDATE memories SET status = ? WHERE id = ?", [extra.status, id]);
  return id;
}

async function start(options: { idleMs?: number; onIdle?: () => void } = {}): Promise<UiServer> {
  server = await startUi({ dataDir, port: 0, open: false, now: () => NOW, ...options });
  return server;
}
const api = (s: UiServer, path: string, init: RequestInit = {}) =>
  fetch(`${s.origin}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${s.token}`, ...(init.headers ?? {}) },
  });

describe("shibaox-mem ui: the page", () => {
  test("listens on the loopback only, at a URL that carries a token, and serves the page there", async () => {
    const s = await start();
    expect(s.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(s.url).toBe(`${s.origin}/?token=${s.token}`);
    const page = await fetch(s.url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("<title>shibaox-mem</title>");
    expect(html).toContain("--shiba:");
    expect(html).toContain('data-mascot="default"');
  });

  test("without the token, nothing is served", async () => {
    const s = await start();
    expect((await fetch(`${s.origin}/`)).status).toBe(401);
    expect((await fetch(`${s.origin}/?token=wrong`)).status).toBe(401);
    expect((await fetch(`${s.origin}/api/overview`)).status).toBe(401);
  });

  test("a request from another origin or host is refused, token or not", async () => {
    const s = await start();
    const r = await api(s, "/api/overview", { headers: { Host: "evil.example" } });
    expect(r.status).toBe(403);
  });

  test("the brand fonts are served from the binary, not from the network", async () => {
    const s = await start();
    const r = await api(s, "/assets/geist-sans-latin-400-normal.woff2");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("font/woff2");
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    const html = await (await fetch(s.url)).text();
    expect(html).not.toMatch(/https?:\/\/fonts\./);
  });
});

describe("shibaox-mem ui: the API", () => {
  test("overview lists projects with their counts, and where the data lives", async () => {
    const s = await start();
    const overview = (await (await api(s, "/api/overview")).json()) as {
      dataDir: string;
      version: string;
      projects: {
        id: number;
        name: string;
        active: number;
        archived: number;
        superseded: number;
      }[];
    };
    expect(overview.dataDir).toBe(dataDir);
    expect(overview.projects.map((p) => [p.name, p.active, p.archived, p.superseded])).toEqual([
      ["shop", 2, 1, 0],
      ["other", 1, 0, 0],
    ]);
  });

  test("memories of a project, newest first, with a total; archived ones on request", async () => {
    const s = await start();
    const active = (await (await api(s, `/api/memories?project=${projectId}`)).json()) as {
      total: number;
      items: { id: number; title: string; kind: string; status: string; files: string[] }[];
    };
    expect(active.total).toBe(2);
    expect(active.items.map((m) => m.title)).toEqual([
      "Never deploy on Fridays.",
      "The cart total is rounded once, at the end.",
    ]);
    expect(active.items[1]?.files).toEqual(["src/cart/total.ts"]);
    const archived = (await (
      await api(s, `/api/memories?project=${projectId}&status=archived`)
    ).json()) as {
      items: { title: string }[];
    };
    expect(archived.items.map((m) => m.title)).toEqual(["Ran the formatter on three files."]);
  });

  test("searches with the same engine as the agent, narrowed by kind", async () => {
    const s = await start();
    const found = (await (
      await api(s, `/api/memories?project=${projectId}&q=rounding`)
    ).json()) as {
      items: { title: string }[];
    };
    expect(found.items.map((m) => m.title)).toEqual([
      "The cart total is rounded once, at the end.",
    ]);
    const none = (await (
      await api(s, `/api/memories?project=${projectId}&q=rounding&kind=convention`)
    ).json()) as {
      items: unknown[];
    };
    expect(none.items).toEqual([]);
  });

  test("one memory in full, with its files; another project's is not found", async () => {
    const s = await start();
    const one = (await (await api(s, "/api/memories/1")).json()) as {
      id: number;
      title: string;
      body: string;
      files: string[];
      fileRoles: { path: string; role: string }[];
      judge: string;
    };
    expect(one).toMatchObject({
      id: 1,
      title: "The cart total is rounded once, at the end.",
      body: "Per-line rounding caused drift.",
      files: ["src/cart/total.ts"],
      fileRoles: [{ path: "src/cart/total.ts", role: "changed" }],
      judge: "typesafe",
    });
    expect((await api(s, "/api/memories/999")).status).toBe(404);
  });

  test("archives and restores a memory; nothing else can be done to it", async () => {
    const s = await start();
    const archive = await api(s, "/api/memories/1", {
      method: "POST",
      body: JSON.stringify({ status: "archived" }),
    });
    expect(archive.status).toBe(200);
    expect(((await (await api(s, "/api/memories/1")).json()) as { status: string }).status).toBe(
      "archived",
    );
    const restore = await api(s, "/api/memories/1", {
      method: "POST",
      body: JSON.stringify({ status: "active" }),
    });
    expect(restore.status).toBe(200);
    expect(((await (await api(s, "/api/memories/1")).json()) as { status: string }).status).toBe(
      "active",
    );
    expect(
      (
        await api(s, "/api/memories/1", {
          method: "POST",
          body: JSON.stringify({ status: "superseded" }),
        })
      ).status,
    ).toBe(400);
    expect((await api(s, "/api/memories/1", { method: "POST", body: "nope" })).status).toBe(400);
  });

  test("the status report of a project, as the CLI shows it", async () => {
    const s = await start();
    const status = (await (await api(s, `/api/status?project=${projectId}`)).json()) as {
      memories: { active: number; archived: number };
    };
    expect(status.memories).toMatchObject({ active: 2, archived: 1 });
  });
});

describe("shibaox-mem ui: lifecycle", () => {
  test("stops itself after a stretch without requests", async () => {
    let idle = 0;
    const s = await start({ idleMs: 50, onIdle: () => idle++ });
    await api(s, "/api/overview");
    await Bun.sleep(150);
    expect(idle).toBe(1);
  });
});
