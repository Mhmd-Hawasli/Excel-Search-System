"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => undefined;

/**
 * Hydration-safe "is mounted" flag. Returns `false` during SSR and the
 * hydration render, then `true` on the client — the effect-free replacement
 * for the classic `useEffect(() => setMounted(true), [])` pattern.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
