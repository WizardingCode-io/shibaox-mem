import { describe, expect, test } from "bun:test";
import { candidates, segment } from "../../src/distill/segment.ts";

describe("segment", () => {
  test("splits prose into sentences", () => {
    expect(
      segment("The cache was stale after a write. We now invalidate the key on every update."),
    ).toEqual(["The cache was stale after a write.", "We now invalidate the key on every update."]);
  });

  test("splits on question and exclamation marks", () => {
    expect(
      segment("Should we keep the old endpoint around? It is still used by the mobile app!"),
    ).toEqual(["Should we keep the old endpoint around?", "It is still used by the mobile app!"]);
  });

  test("drops fenced code blocks, keeping the prose around them", () => {
    const out = segment(
      "I changed the retry policy to back off.\n```ts\nconst retries = 3; // The Old Value. Was Five.\n```\nThe new policy waits longer each time.",
    );
    expect(out).toEqual([
      "I changed the retry policy to back off.",
      "The new policy waits longer each time.",
    ]);
  });

  test("an unterminated code fence swallows the rest, not the start", () => {
    expect(segment("The parser now rejects empty input.\n```\nlet x = 1. Then More.")).toEqual([
      "The parser now rejects empty input.",
    ]);
  });

  test("keeps inline code intact, even with dots inside it", () => {
    expect(
      segment("Renamed `user.getById. Old` to `findUser` everywhere. It was confusing callers."),
    ).toEqual([
      "Renamed `user.getById. Old` to `findUser` everywhere.",
      "It was confusing callers.",
    ]);
  });

  test("treats each list item as its own unit, without its marker", () => {
    expect(
      segment(
        [
          "- The first item is long enough to keep.",
          "* The second item is also long enough.",
          "1. A numbered item that says something.",
          "2) Another numbered item worth keeping.",
          "- [x] A finished task that states a fact.",
        ].join("\n"),
      ),
    ).toEqual([
      "The first item is long enough to keep.",
      "The second item is also long enough.",
      "A numbered item that says something.",
      "Another numbered item worth keeping.",
      "A finished task that states a fact.",
    ]);
  });

  test("does not split after English abbreviations", () => {
    expect(
      segment("We use Redis, e.g. For sessions and rate limits. It listens on port 6379 only."),
    ).toEqual([
      "We use Redis, e.g. For sessions and rate limits.",
      "It listens on port 6379 only.",
    ]);
  });

  test("does not split after Portuguese abbreviations", () => {
    expect(
      segment("Usámos a cache, p. ex. Para sessões e limites. Está à escuta na porta 6379."),
    ).toEqual(["Usámos a cache, p. ex. Para sessões e limites.", "Está à escuta na porta 6379."]);
  });

  test("a sentence may start with an accented capital", () => {
    expect(segment("A fila é durável por desenho. É drenada por qualquer invocação.")).toEqual([
      "A fila é durável por desenho.",
      "É drenada por qualquer invocação.",
    ]);
  });

  test("does not split inside URLs, version numbers or file names", () => {
    expect(
      segment(
        "See https://example.com/a.b/c?x=1.2 for details on v1.2.3 of config.yaml. Then restart the worker process.",
      ),
    ).toEqual([
      "See https://example.com/a.b/c?x=1.2 for details on v1.2.3 of config.yaml.",
      "Then restart the worker process.",
    ]);
  });

  test("drops headings, tables and rules", () => {
    expect(
      segment(
        "## Summary\n\n| file | change |\n|---|---|\n| a.ts | renamed |\n\n---\nThe migration is forward-only by design.",
      ),
    ).toEqual(["The migration is forward-only by design."]);
  });

  test("strips emphasis and quote markers", () => {
    expect(segment("> **Root cause:** the lease was *never* released by the worker.")).toEqual([
      "Root cause: the lease was never released by the worker.",
    ]);
  });

  test("leaves snake_case identifiers alone", () => {
    expect(segment("The column busy_timeout_ms must be set first.")).toEqual([
      "The column busy_timeout_ms must be set first.",
    ]);
  });

  test.each([
    "Done.",
    "OK!",
    "Feito.",
    "All good now.",
    "",
    "   \n\n  ",
    "1234567890 1234567890 123",
  ])("a fragment too thin to be knowledge is dropped: %p", (text) => {
    expect(segment(text)).toEqual([]);
  });

  test("the same sentence is kept once", () => {
    expect(segment("The index is rebuilt on startup.\nthe index is rebuilt on startup.")).toEqual([
      "The index is rebuilt on startup.",
    ]);
  });

  test("a very long sentence is cut, not dropped", () => {
    const [only] = segment(`The list of affected modules is ${"module ".repeat(200)}and more.`);
    expect(only?.length).toBeLessThanOrEqual(400);
    expect(only).toStartWith("The list of affected modules is module");
  });

  test("keeps at most the requested number, from both ends", () => {
    const text = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} says something.`).join(
      " ",
    );
    const out = segment(text, { maxCandidates: 10 });
    expect(out).toHaveLength(10);
    expect(out[0]).toBe("Sentence number 0 says something.");
    expect(out.at(-1)).toBe("Sentence number 99 says something.");
    // Order of appearance is preserved.
    const numbers = out.map((s) => Number(s.match(/\d+/)?.[0]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  test("the default cap is 40", () => {
    const text = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} says something.`).join(
      " ",
    );
    expect(segment(text)).toHaveLength(40);
  });
});

describe("candidates", () => {
  test("numbers sentences from the prompt first, then from the answer", () => {
    expect(
      candidates(
        "Never mock the database in these tests. Use the real SQLite file instead.",
        "Switched the tests to a real database file. They now catch the migration bug.",
      ),
    ).toEqual([
      { idx: 0, source: "prompt", text: "Never mock the database in these tests." },
      { idx: 1, source: "prompt", text: "Use the real SQLite file instead." },
      { idx: 2, source: "final", text: "Switched the tests to a real database file." },
      { idx: 3, source: "final", text: "They now catch the migration bug." },
    ]);
  });

  test("a turn with no answer still yields the prompt's sentences", () => {
    expect(candidates("Always run the linter before committing.", null)).toEqual([
      { idx: 0, source: "prompt", text: "Always run the linter before committing." },
    ]);
  });

  test("the prompt cannot crowd out the answer", () => {
    const prompt = Array.from({ length: 60 }, (_, i) => `Prompt sentence ${i} is here.`).join(" ");
    const final = Array.from({ length: 60 }, (_, i) => `Answer sentence ${i} is here.`).join(" ");
    const out = candidates(prompt, final);
    expect(out).toHaveLength(40);
    expect(out.filter((c) => c.source === "prompt")).toHaveLength(10);
    expect(out.filter((c) => c.source === "final")).toHaveLength(30);
    expect(out.map((c) => c.idx)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });
});
