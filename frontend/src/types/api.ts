export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  message?: string | null;
  data?: T;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ErrorBody {
  error?: string;
}

export type QueryMap = Record<string, string | number | boolean | undefined | null>;
