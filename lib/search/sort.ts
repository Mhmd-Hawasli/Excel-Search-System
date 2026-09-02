export const SEARCH_SORT_KEYS = [
  "source",
  "full_name",
  "national_id",
  "mother_name",
  "sham_cash",
  "personal_no",
  "match",
] as const;

export type SearchSortKey = (typeof SEARCH_SORT_KEYS)[number];
export type SearchSortDirection = "asc" | "desc";
