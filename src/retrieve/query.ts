import { clip } from "../util/text.ts";
import { anyOf, identifierParts, STOPWORDS, searchTokens, stem } from "../util/words.ts";

export { searchTokens } from "../util/words.ts";

export interface Query {
  /** Meaningful plain words, lower case, in order of appearance. */
  words: string[];
  /** Exact things named in the prompt: symbols, paths, file names. */
  identifiers: string[];
  /** FTS5 expression matching any of them. */
  match: string;
}

const MAX_TERMS = 32;
const MAX_IDENTIFIER_CHARS = 80;

const MAX_PROMPT_CHARS = 4000;

// One pass, leftmost match first, so a path is taken whole before its file name is seen.
// Every repetition is bounded and every alternative can only start at the beginning of
// a run: an unanchored `[\w.-]+` is quadratic on a long run of hex or base64, and a
// prompt may be exactly that.
const IDENTIFIER = new RegExp(
  [
    "`([^`\\n]{1,200})`", // a code span
    "(?<![\\w./-])[\\w.-]{1,80}(?:/[\\w.-]{1,80}){1,20}", // a path
    "(?<![\\w-])[\\w-]{1,80}\\.(?:tsx?|jsx?|json|md|sql|py|go|rs|toml|ya?ml|sh|css|html|php|rb|java|kt|swift|cpp|c|h)\\b", // a file name
    "\\b[A-Za-z][A-Za-z0-9]{0,80}(?:_[A-Za-z0-9]{1,80}){1,20}\\b", // snake_case
    "\\b[A-Za-z][a-z0-9]{1,80}[A-Z][A-Za-z0-9]{0,80}\\b", // camelCase
  ].join("|"),
  "g",
);

/**
 * What to search for, given a prompt. The prompt is never used as it stands: common
 * words would match everything. Null when the prompt names too little to search for,
 * in which case nothing is injected.
 */
export function buildQuery(prompt: string): Query | null {
  const identifiers: string[] = [];
  // What a prompt is about is said at its start; the rest of a long one is material.
  const prose = clip(prompt, MAX_PROMPT_CHARS).replace(
    IDENTIFIER,
    (match: string, span?: string) => {
      const identifier = (span ?? match).trim().replace(/\.+$/, "");
      if (/[\p{L}\p{N}]/u.test(identifier) && identifier.length <= MAX_IDENTIFIER_CHARS) {
        if (!identifiers.includes(identifier)) identifiers.push(identifier);
      }
      return " ";
    },
  );

  const words: string[] = [];
  const candidates = [
    ...(prose.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []),
    ...identifierParts(identifiers.join(" ")).split(" "),
  ];
  for (const word of candidates) {
    if (word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word) && !words.includes(word)) {
      words.push(word);
    }
  }

  if (identifiers.length === 0 && words.length < 2) return null;
  const kept = identifiers.slice(0, MAX_TERMS);
  const keptWords = words.slice(0, MAX_TERMS - kept.length);
  // Stems go into the search only: they find the other forms of a word.
  const stems = keptWords.map((word) => stem(searchTokens(word)[0] ?? word));
  return {
    words: keptWords,
    identifiers: kept,
    match: anyOf(new Set([...kept, ...keptWords, ...stems])),
  };
}
