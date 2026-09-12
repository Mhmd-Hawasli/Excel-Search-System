namespace ExcelArchive.Application.DTOs.RecordDto;

/// <summary>Complete record read model replacing the V1 server-component
/// Prisma reads on records/[id] (docs/05).</summary>
public record RecordDetailColumnDto(
    Guid Id,
    string HeaderRaw,
    Guid? CategoryId,
    string? CategoryName,
    int? CategoryOrder,
    string? StandardField,
    string Value);

public record EditedHeaderDto(int Count, string OriginalValue, string LastValue, DateTime LastAt);

public record RelatedRecordDto(
    Guid Id,
    string? SfFullName,
    string? SfFirstName,
    string? SfFatherName,
    string? SfLastName,
    string? SfMotherName,
    string? DNationalId,
    string FileName,
    string GroupName,
    DateTime UploadedAt);

public record RelatedGroupDto(IReadOnlyList<RelatedRecordDto> Rows, bool Truncated);

public record RecordDetailDto(
    Guid Id,
    Guid FileId,
    string FileName,
    Guid GroupId,
    string GroupName,
    string FileDescription,
    string OriginalFilename,
    DateTime UploadedAt,
    int RowIndex,
    string DisplayName,
    string? SfNationalId,
    string? DNationalId,
    long? NationalIdNum,
    IReadOnlyList<RecordDetailColumnDto> Columns,
    IReadOnlyDictionary<string, EditedHeaderDto> EditedHeaders,
    int EditCount,
    RelatedGroupDto RelatedByNationalId,
    RelatedGroupDto RelatedByPerson,
    RelatedGroupDto ConflictByNationalId,
    RelatedGroupDto ConflictByMother);
