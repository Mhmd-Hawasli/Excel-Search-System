import type { StandardFieldKey } from "@/lib/standard-fields";
import { digitsOnly, normalizeQuery, normalizeStored } from "@/lib/normalization";

/**
 * محرك التظليل: يحسب المقاطع المطابقة مع إرجاع الفهارس إلى القيمة الأصلية.
 *
 * يوازي سلوك الباك-إند:
 * - `normalizeStored` يحذف محارف (التشكيل، التطويل، الهمزة `ء`، والمسافة
 *   بعد `عبد` عبر `/عبد\s+/`) فيصبح طول النص المطبّع أقصر من الأصلي، لذلك
 *   تُبنى خريطة `normalizedIndex -> originalRange` محرفًا بمحرف.
 * - `normalizeQuery` يجرّد `ال` التعريف (الحموي -> حموي)، لذلك تُجرَّب أيضًا
 *   الصيغة مع `ال` حتى تُظلَّل الكلمة كاملة بدل ترك `ال` بيضاء.
 * - فرع الـ fuzzy في SQL لحقل `full_name` (مجموع مسافات ليفنشتاين × 5 <= طول
 *   التوكنات) يقبل أغلاطًا مثل `رجمو` مقابل `رحمو`. التوكن بلا مطابقة حرفية
 *   يظلل أقرب كلمة مخزنة ضمن نفس الميزانية، ويُعلَّم `fuzzy` لعرضه كمطابقة
 *   تقريبية.
 */

const NUMERIC_FIELDS = new Set<string>(["national_id", "sham_cash", "personal_no", "phone"]);

/** Only `full_name` has a fuzzy branch on the backend (mirrors `FuzzyDivisor = 5`). */
const FUZZY_FIELD = "full_name";
const FUZZY_ERROR_DIVISOR = 5;

export type HighlightRange = { start: number; end: number; fuzzy?: boolean };

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

/** Code-point Levenshtein distance (mirrors Postgres `levenshtein()`). */
function levenshtein(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

/** All occurrences of `needle` in the mapped sequence, as source ranges. */
function spansOf(sequence: { normalized: string; map: HighlightRange[] }, needle: string): HighlightRange[] {
  const out: HighlightRange[] = [];
  if (!needle) return out;
  let from = 0;
  for (;;) {
    const start = sequence.normalized.indexOf(needle, from);
    if (start < 0) break;
    const last = start + needle.length - 1;
    if (sequence.map[start] && sequence.map[last]) {
      out.push({ start: sequence.map[start].start, end: sequence.map[last].end });
    }
    from = start + Math.max(1, needle.length);
  }
  return out;
}

/** Stored words exactly as the backend fuzzy branch sees them. */
function fuzzyWords(value: string): string[] {
  return normalizeStored(value)
    .split(/\s+/)
    .filter(Boolean);
}
/** Same `ال` stripping the SQL applies to stored words (length in code points). */
function stripStoredWord(word: string): string {
  return word.startsWith("ال") && Array.from(word).length >= 5 ? word.slice(2) : word;
}

/**
 * Swallows visually-attached deleted characters (hamza `ء`, diacritics,
 * tatweel) trailing a match, so «ضياء» highlights wholly instead of «ضيا»
 * plus a bare `ء`. Only the exact deleted set is swallowed — never spaces
 * (single-char `normalizeStored` trims, so it can't be reused as the test).
 */
const DELETED_CHARS = /[ءً-ٰٕـ]/;
function extendOverDeleted(value: string, end: number): number {
  let cursor = end;
  while (cursor < value.length) {
    const codePoint = value.codePointAt(cursor);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    if (!DELETED_CHARS.test(character)) break;
    cursor += character.length;
  }
  return cursor;
}

/** Backend-oracle distance: every token pays its closest-word distance. */
function fuzzyTotalDistance(tokens: string[], words: string[]): number {
  return tokens.reduce((total, token) => {
    if (words.length === 0) return total + Array.from(token).length;
    let best = Number.POSITIVE_INFINITY;
    for (const word of words) best = Math.min(best, levenshtein(stripStoredWord(word), token));
    return total + best;
  }, 0);
}

/**
 * Computes merged, source-value ranges that visually match `query` for the
 * given field. Returns an empty array when nothing matches.
 */
export function computeHighlightRanges(
  value: string,
  query: string,
  field: StandardFieldKey | string | null,
): HighlightRange[] {
  const numeric = field ? NUMERIC_FIELDS.has(field) : false;
  const sequence = mappedSequence(value, numeric);
  const ranges: HighlightRange[] = [];
  if (numeric) {
    for (const span of spansOf(sequence, digitsOnly(query))) ranges.push(span);
  } else {
    const tokens = normalizeQuery(query);
    const exactHit = new Set<string>();
    for (const token of tokens) {
      let hit = false;
      for (const span of spansOf(sequence, token)) {
        ranges.push(span);
        hit = true;
      }
      if (!token.startsWith("ال")) {
        for (const span of spansOf(sequence, `ال${token}`)) {
          ranges.push(span);
          hit = true;
        }
      }
      if (hit) exactHit.add(token);
    }
    if (field === FUZZY_FIELD && tokens.length > 0 && exactHit.size < tokens.length) {
      const words = fuzzyWords(value);
      const baseLength = Array.from(tokens.join("")).length;
      if (words.length > 0 && fuzzyTotalDistance(tokens, words) * FUZZY_ERROR_DIVISOR <= baseLength) {
        const wordSpans = new Map<string, HighlightRange[]>();
        for (const token of tokens) {
          if (exactHit.has(token)) continue;
          let bestIndex = -1;
          let bestDistance = Number.POSITIVE_INFINITY;
          words.forEach((word, index) => {
            const distance = levenshtein(stripStoredWord(word), token);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          });
          if (bestIndex < 0) continue;
          const word = words[bestIndex];
          let spans = wordSpans.get(word);
          if (!spans) {
            spans = spansOf(sequence, word);
            wordSpans.set(word, spans);
          }
          const occurrence = words.slice(0, bestIndex).filter((w) => w === word).length;
          const span = spans[Math.min(occurrence, Math.max(0, spans.length - 1))];
          if (span) ranges.push({ ...span, fuzzy: true });
        }
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const extended = ranges.map((range) => ({
    ...range,
    end: extendOverDeleted(value, range.end),
  }));
  extended.sort((a, b) => a.start - b.start);
  return extended.reduce<HighlightRange[]>((all, current) => {
    const last = all.at(-1);
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      last.fuzzy = last.fuzzy && current.fuzzy;
    } else all.push({ ...current });
    return all;
  }, []);
}
