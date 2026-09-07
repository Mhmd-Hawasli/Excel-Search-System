import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  extractWorkbookFormats,
  sidecarRowFormats,
  sidecarTableRange,
  type FormatSidecar,
} from "./workbook";

function styledWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet("first");
  first.getCell("A1").value = "h1";
  first.getCell("B1").value = "h2";
  first.getCell("A2").value = "a";
  first.getCell("B2").value = "b";
  first.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF0000" },
  };
  first.getCell("B2").font = { color: { argb: "FF00FF00" } };
  first.getCell("A3").value = "plain";
  const second = workbook.addWorksheet("second");
  second.getCell("A1").value = "h";
  second.getCell("A2").value = "x";
  second.getCell("A2").font = { color: { theme: 4 } };
  return workbook;
}

describe("extractWorkbookFormats", () => {
  it("captures styled rows of every sheet and skips plain rows", () => {
    const extracted = extractWorkbookFormats(styledWorkbook());
    expect(extracted.order).toEqual(["first", "second"]);
    expect(extracted.sheets.first).toEqual({
      "2": { fills: { "0": "FFFF0000" }, fonts: { "1": "FF00FF00" } },
    });
    expect(extracted.sheets.second).toEqual({ "2": { fills: {}, fonts: { "0": "FF5B9BD5" } } });
  });
});

describe("sidecarRowFormats", () => {
  const sidecar: FormatSidecar = {
    version: 1,
    order: ["first", "second"],
    sheets: {
      first: { "2": { fills: { "0": "FFFF0000" }, fonts: { "1": "FF00FF00" } } },
      second: {},
    },
    tables: {
      first: { headerRow: 3, firstRow: 4, lastRow: 6, firstCol: 2, lastCol: 3 },
      second: null,
    },
  };

  it("resolves by sheet name", () => {
    expect(sidecarRowFormats(sidecar, "first", 9, 2)).toEqual({
      fills: { "0": "FFFF0000" },
      fonts: { "1": "FF00FF00" },
    });
  });

  it("falls back to the sheet index when the name is unknown", () => {
    expect(sidecarRowFormats(sidecar, "renamed", 2, 2)).toBeNull();
    expect(sidecarRowFormats(sidecar, undefined, 1, 2)?.fills).toEqual({ "0": "FFFF0000" });
  });

  it("returns null for missing sidecars, sheets and rows", () => {
    expect(sidecarRowFormats(null, "first", 1, 2)).toBeNull();
    expect(sidecarRowFormats(sidecar, "first", 1, 99)).toBeNull();
    expect(sidecarRowFormats(sidecar, "first", 1, 3)).toBeNull();
  });
});

describe("sidecarTableRange", () => {
  const sidecar: FormatSidecar = {
    version: 1,
    order: ["first", "second"],
    sheets: { first: {}, second: {} },
    tables: {
      first: { headerRow: 3, firstRow: 4, lastRow: 6, firstCol: 2, lastCol: 3 },
      second: null,
    },
  };

  it("resolves by sheet name, then by index", () => {
    expect(sidecarTableRange(sidecar, "first", 9)).toEqual({
      headerRow: 3,
      firstRow: 4,
      lastRow: 6,
      firstCol: 2,
      lastCol: 3,
    });
    expect(sidecarTableRange(sidecar, "second", 9)).toBeNull();
    expect(sidecarTableRange(sidecar, undefined, 1)?.headerRow).toBe(3);
  });

  it("returns null for missing sidecars and unknown sheets", () => {
    expect(sidecarTableRange(null, "first", 1)).toBeNull();
    expect(sidecarTableRange(sidecar, "missing", 9)).toBeNull();
  });
});
