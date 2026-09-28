import type { ApiEnvelope } from "@/types/api";
import { ApiError, apiDelete, apiFetch, apiFetchBinary, apiGet, apiPost, apiUploadForm } from "./api-client";

export interface ExportValueReplacement {
  from: string;
  to: string;
}

export interface ExportTemplateColumn {
  /** المصدر هو HeaderRaw الأصلي؛ القيمة الفارغة تعني عمودًا إضافيًا فارغ القيم. */
  source: string | null;
  alias?: string | null;
  replacements?: ExportValueReplacement[];
}

export interface ExportTemplate {
  id: string;
  fileId: string;
  fileName: string;
  groupName?: string | null;
  name: string;
  columns: ExportTemplateColumn[];
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSourceFile {
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  rowCount: number;
}

export interface ImportSheetHeaders {
  sheetName: string;
  columnCount: number;
  headers: string[];
}

export interface ExportSourceColumns {
  fileId: string;
  fileName: string;
  groupName?: string | null;
  columns: Array<{ headerRaw: string; columnIndex: number }>;
}

export const customExportService = {
  async listFiles(): Promise<ExportSourceFile[]> {
    const envelope = await apiGet<ApiEnvelope<{ files: ExportSourceFile[] }>>("/api/export-templates/files");
    return envelope.data?.files ?? [];
  },

  async getColumns(fileId: string): Promise<ExportSourceColumns> {
    const envelope = await apiGet<ApiEnvelope<ExportSourceColumns>>(`/api/export-templates/files/${fileId}/columns`);
    if (!envelope.data) throw new Error("الملف غير موجود.");
    return envelope.data;
  },

  async listTemplates(fileId?: string): Promise<ExportTemplate[]> {
    const query = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
    const envelope = await apiGet<ApiEnvelope<{ templates: ExportTemplate[] }>>(`/api/export-templates${query}`);
    return envelope.data?.templates ?? [];
  },

  async create(fileId: string, name: string, columns: ExportTemplateColumn[]): Promise<ExportTemplate> {
    const envelope = await apiPost<ApiEnvelope<{ template: ExportTemplate }>>("/api/export-templates", {
      fileId,
      name,
      columns,
    });
    if (!envelope.data?.template) throw new ApiError("تعذر حفظ القالب.", 500);
    return envelope.data.template;
  },

  async update(id: string, name: string, columns: ExportTemplateColumn[]): Promise<ExportTemplate> {
    const envelope = await apiFetch<ApiEnvelope<{ template: ExportTemplate }>>(`/api/export-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, columns }),
    });
    if (!envelope.data?.template) throw new ApiError("تعذر حفظ القالب.", 500);
    return envelope.data.template;
  },

  async remove(id: string): Promise<void> {
    await apiDelete<ApiEnvelope<null>>(`/api/export-templates/${id}`);
  },

  exportUrl(templateId: string, markEdits = false): string {
    return `/api/export-templates/${templateId}/export${markEdits ? "?markEdits=true" : ""}`;
  },

  /** تصدير لحظي بتشكيلة أعمدة دون حفظ قالب (POST ثنائي). */
  async exportAdhoc(fileId: string, columns: ExportTemplateColumn[], markEdits = false): Promise<{ blob: Blob; filename: string | null }> {
    return apiFetchBinary("/api/export-templates/export-adhoc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId, columns, markEdits }),
    });
  },

  /** فحص ملف استيراد قالب: الأوراق وعناوين صفها الأول. */
  async inspectImport(file: File, onProgress?: (percent: number) => void): Promise<ImportSheetHeaders[]> {
    const form = new FormData();
    form.append("file", file);
    const response = await apiUploadForm<{ data?: { sheets: ImportSheetHeaders[] } } & { sheets?: ImportSheetHeaders[] }>(
      "/api/export-templates/import-inspect",
      form,
      onProgress,
    );
    return response.data?.sheets ?? response.sheets ?? [];
  },
};
