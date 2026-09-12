import { normalizeQuery, normalizeStored, stripDefiniteArticle } from "@/lib/normalization/arabic";

/**
 * Minimum name similarity for a fuzzy match (80%). The rule is expressed with
 * integer arithmetic — `distance * 5 <= length` — so there is no floating
 * point involved, in TypeScript or in SQL. For a 20-character name this
 * allows up to 4 wrong letters; a missing word on the query side (typing two
 * name parts out of three) costs nothing because only written tokens are
 * scored.
 */
export const FUZZY_ERROR_DIVISOR = 5;

export function fuzzyErrorLimit(length: number): number {
  return Math.floor(length / FUZZY_ERROR_DIVISOR);
}

/**
 * Code-point Levenshtein distance. Pure-TypeScript mirror of Postgres
 * `levenshtein()` (fuzzystrmatch) used as the unit-test oracle for the SQL
 * fuzzy predicate in `query.ts` — both count character insertions, deletions
 * and substitutions.
 */
export function levenshtein(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function storedWords(storedName: string): string[] {
  return normalizeStored(storedName)
    .split(/\s+/)
    .filter(Boolean)
    .map(stripDefiniteArticle);
}

/**
 * Total typo distance of a query against a stored name: every written token
 * pays the distance to its closest stored word. Stored words with no matching
 * query token are free (omission is not an error); a query token with no
 * counterpart pays its full length.
 */
export function fuzzyNameDistance(query: string, storedName: string): number | null {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) return null;
  const words = storedWords(storedName);
  return tokens.reduce(
    (total, token) =>
      total +
      (words.length === 0
        ? Array.from(token).length
        : Math.min(...words.map((word) => levenshtein(word, token)))),
    0,
  );
}

/**
 * Mirrors the SQL fuzzy predicate: 80% similarity over the written query
 * tokens. An exact two-part query always matches a three-part stored name
 * because the missing word contributes no error.
 */
export function fuzzyNameMatches(query: string, storedName: string): boolean {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) return false;
  const distance = fuzzyNameDistance(query, storedName);
  if (distance === null) return false;
  const baseLength = Array.from(tokens.join("")).length;
  return distance * FUZZY_ERROR_DIVISOR <= baseLength;
}
