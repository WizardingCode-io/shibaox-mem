import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyFingerprint } from "../../src/judge/key.ts";
import {
  loadSettings,
  publicSettings,
  SETTING_KEYS,
  saveSettings,
  validatePatch,
} from "../../src/settings/settings.ts";

const dir = (env = "") => {
  const dataDir = mkdtempSync(join(tmpdir(), "shibaox-mem-settings-"));
  if (env) writeFileSync(join(dataDir, "env"), env);
  return dataDir;
};

describe("loadSettings", () => {
  test("has sensible defaults with no file and no environment", () => {
    expect(loadSettings({}, dir())).toEqual({
      typesafeKey: null,
      typesafe: "on",
      retentionDays: 90,
      uiAutoOpen: true,
      storeDir: null,
      backup: {
        to: null,
        everyHours: 24,
        keep: 10,
        s3: { endpoint: null, region: null, accessKey: null, secretKey: null },
      },
    });
  });

  test("reads the file", () => {
    const s = loadSettings(
      {},
      dir(
        [
          "TYPESAFE_API_KEY=sk-file",
          "SHIBAOX_MEM_TYPESAFE=off",
          "SHIBAOX_MEM_RETENTION_DAYS=30",
          "SHIBAOX_MEM_UI_AUTO_OPEN=off",
          "SHIBAOX_MEM_STORE_DIR=/Volumes/Ext/mem",
          "SHIBAOX_MEM_BACKUP_TO=s3://bucket/mem",
          "SHIBAOX_MEM_BACKUP_EVERY_HOURS=6",
          "SHIBAOX_MEM_BACKUP_KEEP=3",
          "SHIBAOX_MEM_BACKUP_S3_ENDPOINT=https://example.r2.cloudflarestorage.com",
          "SHIBAOX_MEM_BACKUP_S3_REGION=auto",
          "SHIBAOX_MEM_BACKUP_S3_ACCESS_KEY=AKIA",
          "SHIBAOX_MEM_BACKUP_S3_SECRET_KEY=shh",
        ].join("\n"),
      ),
    );
    expect(s).toEqual({
      typesafeKey: "sk-file",
      typesafe: "off",
      retentionDays: 30,
      uiAutoOpen: false,
      storeDir: "/Volumes/Ext/mem",
      backup: {
        to: "s3://bucket/mem",
        everyHours: 6,
        keep: 3,
        s3: {
          endpoint: "https://example.r2.cloudflarestorage.com",
          region: "auto",
          accessKey: "AKIA",
          secretKey: "shh",
        },
      },
    });
  });

  test("the environment wins over the file, and an empty variable is unset", () => {
    const dataDir = dir("TYPESAFE_API_KEY=sk-file\nSHIBAOX_MEM_RETENTION_DAYS=30\n");
    const s = loadSettings(
      {
        TYPESAFE_API_KEY: "sk-env",
        SHIBAOX_MEM_RETENTION_DAYS: "",
        SHIBAOX_MEM_UI_AUTO_OPEN: "off",
      },
      dataDir,
    );
    expect(s.typesafeKey).toBe("sk-env");
    expect(s.retentionDays).toBe(30);
    expect(s.uiAutoOpen).toBe(false);
  });

  test("a value that makes no sense falls back to the default rather than breaking", () => {
    const s = loadSettings(
      {},
      dir("SHIBAOX_MEM_RETENTION_DAYS=lots\nSHIBAOX_MEM_TYPESAFE=maybe\n"),
    );
    expect(s.retentionDays).toBe(90);
    expect(s.typesafe).toBe("on");
  });
});

