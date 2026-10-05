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

// One pass, leftmost match first, so a path is taken whole before its file name is seen.
const IDENTIFIER = new RegExp(
  [
    "`([^`\\n]+)`", // a code span
    "[\\w.-]+(?:/[\\w.-]+)+", // a path
    "\\b[\\w-]+\\.(?:tsx?|jsx?|json|md|sql|py|go|rs|toml|ya?ml|sh|css|html|php|rb|java|kt|swift|cpp|c|h)\\b", // a file name
    "\\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\\b", // snake_case
    "\\b[A-Za-z][a-z0-9]+[A-Z][A-Za-z0-9]*\\b", // camelCase
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
  const prose = prompt.replace(IDENTIFIER, (match: string, span?: string) => {
    const identifier = (span ?? match).trim().replace(/\.+$/, "");
    if (/[\p{L}\p{N}]/u.test(identifier) && identifier.length <= MAX_IDENTIFIER_CHARS) {
      if (!identifiers.includes(identifier)) identifiers.push(identifier);
    }
    return " ";
  });

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
