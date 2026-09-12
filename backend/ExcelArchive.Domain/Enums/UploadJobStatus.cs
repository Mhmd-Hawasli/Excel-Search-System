namespace ExcelArchive.Domain.Enums;

public enum UploadJobStatus
{
    Pending,
    Parsing,
    Inserting,
    Done,
    Failed,
}
