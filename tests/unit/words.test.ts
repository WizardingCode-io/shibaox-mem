import { describe, expect, test } from "bun:test";
import { searchTerms, stem } from "../../src/util/words.ts";

describe("stem", () => {
  // Each group is forms of one word: they must all reduce to the same thing.
  const FORMS: string[][] = [
    ["query", "queries"],
    ["memory", "memories"],
    ["message", "messages"],
    ["payload", "payloads"],
    ["fold", "folds"],
    ["restore", "restores", "restored", "restoring"],
    ["store", "stores", "stored", "storing"],
    ["search", "searches", "searched", "searching"],
    ["test", "tests", "tested", "testing"],
    ["commit", "commits", "committed", "committing"],
    ["cache", "caches", "cached", "caching"],
    ["change", "changes", "changed", "changing"],
    ["redact", "redacts", "redacted", "redacting"],
    ["embed", "embedding", "embeddings"],
    ["process", "processes"],
    ["index", "indexes"],
    ["match", "matches", "matched", "matching"],
    ["database", "databases"],
    ["tabela", "tabelas"],
    ["memoria", "memorias"],
    ["migracao", "migracoes"],
    ["sessao", "sessoes"],
    ["identificador", "identificadores"],
    ["resposta", "respostas"],
  ];
  for (const forms of FORMS) {
    test(`forms of ${forms[0]} share a stem`, () => {
      expect(new Set(forms.map(stem)).size).toBe(1);
    });
  }

  // Different words must stay different.
  test.each([
    ["status", "state"],
    ["cursor", "curse"],
    ["process", "procedure"],
    ["string", "strip"],
    ["analysis", "analyst"],
    ["responder", "resposta"],
    ["test", "text"],
  ])("%s and %s do not share a stem", (a, b) => {
    expect(stem(a)).not.toBe(stem(b));
  });

  test.each(["db", "ts", "wal", "fts5", "utf8", "v2", "status", "class", "this", "bus", "sha256"])(
    "%s is left as it is",
    (token) => {
      expect(stem(token)).toBe(token);
    },
  );
});

describe("searchTerms", () => {
  test("holds the paths, the parts of identifiers, and the stems of inflected words", () => {
    const terms = searchTerms(
      "Fixed: `openDb` retries the queries",
      "Processes creating databases together.",
      ["src/store/db.ts"],
    ).split(" ");
    expect(terms).toContain("src/store/db.ts");
    expect(terms).toEqual(expect.arrayContaining(["open", "db"]));
    expect(terms).toEqual(expect.arrayContaining(["query", "process", "databas", "retry"]));
  });

  test("adds nothing for words that are already their own stem", () => {
    expect(searchTerms("Never mock this", "", [])).toBe("");
  });

  test("lists each term once", () => {
    const terms = searchTerms("queries and queries and more queries", "queries", []).split(" ");
    expect(terms.filter((term) => term === "query")).toHaveLength(1);
  });
});
