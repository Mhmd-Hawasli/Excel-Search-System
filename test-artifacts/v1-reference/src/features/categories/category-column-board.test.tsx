import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The board renders MutationForm, whose shared action hook reads the
// App Router; stub navigation since this test renders outside Next.js.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

import { CategoryColumnBoard } from "@/features/categories/category-column-board";

describe("CategoryColumnBoard", () => {
  it("merges standard-field columns into one draggable item without exposing system weights", () => {
    const html = renderToStaticMarkup(
      <CategoryColumnBoard
        categoryId="2254b5b0-065d-4846-ab8a-d5f57f7655ab"
        categoryOptions={[{ id: null, name: "أخرى" }]}
        groups={[
          {
            key: "standard:first_name",
            label: "الاسم",
            standardFieldLabel: "الاسم",
            columns: [
              { id: "column-1", headerRaw: "الاسم", columnIndex: 1, fileName: "الذاتية", groupName: "الموظفون" },
              { id: "column-2", headerRaw: "اسم المستفيد", columnIndex: 2, fileName: "العقود", groupName: "العقود" },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("حقل قياسي موحّد");
    expect(html).toContain("2 عمود");
    expect(html).toContain("وتتحرك معًا كبند واحد");
    expect(html).toContain("اسحب لتغيير ترتيب الاسم");
    expect(html).not.toContain("وزن الترتيب");
  });
});
