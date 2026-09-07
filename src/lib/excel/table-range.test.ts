import { describe, expect, it } from "vitest";
import {
  parseTableRef,
  tableDataRowCount,
  tableColumnCount,
  tableRangeForSheet,
  tableRowValues,
} from "./table-range";

describe("parseTableRef", () => {
  it.each([
    ["A1:D10", { firstRow: 1, lastRow: 10, firstCol: 1, lastCol: 4 }],
    ["B2:D20", { firstRow: 2, lastRow: 20, firstCol: 2, lastCol: 4 }],
    ["$B$2:$D$20", { firstRow: 2, lastRow: 20, firstCol: 2, lastCol: 4 }],
    ["AA10:AB12", { firstRow: 10, lastRow: 12, firstCol: 27, lastCol: 28 }],
  ])("parses %s", (ref, expected) => {
    expect(parseTableRef(ref)).toEqual(expected);
  });

  it.each([[""], ["A1"], ["A0:B2"], ["B5:A1"], ["1A:B2"], [null], [undefined], [42]])(
    "rejects %s",
    (ref) => {
      expect(parseTableRef(ref)).toBeNull();
    },
  );
});

describe("tableRangeForSheet", () => {
  it("returns null without tables", () => {
    expect(tableRangeForSheet({ getTables: () => [] })).toBeNull();
    expect(tableRangeForSheet({})).toBeNull();
  });

  it("resolves the first table and excludes the totals row", () => {
    // Runtime shape observed from ExcelJS: entries wrap the model.
    const sheet = {
      getTables: () => [
        { table: { tableRef: "B2:D21", headerRow: true, totalsRow: true } },
        { table: { tableRef: "F2:G10" } },
      ],
    };
    expect(tableRangeForSheet(sheet)).toEqual({
      headerRow: 2,
      firstRow: 3,
      lastRow: 20,
      firstCol: 2,
      lastCol: 4,
    });
  });

  it("keeps the full range without a totals row", () => {
    expect(tableRangeForSheet({ getTables: () => [{ table: { tableRef: "A1:C5" } }] })).toEqual({
      headerRow: 1,
      firstRow: 2,
      lastRow: 5,
      firstCol: 1,
      lastCol: 3,
    });
  });

  it("rejects header-only totals tables and invalid refs", () => {
    expect(
      tableRangeForSheet({ getTables: () => [{ table: { tableRef: "A1:C1", totalsRow: true } }] }),
    ).toBeNull();
    expect(tableRangeForSheet({ getTables: () => [{ table: { tableRef: "nope" } }] })).toBeNull();
  });
});

describe("table helpers", () => {
  const table = { headerRow: 2, firstRow: 3, lastRow: 20, firstCol: 2, lastCol: 4 };

  it("counts rows and columns", () => {
    expect(tableDataRowCount(table)).toBe(18);
    expect(tableColumnCount(table)).toBe(3);
    expect(tableDataRowCount({ ...table, lastRow: 2 })).toBe(0);
  });

  it("reads one row sliced to the table columns", () => {
    const row = { getCell: (index: number) => `c${index}` };
    expect(tableRowValues(row, table, String)).toEqual(["c2", "c3", "c4"]);
  });
});
