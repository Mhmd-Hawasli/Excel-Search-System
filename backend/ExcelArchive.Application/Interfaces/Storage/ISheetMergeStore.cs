using ExcelArchive.Domain.SheetMerge;

namespace ExcelArchive.Application.Interfaces.Storage;

public interface ISheetMergeStore
{
    UploadedWorkbook SaveUpload(UploadedWorkbook uploaded);
    UploadedWorkbook GetUpload(Guid uploadId);
    SheetMergeSessionData SaveSession(
        Guid uploadId, int nationalIdColumn, IReadOnlyList<string> sheetNames, SheetMergeStats result);
    SheetMergeSessionData GetSession(Guid sessionId);
    SheetMergeExportData SaveExport(byte[] buffer, string filename, int sheetCount);
    SheetMergeExportData GetExport(Guid downloadId);
}
