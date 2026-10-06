// Where backups go: a folder (an external disk, a NAS mounted as one) or an
// S3-compatible bucket (AWS, R2, MinIO, B2) through Bun's own client, no SDK. A target
// only ever sees files named like ours; anything else in the folder or bucket is not its
// business.
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Settings } from "../settings/settings.ts";

export interface BackupEntry {
  name: string;
  bytes: number;
  /** When the copy was taken, from its name. */
  at: number;
  /** The schema version inside, from its name. */
  version: number;
}

export interface BackupTarget {
  kind: "folder" | "s3";
  /** What the user would call it: the folder, or `s3://bucket/prefix`. */
  label: string;
  put(name: string, path: string): Promise<void>;
  list(): Promise<BackupEntry[]>;
  get(name: string, toPath: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const NAME = /^shibaox-mem-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-v(\d+)\.db\.gz$/;

/** Our naming: UTC time first, so that sorting by name is sorting by age. */
export function backupName(now: number, version: number): string {
  const stamp = new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `shibaox-mem-${stamp}-v${version}.db.gz`;
}

export function parseBackupName(name: string): { at: number; version: number } | null {
  const m = NAME.exec(name);
  if (m === null) return null;
  const [, y, mo, d, h, mi, s, v] = m as unknown as string[];
  return {
    at: Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    version: Number(v),
  };
}

const newestFirst = (entries: BackupEntry[]) => entries.sort((a, b) => b.at - a.at);

export function folderTarget(dir: string): BackupTarget {
  return {
    kind: "folder",
    label: dir,
    async put(name, path) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = join(dir, `.${name}.part`);
      copyFileSync(path, tmp);
      renameSync(tmp, join(dir, name));
    },
    async list() {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return [];
      }
      const entries: BackupEntry[] = [];
      for (const name of names) {
        const parsed = parseBackupName(name);
        if (parsed === null) continue;
        entries.push({ name, bytes: statSync(join(dir, name)).size, ...parsed });
      }
      return newestFirst(entries);
    },
    async get(name, toPath) {
      if (parseBackupName(name) === null) throw new Error("not one of our backups");
      copyFileSync(join(dir, name), toPath);
    },
    async remove(name) {
      if (parseBackupName(name) === null) return;
      rmSync(join(dir, name), { force: true });
    },
  };
}

export function parseS3Url(url: string): { bucket: string; prefix: string } | null {
  const m = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/i.exec(url);
  if (m === null) return null;
  const raw = (m[2] ?? "").replace(/^\/+|\/+$/g, "");
  return { bucket: m[1] as string, prefix: raw === "" ? "" : `${raw}/` };
}

export interface S3Options {
  url: string;
  endpoint: string | null;
  region: string | null;
  accessKey: string | null;
  secretKey: string | null;
}

export function s3Target(options: S3Options): BackupTarget | null {
  const parsed = parseS3Url(options.url);
  if (parsed === null) return null;
  const { bucket, prefix } = parsed;
  const client = new Bun.S3Client({
    bucket,
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.region ? { region: options.region } : {}),
    ...(options.accessKey ? { accessKeyId: options.accessKey } : {}),
    ...(options.secretKey ? { secretAccessKey: options.secretKey } : {}),
  });
  return {
    kind: "s3",
    label: `s3://${bucket}${prefix ? `/${prefix.slice(0, -1)}` : ""}`,
    async put(name, path) {
      await client.write(prefix + name, Bun.file(path));
    },
    async list() {
      const entries: BackupEntry[] = [];
      let token: string | undefined;
      do {
        const page = await client.list({
          prefix,
          maxKeys: 1000,
          ...(token ? { continuationToken: token } : {}),
        });
        for (const item of page.contents ?? []) {
          const name = item.key.slice(prefix.length);
          const parsed = parseBackupName(name);
          if (parsed !== null) entries.push({ name, bytes: item.size ?? 0, ...parsed });
        }
        token = page.isTruncated ? page.nextContinuationToken : undefined;
      } while (token);
      return newestFirst(entries);
    },
    async get(name, toPath) {
      if (parseBackupName(name) === null) throw new Error("not one of our backups");
      await Bun.write(toPath, client.file(prefix + name));
    },
    async remove(name) {
      if (parseBackupName(name) === null) return;
      await client.delete(prefix + name);
    },
  };
}

/** The target the settings describe, or null when backups are not configured. */
export function targetFor(settings: Settings): BackupTarget | null {
  const to = settings.backup.to;
  if (to === null) return null;
  if (to.startsWith("s3://")) return s3Target({ url: to, ...settings.backup.s3 });
  return folderTarget(to);
}
