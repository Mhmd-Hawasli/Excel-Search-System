import { describe, expect, it } from "vitest";
import { formatNationalId, nationalIdColumns, nationalIdIssue } from "./national-id";

describe("national ID numeric storage, integrity and display", () => {
  it.each([
    ["12345678", 12345678n, "00012345678", "short"],
    ["00012345678", 12345678n, "00012345678", "short"],
    ["123456789", 123456789n, "00123456789", null],
    ["00123456789", 123456789n, "00123456789", null],
    ["1234567890", 1234567890n, "01234567890", null],
    ["12345678901", 12345678901n, "12345678901", null],
    ["123456789012", 123456789012n, "123456789012", "long"],
    ["00000000000", 0n, "00000000000", "short"],
    ["٠٠١٢٣\u00a0٤٥٦\t٧٨٩\n", 123456789n, "00123456789", null],
    ["۰۰۱۲۳\u2009۴۵۶\u202f۷۸۹\ufeff", 123456789n, "00123456789", null],
  ])(
    "normalizes %s without allowing display padding to change validity",
    (raw, numeric, display, issue) => {
      expect(nationalIdColumns(raw)).toEqual({
        sfNationalId: numeric,
        dNationalId: display,
        nationalIdNum: issue === null ? numeric : null,
      });
      expect(formatNationalId(raw)).toBe(display);
      expect(nationalIdIssue(raw)).toBe(issue);
    },
  );

  it.each(["123456789A", "123-456-789", "1.23456789E8", "-123456789"])(
    "does not turn invalid input %s into a valid ID",
    (raw) => {
      expect(nationalIdColumns(raw)).toEqual({
        sfNationalId: null,
        dNationalId: null,
        nationalIdNum: null,
      });
      expect(nationalIdIssue(raw)).toBe("characters");
      expect(formatNationalId(raw)).toBe(raw);
    },
  );

  it("preserves the digits of oversized values without bigint overflow or truncation", () => {
    const raw = "9223372036854775808";
    expect(nationalIdColumns(raw)).toEqual({
      sfNationalId: null,
      dNationalId: raw,
      nationalIdNum: null,
    });
    expect(formatNationalId(raw)).toBe(raw);
    expect(nationalIdIssue(raw)).toBe("long");
    expect(nationalIdColumns("9223372036854775807").sfNationalId).toBe(9223372036854775807n);
  });

  it.each([null, undefined, "", "\t\u00a0\ufeff"])("keeps a missing value missing", (raw) => {
    expect(nationalIdColumns(raw)).toEqual({
      sfNationalId: null,
      dNationalId: null,
      nationalIdNum: null,
    });
    expect(formatNationalId(raw)).toBe("");
    expect(nationalIdIssue(raw)).toBe("missing");
  });
});
