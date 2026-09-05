/**
 * Normalizes a Next.js typed search-param value (`string | string[] |
 * undefined`) into a single optional string. Repeated query keys collapse to
 * their first occurrence, matching common browser behavior.
 */
export function singleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Reads one search param from a typed `searchParams` object and returns its
 * single-string value (or `undefined` when absent/empty).
 */
export function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = singleSearchParam(searchParams[key]);
  return value ? value : undefined;
}
