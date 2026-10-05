import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultDataDir } from "../../src/util/paths.ts";

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
