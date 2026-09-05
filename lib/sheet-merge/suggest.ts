import { normalizeStored } from "@/lib/normalization/arabic";
import { readNationalId } from "@/lib/sheet-merge/key";
import type { NationalIdSuggestion } from "@/lib/sheet-merge/types";

/**
 * Automatic suggestion of the national-id column of the first sheet.
 *
 * Client-safe (no Prisma, no files). Two signals are combined with the same
 * scoring the rest of the system uses for header aliases (exact = 1,
 * contains = 0.9, otherwise bigram Dice):
 *  - the column header ("الرقم الوطني", "الرقم القومي", …), and
 *  - the share of sampled cell values that already read as a valid id.
 * The header dominates, so a sheet whose id column is properly titled is
 * always detected; an untitled column is still found from its values.
 */

const ALIASES = [
  "الرقم الوطني",
  "رقم وطني",
  "الرقم الوطنى",
  "الرقم القومي",
  "رقم قومي",
  "الرقم الوطني الموحد",
  "الرقم الوطني للشخص",
  "national id",
];

const HEADER_THRESHOLD = 0.58;
/** A column counts as "id-like" when most of its sampled values are valid ids. */
const VALUE_THRESHOLD = 0.6;
const HEADER_WEIGHT = 0.65;
const VALUE_WEIGHT = 0.35;

function bigrams(value: string) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, i) => value.slice(i, i + 2)));
}

function dice(left: string, right: string) {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size || 1);
}

function headerScore(header: string): number {
  const normalized = normalizeStored(header);
  if (!normalized) return 0;
  let best = 0;
  for (const alias of ALIASES) {
    const candidate = normalizeStored(alias);
    const score =
      normalized === candidate
        ? 1
        : normalized.includes(candidate) || candidate.includes(normalized)
          ? 0.9
          : dice(normalized, candidate);
    if (score > best) best = score;
  }
  return best >= HEADER_THRESHOLD ? best : 0;
}

/** Share of sampled values that read as a linkable national id (0..1). */
export function idValueRatio(column: Array<string | undefined>): number {
  let filled = 0;
  let valid = 0;
  for (const value of column) {
    const text = value == null ? "" : String(value).trim();
    if (!text) continue;
    filled += 1;
    if (readNationalId(text).key) valid += 1;
  }
  if (!filled) return 0;
  return valid / filled;
}

export function suggestNationalIdColumn(
  headers: string[],
  sampleRows: string[][],
): NationalIdSuggestion {
  if (!headers.length) return { index: null, reason: null };

  let bestIndex: number | null = null;
  let bestScore = 0;
  let bestReason: string | null = null;

  headers.forEach((header, index) => {
    const headerPart = headerScore(header);
    const ratio = idValueRatio(sampleRows.map((row) => row[index]));
    const valuePart = ratio >= VALUE_THRESHOLD ? ratio : 0;
    const score = headerPart * HEADER_WEIGHT + valuePart * VALUE_WEIGHT;
    if (score <= bestScore || score <= 0) return;
    bestScore = score;
    bestIndex = index;
    bestReason =
      headerPart && valuePart
        ? `اقتراح تلقائي من عنوان العمود «${header}» ومن قيمه (${Math.round(ratio * 100)}% أرقام وطنية صالحة).`
        : headerPart
          ? `اقتراح تلقائي من عنوان العمود «${header}».`
          : `اقتراح تلقائي من قيم العمود: ${Math.round(ratio * 100)}% من القيم أرقام وطنية صالحة.`;
  });

  return { index: bestIndex, reason: bestReason };
}
