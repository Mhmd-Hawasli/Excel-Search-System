import { describe, expect, it } from "vitest";
import {
  applyRules,
  canonicalNumeric,
  firstWord,
  mergeStatus,
  relinkUnmatched,
  runMerge,
} from "@/lib/merge/rules";
import type { MergeMapping, MergeRuleKey, MergeRow, MergeTableInput } from "@/lib/merge/types";

const HEADERS = [
  "الاسم الثلاثي",
  "الاسم",
  "اسم الأب",
  "النسبة",
  "اسم الأم",
  "الرقم الوطني",
  "الرقم الذاتي",
  "الشام كاش",
  "رقم الهاتف",
];
const FULL_MAPPING: MergeMapping = {
  fullName: 0,
  firstName: 1,
  fatherName: 2,
  lastName: 3,
  motherName: 4,
  nationalId: 5,
  personalNo: 6,
  shamCash: 7,
  phone: 8,
};

function values(partial: Partial<Record<MergeField, string>>): string[] {
  const cells = Array.from({ length: HEADERS.length }, () => "");
  for (const [field, value] of Object.entries(partial)) {
    const index = (FULL_MAPPING as Record<string, number>)[field];
    cells[index] = value ?? "";
  }
  return cells;
}

type MergeField = keyof typeof FULL_MAPPING;

function row(rowNumber: number, partial: Partial<Record<MergeField, string>>) {
  return { rowNumber, cells: values(partial) };
}

function table(
  rows: Array<{ rowNumber: number; cells: string[] }>,
  mapping: MergeMapping = FULL_MAPPING,
): MergeTableInput {
  return { headers: HEADERS, rows, mapping };
}

function linkedRows(rows: MergeRow[]) {
  return rows
    .filter((r) => r.key !== null)
    .map((r) => ({ rowNumber: r.rowNumber, key: r.key, rule: r.rule, confirmed: r.confirmed }));
}

function rulePairs(result: ReturnType<typeof runMerge>, key: MergeRuleKey) {
  return result.rules.find((rule) => rule.key === key)!.pairs;
}

describe("canonical helpers", () => {
  it("normalizes numbers: Arabic digits, spaces and leading zeros", () => {
    expect(canonicalNumeric("٠٠١٢٣٤٥٦")).toBe("123456");
    expect(canonicalNumeric("00123456")).toBe("123456");
    expect(canonicalNumeric("0937 000 000")).toBe("937000000");
    expect(canonicalNumeric("12a3")).toBe("123");
    expect(canonicalNumeric("")).toBe("");
  });

  it("keeps only the first word for confirmation", () => {
    // Normalization (تاء مربوطة -> هاء) applies to the confirmation value too.
    expect(firstWord("فاطمة محمد علي")).toBe("فاطمه");
    expect(firstWord("فاطمة شيخ")).toBe("فاطمه");
    expect(firstWord("فاطمة محمد علي")).toBe(firstWord("فاطمه شيخ احمد"));
    expect(firstWord("  ")).toBe("");
  });
});

