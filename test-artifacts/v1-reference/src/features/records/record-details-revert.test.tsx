// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordDetails } from "@/features/records/record-details";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const column = {
  id: "col-1",
  headerRaw: "اسم الأم",
  categoryId: null,
  categoryName: null,
  categoryOrder: null,
  standardField: "mother_name" as const,
  value: "سارة",
};

const editedHeaders = {
  "اسم الأم": {
    count: 1,
    originalValue: "مريم",
    lastValue: "سارة",
    lastAt: new Date().toISOString(),
  },
};

describe("RecordDetails revert", () => {
  it("reverts the last edit after confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        changed: true,
        oldValue: "سارة",
        newValue: "مريم",
        edits: {},
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(
        <RecordDetails recordId="rec-1" columns={[column]} editedHeaders={editedHeaders} canEdit />,
      );
      fireEvent.click(screen.getByRole("button", { name: "تراجع عن آخر تعديل لـ اسم الأم" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith("/api/records/rec-1/edits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileColumnId: "col-1", revert: true }),
      });
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      confirmSpy.mockRestore();
    }
  });

  it("does nothing when the confirmation is dismissed", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(
        <RecordDetails recordId="rec-1" columns={[column]} editedHeaders={editedHeaders} canEdit />,
      );
      fireEvent.click(screen.getByRole("button", { name: "تراجع عن آخر تعديل لـ اسم الأم" }));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      confirmSpy.mockRestore();
    }
  });

  it("hides the revert button without edit permission or edit history", () => {
    const { unmount } = render(
      <RecordDetails
        recordId="rec-1"
        columns={[column]}
        editedHeaders={editedHeaders}
        canEdit={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "تراجع عن آخر تعديل لـ اسم الأم" })).toBeNull();
    unmount();
    render(<RecordDetails recordId="rec-1" columns={[column]} canEdit />);
    expect(screen.queryByRole("button", { name: "تراجع عن آخر تعديل لـ اسم الأم" })).toBeNull();
  });
});
