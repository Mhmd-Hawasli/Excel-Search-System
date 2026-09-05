import { describe, expect, it } from "vitest";
import { formatShamCash, normalizeShamCash, shamCashAsBigInt } from "@/lib/format/sham-cash";

describe("Sham Cash formatting", () => {
  it("accepts exactly 16 Arabic or Latin digits", () => {
    expect(normalizeShamCash("1234 5678 9012 3456")).toBe("1234567890123456");
    expect(normalizeShamCash("١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦")).toBe("1234567890123456");
    expect(normalizeShamCash("123456789012345")).toBeNull();
    expect(normalizeShamCash("12345678901234567")).toBeNull();
  });

  it("stores the normalized value as bigint", () => {
    expect(shamCashAsBigInt("1234 5678 9012 3456")).toBe(1234567890123456n);
  });

  it("formats database values in four groups and restores leading zeroes", () => {
    expect(formatShamCash(1234567890123456n)).toBe("1234 5678 9012 3456");
    expect(formatShamCash(963111222333n)).toBe("0000 9631 1122 2333");
  });
});
