// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useParamNavigation } from "@/hooks/use-param-navigation";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("useParamNavigation", () => {
  beforeEach(() => replace.mockClear());

  it("navigates to the pathname with partial updates applied", () => {
    const { result } = renderHook(() =>
      useParamNavigation("/search", new URLSearchParams("q=a&page=2")),
    );
    act(() => result.current.setParams({ q: "b" }));
    expect(replace).toHaveBeenCalledWith("/search?q=b", { scroll: false });
  });

  it("reads the latest params snapshot even after the URL changed", () => {
    const { result, rerender } = renderHook(
      ({ params }) => useParamNavigation("/conflicts", params),
      { initialProps: { params: new URLSearchParams("category=invalid") } },
    );
    rerender({ params: new URLSearchParams("category=similar&field=all") });

    act(() => result.current.setParams({ page: 3 }));
    expect(replace).toHaveBeenLastCalledWith("/conflicts?category=similar&field=all&page=3", {
      scroll: false,
    });
  });
});
