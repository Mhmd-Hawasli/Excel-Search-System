import { normalizeStored } from "@/lib/normalization/arabic";
import { MERGE_FIELD_KEYS, type MergeFieldKey, type MergeMapping } from "@/lib/merge/types";

/**
 * Automatic column suggestions for the merge section.
 *
 * Client-safe (no Prisma import): matches each uploaded header against
 * per-field Arabic aliases with the same scoring as the archive import
 * (exact = 1, contains = 0.9, otherwise bigram Dice, threshold 0.58).
 * Every Excel column is suggested at most once, and the full triple name
 * excludes the split parts (first + father + last) and vice versa.
 */

const ALIASES: Record<MergeFieldKey, string[]> = {
  fullName: ["الاسم الثلاثي", "الاسم الكامل", "اسم الشخص"],
  firstName: ["الاسم", "اسم"],
  fatherName: ["اسم الاب", "الاب", "اسم الوالد"],
  lastName: ["النسبه", "الكنيه", "اللقب"],
  motherName: ["اسم الام", "الام", "اسم الوالده", "اسم وكنيه الام", "كنيه الام"],
  nationalId: ["الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي"],
  personalNo: ["الرقم الذاتي", "رقم ذاتي", "الرقم الوظيفي"],
  shamCash: ["الشام كاش", "شام كاش", "رقم شام كاش", "رقم حساب شام كاش"],
  phone: ["رقم الهاتف", "الهاتف", "الموبايل", "الجوال", "رقم الموبايل"],
};

const THRESHOLD = 0.58;
const PART_FIELDS: MergeFieldKey[] = ["firstName", "fatherName", "lastName"];

function bigrams(value: string) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function dice(left: string, right: string) {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size || 1);
}

function fieldScore(field: MergeFieldKey, normalizedHeader: string): number {
  let best = 0;
  for (const alias of ALIASES[field]) {
    const candidate = normalizeStored(alias);
    if (!candidate || !normalizedHeader) continue;
    const score =
      normalizedHeader === candidate
        ? 1
        : normalizedHeader.includes(candidate) || candidate.includes(normalizedHeader)
          ? 0.9
          : dice(normalizedHeader, candidate);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Suggests a mapping from merge field to 0-based column index. Each column is
 * used at most once (highest score wins) and only one name form survives:
 * either the triple full name or the split parts, whichever scored higher
 * (ties prefer the triple full name).
 */
export function suggestMergeMapping(headers: string[]): MergeMapping {
  const normalized = headers.map((header) => normalizeStored(header));
  const candidates: Array<{ field: MergeFieldKey; index: number; score: number }> = [];
  for (const field of MERGE_FIELD_KEYS)
    normalized.forEach((header, index) => {
      const score = fieldScore(field, header);
      if (score >= THRESHOLD) candidates.push({ field, index, score });
    });
  candidates.sort((a, b) => b.score - a.score);

  const mapping: MergeMapping = {};
  const scores: Partial<Record<MergeFieldKey, number>> = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (mapping[candidate.field] !== undefined || usedColumns.has(candidate.index)) continue;
    mapping[candidate.field] = candidate.index;
    scores[candidate.field] = candidate.score;
    usedColumns.add(candidate.index);
  }

  // Mutually exclusive name forms: keep the higher-scoring side.
  if (mapping.fullName !== undefined && PART_FIELDS.some((field) => mapping[field] !== undefined)) {
    const fullScore = scores.fullName ?? 0;
    const partsScore = Math.max(...PART_FIELDS.map((field) => scores[field] ?? 0));
    if (fullScore >= partsScore) {
      for (const field of PART_FIELDS) delete mapping[field];
    } else {
      delete mapping.fullName;
    }
  }
  return mapping;
}
