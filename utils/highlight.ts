import type { StandardFieldKey } from "@/lib/excel/types";
import { digitsOnly, normalizeQuery, normalizeStored } from "@/lib/normalization/arabic";

/**
 * Pure highlight engine shared by search results: computes which segments of
 * an original cell value match the query, accounting for Arabic letter
 * normalization (text fields) and Arabic-Indic digit folding (numeric fields)
 * by mapping every normalized character back to its source range.
 */

const NUMERIC_FIELDS = new Set<StandardFieldKey>(["national_id", "sham_cash", "personal_no", "phone"]);

export type HighlightRange = { start: number; end: number };

function mappedSequence(value: string, numeric: boolean) {
  let normalized = "";
  const map: HighlightRange[] = [];
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;
    const transformed = numeric ? digitsOnly(character) : normalizeStored(character);
    for (const normalizedCharacter of transformed) {
      normalized += normalizedCharacter;
      map.push({ start: index, end });
    }
    index = end;
  }
  return { normalized, map };
}

/**
 * Computes merged, source-value ranges that visually match `query` for the
 * given field. Returns an empty array when nothing matches.
 */
export function computeHighlightRanges(value: string, query: string, field: StandardFieldKey | null): HighlightRange[] {
  const numeric = field ? NUMERIC_FIELDS.has(field) : false;
  const needles = numeric ? [digitsOnly(query)].filter(Boolean) : normalizeQuery(query);
  const sequence = mappedSequence(value, numeric);
  const ranges = needles
    .map((needle) => {
      const start = sequence.normalized.indexOf(needle);
      if (start < 0 || !sequence.map[start] || !sequence.map[start + needle.length - 1]) return null;
      return { start: sequence.map[start].start, end: sequence.map[start + needle.length - 1].end };
    })
    .filter((range): range is HighlightRange => Boolean(range))
    .sort((a, b) => a.start - b.start);
  return ranges.reduce<HighlightRange[]>((all, current) => {
    const last = all.at(-1);
    if (last && current.start <= last.end) last.end = Math.max(last.end, current.end);
    else all.push({ ...current });
    return all;
  }, []);
}
