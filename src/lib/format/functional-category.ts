import { normalizeStored, toLatinDigits } from "@/lib/normalization/arabic";

export const FUNCTIONAL_CATEGORY_ERROR = 0;
export const FUNCTIONAL_CATEGORY_LABELS = [
  "الفئة الأولى",
  "الفئة الثانية",
  "الفئة الثالثة",
  "الفئة الرابعة",
  "الفئة الخامسة",
] as const;

export type FunctionalCategory = 1 | 2 | 3 | 4 | 5;

/**
 * Converts any Arabic (or numeric) spelling of the functional category into
 * the stored numeric form:
 *
 * - empty / whitespace / null  => null (field is empty)
 * - a recognized category      => 1..5
 * - any other non-empty value  => 0 (error / unknown category)
 *
 * Examples: "1", "٢", "الفئة الأولى", "الأولى", "اولى", "اول", "او" => 1
 * "ثانية", "ثان" => 2, "الثالثة", "لث" => 3, "رابعة", "را" => 4,
 * "خامسة", "مس" => 5.
 */
export function parseFunctionalCategory(value: unknown): FunctionalCategory | 0 | null {
  if (value === null || value === undefined) return null;
  const text = toLatinDigits(String(value)).trim();
  if (!text) return null;

  const numeric = text.match(/^([0-9]+)(?:[.,][0-9]+)?$/);
  if (numeric) {
    const number = Number(numeric[1]);
    return number >= 1 && number <= 5 ? (number as FunctionalCategory) : FUNCTIONAL_CATEGORY_ERROR;
  }

  // Normalize Arabic letters, strip the common filler word(s) and the article.
  const normalized = normalizeStored(text).replace(/الفيه|فيه/g, " ");
  const key = normalized.replace(/\s+/g, "").replace(/^ال/, "").trim();
  if (!key) return null;

  if (/^[0-9]+$/.test(key)) {
    const number = Number(key);
    return number >= 1 && number <= 5 ? (number as FunctionalCategory) : FUNCTIONAL_CATEGORY_ERROR;
  }

  if (key === "او" || key.startsWith("اول")) return 1;
  if (key === "ثان" || key.startsWith("ثان")) return 2;
  if (key === "لث" || key.startsWith("ثالث") || key.startsWith("ثلث")) return 3;
  if (key === "را" || key.startsWith("رابع")) return 4;
  if (key === "مس" || key.startsWith("خامس") || key.startsWith("خمس")) return 5;
  return FUNCTIONAL_CATEGORY_ERROR;
}

/** Display form of a stored category: «الفئة الأولى» … «الفئة الخامسة». */
export function formatFunctionalCategory(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const category = parseFunctionalCategory(value);
  if (category === null) return "";
  if (category === FUNCTIONAL_CATEGORY_ERROR) return "فئة غير معروفة";
  return FUNCTIONAL_CATEGORY_LABELS[category - 1];
}

/**
 * Search helper: returns the numeric category to match in search, or null when
 * the query is not a recognizable category (used to keep full search clean).
 */
export function functionalCategoryQuery(value: unknown): number | null {
  const category = parseFunctionalCategory(value);
  return category !== null && category !== FUNCTIONAL_CATEGORY_ERROR ? category : null;
}
