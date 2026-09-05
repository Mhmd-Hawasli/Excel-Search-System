"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`. Re-renders with the raw value first
 * so inputs stay responsive, then with the settled value for expensive work
 * (URL navigation, queries).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
