// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordVisitLogger } from "@/features/records/record-visit-logger";

describe("RecordVisitLogger", () => {
  it("beacons the visit once on mount", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const view = render(<RecordVisitLogger recordId="rec-1" />);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/records/rec-1/visit", { method: "POST" });
      view.rerender(<RecordVisitLogger recordId="rec-1" />);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
