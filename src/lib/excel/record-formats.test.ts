import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import type { UploadConfig } from "@/lib/excel/config";
import { recordInput } from "@/lib/excel/import-worker";

const config: UploadConfig = {
  token: "d57df626-8e31-4a3d-b8b8-d01bb4648d4f",
  groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
  name: "formats.xlsx",
  description: "",
  originalFilename: "formats.xlsx",
  sheetName: "Sheet1",
  sheetIndex: 1,
  totalRows: 1,
  columns: [
    {
      headerRaw: "A",
      headerNormalized: "a",
      columnIndex: 1,
      standardField: null,
      categoryId: null,
    },
    {
      headerRaw: "B",
      headerNormalized: "b",
      columnIndex: 2,
      standardField: null,
      categoryId: null,
    },
  ],
};

describe("recordInput cell formats", () => {
  it("stores per-cell fills and maps font colors to headers", () => {
    const input = recordInput("file-id", 2, { A: "x", B: "y" }, config, {
      fills: { "0": "FFFF0000", "5": "FF00FF00" },
      fonts: { "0": "FF00FF00", "5": "FF0000FF" },
    });
    expect(input.fmtFills).toEqual({ A: "FFFF0000" });
    expect(input.fmtFontColors).toEqual({ A: "FF00FF00" });
  });

  it("stores database nulls when the row carries no colors", () => {
    const plain = recordInput("file-id", 2, { A: "x", B: "y" }, config);
    expect(plain.fmtFills).toBe(Prisma.DbNull);
    expect(plain.fmtFontColors).toBe(Prisma.DbNull);
    const empty = recordInput("file-id", 2, { A: "x", B: "y" }, config, {
      fills: {},
      fonts: {},
    });
    expect(empty.fmtFills).toBe(Prisma.DbNull);
    expect(empty.fmtFontColors).toBe(Prisma.DbNull);
  });
});
