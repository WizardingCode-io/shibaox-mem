import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRemote, readGitInfo } from "../../src/core/git.ts";
import { resolveProject } from "../../src/core/project.ts";
import { type Db, openDb } from "../../src/store/db.ts";

let base: string;
let db: Db;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "ai-mem-project-")));
  db = openDb({ dataDir: join(base, "data"), busyTimeoutMs: 2000 });
});
afterEach(() => {
  db.close();
  rmSync(base, { recursive: true, force: true });
});

// Tests may run git; the code under test never does.
function git(cwd: string, ...args: string[]): string {
  const proc = Bun.spawnSync(
    [
      "git",
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout.toString().trim();
}

function repo(name: string, options: { commit?: boolean } = {}): string {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  if (options.commit !== false) {
    writeFileSync(join(dir, "README.md"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "first");
  }
  return dir;
}

describe("core/git", () => {
  test("reads root, branch and commit from a repository", () => {
    const dir = repo("plain");
    expect(readGitInfo(dir)).toEqual({
      root: dir,
      commonDir: join(dir, ".git"),
      branch: "main",
      head: git(dir, "rev-parse", "HEAD"),
      originUrl: null,
    });
  });

  test("finds the repository from a nested directory", () => {
    const dir = repo("nested");
    const deep = join(dir, "a", "b");
    mkdirSync(deep, { recursive: true });
    expect(readGitInfo(deep)?.root).toBe(dir);
  });

  test("a detached HEAD has a commit but no branch", () => {
    const dir = repo("detached");
    const sha = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "--detach", sha);
    expect(readGitInfo(dir)).toMatchObject({ branch: null, head: sha });
  });

  test("a repository with no commits has a branch but no commit", () => {
    const dir = repo("unborn", { commit: false });
    expect(readGitInfo(dir)).toMatchObject({ branch: "main", head: null });
  });

  test("resolves the commit when refs have been packed", () => {
    const dir = repo("packed");
    const sha = git(dir, "rev-parse", "HEAD");
    git(dir, "pack-refs", "--all");
    expect(readGitInfo(dir)?.head).toBe(sha);
  });

  test("a worktree shares the common directory of its repository", () => {
    const dir = repo("main-tree");
    const worktree = join(base, "side-tree");
    git(dir, "worktree", "add", "-q", "-b", "feature", worktree);
    expect(readGitInfo(worktree)).toEqual({
      root: worktree,
      commonDir: join(dir, ".git"),
      branch: "feature",
      head: git(worktree, "rev-parse", "HEAD"),
      originUrl: null,
    });
  });

  test("reads the origin URL", () => {
    const dir = repo("with-remote");
    git(dir, "remote", "add", "upstream", "https://example.com/other/thing.git");
    git(dir, "remote", "add", "origin", "git@github.com:Org/Repo.git");
    expect(readGitInfo(dir)?.originUrl).toBe("git@github.com:Org/Repo.git");
  });

  test("a directory outside any repository has no git info", () => {
    const dir = join(base, "not-a-repo");
    mkdirSync(dir);
    expect(readGitInfo(dir)).toBeNull();
  });

  test.each([
    ["https://github.com/Org/Repo.git", "github.com/org/repo"],
    ["https://github.com/org/repo/", "github.com/org/repo"],
    ["git@github.com:Org/Repo.git", "github.com/org/repo"],
    ["ssh://git@github.com:22/org/repo.git", "github.com/org/repo"],
    [
      "https://user:s3cretpass@gitlab.example.com/group/sub/repo.git",
      "gitlab.example.com/group/sub/repo",
    ],
    ["https://x-access-token:abc123@github.com/org/repo", "github.com/org/repo"],
    ["git://Example.COM/org/repo.git", "example.com/org/repo"],
    ["/srv/git/repo.git", "/srv/git/repo"],
    ["file:///srv/git/repo.git", "/srv/git/repo"],
  ])("normalizeRemote(%s) is %s", (url, expected) => {
    expect(normalizeRemote(url)).toBe(expected);
  });
});

describe("core/project", () => {
  const aliases = (id: number) =>
    db
      .query<{ alias: string }, [number]>(
        "SELECT alias FROM project_aliases WHERE project_id = ? ORDER BY alias",
      )
      .all(id)
      .map((row) => row.alias);

  test("a directory outside git is its own project, and stays the same project", () => {
    const dir = join(base, "loose");
    mkdirSync(dir);
    const first = resolveProject(db, dir);
    expect(first).toMatchObject({ key: `path:${dir}`, name: "loose", branch: null, commit: null });
    expect(resolveProject(db, dir).id).toBe(first.id);

    const other = join(base, "elsewhere");
    mkdirSync(other);
    expect(resolveProject(db, other).id).not.toBe(first.id);
  });

  test("reports the branch and commit the work is happening on", () => {
    const dir = repo("current");
    expect(resolveProject(db, dir)).toMatchObject({
      root: dir,
      branch: "main",
      commit: git(dir, "rev-parse", "HEAD"),
      disabled: false,
    });
  });

  test("two worktrees of one repository are the same project", () => {
    const dir = repo("shared");
    const worktree = join(base, "shared-side");
    git(dir, "worktree", "add", "-q", "-b", "feature", worktree);
    const main = resolveProject(db, dir);
    const side = resolveProject(db, worktree);
    expect(side.id).toBe(main.id);
    expect(side.branch).toBe("feature");
  });

  test("two clones of the same remote are the same project", () => {
    const a = repo("clone-a");
    const b = repo("clone-b");
    git(a, "remote", "add", "origin", "https://github.com/org/shared.git");
    git(b, "remote", "add", "origin", "git@github.com:org/shared.git");
    const first = resolveProject(db, a);
    expect(first).toMatchObject({ key: "remote:github.com/org/shared", name: "shared" });
    expect(resolveProject(db, b).id).toBe(first.id);
  });

  test("a project keeps its identity when it gains a remote", () => {
    const dir = repo("grows");
    const before = resolveProject(db, dir);
    expect(before.key).toBe(`gitdir:${join(dir, ".git")}`);
    git(dir, "remote", "add", "origin", "https://github.com/org/grows.git");
    const after = resolveProject(db, dir);
    expect(after.id).toBe(before.id);
    expect(aliases(after.id)).toContain("remote:github.com/org/grows");
  });

  test("credentials in a remote URL are never stored", () => {
    const dir = repo("leaky");
    git(dir, "remote", "add", "origin", "https://deploy:s3cretpass@github.com/org/leaky.git");
    const project = resolveProject(db, dir);
    const stored = JSON.stringify([
      db.query("SELECT * FROM projects").all(),
      db.query("SELECT * FROM project_aliases").all(),
    ]);
    expect(project.key).toBe("remote:github.com/org/leaky");
    expect(stored).not.toContain("s3cretpass");
    expect(stored).not.toContain("deploy");
  });

  test("a disabled project is reported as disabled", () => {
    const dir = repo("muted");
    const project = resolveProject(db, dir);
    db.run("UPDATE projects SET disabled = 1 WHERE id = ?", [project.id]);
    expect(resolveProject(db, dir).disabled).toBe(true);
  });
});
