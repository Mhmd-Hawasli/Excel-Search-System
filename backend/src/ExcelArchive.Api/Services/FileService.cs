using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Files;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class FileService(AppDbContext db, IActivityService activity) : IFileService
{
    private static readonly Dictionary<string, StandardField> FieldMap = new()
    {
        ["first_name"] = StandardField.FirstName,
        ["father_name"] = StandardField.FatherName,
        ["last_name"] = StandardField.LastName,
        ["full_name"] = StandardField.FullName,
        ["national_id"] = StandardField.NationalId,
        ["sham_cash"] = StandardField.ShamCash,
        ["personal_no"] = StandardField.PersonalNo,
        ["mother_name"] = StandardField.MotherName,
        ["phone"] = StandardField.Phone,
        ["contract_code"] = StandardField.ContractCode,
        ["secondary_contract_code"] = StandardField.SecondaryContractCode,
        ["job_title"] = StandardField.JobTitle,
        ["functional_category"] = StandardField.FunctionalCategory,
        ["organizational_level"] = StandardField.OrganizationalLevel,
    };

    public async Task<(bool Available, string? Error)> CheckNameAsync(string name, CancellationToken ct = default)
    {
        if (await db.Files.AnyAsync(f => f.Name == name.Trim(), ct))
            return (false, "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر.");
        return (true, null);
    }

    public async Task<FileMappingDto?> GetMappingAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await db.Files.AsNoTracking()
            .Include(f => f.Columns.OrderBy(c => c.ColumnIndex))
            .ThenInclude(c => c.Category)
            .FirstOrDefaultAsync(f => f.Id == fileId, ct);
        if (file is null) return null;
        return new FileMappingDto(file.Id, file.Name, file.Columns.Select(c =>
            new FileColumnDto(c.Id, c.HeaderRaw, c.HeaderNormalized, c.ColumnIndex,
                c.StandardField?.ToString() ?? null, c.CategoryId, c.Category?.Name)).ToList());
    }

    public async Task<FileMappingDto> UpdateMappingAsync(Guid fileId, UpdateMappingRequest request, CancellationToken ct = default)
    {
        var file = await db.Files
            .Include(f => f.Columns)
            .FirstOrDefaultAsync(f => f.Id == fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        var columnMap = file.Columns.ToDictionary(c => c.Id);

        var seen = new HashSet<StandardField>();
        foreach (var item in request.Columns)
        {
            if (!columnMap.TryGetValue(item.Id, out var column)) throw new InvalidOperationException("عمود غير موجود.");
            StandardField? field = null;
            if (!string.IsNullOrWhiteSpace(item.StandardField))
            {
                if (!FieldMap.TryGetValue(item.StandardField.Trim().ToLowerInvariant(), out var mapped))
                    throw new InvalidOperationException($"حقل قياسي غير معروف: {item.StandardField}");
                if (!seen.Add(mapped)) throw new InvalidOperationException("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
                field = mapped;
            }
            column.StandardField = field;
            column.CategoryId = item.CategoryId;
            column.SortOrder = column.ColumnIndex;
        }

        // Recompute the standard-field shadow indexes for the selected columns.
        await RecomputeStandardFieldsAsync(file);
        await db.SaveChangesAsync(ct);
        return (await GetMappingAsync(fileId, ct))!;
    }

    public async Task DeleteAsync(Guid fileId, string confirmName, string actorUsername, CancellationToken ct = default)
    {
        var file = await db.Files.FirstOrDefaultAsync(f => f.Id == fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        if (confirmName != file.Name) throw new InvalidOperationException("اسم التأكيد لا يطابق اسم الملف.");
        var groupId = file.GroupId;
        var rowCount = file.RowCount;
        db.Files.Remove(file);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.FileDeleted, file.Name,
            new { fileId, records = rowCount, by = actorUsername }, ct);
    }

    private async Task RecomputeStandardFieldsAsync(File file)
    {
        var records = await db.Records.Where(r => r.FileId == file.Id).ToListAsync();
        var columns = file.Columns.Where(c => c.StandardField is not null).ToList();
        foreach (var record in records)
        {
            ClearStandardFields(record);
            if (record.Data is null) continue;
            var data = record.Data.RootElement;
            if (data.ValueKind != JsonValueKind.Object) continue;
            foreach (var column in columns)
            {
                if (!data.TryGetProperty(column.HeaderRaw, out var value) || value.ValueKind != JsonValueKind.String) continue;
                ApplyStandardField(record, column.StandardField!.Value, value.GetString());
            }
        }
    }

    private static void ClearStandardFields(Record r)
    {
        r.SfFirstName = null;
        r.SfFatherName = null;
        r.SfLastName = null;
        r.SfFullName = null;
        r.SfNationalId = null;
        r.SfShamCash = null;
        r.SfPersonalNo = null;
        r.SfMotherName = null;
        r.SfPhone = null;
        r.SfContractCode = null;
        r.SfSecondaryContractCode = null;
        r.SfJobTitle = null;
        r.SfFunctionalCategory = null;
        r.SfOrganizationalLevel = null;
        r.NationalIdNum = null;
        r.DNationalId = null;
        r.DPhone = null;
        r.DPersonalNo = null;
    }

    private static void ApplyStandardField(Record r, StandardField field, string? raw)
    {
        if (raw is null) return;
        var text = raw.Trim();
        switch (field)
        {
            case StandardField.FirstName: r.SfFirstName = text; break;
            case StandardField.FatherName: r.SfFatherName = text; break;
            case StandardField.LastName: r.SfLastName = text; break;
            case StandardField.FullName: r.SfFullName = text; break;
            case StandardField.NationalId:
                if (long.TryParse(text, out var nid)) { r.SfNationalId = nid; r.NationalIdNum = nid; }
                r.DNationalId = text.PadLeft(11, '0'); break;
            case StandardField.ShamCash:
                if (long.TryParse(text, out var sham)) r.SfShamCash = sham;
                break;
            case StandardField.PersonalNo: r.SfPersonalNo = text; r.DPersonalNo = text; break;
            case StandardField.MotherName: r.SfMotherName = text; break;
            case StandardField.Phone: r.SfPhone = text; r.DPhone = text; break;
            case StandardField.ContractCode: r.SfContractCode = text; break;
            case StandardField.SecondaryContractCode: r.SfSecondaryContractCode = text; break;
            case StandardField.JobTitle: r.SfJobTitle = text; break;
            case StandardField.FunctionalCategory:
                if (int.TryParse(text, out var fc)) r.SfFunctionalCategory = fc;
                break;
            case StandardField.OrganizationalLevel: r.SfOrganizationalLevel = text; break;
        }
    }
}