describe("rule 1: full name + mother name", () => {
  it("links identical normalized full names and confirms by the mother", () => {
    const result = runMerge(
      table([row(2, { fullName: "محمد أحمد على", motherName: "فاطمة محمد" })]),
      table([row(2, { fullName: "محمد أحمد علي", motherName: "فاطمة شيخ" })]),
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      rule: "full_name",
      leftRowNumber: 2,
      rightRowNumber: 2,
      confirmed: true,
    });
    expect(result.status).toMatchObject({
      state: "complete",
      matchedPairs: 1,
      total: 1,
      percent: 100,
    });
  });

  it("does not link when the mother names differ", () => {
    const result = runMerge(
      table([row(2, { fullName: "محمد أحمد على", motherName: "فاطمة" })]),
      table([row(2, { fullName: "محمد احمد علي", motherName: "سليمة" })]),
    );
    expect(result.pairs).toHaveLength(0);
    expect(result.status.state).toBe("partial");
  });

  it("uses the mother first word only, so compound mothers still confirm", () => {
    const result = runMerge(
      table([row(2, { fullName: "خالد سعيد", motherName: "أم فاطمة" })]),
      table([row(2, { fullName: "خالد سعيد", motherName: "ام فاطمة احمد" })]),
    );
    expect(result.pairs[0].confirmed).toBe(true);
  });

  it("disambiguates a repeated full name via different mothers", () => {
    const result = runMerge(
      table([row(2, { fullName: "خالد سعيد", motherName: "فاطمة" })]),
      table([
        row(2, { fullName: "خالد سعيد", motherName: "فاطمة" }),
        row(3, { fullName: "خالد سعيد", motherName: "سليمة" }),
      ]),
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].rightRowNumber).toBe(2);
    expect(linkedRows(result.right)).toEqual([
      { rowNumber: 2, key: "0001", rule: "full_name", confirmed: true },
    ]);
  });

  it("skips the rule when the full name repeats with the same mother in a file", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "خالد سعيد", motherName: "فاطمة", nationalId: "111" }),
        row(3, { fullName: "خالد سعيد", motherName: "فاطمة", nationalId: "222" }),
      ]),
      table([
        row(2, { fullName: "خالد سعيد", motherName: "فاطمة", nationalId: "111" }),
        row(3, { fullName: "خالد سعيد", motherName: "فاطمة", nationalId: "222" }),
      ]),
    );
    expect(rulePairs(result, "full_name")).toHaveLength(0);
    // The later numeric rule still links them.
    expect(rulePairs(result, "national_id")).toHaveLength(2);
  });

  it("links without confirmation and flags the pair when the mother column is absent", () => {
    const mapping: MergeMapping = { fullName: 0, nationalId: 5 };
    const result = runMerge(
      table([row(2, { fullName: "خالد سعيد", nationalId: "111" })], mapping),
      table([row(2, { fullName: "خالد سعيد", nationalId: "111" })], mapping),
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].confirmed).toBe(false);
  });
});

describe("rule 2: composed name", () => {
  it("links a parts-only table against the other table's full name", () => {
    const mappingLeft: MergeMapping = { fatherName: 2, motherName: 4, nationalId: 5 };
    const result = runMerge(
      table([row(2, { fatherName: "محمد", motherName: "فاطمة", nationalId: "111" })], mappingLeft),
      table([row(2, { fullName: "محمد", motherName: "فاطمة", nationalId: "111" })]),
    );
    expect(rulePairs(result, "full_name")).toHaveLength(0);
    expect(rulePairs(result, "composed_name")).toHaveLength(1);
  });

  it("links composed names from both sides, fixing spelling differences", () => {
    const mappingLeft: MergeMapping = { firstName: 1, fatherName: 2, lastName: 3, motherName: 4 };
    const mappingRight: MergeMapping = { firstName: 1, fatherName: 2, lastName: 3, motherName: 4 };
    const result = runMerge(
      table(
        [row(2, { firstName: "احمد", fatherName: "خالد", lastName: "حسن", motherName: "فاطمة" })],
        mappingLeft,
      ),
      table(
        [row(2, { firstName: "أحمد", fatherName: "خالد", lastName: "حسن", motherName: "فاطمة" })],
        mappingRight,
      ),
    );
    expect(rulePairs(result, "composed_name")).toHaveLength(1);
  });

  it("applies only to rows that rule 1 left unmatched", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "محمد علي عمر", motherName: "فاطمة", nationalId: "1" }),
        row(3, {
          fullName: "سامي نوور خالد",
          motherName: "سليمة",
          nationalId: "2",
          firstName: "سامي",
          fatherName: "نور",
          lastName: "خالد",
        }),
      ]),
      table([
        row(2, { fullName: "محمد علي عمر", motherName: "فاطمة", nationalId: "1" }),
        row(3, {
          fullName: "سامي نور خالد",
          motherName: "سليمه",
          nationalId: "2",
          firstName: "سامي",
          fatherName: "نور",
          lastName: "خالد",
        }),
      ]),
    );
    expect(rulePairs(result, "full_name")).toHaveLength(1);
    expect(rulePairs(result, "composed_name")).toHaveLength(1);
    expect(rulePairs(result, "composed_name")[0].leftRowNumber).toBe(3);
  });
});

