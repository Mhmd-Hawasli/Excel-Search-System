import { digitsOnly, normalizeStored } from "@/lib/normalization/arabic";
import {
  MERGE_RULES,
  type MatchPair,
  type MergeMapping,
  type MergeResult,
  type MergeRow,
  type MergeRuleKey,
  type MergeStatus,
  type MergeTableInput,
  type RuleStat,
} from "@/lib/merge/types";

/**
 * Pure merge rule engine. Inputs are plain arrays; the engine touches no
 * database, no files and no session state, which keeps it fully unit-testable.
 *
 * Rule cascade:
 *  1. full_name      — link by normalized full name, confirm by mother name.
 *  2. composed_name  — links rows left unmatched by rule 1: the composed name
 *                      (first + father + last) of one side against the other
 *                      side's full name, or its composed name when the other
 *                      side's full name is also unavailable; confirm by the
 *                      mother name.
 *  3..6. national_id / personal_no / sham_cash / phone — link by the
 *        normalized digit value; confirm by the first word of the full name.
 *
 * General behavior:
 *  - Text comparison uses the system normalization (normalizeStored).
 *  - Identifier comparison converts Arabic digits to Latin and keeps only
 *    digits (leading zeros are ignored).
 *  - Confirmation compares only the FIRST WORD of the confirmation value.
 *  - Numeric rules confirm by the first word of the triple full name, falling
 *    back to the first word of the الاسم column when the triple-name column
 *    is unmapped or the cell is empty.
 *  - Confirmed-only linking: a pair is linked ONLY on an exact confirmation
 *    match. Rows without a usable confirmation stay unlinked, so results and
 *    exports never contain unconfirmed pairs.
 *  - Every rule requires its link value to appear exactly once inside each
 *    file (Excel COUNTIF(column, current cell) = 1): a value repeated
 *    anywhere in the file can never identify a single row, so every row
 *    carrying it is skipped, whatever the confirmation is.
 *  - When a confirmation column/cell is missing the rows stay unlinked
 *    (no key is assigned at all).
 */

type PreparedRow = {
  row: MergeRow;
  full: { key: string; display: string };
  composed: { key: string; display: string };
  numeric: Record<
    "national_id" | "personal_no" | "sham_cash" | "phone",
    { key: string; display: string }
  >;
  motherWord: string;
  fullWord: string;
};

type RuleDefinition = (typeof MERGE_RULES)[number];

export function canonicalText(value: unknown): string {
  return normalizeStored(value);
}

