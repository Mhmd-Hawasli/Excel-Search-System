"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildQueryPath, type QueryParamUpdates } from "@/utils/query-params";

/**
 * Drives URL-based list state: applies partial query-param updates through
 * `router.replace` inside a transition, so the current view stays interactive
 * until the server-rendered result is ready. The latest params snapshot is
 * synced via an effect so the returned `setParams` stays referentially stable
 * while always reading the current query.
 */
export function useParamNavigation(pathname: string, current: URLSearchParams) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentRef = useRef(current);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const setParams = useCallback(
    (updates: QueryParamUpdates) => {
      const href = buildQueryPath(pathname, currentRef.current, updates);
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router],
  );

  return { setParams, isPending };
}
