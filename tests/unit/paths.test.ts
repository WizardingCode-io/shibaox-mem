import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDataDir, resolvePaths } from "../../src/util/paths.ts";

describe("defaultDataDir", () => {
  test("lives under the brand's home by default", () => {
    expect(defaultDataDir({})).toBe(join(homedir(), ".shibaox", "mem"));
  });

  test("follows SHIBAOX_HOME when the brand's home was moved", () => {
    expect(defaultDataDir({ SHIBAOX_HOME: "/srv/shibaox" })).toBe("/srv/shibaox/mem");
  });

  test("SHIBAOX_MEM_DATA_DIR overrides everything", () => {
    expect(defaultDataDir({ SHIBAOX_HOME: "/srv/shibaox", SHIBAOX_MEM_DATA_DIR: "/tmp/m" })).toBe(
      "/tmp/m",
    );
  });

  test("an empty override is no override", () => {
    expect(defaultDataDir({ SHIBAOX_MEM_DATA_DIR: "", SHIBAOX_HOME: "" })).toBe(
      join(homedir(), ".shibaox", "mem"),
    );
  });
});

describe("resolvePaths", () => {
  const dir = (env = "") => {
    const dataDir = mkdtempSync(join(tmpdir(), "shibaox-mem-paths-"));
    if (env) writeFileSync(join(dataDir, "env"), env);
    return dataDir;
  };

  test("the store is the data directory until it is moved", () => {
    const dataDir = dir();
    expect(resolvePaths({ SHIBAOX_MEM_DATA_DIR: dataDir })).toEqual({ dataDir, storeDir: dataDir });
  });

  test("follows SHIBAOX_MEM_STORE_DIR from the settings file", () => {
    const dataDir = dir("SHIBAOX_MEM_STORE_DIR=/Volumes/Ext/shibaox-mem\n");
    expect(resolvePaths({ SHIBAOX_MEM_DATA_DIR: dataDir }).storeDir).toBe(
      "/Volumes/Ext/shibaox-mem",
    );
  });

  test("the environment wins over the file", () => {
    const dataDir = dir("SHIBAOX_MEM_STORE_DIR=/from/file\n");
    expect(
      resolvePaths({ SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_STORE_DIR: "/from/env" }).storeDir,
    ).toBe("/from/env");
  });

  test("a relative or empty value is ignored rather than trusted", () => {
    const dataDir = dir("SHIBAOX_MEM_STORE_DIR=relative/path\n");
    expect(resolvePaths({ SHIBAOX_MEM_DATA_DIR: dataDir }).storeDir).toBe(dataDir);
    expect(
      resolvePaths({ SHIBAOX_MEM_DATA_DIR: dataDir, SHIBAOX_MEM_STORE_DIR: "" }).storeDir,
    ).toBe(dataDir);
  });
});