/** Digits only (Arabic digits converted), leading zeros ignored; "" when empty. */
export function canonicalNumeric(value: unknown): string {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

/** First word of the normalized value (the confirmation comparison). */
export function firstWord(value: unknown): string {
  return canonicalText(value).split(/\s+/).filter(Boolean).slice(0, 1).join(" ");
}

function cell(row: MergeRow, index: number | undefined): string {
  if (index === undefined) return "";
  return row.cells[index] ?? "";
}

function trimmed(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function textLink(value: string): { key: string; display: string } {
  const display = trimmed(value);
  return { key: canonicalText(display), display };
}

function numericLink(value: string): { key: string; display: string } {
  const display = trimmed(value);
  return { key: canonicalNumeric(display), display };
}

function preparedRow(row: MergeRow, mapping: MergeMapping): PreparedRow {
  const full = textLink(cell(row, mapping.fullName));
  const first = textLink(cell(row, mapping.firstName));
  const composed = textLink(
    [mapping.firstName, mapping.fatherName, mapping.lastName]
      .map((index) => trimmed(cell(row, index)))
      .filter(Boolean)
      .join(" "),
  );
  // Numeric rules confirm by the first word of the triple name, or by the
  // first word of الاسم when the triple-name column is unmapped/empty.
  const confirmSource = full.key || first.key;
  return {
    row,
    full,
    composed,
    numeric: {
      national_id: numericLink(cell(row, mapping.nationalId)),
      personal_no: numericLink(cell(row, mapping.personalNo)),
      sham_cash: numericLink(cell(row, mapping.shamCash)),
      phone: numericLink(cell(row, mapping.phone)),
    },
    motherWord: firstWord(cell(row, mapping.motherName)),
    fullWord: confirmSource.split(/\s+/).filter(Boolean).slice(0, 1).join(" ") ?? "",
  };
}

function linkFor(rule: RuleDefinition, prepared: PreparedRow) {
  if (rule.key === "full_name") return prepared.full;
  if (rule.key === "composed_name")
    // Composed name (first + father + last) when available, otherwise the
    // full name; this lets rule 2 fix rows whose full names differ in spelling.
    return prepared.composed.key ? prepared.composed : prepared.full;
  return prepared.numeric[rule.key];
}

function confirmFor(rule: RuleDefinition, prepared: PreparedRow): string {
  return rule.key === "full_name" || rule.key === "composed_name"
    ? prepared.motherWord
    : prepared.fullWord;
}

/**
 * Returns the set of link values that appear more than once inside a file
 * (Excel COUNTIF(column, current cell) > 1). A repeated value can never
 * identify a single row, so every row carrying one is skipped by the rule —
 * regardless of the confirmation value.
 */
function ambiguousLinks(rows: PreparedRow[], rule: RuleDefinition): Set<string> {
  const counts = new Map<string, number>();
  for (const prepared of rows) {
    const link = linkFor(rule, prepared);
    if (!link.key) continue;
    counts.set(link.key, (counts.get(link.key) ?? 0) + 1);
  }
  const ambiguous = new Set<string>();
  for (const [key, count] of counts) if (count > 1) ambiguous.add(key);
  return ambiguous;
}

/**
 * Applies the cascade over the given row sets. Rows whose `key` is already set
 * are left untouched, so this function can also be used after a key deletion
 * to re-run the rules only on the still-unlinked rows.
 */
export function applyRules(
  left: MergeRow[],
  right: MergeRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
  startKey: number,
  onRuleDone?: (rule: MergeRuleKey, index: number, total: number) => void,
): { pairs: MatchPair[]; nextKey: number } {
  let counter = startKey;
  const pairs: MatchPair[] = [];
  const preparedLeft = left.map((row) => preparedRow(row, leftMapping));
  const preparedRight = right.map((row) => preparedRow(row, rightMapping));

  MERGE_RULES.forEach((rule, ruleIndex) => {
    const ambiguousLeft = ambiguousLinks(preparedLeft, rule);
    const ambiguousRight = ambiguousLinks(preparedRight, rule);
    // Index the right side by link value (insertion order = sheet order) so
    // each left row looks up its candidates in O(1) instead of scanning the
    // whole table. `row.key` is checked live because rows are linked during
    // this same loop; the resulting choice is identical to a full scan.
    const rightByLink = new Map<string, PreparedRow[]>();
    for (const b of preparedRight) {
      const bLink = linkFor(rule, b);
      if (!bLink.key) continue;
      const bucket = rightByLink.get(bLink.key);
      if (bucket) bucket.push(b);
      else rightByLink.set(bLink.key, [b]);
    }

    for (const a of preparedLeft) {
      if (a.row.key !== null) continue;
      const aLink = linkFor(rule, a);
      if (!aLink.key || ambiguousLeft.has(aLink.key) || ambiguousRight.has(aLink.key)) continue;

      const candidates = (rightByLink.get(aLink.key) ?? []).filter((b) => b.row.key === null);
      if (candidates.length === 0) continue;

      // Confirmation: the left value must match exactly one candidate with
      // the same confirmation; anything else stays unlinked (confirmed-only).
      const aConfirm = confirmFor(rule, a);
      let chosen: PreparedRow | null = null;
      if (aConfirm) {
        const exact = candidates.filter((b) => confirmFor(rule, b) === aConfirm);
        if (exact.length === 1) chosen = exact[0];
        else if (exact.length === 0) {
          const loose = candidates.filter((b) => !confirmFor(rule, b));
          if (loose.length === 1) chosen = loose[0];
        }
      } else if (candidates.length === 1) {
        chosen = candidates[0];
      }
      if (!chosen) continue;

      const confirmed = aConfirm !== "" && confirmFor(rule, chosen) === aConfirm;
      // Confirmed-only linking: unverifiable pairs stay unlinked so neither
      // the results nor the export ever contain "غير مؤكد" values.
      if (!confirmed) continue;
      const key = String(counter).padStart(4, "0");
      counter += 1;
      a.row.key = key;
      a.row.rule = rule.key;
      a.row.confirmed = confirmed;
      chosen.row.key = key;
      chosen.row.rule = rule.key;
      chosen.row.confirmed = confirmed;
      pairs.push({
        key,
        rule: rule.key,
        leftRowNumber: a.row.rowNumber,
        rightRowNumber: chosen.row.rowNumber,
        confirmed,
        leftValue: aLink.display,
        rightValue: linkFor(rule, chosen).display,
      });
    }
    onRuleDone?.(rule.key, ruleIndex, MERGE_RULES.length);
  });
  return { pairs, nextKey: counter };
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    fullName: "الاسم الثلاثي",
    firstName: "الاسم",
    fatherName: "اسم الأب",
    lastName: "النسبة",
    motherName: "اسم الأم",
    nationalId: "الرقم الوطني",
    personalNo: "الرقم الذاتي",
    shamCash: "الشام كاش",
    phone: "رقم الهاتف",
  };
  return labels[field] ?? field;
}

/** A rule is available only when both tables can produce link values for it. */
function availabilityReason(
  rule: RuleDefinition,
  left: PreparedRow[],
  right: PreparedRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
): string | null {
  const missing = (
    mapping: MergeMapping,
    side: "الأول" | "الثاني",
    linkable: boolean,
  ): string | null => {
    if (rule.key === "composed_name") {
      if (
        mapping.fullName === undefined &&
        !["firstName", "fatherName", "lastName"].some((f) => mapping[f as never] !== undefined)
      )
        return `لا يوجد عمود «${fieldLabel("fullName")}» أو أعمدة الاسم واسم الأب والنسبة في الجدول ${side}.`;
    } else if (mapping[rule.required[0]] === undefined) {
      return `لا يوجد عمود «${fieldLabel(rule.required[0])}» في الجدول ${side}.`;
    }
    return linkable ? null : `لا توجد قيم كافية في الجدول ${side} لاستخدام القاعدة.`;
  };

  const leftLinkable = left.some((row) => linkFor(rule, row).key);
  const rightLinkable = right.some((row) => linkFor(rule, row).key);
  return (
    missing(leftMapping, "الأول", leftLinkable) ?? missing(rightMapping, "الثاني", rightLinkable)
  );
}

function ruleStats(
  left: MergeRow[],
  right: MergeRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
): RuleStat[] {
  const preparedLeft = left.map((row) => preparedRow(row, leftMapping));
  const preparedRight = right.map((row) => preparedRow(row, rightMapping));
  return MERGE_RULES.map((rule) => {
    const reason = availabilityReason(rule, preparedLeft, preparedRight, leftMapping, rightMapping);
    return {
      key: rule.key,
      order: rule.order,
      label: rule.label,
      description: rule.description,
      available: reason === null,
      reason,
      matchedPairs: 0,
      pairs: [],
    };
  });
}

function statsWithPairs(stats: RuleStat[], pairs: MatchPair[]): RuleStat[] {
  for (const stat of stats) stat.pairs = pairs.filter((pair) => pair.rule === stat.key);
  for (const stat of stats) stat.matchedPairs = stat.pairs.length;
  return stats;
}

export function mergeStatus(leftCount: number, rightCount: number, pairCount: number): MergeStatus {
  const total = Math.min(leftCount, rightCount);
  const percent = total === 0 ? 0 : Math.round((pairCount / total) * 1000) / 10;
  const complete = total > 0 && pairCount >= total;
  return { state: complete ? "complete" : "partial", matchedPairs: pairCount, total, percent };
}

/**
 * Full merge: turns two raw tables into linked row sets, per-rule statistics
 * and the final status.
 */
export function runMerge(
  left: MergeTableInput,
  right: MergeTableInput,
  startKey = 1,
  onRuleDone?: (rule: MergeRuleKey, index: number, total: number) => void,
): MergeResult {
  const leftRows: MergeRow[] = left.rows.map((row) => ({
    rowNumber: row.rowNumber,
    cells: row.cells,
    key: null,
    rule: null,
    confirmed: false,
  }));
  const rightRows: MergeRow[] = right.rows.map((row) => ({
    rowNumber: row.rowNumber,
    cells: row.cells,
    key: null,
    rule: null,
    confirmed: false,
  }));
  const { pairs } = applyRules(leftRows, rightRows, left.mapping, right.mapping, startKey, onRuleDone);
  return {
    left: leftRows,
    right: rightRows,
    pairs,
    rules: statsWithPairs(ruleStats(leftRows, rightRows, left.mapping, right.mapping), pairs),
    status: mergeStatus(leftRows.length, rightRows.length, pairs.length),
  };
}

/** Rebuilds the pair list from the current row state (existing + new links). */
function currentPairs(
  left: MergeRow[],
  right: MergeRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
): MatchPair[] {
  const preparedRight = right.map((row) => preparedRow(row, rightMapping));
  const rightByKey = new Map<string, PreparedRow>();
  for (const b of preparedRight) if (b.row.key) rightByKey.set(b.row.key, b);

  const pairs: MatchPair[] = [];
  for (const a of left) {
    if (!a.key) continue;
    const b = rightByKey.get(a.key);
    if (!b) continue;
    const rule = MERGE_RULES.find((entry) => entry.key === a.rule);
    if (!rule) continue;
    const aPrepared = preparedRow(a, leftMapping);
    pairs.push({
      key: a.key,
      rule: rule.key,
      leftRowNumber: a.rowNumber,
      rightRowNumber: b.row.rowNumber,
      confirmed: a.confirmed && b.row.confirmed,
      leftValue: linkFor(rule, aPrepared).display,
      rightValue: linkFor(rule, b).display,
    });
  }
  return pairs.sort((x, y) => x.key.localeCompare(y.key, "en", { numeric: true }));
}

/** Summary of the current row state without mutating anything. */
export function summarizeResult(
  left: MergeRow[],
  right: MergeRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
): MergeResult {
  const pairs = currentPairs(left, right, leftMapping, rightMapping);
  return {
    left,
    right,
    pairs,
    rules: statsWithPairs(ruleStats(left, right, leftMapping, rightMapping), pairs),
    status: mergeStatus(left.length, right.length, pairs.length),
  };
}

/** Highest used key number + 1 (continues the key sequence after deletions). */
export function nextKeyAfter(rows: MergeRow[]): number {
  let max = 0;
  for (const row of rows) {
    if (!row.key) continue;
    const number = Number(row.key);
    if (Number.isFinite(number) && number > max) max = number;
  }
  return max + 1;
}

/**
 * Re-link after key deletion: existing keys are preserved and only unlinked
 * rows are considered, so the other results stay exactly as they were.
 */
export function relinkUnmatched(
  left: MergeRow[],
  right: MergeRow[],
  leftMapping: MergeMapping,
  rightMapping: MergeMapping,
  startKey: number,
): MergeResult {
  applyRules(left, right, leftMapping, rightMapping, startKey);
  return summarizeResult(left, right, leftMapping, rightMapping);
}

export type { MergeRuleKey };
