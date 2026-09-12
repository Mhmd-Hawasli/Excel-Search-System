// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchFilters } from "@/features/search/search-filters";

const replace = vi.fn();
// Stable identity on purpose: useParamNavigation memoizes setParams on the
// router instance, and a fresh object per render would re-fire its effect.
const router = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function renderFilters(query = "", rawParams = "") {
  return render(
    <SearchFilters
      pathname="/search"
      params={new URLSearchParams(rawParams)}
      groups={[]}
      query={query}
      mode="full"
      field={null}
      groupIds={[]}
      fileIds={[]}
    />,
  );
}

function queryInput() {
  return screen.getByLabelText("عبارة البحث") as HTMLInputElement;
}

describe("SearchFilters query input", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search while typing; searches 2s after stopping", () => {
    renderFilters();
    fireEvent.change(queryInput(), { target: { value: "محمد" } });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/search?q=%D9%85%D8%AD%D9%85%D8%AF", {
      scroll: false,
    });
  });

  it("restarts the 2s idle window on every keystroke", () => {
    renderFilters();
    fireEvent.change(queryInput(), { target: { value: "م" } });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.change(queryInput(), { target: { value: "مح" } });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/search?q=%D9%85%D8%AD", { scroll: false });
  });

  it("never overwrites in-flight typing with a stale server echo", () => {
    const view = renderFilters();
    fireEvent.change(queryInput(), { target: { value: "ا" } });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(replace).toHaveBeenCalledTimes(1);

    // User kept typing while the first navigation was in flight; the late
    // echo (query prop finally catching up to the pushed "ا") must not eat it.
    fireEvent.change(queryInput(), { target: { value: "احمد" } });
    view.rerender(
      <SearchFilters
        pathname="/search"
        params={new URLSearchParams("q=ا")}
        groups={[]}
        query="ا"
        mode="full"
        field={null}
        groupIds={[]}
        fileIds={[]}
      />,
    );
    expect(queryInput().value).toBe("احمد");
    expect(replace).toHaveBeenCalledTimes(1);

    // Once idle, the full draft is pushed.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenLastCalledWith("/search?q=%D8%A7%D8%AD%D9%85%D8%AF", {
      scroll: false,
    });
  });

  it("adopts external URL changes such as back/forward navigation", () => {
    const view = renderFilters();
    view.rerender(
      <SearchFilters
        pathname="/search"
        params={new URLSearchParams("q=قديم")}
        groups={[]}
        query="قديم"
        mode="full"
        field={null}
        groupIds={[]}
        fileIds={[]}
      />,
    );
    expect(queryInput().value).toBe("قديم");
    // Adopted, not re-pushed: no navigation loop.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
