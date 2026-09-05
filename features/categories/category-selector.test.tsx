import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategorySelector } from "@/features/categories/category-selector";
import { MAX_TOTAL_CATEGORIES } from "@/lib/categories/config";

describe("CategorySelector", () => {
  it("renders Other plus seven categories as responsive theme buttons", () => {
    const categories = Array.from({ length: MAX_TOTAL_CATEGORIES - 1 }, (_, index) => ({ id: `category-${index + 1}`, name: `فئة ${index + 1}` }));
    const html = renderToStaticMarkup(<CategorySelector categories={categories} value={null} onChange={() => undefined} label="فئة العمود" />);

    expect(html.match(/role="radio"/g)).toHaveLength(MAX_TOTAL_CATEGORIES);
    expect(html).toContain("grid-cols-4");
    expect(html).toContain("xl:flex");
    expect(html).toMatch(/aria-checked="true"[^>]*><span[^>]*>أخرى<\/span>/);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(MAX_TOTAL_CATEGORIES - 1);
  });
});
