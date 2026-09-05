import { describe, expect, it } from "vitest";
import { computeHighlightRanges } from "@/utils/highlight";

describe("computeHighlightRanges", () => {
  it("maps normalized Arabic letters back to the original value", () => {
    // أ/ا fold together in text search; the range must cover the original glyph.
    const ranges = computeHighlightRanges("أحمد", "احمد", "full_name");
    expect(ranges).toEqual([{ start: 0, end: 4 }]);
  });

  it("finds a match inside the value", () => {
    const ranges = computeHighlightRanges("محمد أحمد خالد", "أحمد", "full_name");
    expect(ranges).toEqual([{ start: 5, end: 9 }]);
  });

  it("folds Arabic-Indic digits for numeric fields", () => {
    const ranges = computeHighlightRanges("٠٠١٢٣٤٥٦٧٨٩", "00123456789", "national_id");
    expect(ranges).toEqual([{ start: 0, end: 11 }]);
  });

  it("merges overlapping ranges", () => {
    // Query tokens "أحم" and "حمد" overlap inside "أحمد".
    const ranges = computeHighlightRanges("أحمد", "أحم حمد", "full_name");
    expect(ranges).toEqual([{ start: 0, end: 4 }]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(computeHighlightRanges("ليلى", "خالد", "full_name")).toEqual([]);
    expect(computeHighlightRanges("ليلى", "", "full_name")).toEqual([]);
  });
});
