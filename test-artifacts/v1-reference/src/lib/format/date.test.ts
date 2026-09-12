import { describe, expect, it } from "vitest";
import { formatStoredDate, formatUploadDateTime } from "@/lib/format/date";

describe("date display formatting", () => {
  it("formats Excel Date text and common stored date strings as dd/mm/yyyy", () => {
    expect(formatStoredDate("Wed Aug 04 1999 03:00:00 GMT+0300 (غرينتش+٠٣:٠٠)")).toBe("04/08/1999");
    expect(formatStoredDate("2025-12-31T00:00:00.000Z")).toBe("31/12/2025");
    expect(formatStoredDate("٣١/١٢/٢٠٢٥")).toBe("31/12/2025");
  });

  it("leaves non-date values unchanged", () => {
    expect(formatStoredDate("E2E-2026-A")).toBe("E2E-2026-A");
    expect(formatStoredDate("31/02/2025")).toBe("31/02/2025");
  });

  it("formats upload timestamps with a 12-hour clock", () => {
    expect(formatUploadDateTime(new Date(2025, 11, 31, 11, 45))).toBe("31/12/2025 11:45 AM");
    expect(formatUploadDateTime(new Date(2025, 11, 31, 23, 5))).toBe("31/12/2025 11:05 PM");
  });
});
