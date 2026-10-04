// English and Portuguese words too common to tell two texts apart.
export const STOPWORDS = new Set(
  "the and for are was were not but with that this from have has had its their there which when then than into about over also been being will would should could can may our your you they them these those does did doing done just only very more most some such each any all one two out off too now new use used using get got yet still onto upon within without between while where what who whom whose why how nor both few own same other another again once here uma uns umas dos das nos nas por para com sem sob sobre entre até que não sim mas como mais menos muito pouco também já ainda são ser está estão foi era eram tem têm ter isto isso esse essa este esta aquele aquela ele ela eles elas seu sua seus suas num numa pelo pela pelos pelas aos quando onde porque pois cada todo toda todos todas outro outra outros outras".split(
    " ",
  ),
);

/** The distinct meaningful words of a text, lower-cased. */
export function tokens(text: string): Set<string> {
  const found = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return new Set(found.filter((token) => token.length >= 3 && !STOPWORDS.has(token)));
}

const CAMEL_CASE = /[A-Za-z][A-Za-z0-9]*[a-z0-9][A-Z][A-Za-z0-9]*/g;

/**
 * The parts of camelCase identifiers in `text`, as plain words: "openDb" gives "open db".
 * The full-text tokenizer already splits on punctuation, but not inside such a word.
 */
export function identifierParts(text: string): string {
  const parts = new Set<string>();
  for (const identifier of text.match(CAMEL_CASE) ?? []) {
    const split = identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase()
      .split(" ");
    for (const part of split) parts.add(part);
  }
  return [...parts].join(" ");
}

/** An FTS5 query matching any of the terms. Each term is quoted, so none is read as syntax. */
export function anyOf(terms: Iterable<string>): string {
  return [...terms].map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}