describe("numeric rules", () => {
  it("links by national ID after digit conversion and confirms by the first name word", () => {
    const result = runMerge(
      table([row(2, { fullName: "علي حسن", nationalId: "٠٠١٢٣٤٥٦٧٨٩" })]),
      table([row(2, { fullName: "علي حسن عباس", nationalId: "123456789" })]),
    );
    expect(rulePairs(result, "national_id")).toHaveLength(1);
    expect(result.pairs[0].confirmed).toBe(true);
  });

  it("links by personal number, sham cash and phone", () => {
    const keys: Array<{ field: MergeField; left: string; right: string; rule: MergeRuleKey }> = [
      { field: "personalNo", left: "١٢٣", right: "123", rule: "personal_no" },
      { field: "shamCash", left: "0000000000000001", right: "1", rule: "sham_cash" },
      { field: "phone", left: "٠٩٣٧٠٠٠٠٠٠٠", right: "09370000000", rule: "phone" },
    ];
    for (const { field, left, right, rule } of keys) {
      // Different full names (same first word) keep rule 1 out of the way.
      const result = runMerge(
        table([row(2, { fullName: "علي حسن", [field]: left })]),
        table([row(3, { fullName: "علي عباس", [field]: right })]),
      );
      expect(rulePairs(result, rule)).toHaveLength(1);
      expect(rulePairs(result, "full_name")).toHaveLength(0);
    }
  });

  it("refuses a numeric link when the full-name confirmation differs", () => {
    const result = runMerge(
      table([row(2, { fullName: "علي حسن", nationalId: "123" })]),
      table([row(2, { fullName: "حسن علي", nationalId: "123" })]),
    );
    expect(rulePairs(result, "national_id")).toHaveLength(0);
  });

  it("rejects a rule when its number repeats inside the same file", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "علي حسن", nationalId: "123", personalNo: "5" }),
        row(3, { fullName: "علي حسن", nationalId: "123", personalNo: "6" }),
      ]),
      table([
        row(2, { fullName: "علي حسن", nationalId: "123", personalNo: "5" }),
        row(3, { fullName: "علي حسن", nationalId: "123", personalNo: "6" }),
      ]),
    );
    expect(rulePairs(result, "national_id")).toHaveLength(0);
    expect(rulePairs(result, "personal_no")).toHaveLength(2);
  });
});

describe("cascade and status", () => {
  it("keeps rule order: rule 1 wins over rule 2", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "محمد علي", motherName: "فاطمة", firstName: "محمد", fatherName: "علي" }),
      ]),
      table([
        row(2, { fullName: "محمد علي", motherName: "فاطمة", firstName: "محمد", fatherName: "علي" }),
      ]),
    );
    expect(result.pairs[0].rule).toBe("full_name");
  });

  it("reports complete when all rows of one table are linked", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "أ", motherName: "م" }),
        row(3, { fullName: "ب", motherName: "م" }),
        row(4, { fullName: "ج", motherName: "م" }),
      ]),
      table([row(2, { fullName: "أ", motherName: "م" })]),
    );
    expect(result.status).toMatchObject({
      state: "complete",
      matchedPairs: 1,
      total: 1,
      percent: 100,
    });
  });

  it("reports partial with percentage and found/total counts", () => {
    const result = runMerge(
      table([
        row(2, { fullName: "أ", motherName: "م" }),
        row(3, { fullName: "ب", motherName: "م" }),
        row(4, { fullName: "ج", motherName: "م" }),
        row(5, { fullName: "د", motherName: "م" }),
      ]),
      table([
        row(2, { fullName: "أ", motherName: "م" }),
        row(3, { fullName: "ز", motherName: "م" }),
      ]),
    );
    expect(result.status).toMatchObject({
      state: "partial",
      matchedPairs: 1,
      total: 2,
      percent: 50,
    });
  });

  it("uses min(rows) as the maximum possible pairs", () => {
    expect(mergeStatus(4, 2, 1)).toMatchObject({ total: 2, percent: 50 });
    expect(mergeStatus(2, 4, 1)).toMatchObject({ total: 2, percent: 50 });
    expect(mergeStatus(200, 150, 120)).toMatchObject({ total: 150, percent: 80 });
  });
});

