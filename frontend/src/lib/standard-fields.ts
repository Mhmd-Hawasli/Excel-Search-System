import { normalizeStored, stripDefiniteArticle } from "@/lib/normalization";

/**
 * Client-safe standard-field catalog ported from V1 lib/excel
 * (types + standard-field-catalog + mapping): Arabic labels, header aliases,
 * the suggestion engine and the uniqueness guard. Used by the upload, update
 * and mapping wizards directly.
 */

export const STANDARD_FIELD_KEYS = [
  "first_name",
  "father_name",
  "last_name",
  "full_name",
  "national_id",
  "sham_cash",
  "personal_no",
  "mother_name",
  "phone",
  "contract_code",
  "secondary_contract_code",
  "job_title",
  "functional_category",
  "organizational_level",
] as const;

export type StandardFieldKey = (typeof STANDARD_FIELD_KEYS)[number];

export const STANDARD_FIELD_LABELS: Record<StandardFieldKey, string> = {
  first_name: "الاسم",
  father_name: "اسم الأب",
  last_name: "النسبة",
  full_name: "الاسم الثلاثي",
  national_id: "الرقم الوطني",
  sham_cash: "الشام كاش",
  personal_no: "الرقم الذاتي",
  mother_name: "اسم الأم",
  phone: "رقم الهاتف",
  contract_code: "رمز العقد الأساسي",
  secondary_contract_code: "رمز العقد الثانوي",
  job_title: "المسمى الوظيفي",
  functional_category: "الفئة الوظيفية",
  organizational_level: "السوية التنظيمية الأساسية",
};

const ALIASES: Record<StandardFieldKey, string[]> = {
  first_name: ["الاسم", "اسم"],
  father_name: ["اسم الاب", "الاب", "اسم الوالد"],
  last_name: ["النسبه", "الكنيه", "اللقب"],
  full_name: ["الاسم الثلاثي", "الاسم الكامل", "اسم الشخص"],
  national_id: ["الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي"],
  sham_cash: ["الشام كاش", "شام كاش", "رقم شام كاش"],
  personal_no: ["الرقم الذاتي", "رقم ذاتي", "الرقم الوظيفي"],
  mother_name: ["اسم الام", "الام", "اسم الوالده"],
  phone: ["رقم الهاتف", "الهاتف", "الموبايل", "الجوال", "رقم الموبايل"],
  contract_code: ["رمز العقد الأساسي", "كود العقد الأساسي", "رقم العقد الأساسي", "رمز العقد", "كود العقد", "رقم العقد"],
  secondary_contract_code: ["رمز العقد الثانوي", "كود العقد الثانوي", "رقم العقد الثانوي", "الرمز الثانوي للعقد", "رمز العقد الإضافي", "رمز العقد الاضافي", "كود العقد الإضافي"],
  job_title: ["المسمى الوظيفي", "مسمى وظيفي", "المسمى", "مسمى الوظيفة", "المسمى الوظيفي الحالي", "الوظيفة الحالية", "الوظيفة", "الوظيفه"],
  functional_category: ["الفئة الوظيفية", "فئة وظيفية", "الفئة", "فئة", "الدرجة الوظيفية", "درجة وظيفية"],
  organizational_level: ["السوية التنظيمية الأساسية", "السوية التنظيمية", "السوية", "المستوى التنظيمي الأساسي", "المستوى التنظيمي", "السوية التنظيميه", "المستوي التنظيمي"],
};

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function dice(left: string, right: string): number {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size || 1);
}

/**
 * Suggests the standard field an Excel header most likely represents,
 * smartest-match first: exact = 1.0, alias-tokens-subset = 0.90 + 0.09 ×
 * alias/header token coverage (so "اسم الام" outranks a lone "اسم" inside
 * "اسم الام الكامل"), substring scaled by coverage (0.9 × alias/header
 * length, so a short alias inside a long unrelated header falls below
 * threshold), bigram-Dice fallback ≥ 0.66.
 * Separators (_, -, /, …) are unified to spaces before matching so headers
 * like "الاسم_الثلاثي" hit their exact alias. Ties keep catalog order —
 * stable. Returns `null` below 0.58.
 */
export function suggestStandardField(header: string): StandardFieldKey | null {
  const normalized = normalizeStored(unifySeparators(header));
  if (!normalized) return null;
  let best: { key: StandardFieldKey; score: number } | null = null;
  for (const key of STANDARD_FIELD_KEYS) {
    for (const alias of ALIASES[key]) {
      const candidate = normalizeStored(unifySeparators(alias));
      if (!candidate) continue;
      let score: number;
      if (normalized === candidate) score = 1;
      else {
        const coverage = tokenCoverage(candidate, normalized);
        if (coverage !== null) score = 0.9 + 0.09 * coverage;
        else if (normalized.includes(candidate) || candidate.includes(normalized))
          score = 0.9 * Math.min(1, candidate.length / normalized.length);
        else {
          const similarity = dice(normalized, candidate);
          if (similarity < 0.66) continue;
          score = similarity;
        }
      }
      if (!best || score > best.score) best = { key, score };
    }
  }
  return best && best.score >= 0.58 ? best.key : null;
}

/** Excel-style separators carry no meaning: unify to spaces. */
function unifySeparators(value: string): string {
  return value.replace(/[_\-–—/\\|:;.,،()[\]{}"'«»!?…]+/g, " ");
}

function tokensEqual(left: string, right: string): boolean {
  return left === right || stripDefiniteArticle(left) === stripDefiniteArticle(right);
}

/**
 * Alias-token coverage of the header (0..1) when every alias token has a
 * header token (exact hit weighs 1, ال-stripped hit weighs 0.5);
 * otherwise null.
 */
function tokenCoverage(candidate: string, normalized: string): number | null {
  const aliasTokens = candidate.split(" ").filter(Boolean);
  if (aliasTokens.length === 0) return null;
  const headerTokens = normalized.split(" ").filter(Boolean);
  if (headerTokens.length === 0) return null;
  let weight = 0;
  for (const token of aliasTokens) {
    if (headerTokens.some((header) => header === token)) weight += 1;
    else if (headerTokens.some((header) => tokensEqual(token, header))) weight += 0.5;
    else return null;
  }
  return weight / headerTokens.length;
}

export function ensureUniqueStandardFields<
  T extends { standardField: StandardFieldKey | null; columnIndex?: number },
>(columns: readonly T[], nationalIdColumnIndex?: number): T[] {
  const usedFields = new Set<StandardFieldKey>();

  return columns.map((input) => {
    const column =
      nationalIdColumnIndex === undefined
        ? input
        : {
            ...input,
            standardField:
              input.columnIndex === nationalIdColumnIndex
                ? ("national_id" as const)
                : input.standardField === "national_id"
                  ? null
                  : input.standardField,
          };
    if (!column.standardField) return column;
    if (usedFields.has(column.standardField)) return { ...column, standardField: null };
    usedFields.add(column.standardField);
    return column;
  });
}