describe("validatePatch", () => {
  const errorsOf = (patch: Record<string, unknown>) => {
    const result = validatePatch(patch);
    return result.ok ? {} : result.errors;
  };

  test("accepts good values and normalises them to strings", () => {
    const result = validatePatch({
      TYPESAFE_API_KEY: " sk-new ",
      SHIBAOX_MEM_TYPESAFE: "off",
      SHIBAOX_MEM_RETENTION_DAYS: 45,
      SHIBAOX_MEM_UI_AUTO_OPEN: false,
      SHIBAOX_MEM_BACKUP_TO: "s3://my-bucket/some/prefix",
      SHIBAOX_MEM_BACKUP_EVERY_HOURS: "12",
      SHIBAOX_MEM_BACKUP_KEEP: 5,
      SHIBAOX_MEM_BACKUP_S3_ENDPOINT: "http://127.0.0.1:9000",
      SHIBAOX_MEM_BACKUP_S3_REGION: "us-east-1",
      SHIBAOX_MEM_BACKUP_S3_ACCESS_KEY: "minio",
      SHIBAOX_MEM_BACKUP_S3_SECRET_KEY: "minio123",
    });
    expect(result).toEqual({
      ok: true,
      changes: {
        TYPESAFE_API_KEY: "sk-new",
        SHIBAOX_MEM_TYPESAFE: "off",
        SHIBAOX_MEM_RETENTION_DAYS: "45",
        SHIBAOX_MEM_UI_AUTO_OPEN: "off",
        SHIBAOX_MEM_BACKUP_TO: "s3://my-bucket/some/prefix",
        SHIBAOX_MEM_BACKUP_EVERY_HOURS: "12",
        SHIBAOX_MEM_BACKUP_KEEP: "5",
        SHIBAOX_MEM_BACKUP_S3_ENDPOINT: "http://127.0.0.1:9000",
        SHIBAOX_MEM_BACKUP_S3_REGION: "us-east-1",
        SHIBAOX_MEM_BACKUP_S3_ACCESS_KEY: "minio",
        SHIBAOX_MEM_BACKUP_S3_SECRET_KEY: "minio123",
      },
    });
  });

  test("null clears a key; absent keys are left alone", () => {
    expect(validatePatch({ TYPESAFE_API_KEY: null })).toEqual({
      ok: true,
      changes: { TYPESAFE_API_KEY: null },
    });
    expect(validatePatch({})).toEqual({ ok: true, changes: {} });
  });

  test("rejects what it cannot use, one message per key, never echoing the value", () => {
    const errors = errorsOf({
      SHIBAOX_MEM_RETENTION_DAYS: 0,
      SHIBAOX_MEM_TYPESAFE: "maybe",
      SHIBAOX_MEM_BACKUP_TO: "relative/path",
      SHIBAOX_MEM_BACKUP_EVERY_HOURS: -1,
      SHIBAOX_MEM_BACKUP_KEEP: "many",
      SHIBAOX_MEM_BACKUP_S3_ENDPOINT: "ftp://nope",
      TYPESAFE_API_KEY: "",
      NOT_A_SETTING: "x",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "NOT_A_SETTING",
      "SHIBAOX_MEM_BACKUP_EVERY_HOURS",
      "SHIBAOX_MEM_BACKUP_KEEP",
      "SHIBAOX_MEM_BACKUP_S3_ENDPOINT",
      "SHIBAOX_MEM_BACKUP_TO",
      "SHIBAOX_MEM_RETENTION_DAYS",
      "SHIBAOX_MEM_TYPESAFE",
      "TYPESAFE_API_KEY",
    ]);
    for (const message of Object.values(errors)) {
      expect(message).not.toContain("maybe");
      expect(message).not.toContain("relative/path");
      expect(message).not.toContain("ftp://nope");
    }
    expect(errorsOf({ SHIBAOX_MEM_RETENTION_DAYS: 99999 })).toHaveProperty(
      "SHIBAOX_MEM_RETENTION_DAYS",
    );
    expect(errorsOf({ SHIBAOX_MEM_RETENTION_DAYS: "abc" })).toHaveProperty(
      "SHIBAOX_MEM_RETENTION_DAYS",
    );
  });

  test("the store directory is not set here: it moves with the store", () => {
    expect(errorsOf({ SHIBAOX_MEM_STORE_DIR: "/somewhere" })).toHaveProperty(
      "SHIBAOX_MEM_STORE_DIR",
    );
  });
});

describe("saveSettings and publicSettings", () => {
  test("writes the file and the public view shows sources but never the secret", () => {
    const dataDir = dir();
    saveSettings(dataDir, {
      TYPESAFE_API_KEY: "sk-secret-value",
      SHIBAOX_MEM_RETENTION_DAYS: "30",
    });
    expect(readFileSync(join(dataDir, "env"), "utf8")).toContain(
      "TYPESAFE_API_KEY=sk-secret-value",
    );

    const view = publicSettings({ SHIBAOX_MEM_UI_AUTO_OPEN: "off" }, dataDir);
    expect(JSON.stringify(view)).not.toContain("sk-secret-value");
    expect(view.TYPESAFE_API_KEY).toEqual({
      secret: true,
      set: true,
      fingerprint: keyFingerprint("sk-secret-value"),
      source: "file",
    });
    expect(view.SHIBAOX_MEM_RETENTION_DAYS).toEqual({ value: "30", source: "file" });
    expect(view.SHIBAOX_MEM_UI_AUTO_OPEN).toEqual({ value: "off", source: "env" });
    expect(view.SHIBAOX_MEM_TYPESAFE).toEqual({ value: "on", source: "default" });
    expect(view.SHIBAOX_MEM_BACKUP_S3_SECRET_KEY).toEqual({
      secret: true,
      set: false,
      fingerprint: null,
      source: "default",
    });
    expect(Object.keys(view).sort()).toEqual([...SETTING_KEYS].sort());
  });

  test("clearing a key removes it from the file", () => {
    const dataDir = dir("TYPESAFE_API_KEY=sk-x\n");
    saveSettings(dataDir, { TYPESAFE_API_KEY: null });
    expect(readFileSync(join(dataDir, "env"), "utf8")).not.toContain("TYPESAFE_API_KEY");
    expect(publicSettings({}, dataDir).TYPESAFE_API_KEY).toMatchObject({ set: false });
  });
});
