import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { type Db, withWrite } from "../store/db.ts";
import { normalizeRemote, readGitInfo } from "./git.ts";

export interface ProjectRef {
  id: number;
  key: string;
  name: string;
  /** Working tree root, or the directory itself outside git. */
  root: string;
  branch: string | null;
  commit: string | null;
  disabled: boolean;
}

function realpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The names a working directory's project may be known by, strongest first. */
function identify(cwd: string) {
  const git = readGitInfo(cwd);
  const root = git?.root ?? realpath(cwd);
  const remote = git?.originUrl ? normalizeRemote(git.originUrl) : null;
  const aliases = [
    ...(remote === null ? [] : [`remote:${remote}`]),
    ...(git === null ? [] : [`gitdir:${git.commonDir}`]),
    `path:${root}`,
  ];
  return { git, root, remote, aliases };
}

/** The project a working directory belongs to, if it is already known. Never writes. */
export function findProject(db: Db, cwd: string): ProjectRef | null {
  const { git, root, aliases } = identify(cwd);
  for (const alias of aliases) {
    const row = db
      .query<{ id: number; key: string; name: string; disabled: number }, [string]>(
        `SELECT p.id, p.key, p.name, p.disabled
           FROM project_aliases a JOIN projects p ON p.id = a.project_id WHERE a.alias = ?`,
      )
      .get(alias);
    if (row !== null) {
      return {
        id: row.id,
        key: row.key,
        name: row.name,
        root,
        branch: git?.branch ?? null,
        commit: git?.head ?? null,
        disabled: row.disabled === 1,
      };
    }
  }
  return null;
}

/**
 * Maps a working directory to a project, creating it on first sight.
 *
 * A project is known by several aliases, strongest first: its remote, its git
 * directory (shared by worktrees), its path. Any one of them finds it, and the others
 * are then recorded, so a project that gains a remote or is cloned again stays one
 * project. Forks have different remotes and are different projects.
 */
export function resolveProject(db: Db, cwd: string, now: number = Date.now()): ProjectRef {
  const { git, root, remote, aliases } = identify(cwd);

  const owner = db.query<{ project_id: number }, [string]>(
    "SELECT project_id FROM project_aliases WHERE alias = ?",
  );
  const lookup = () => {
    let id: number | undefined;
    const unknown: string[] = [];
    for (const alias of aliases) {
      const row = owner.get(alias);
      if (row === null) unknown.push(alias);
      else id ??= row.project_id;
    }
    return { id, unknown };
  };

  let { id, unknown } = lookup();
  if (id === undefined || unknown.length > 0) {
    id = withWrite(db, () => {
      // Looked up again under the write lock: another hook may have just created it.
      const current = lookup();
      const projectId =
        current.id ??
        (db
          .query<{ id: number }, [string, string, number]>(
            "INSERT INTO projects (key, name, created_at) VALUES (?, ?, ?) RETURNING id",
          )
          .get(aliases[0] as string, basename(remote ?? root), now)?.id as number);
      for (const alias of current.unknown) {
        db.run("INSERT OR IGNORE INTO project_aliases (alias, project_id) VALUES (?, ?)", [
          alias,
          projectId,
        ]);
      }
      return projectId;
    });
  }

  const row = db
    .query<{ key: string; name: string; disabled: number }, [number]>(
      "SELECT key, name, disabled FROM projects WHERE id = ?",
    )
    .get(id);
  return {
    id,
    key: row?.key ?? (aliases[0] as string),
    name: row?.name ?? basename(root),
    root,
    branch: git?.branch ?? null,
    commit: git?.head ?? null,
    disabled: row?.disabled === 1,
  };
}
