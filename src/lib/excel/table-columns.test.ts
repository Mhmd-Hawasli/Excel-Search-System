import { describe, expect, it } from "vitest";
import { uniqueTableColumnNames } from "./table-columns";

describe("uniqueTableColumnNames", () => {
  it("flattens line breaks so Excel keeps the table", () => {
    expect(uniqueTableColumnNames(["الاسم\nالأول", "هاتف\r\nعمل", "a\tb"])).toEqual([
      "الاسم الأول",
      "هاتف عمل",
      "a b",
    ]);
  });

  it("replaces blank names with positional fallbacks", () => {
    expect(uniqueTableColumnNames(["", "   ", "x"])).toEqual(["عمود 1", "عمود 2", "x"]);
  });

  it("makes repeated names unique the way Excel does", () => {
    expect(uniqueTableColumnNames(["الهاتف", "الهاتف", "الهاتف"])).toEqual([
      "الهاتف",
      "الهاتف (2)",
      "الهاتف (3)",
    ]);
  });

  it("treats names case-insensitively and trims duplicates after flattening", () => {
    expect(uniqueTableColumnNames(["Name", "name", "a\nb", "a b"])).toEqual([
      "Name",
      "name (2)",
      "a b",
      "a b (2)",
    ]);
  });

  it("leaves clean headers untouched", () => {
    expect(uniqueTableColumnNames(["الاسم", "الهاتف"])).toEqual(["الاسم", "الهاتف"]);
  });
});
