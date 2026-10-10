import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDataDir, resolvePaths } from "../../src/util/paths.ts";

describe("defaultDataDir", () => {
  test("lives under the brand's home by default", () => {
    expect(defaultDataDir({})).toBe(join(homedir(), ".wizardingcode", "mem"));
  });

  test("follows WIZARDINGCODE_HOME when the brand's home was moved", () => {
    expect(defaultDataDir({ WIZARDINGCODE_HOME: "/srv/wizardingcode" })).toBe(
      "/srv/wizardingcode/mem",
    );
  });

  test("WIZARDINGCODE_MEM_DATA_DIR overrides everything", () => {
    expect(
      defaultDataDir({
        WIZARDINGCODE_HOME: "/srv/wizardingcode",
        WIZARDINGCODE_MEM_DATA_DIR: "/tmp/m",
      }),
    ).toBe("/tmp/m");
  });

  test("an empty override is no override", () => {
    expect(defaultDataDir({ WIZARDINGCODE_MEM_DATA_DIR: "", WIZARDINGCODE_HOME: "" })).toBe(
      join(homedir(), ".wizardingcode", "mem"),
    );
  });
});

describe("resolvePaths", () => {
  const dir = (env = "") => {
    const dataDir = mkdtempSync(join(tmpdir(), "wizardingcode-mem-paths-"));
    if (env) writeFileSync(join(dataDir, "env"), env);
    return dataDir;
  };

  test("the store is the data directory until it is moved", () => {
    const dataDir = dir();
    expect(resolvePaths({ WIZARDINGCODE_MEM_DATA_DIR: dataDir })).toEqual({
      dataDir,
      storeDir: dataDir,
    });
  });

  test("follows WIZARDINGCODE_MEM_STORE_DIR from the settings file", () => {
    const dataDir = dir("WIZARDINGCODE_MEM_STORE_DIR=/Volumes/Ext/wizardingcode-mem\n");
    expect(resolvePaths({ WIZARDINGCODE_MEM_DATA_DIR: dataDir }).storeDir).toBe(
      "/Volumes/Ext/wizardingcode-mem",
    );
  });

  test("the environment wins over the file", () => {
    const dataDir = dir("WIZARDINGCODE_MEM_STORE_DIR=/from/file\n");
    expect(
      resolvePaths({
        WIZARDINGCODE_MEM_DATA_DIR: dataDir,
        WIZARDINGCODE_MEM_STORE_DIR: "/from/env",
      }).storeDir,
    ).toBe("/from/env");
  });

  test("a relative or empty value is ignored rather than trusted", () => {
    const dataDir = dir("WIZARDINGCODE_MEM_STORE_DIR=relative/path\n");
    expect(resolvePaths({ WIZARDINGCODE_MEM_DATA_DIR: dataDir }).storeDir).toBe(dataDir);
    expect(
      resolvePaths({ WIZARDINGCODE_MEM_DATA_DIR: dataDir, WIZARDINGCODE_MEM_STORE_DIR: "" })
        .storeDir,
    ).toBe(dataDir);
  });
});
