import { describe, expect, it } from "vitest";
import {
  CONFLICT_CATEGORIES,
  CONFLICT_FIELDS,
  CONFLICT_RULES,
  type ConflictCategory,
  type ConflictPairSide,
} from "./catalog";

describe("conflict catalog integrity", () => {
  it("has unique keys and non-empty labels", () => {
    const keys = CONFLICT_RULES.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const rule of CONFLICT_RULES) {
      expect(rule.label.trim().length).toBeGreaterThan(0);
      expect(
        (CONFLICT_CATEGORIES as readonly { key: string }[]).some(
          (category) => category.key === rule.category,
        ),
        rule.key,
      ).toBe(true);
      expect(Object.hasOwn(CONFLICT_FIELDS, rule.field), rule.key).toBe(true);
    }
  });

  it("declares valid directed pairs", () => {
    const paired = CONFLICT_RULES.filter(
      (
        rule,
      ): rule is typeof rule & { pair: { from: ConflictPairSide; to: ConflictPairSide } } =>
        "pair" in rule,
    );
    expect(paired.length).toBe(22);
    for (const rule of paired) {
      expect(rule.pair!.from, rule.key).not.toBe(rule.pair!.to);
      // The filter field is always the "to" side (what differs).
      expect(rule.field, rule.key).toBe(rule.pair!.to);
    }
    // Every ordered pair of distinct sides exists exactly once.
    const sides = ["national_id", "person", "personal_no", "sham_cash", "contract_pair", "phone"];
    const combos = new Set(paired.map((rule) => `${rule.pair!.from}>${rule.pair!.to}`));
    expect(combos.size).toBe(22);
    // Legacy rules already cover X→person and person→{national,sham,personal}.
    const legacyCovered = new Set([
      "national_id>person",
      "sham_cash>person",
      "personal_no>person",
      "contract_pair>person",
      "phone>person",
      "person>national_id",
      "person>sham_cash",
      "person>personal_no",
    ]);
    for (const from of sides) {
      for (const to of sides) {
        if (from === to || legacyCovered.has(`${from}>${to}`)) continue;
        expect(combos.has(`${from}>${to}`), `${from}>${to}`).toBe(true);
      }
    }
  });

  it("keeps every category and the new fields filterable", () => {
    const categories = new Set<ConflictCategory>(CONFLICT_RULES.map((rule) => rule.category));
    expect(categories).toEqual(new Set(["invalid", "missing", "similar", "conflicting"]));
    expect(Object.hasOwn(CONFLICT_FIELDS, "phone")).toBe(true);
    expect(Object.hasOwn(CONFLICT_FIELDS, "contract_pair")).toBe(true);
  });
});
