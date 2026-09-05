// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadJobPercent, useUploadJobPolling } from "@/hooks/use-upload-job-polling";
import type { UploadJobDto } from "@/types/upload-job";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: { ...actual.toast, success: vi.fn(), error: vi.fn() } };
});

function job(partial: Partial<UploadJobDto>): UploadJobDto {
  return { id: "job-1", fileId: null, status: "INSERTING", totalRows: 100, processedRows: 0, errorMessage: null, ...partial };
}

describe("useUploadJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("polls until DONE and notifies success exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(job({ processedRows: 50 })))
      .mockResolvedValueOnce(Response.json(job({ status: "DONE", processedRows: 100 })));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useUploadJobPolling({ doneMessage: "تم", failedFallbackMessage: "فشل" }),
    );
    act(() => result.current[1](job({ processedRows: 10 })));

    await act(async () => vi.advanceTimersByTimeAsync(1200));
    await act(async () => vi.advanceTimersByTimeAsync(1200));
    await act(async () => vi.advanceTimersByTimeAsync(1200));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current[0]?.status).toBe("DONE");
    expect(toast.success).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("notifies failure with the job's message and stops polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(job({ status: "FAILED", errorMessage: "خطأ" })));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useUploadJobPolling({ doneMessage: "تم", failedFallbackMessage: "فشل" }),
    );
    act(() => result.current[1](job({})));
    await act(async () => vi.advanceTimersByTimeAsync(1200));
    await act(async () => vi.advanceTimersByTimeAsync(2400));

    expect(toast.error).toHaveBeenCalledWith("خطأ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("computes progress and clamps to 100 when done", () => {
    expect(uploadJobPercent(job({ processedRows: 40 }))).toBe(40);
    expect(uploadJobPercent(job({ status: "DONE" }))).toBe(100);
    expect(uploadJobPercent(job({ totalRows: 0, processedRows: 0 }))).toBe(0);
  });
});
