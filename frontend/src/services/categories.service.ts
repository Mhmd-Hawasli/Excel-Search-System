import { apiDelete, apiGet, apiPatch, apiPost } from "./api-client";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface BoardColumn {
  id: string;
  headerRaw: string;
  columnIndex: number;
  fileId: string;
  fileName: string;
  groupName: string;
}

export interface BoardGroup {
  key: string;
  label: string;
  standardField: string | null;
  columns: BoardColumn[];
}

export interface BoardCategory {
  categoryId: string | null;
  categoryName: string;
  groups: BoardGroup[];
}

export interface CategoryOption {
  id: string | null;
  name: string;
}

export const categoriesService = {
  async list(): Promise<Category[]> {
    const response = await apiGet<{ categories: Category[] }>("/api/categories");
    return response.categories ?? [];
  },
  async board(): Promise<BoardCategory[]> {
    const response = await apiGet<{ categories: BoardCategory[] }>("/api/categories/board");
    return response.categories ?? [];
  },
  async options(): Promise<{ id: string; name: string }[]> {
    const response = await apiGet<{ data: { categories: { id: string; name: string }[] } }>("/api/categories/options");
    return response.data?.categories ?? [];
  },
  create(name: string): Promise<{ category: Category }> {
    return apiPost<{ category: Category }>("/api/categories", { name });
  },
  update(id: string, name: string): Promise<{ category: Category }> {
    return apiPatch<{ category: Category }>(`/api/categories/${id}`, { name });
  },
  reorder(id: string, direction: "up" | "down"): Promise<{ ok: boolean }> {
    return apiPost<{ ok: boolean }>(`/api/categories/${id}/reorder`, { id, direction });
  },
  remove(id: string, confirmName: string): Promise<{ ok: boolean }> {
    return apiDelete<{ ok: boolean }>(`/api/categories/${id}`, { id, confirmName });
  },
  moveColumn(columnId: string, categoryId: string | null): Promise<{ ok: boolean; message: string }> {
    return apiPost<{ ok: boolean; message: string }>("/api/categories/columns/move", { columnId, categoryId });
  },
  reorderGroups(categoryId: string | null, orderedGroupKeys: string[]): Promise<{ ok: boolean }> {
    return apiPost<{ ok: boolean }>("/api/categories/column-groups/reorder", { categoryId, orderedGroupKeys });
  },
};
