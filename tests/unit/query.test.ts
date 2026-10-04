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

  test("bounds the number of terms", () => {
    const query = buildQuery(Array.from({ length: 200 }, (_, i) => `word${i}x`).join(" "));
    expect((query?.words.length ?? 0) + (query?.identifiers.length ?? 0)).toBeLessThanOrEqual(32);
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
