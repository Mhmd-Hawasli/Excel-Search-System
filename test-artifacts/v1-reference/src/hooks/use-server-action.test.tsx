// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServerAction } from "@/hooks/use-server-action";
import type { MutationResult } from "@/lib/actions/result";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: { ...actual.toast, loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn() } };
});

function makeAction(result: MutationResult, calls: FormData[] = []) {
  return vi.fn(async (formData: FormData) => {
    calls.push(formData);
    return result;
  });
}

describe("useServerAction", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(toast.loading).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("shows success toast, runs onSuccess and navigates when asked", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction());
    const action = makeAction({ ok: true, message: "تم", navigateTo: "/groups/1" });

    act(() => result.current.run(action, new FormData(), { onSuccess }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(toast.success).toHaveBeenCalledWith("تم", { id: "t1" });
    expect(replace).toHaveBeenCalledWith("/groups/1");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports the action error without navigating", async () => {
    const { result } = renderHook(() => useServerAction());
    const action = makeAction({ ok: false, error: "غير مسموح" });

    act(() => result.current.run(action, new FormData()));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("غير مسموح", { id: "t1" }));

    expect(replace).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to a generic error when the action throws", async () => {
    const { result } = renderHook(() => useServerAction());
    const action = vi.fn(async () => {
      throw new Error("network");
    });

    act(() => result.current.run(action, new FormData(), { fallbackError: "فشل" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("فشل", { id: "t1" }));
  });

  it("exposes pending only while the action is in flight", async () => {
    let resolveAction: (result: MutationResult) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<MutationResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const { result } = renderHook(() => useServerAction());

    act(() => result.current.run(action, new FormData()));
    await waitFor(() => expect(result.current.pending).toBe(true));
    await act(async () => resolveAction({ ok: true, message: "تم" }));
    expect(result.current.pending).toBe(false);
  });
});
