import { describe, expect, test } from "bun:test";
import { buildQuery, searchTokens } from "../../src/retrieve/query.ts";

describe("buildQuery", () => {
  test("keeps the words that carry meaning and drops the ones that do not", () => {
    const query = buildQuery("Why does the migration fail when the database is locked?");
    expect(query?.words).toEqual(["migration", "fail", "database", "locked"]);
    expect(query?.identifiers).toEqual([]);
  });

  test("does the same in Portuguese", () => {
    const query = buildQuery(
      "porque é que a migração falha quando a base de dados está bloqueada?",
    );
    expect(query?.words).toEqual(["migração", "falha", "base", "dados", "bloqueada"]);
  });

  test("recognises identifiers: code spans, snake_case, camelCase, paths and file names", () => {
    const query = buildQuery(
      "Why does `openDb` fail when busy_timeout is set in src/store/db.ts, unlike handleHook in hook.ts?",
    );
    expect(query?.identifiers).toEqual([
      "openDb",
      "busy_timeout",
      "src/store/db.ts",
      "handleHook",
      "hook.ts",
    ]);
  });

  test("also searches for the parts of a camelCase identifier", () => {
    expect(buildQuery("where is handleHook called from?")?.words).toEqual(
      expect.arrayContaining(["handle", "hook"]),
    );
  });

  test.each(["continua", "ok", "sim, avança", "yes", "go on", "", "   ", "???", "faz isso"])(
    "a prompt with too little to search for gives no query: %p",
    (prompt) => {
      expect(buildQuery(prompt)).toBeNull();
    },
  );

  test("one identifier alone is enough to search", () => {
    expect(buildQuery("openDb?")?.identifiers).toEqual(["openDb"]);
  });

  test("the match expression quotes every term, so no input is read as query syntax", () => {
    const query = buildQuery('explain "foo" OR NOT (bar* NEAR ^baz) AND qux:quux');
    expect(query?.match).toMatch(/^"[^"]+"( OR "[^"]+")*$/);
  });

  test("also searches for the stem of an inflected word, so that other forms of it are found", () => {
    const query = buildQuery("the queries about cached memories are slow");
    expect(query?.match).toContain('"queries"');
    expect(query?.match).toContain('"query"');
    expect(query?.match).toContain('"memory"');
    expect(query?.match).toContain('"cach"');
  });

  test("bounds the number of terms", () => {
    const query = buildQuery(Array.from({ length: 200 }, (_, i) => `word${i}x`).join(" "));
    expect((query?.words.length ?? 0) + (query?.identifiers.length ?? 0)).toBeLessThanOrEqual(32);
  });
});

describe("buildQuery on hostile input", () => {
  // A prompt can be a pasted key, a dump or a minified file. The hook that reads it
  // sits between the user and the model, so no input may make it slow.
  const hex = (n: number) => "0123456789abcdef".repeat(Math.ceil(n / 16)).slice(0, n);
  test.each([
    ["one long run of hex", hex(200_000)],
    ["hex in dashed groups", hex(200_000).replace(/(.{8})/g, "$1-")],
    ["base32", "abcdefghijklmnopqrstuvwxyz234567".repeat(6250)],
    ["base64url", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_".repeat(5264)],
    ["dotted", "a.b.c.d.e.f.g.h.".repeat(12_500)],
    ["slashes", "ab/cd/ef/gh/".repeat(16_667)],
    ["backticks", "`a ".repeat(60_000)],
    ["underscores", "a_".repeat(100_000)],
  ])("stays fast on %s", (_label, text) => {
    const started = performance.now();
    buildQuery(text);
    expect(performance.now() - started).toBeLessThan(250);
  });

  test("still recognises identifiers in ordinary text", () => {
    expect(
      buildQuery("see src/store/db.ts and hook.ts, then call openDb with busy_timeout")
        ?.identifiers,
    ).toEqual(["src/store/db.ts", "hook.ts", "openDb", "busy_timeout"]);
  });
});

describe("searchTokens", () => {
  test("splits the way the full-text index does: lower case, no diacritics, no punctuation", () => {
    expect(searchTokens("Migração do busy_timeout em src/Store/db.ts")).toEqual([
      "migracao",
      "do",
      "busy",
      "timeout",
      "em",
      "src",
      "store",
      "db",
      "ts",
    ]);
  });
});
