/**
 * Pure helpers for URL-driven list state (search, conflicts). Both pages keep
 * their filters in the query string so every view is shareable, server-rendered
 * and prefetched; these helpers are the single place that builds those URLs.
 */

export type QueryParamValue = string | number | null | undefined;
export type QueryParamUpdates = Record<string, QueryParamValue | QueryParamValue[]>;

/**
 * Converts a Next.js typed `searchParams` record into `URLSearchParams`.
 * Repeated keys (e.g. `groupId`) survive as multiple entries.
 */
export function toUrlSearchParams(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}

/**
 * Applies partial updates to a query string. `null` removes a key; arrays
 * expand into repeated keys. When anything other than `page` changes, `page`
 * resets to keep list state consistent (unless updated explicitly).
 */
export function buildQueryString(current: URLSearchParams, updates: QueryParamUpdates): string {
  const next = new URLSearchParams(current);
  let touchesPage = false;
  for (const [key, value] of Object.entries(updates)) {
    if (key !== "page") touchesPage = true;
    next.delete(key);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && item !== undefined && item !== "") next.append(key, String(item));
    }
  }
  if (touchesPage && !Object.hasOwn(updates, "page")) {
    next.delete("page");
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

/** Builds an href for `pathname` with partial param updates applied. */
export function buildQueryPath(pathname: string, current: URLSearchParams, updates: QueryParamUpdates): string {
  return `${pathname}${buildQueryString(current, updates)}`;
}
