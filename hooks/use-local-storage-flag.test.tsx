// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorageFlag } from "@/hooks/use-local-storage-flag";

describe("useLocalStorageFlag", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to false and persists updates", () => {
    const { result } = renderHook(() => useLocalStorageFlag("test-flag"));
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem("test-flag")).toBe("true");

    act(() => result.current[1](false));
    expect(window.localStorage.getItem("test-flag")).toBe("false");
  });

  it("reads an existing persisted value", () => {
    window.localStorage.setItem("test-flag", "true");
    const { result } = renderHook(() => useLocalStorageFlag("test-flag"));
    expect(result.current[0]).toBe(true);
  });

  it("keeps two hooks on the same key in sync", () => {
    const first = renderHook(() => useLocalStorageFlag("sync-flag"));
    const second = renderHook(() => useLocalStorageFlag("sync-flag"));
    act(() => first.result.current[1](true));
    expect(second.result.current[0]).toBe(true);
  });

  it("survives unavailable storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const { result } = renderHook(() => useLocalStorageFlag("broken-flag"));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(false);
    vi.mocked(Storage.prototype.setItem).mockRestore();
  });
});
