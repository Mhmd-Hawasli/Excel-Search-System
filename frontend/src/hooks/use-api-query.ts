"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";
import { ApiError } from "@/services/api-client";

interface ApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
): ApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    // Setting loading state here is intentional: the query needs to reflect a
    // fresh in-flight request whenever the request key changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل البيانات.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, refetch };
}
