"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Same-tab change notifications (cross-tab ones arrive via `storage`). */
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    /* Storage is optional. */
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
    for (const listener of listeners) listener();
  } catch {
    /* Storage is optional. */
  }
}

/**
 * SSR-safe boolean flag persisted in `localStorage`, backed by
 * `useSyncExternalStore` (no effects, stays in sync across tabs).
 */
export function useLocalStorageFlag(key: string): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => readFlag(key), () => false);
  const setValue = useCallback((next: boolean) => writeFlag(key, next), [key]);
  return [value, setValue];
}
