export interface Group {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileItem {
  id: string;
  groupId: string;
  name: string;
  description: string;
  originalFilename: string;
  sheetName: string;
  rowCount: number;
  columnSignature: string;
  version: number;
  uploadedAt: string;
  updatedAt: string;
  groupName?: string;
  columnCount?: number;
}

export interface FileColumn {
  id: string;
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: string | null;
  categoryId: string | null;
  categoryName?: string | null;
}

export interface SearchResult {
  id: string;
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  rowIndex: number;
  fullName: string | null;
  nationalId: string | null;
  phone: string | null;
  data: Record<string, unknown>;
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string | null;
  permissions: PermissionAssignment[];
}

export interface PermissionAssignment {
  permission: string;
  groupId?: string | null;
  fileId?: string | null;
}
