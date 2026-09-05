import { StandardField } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import {
  PRISMA_STANDARD_FIELDS,
  STANDARD_FIELD_LABELS,
  standardFieldKey,
} from "@/lib/excel/standard-fields";
import { STANDARD_FIELD_KEYS, type StandardFieldKey } from "@/lib/excel/types";

describe("standard-fields Prisma bridge", () => {
  it("maps every catalog key to a distinct Prisma enum member", () => {
    const values = Object.values(PRISMA_STANDARD_FIELDS);
    expect(values).toHaveLength(STANDARD_FIELD_KEYS.length);
    expect(new Set(values).size).toBe(STANDARD_FIELD_KEYS.length);
    for (const value of values) expect(Object.values(StandardField)).toContain(value);
  });

  it("round-trips enum members back to catalog keys", () => {
    for (const key of STANDARD_FIELD_KEYS) {
      expect(standardFieldKey(PRISMA_STANDARD_FIELDS[key])).toBe(key);
    }
  });

  it("returns null for unknown enum members", () => {
    expect(standardFieldKey("NOT_A_FIELD" as StandardField)).toBeNull();
  });

  it("provides an Arabic label for every key", () => {
    for (const key of STANDARD_FIELD_KEYS) {
      expect(STANDARD_FIELD_LABELS[key as StandardFieldKey]).toBeTruthy();
    }
  });
});
