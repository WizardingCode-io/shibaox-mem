import { randomBytes } from "node:crypto";
import pkg from "../../package.json" with { type: "json" };
import { statusReport } from "../status/report.ts";
import { type Db, openDb } from "../store/db.ts";
import { logError } from "../util/log.ts";
import {
  getMemory,
  listMemories,
  listProjects,
  projectRef,
  recentTurns,
  setMemoryStatus,
} from "./api.ts";
import bricolage from "./assets/bricolage-grotesque-latin-700-normal.woff2" with { type: "file" };
import geistMono from "./assets/geist-mono-latin-400-normal.woff2" with { type: "file" };
import geist400 from "./assets/geist-sans-latin-400-normal.woff2" with { type: "file" };
import geist500 from "./assets/geist-sans-latin-500-normal.woff2" with { type: "file" };
import { renderPage } from "./page.ts";

// The viewer: a local page over the database. Loopback only, a token in the URL that
// every request must carry, the Host header checked, and it stops itself when idle.
// Nothing is loaded from the network: fonts and the mascot travel in the binary.

export interface UiOptions {
  dataDir: string;
  /** 0 picks a free port. */
  port?: number;
  /** Open the browser on start. */
  open?: boolean;
  now?: () => number;
  /** Without a request for this long, the server stops. */
  idleMs?: number;
  onIdle?: () => void;
}

export interface UiServer {
  origin: string;
  /** The page's address, token included. */
  url: string;
  token: string;
  stop(): Promise<void>;
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const FONTS: Record<string, string> = {
  "bricolage-grotesque-latin-700-normal.woff2": bricolage,
  "geist-sans-latin-400-normal.woff2": geist400,
  "geist-sans-latin-500-normal.woff2": geist500,
  "geist-mono-latin-400-normal.woff2": geistMono,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const problem = (status: number, detail: string) => json({ error: detail }, status);

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  } catch {
    // The URL is printed anyway.
  }
}

export async function startUi(options: UiOptions): Promise<UiServer> {
  const token = randomBytes(16).toString("hex");
  const now = options.now ?? Date.now;
  const db: Db = openDb({ dataDir: options.dataDir, busyTimeoutMs: 2000 });
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    await server.stop(true);
    db.close();
  };
  const touch = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      options.onIdle?.();
      void stop();
    }, idleMs);
    idleTimer.unref?.();
  };

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? "";
    if (host !== `127.0.0.1:${server.port}` && host !== `localhost:${server.port}`) {
      return problem(403, "wrong host");
    }
    const presented =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      url.searchParams.get("token");
    if (presented !== token) return problem(401, "missing or wrong token");
    touch();

    const path = url.pathname;
    if (request.method === "GET" && path === "/") {
      return new Response(renderPage({ token, version: pkg.version }), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "GET" && path.startsWith("/assets/")) {
      const font = FONTS[path.slice("/assets/".length)];
      if (font === undefined) return problem(404, "no such asset");
      return new Response(Bun.file(font), {
        headers: { "content-type": "font/woff2", "cache-control": "private, max-age=86400" },
      });
    }
    if (path === "/api/overview" && request.method === "GET") {
      return json({ version: pkg.version, dataDir: options.dataDir, projects: listProjects(db) });
    }
    if (path === "/api/memories" && request.method === "GET") {
      const projectId = Number(url.searchParams.get("project"));
      if (!Number.isInteger(projectId)) return problem(400, "project is required");
      const number = (name: string) => {
        const value = url.searchParams.get(name);
        return value === null ? undefined : Number(value);
      };
      return json(
        listMemories(db, {
          projectId,
          q: url.searchParams.get("q") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
          minImportance: number("minImportance"),
          limit: number("limit"),
          offset: number("offset"),
        }),
      );
    }
    const one = /^\/api\/memories\/(\d+)$/.exec(path);
    if (one !== null) {
      const id = Number(one[1]);
      if (request.method === "GET") {
        const memory = getMemory(db, id);
        return memory === null ? problem(404, "no such memory") : json(memory);
      }
      if (request.method === "POST") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return problem(400, "body must be JSON");
        }
        const status =
          body !== null && typeof body === "object"
            ? (body as { status?: unknown }).status
            : undefined;
        if (typeof status !== "string") return problem(400, "status is required");
        const outcome = setMemoryStatus(db, id, status, now());
        if (outcome === "ok") return json(getMemory(db, id));
        if (outcome === "not-found") return problem(404, "no such memory");
        return problem(400, "a memory can only be archived or made active again");
      }
    }
    if (path === "/api/status" && request.method === "GET") {
      const projectId = Number(url.searchParams.get("project"));
      const project = Number.isInteger(projectId) ? projectRef(db, projectId) : null;
      return json(statusReport(db, project, options.dataDir));
    }
    if (path === "/api/turns" && request.method === "GET") {
      const projectId = Number(url.searchParams.get("project"));
      if (!Number.isInteger(projectId)) return problem(400, "project is required");
      return json(recentTurns(db, projectId, Number(url.searchParams.get("limit") ?? 50)));
    }
    return problem(404, "not found");
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      try {
        return await handle(request);
      } catch (error) {
        logError("ui", error, options.dataDir);
        return problem(500, error instanceof Error ? error.message : String(error));
      }
    },
  });
  touch();

  const origin = `http://127.0.0.1:${server.port}`;
  const url = `${origin}/?token=${token}`;
  if (options.open) openBrowser(url);
  return { origin, url, token, stop };
}