describe("availability", () => {
  it("reports unavailable rules with a reason when columns are missing", () => {
    const mapping: MergeMapping = { firstName: 1, fatherName: 2, motherName: 4 };
    const result = runMerge(
      table([row(2, { firstName: "محمد", fatherName: "علي" })], mapping),
      table([row(2, { firstName: "محمد", fatherName: "علي" })], mapping),
    );
    const fullNameRule = result.rules.find((rule) => rule.key === "full_name")!;
    expect(fullNameRule.available).toBe(false);
    expect(fullNameRule.reason).toContain("الاسم الثلاثي");
    const composed = result.rules.find((rule) => rule.key === "composed_name")!;
    expect(composed.available).toBe(true);
  });

  it("marks numeric rules unavailable when the column is missing", () => {
    const mapping: MergeMapping = { fullName: 0, motherName: 4, phone: 8 };
    const result = runMerge(
      table([row(2, { fullName: "محمد", phone: "0937" })], mapping),
      table([row(2, { fullName: "محمد", phone: "0937" })], mapping),
    );
    expect(result.rules.find((rule) => rule.key === "national_id")!.available).toBe(false);
    expect(result.rules.find((rule) => rule.key === "phone")!.available).toBe(true);
  });
});

describe("delete key and re-link", () => {
  it("clears both sides, preserves other keys and re-links via a later rule", () => {
    const left = [
      row(2, { fullName: "محمد علي", motherName: "فاطمة", nationalId: "10" }),
      row(3, { fullName: "سامي نور", motherName: "سلمى", nationalId: "20" }),
    ];
    const right = [
      row(2, { fullName: "محمد علي", motherName: "فاطمة", nationalId: "10" }),
      row(3, { fullName: "سامي نور", motherName: "سلمى", nationalId: "20" }),
    ];
    const first = runMerge(table(left), table(right));

    // Break the rule-1 link and change the names so the rule-1 pair can no
    // longer match; the national ID then re-links those two rows.
    const pair = first.pairs.find((entry) => entry.rule === "full_name")!;
    const leftRow = first.left.find((r) => r.rowNumber === pair.leftRowNumber)!;
    const rightRow = first.right.find((r) => r.rowNumber === pair.rightRowNumber)!;
    leftRow.key = null;
    leftRow.rule = null;
    rightRow.key = null;
    rightRow.rule = null;
    rightRow.cells[0] = "محمد حسن";

    const relinked = relinkUnmatched(first.left, first.right, FULL_MAPPING, FULL_MAPPING, 3);
    const reLinked = relinked.pairs.find((entry) => entry.leftRowNumber === leftRow.rowNumber)!;
    expect(reLinked?.rule).toBe("national_id");
    expect(reLinked?.key).toBe("0003");
    expect(relinked.pairs.find((entry) => entry.rule === "full_name")?.key).toBe("0002");
    expect(relinked.pairs).toHaveLength(2);
    expect(relinked.status.matchedPairs).toBe(2);
  });

  it("keeps generation counters unique after re-link", () => {
    const first = runMerge(
      table([
        row(2, { fullName: "أ", motherName: "م" }),
        row(3, { fullName: "ب", motherName: "م" }),
      ]),
      table([
        row(2, { fullName: "أ", motherName: "م" }),
        row(3, { fullName: "ب", motherName: "م" }),
      ]),
    );
    const rowA = first.left[0];
    const rowB = first.right[0];
    rowA.key = null;
    rowA.rule = null;
    rowB.key = null;
    rowB.rule = null;
    const relinked = relinkUnmatched(first.left, first.right, FULL_MAPPING, FULL_MAPPING, 3);
    const keys = relinked.pairs.map((pair) => pair.key);
    expect(keys).toContain("0002");
    expect(keys).toContain("0003");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("applyRules", () => {
  it("skips rows that already carry a key", () => {
    const leftRow: MergeRow = {
      rowNumber: 2,
      cells: values({ fullName: "محمد" }),
      key: "0001",
      rule: "full_name",
      confirmed: true,
    };
    const rightRow: MergeRow = {
      rowNumber: 2,
      cells: values({ fullName: "محمد" }),
      key: null,
      rule: null,
      confirmed: false,
    };
    const { pairs } = applyRules([leftRow], [rightRow], FULL_MAPPING, FULL_MAPPING, 2);
    expect(pairs).toHaveLength(0);
  });
});
