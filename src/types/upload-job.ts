/**
 * Client-safe DTO of an upload/replace job as returned by `/api/upload-jobs`.
 * Single source of truth for the upload and file-update wizards (previously
 * duplicated in both).
 */
export type UploadJobStatusDto = "PENDING" | "PARSING" | "INSERTING" | "DONE" | "FAILED";

export type UploadJobDto = {
  id: string;
  fileId: string | null;
  status: UploadJobStatusDto;
  totalRows: number;
  processedRows: number;
  errorMessage: string | null;
};
