using System.Text.Json;
using ExcelArchive.Application.Common.Backup;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Conflicts;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Application.DTOs.BackupDto;

    /// <summary>Fully validated in-memory restore plan. Parsing never writes.</summary>
    public sealed class ArchivePlan
    {
        public List<Domain.Entities.Group> Groups { get; } = [];
        public List<Category> Categories { get; } = [];
        public List<FileEntity> Files { get; } = [];
        public List<FileColumn> Columns { get; } = [];
        public List<Record> Records { get; } = [];
        public List<DataQualityIssue> Issues { get; } = [];
        public List<MappingTemplate> Templates { get; } = [];
        public List<UploadJob> Jobs { get; } = [];
        public List<ActivityLog> Logs { get; } = [];
        public List<RecordEdit> Edits { get; } = [];

        public static ArchivePlan Parse(JsonElement root)
        {
            if (root.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("ملف النسخة غير صالح.");
            if (!root.TryGetProperty("schemaVersion", out var ver) || ver.ValueKind != JsonValueKind.Number
                || !ver.TryGetInt32(out var version) || version != BackupProtocol.SupportedVersion)
                throw new InvalidOperationException($"إصدار النسخة غير مدعوم (المدعوم: {BackupProtocol.SupportedVersion}).");
            if (!root.TryGetProperty("exportedAt", out var exported)
                || exported.ValueKind != JsonValueKind.String
                || !DateTime.TryParse(exported.GetString(), out _))
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            if (!root.TryGetProperty("application", out var app)
                || app.ValueKind != JsonValueKind.String || app.GetString() != BackupProtocol.ApplicationName)
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");

            var plan = new ArchivePlan();
            foreach (var g in Rows(data, "groups")) plan.Groups.Add(new Domain.Entities.Group
            {
                Id = Uuid(g, "id"), Name = ReqText(g, "name"), Description = OptText(g, "description") ?? "",
                SortOrder = ReqInt(g, "sortOrder"), CreatedAt = ReqDate(g, "createdAt"), UpdatedAt = ReqDate(g, "updatedAt"),
            });
            var categories = Rows(data, "categories");
            if (categories.Count > ExcelArchive.Application.Services.CategoryService.MaxCustomCategories)
                throw new InvalidOperationException(ExcelArchive.Application.Services.CategoryService.LimitMessage);
            foreach (var c in categories) plan.Categories.Add(new Category
            {
                Id = Uuid(c, "id"), Name = ReqText(c, "name"),
                SortOrder = ReqInt(c, "sortOrder"), CreatedAt = ReqDate(c, "createdAt"),
            });
            foreach (var f in Rows(data, "files")) plan.Files.Add(new FileEntity
            {
                Id = Uuid(f, "id"), GroupId = Uuid(f, "groupId"), Name = ReqText(f, "name"),
                Description = OptText(f, "description") ?? "",
                OriginalFilename = ReqText(f, "originalFilename"), SheetName = ReqText(f, "sheetName"),
                RowCount = ReqInt(f, "rowCount"), ColumnSignature = ReqText(f, "columnSignature"),
                Version = ReqInt(f, "version"), UploadedAt = ReqDate(f, "uploadedAt"), UpdatedAt = ReqDate(f, "updatedAt"),
            });
            foreach (var c in Rows(data, "fileColumns")) plan.Columns.Add(new FileColumn
            {
                Id = Uuid(c, "id"), FileId = Uuid(c, "fileId"), HeaderRaw = ReqText(c, "headerRaw"),
                HeaderNormalized = ReqText(c, "headerNormalized"), ColumnIndex = ReqInt(c, "columnIndex"),
                SortOrder = c.TryGetProperty("sortOrder", out var so) && so.ValueKind == JsonValueKind.Number
                    ? so.GetInt32() : ReqInt(c, "columnIndex"),
                CategoryId = OptUuid(c, "categoryId"),
                StandardField = c.TryGetProperty("standardField", out var sf) && sf.ValueKind != JsonValueKind.Null
                    ? ClientEnums.ParseClientEnum<StandardField>(sf, "standardField") : null,
                CreatedAt = ReqDate(c, "createdAt"),
            });

            // Header maps for the historical recompute below.
            var nationalHeaders = plan.Columns
                .Where(c => c.StandardField == StandardField.NationalId)
                .ToDictionary(c => c.FileId, c => c.HeaderRaw);
            var jobHeaders = plan.Columns
                .Where(c => c.StandardField == StandardField.JobTitle)
                .ToDictionary(c => c.FileId, c => c.HeaderRaw);
            var categoryHeaders = plan.Columns
                .Where(c => c.StandardField == StandardField.FunctionalCategory)
                .ToDictionary(c => c.FileId, c => c.HeaderRaw);
            var orgHeaders = plan.Columns
                .Where(c => c.StandardField == StandardField.OrganizationalLevel)
                .ToDictionary(c => c.FileId, c => c.HeaderRaw);

            var storedRecords = new List<Record>();
            foreach (var r in Rows(data, "records")) storedRecords.Add(ParseRecord(r));
            // V1 transform: historical national/category/job/org recompute
            // from original cells, then national-quality rebuild.
            var seenByFile = new Dictionary<Guid, HashSet<string>>();
            var rebuiltIssues = new List<DataQualityIssue>();
            foreach (var record in storedRecords.OrderBy(r => r.RowIndex))
            {
                var cells = CellMap(record.Data);
                nationalHeaders.TryGetValue(record.FileId, out var nationalHeader);
                string? raw = nationalHeader is not null && cells.TryGetValue(nationalHeader, out var cell)
                    ? cell : record.SfNationalId?.ToString();
                var (sfNational, dNational, nationalNum) = ArabicNormalizer.NationalIdColumns(raw ?? "");
                record.SfNationalId = sfNational;
                record.DNationalId = string.IsNullOrEmpty(dNational) ? null : dNational;
                record.NationalIdNum = nationalNum;
                jobHeaders.TryGetValue(record.FileId, out var jobHeader);
                var jobRaw = jobHeader is not null && cells.TryGetValue(jobHeader, out var jc) ? jc : null;
                record.SfJobTitle = jobRaw ?? record.SfJobTitle;
                record.NJobTitle = jobRaw is not null
                    ? (jobRaw.Length == 0 ? null : ArabicNormalizer.NormalizeStored(jobRaw)) : record.NJobTitle;
                categoryHeaders.TryGetValue(record.FileId, out var categoryHeader);
                var categoryRaw = categoryHeader is not null && cells.TryGetValue(categoryHeader, out var cc) ? cc : null;
                record.SfFunctionalCategory = categoryRaw is not null
                    ? (categoryRaw.Length == 0 ? null : FunctionalCategory.Parse(categoryRaw)) : record.SfFunctionalCategory;
                orgHeaders.TryGetValue(record.FileId, out var orgHeader);
                var orgRaw = orgHeader is not null && cells.TryGetValue(orgHeader, out var oc) ? oc : null;
                record.SfOrganizationalLevel = orgRaw ?? record.SfOrganizationalLevel;
                record.NOrganizationalLevel = orgRaw is not null
                    ? (orgRaw.Length == 0 ? null : ArabicNormalizer.NormalizeStored(orgRaw)) : record.NOrganizationalLevel;
                var issue = ArabicNormalizer.NationalIdIssue(raw ?? "");
                if (issue == "missing")
                    rebuiltIssues.Add(QualityIssue(record, DataQualityIssueType.MissingNationalId, raw));
                else if (issue is not null)
                    rebuiltIssues.Add(QualityIssue(record, DataQualityIssueType.InvalidNationalId, raw));
                else
                {
                    var digits = ArabicNormalizer.NationalIdDigits(raw ?? "")!;
                    if (!seenByFile.TryGetValue(record.FileId, out var seen))
                        seenByFile[record.FileId] = seen = new HashSet<string>(StringComparer.Ordinal);
                    if (!seen.Add(digits))
                        rebuiltIssues.Add(QualityIssue(record, DataQualityIssueType.DuplicateNationalId, raw));
                }
            }
            plan.Records.AddRange(storedRecords);
            foreach (var i in Rows(data, "dataQualityIssues"))
            {
                var type = ClientEnums.ParseClientEnum<DataQualityIssueType>(Prop(i, "issueType"), "issueType");
                if (type is DataQualityIssueType.MissingNationalId
                    or DataQualityIssueType.InvalidNationalId
                    or DataQualityIssueType.DuplicateNationalId)
                    continue; // Recomputed from originals above (V1 transform).
                plan.Issues.Add(new DataQualityIssue
                {
                    Id = Uuid(i, "id"), FileId = Uuid(i, "fileId"), RowIndex = ReqInt(i, "rowIndex"),
                    IssueType = type, ColumnName = OptText(i, "columnName"), RawValue = OptText(i, "rawValue"),
                    CreatedAt = ReqDate(i, "createdAt"),
                });
            }
            plan.Issues.AddRange(rebuiltIssues);
            foreach (var t in Rows(data, "mappingTemplates")) plan.Templates.Add(new MappingTemplate
            {
                Id = Uuid(t, "id"), GroupId = Uuid(t, "groupId"), Name = ReqText(t, "name"),
                HeaderSignature = ReqText(t, "headerSignature"), Mapping = ReqJson(t, "mapping"),
                CreatedAt = ReqDate(t, "createdAt"), UpdatedAt = ReqDate(t, "updatedAt"),
            });
            foreach (var j in Rows(data, "uploadJobs"))
            {
                var status = ClientEnums.ParseClientEnum<UploadJobStatus>(Prop(j, "status"), "status");
                var nonterminal = status is UploadJobStatus.Pending or UploadJobStatus.Parsing or UploadJobStatus.Inserting;
                plan.Jobs.Add(new UploadJob
                {
                    Id = Uuid(j, "id"), FileId = OptUuid(j, "fileId"),
                    Status = nonterminal ? UploadJobStatus.Failed : status,
                    TotalRows = ReqInt(j, "totalRows"), ProcessedRows = ReqInt(j, "processedRows"),
                    ErrorMessage = nonterminal
                        ? "أوقفت المهمة عند استعادة النسخة الاحتياطية."
                        : OptText(j, "errorMessage"),
                    Payload = ReqJson(j, "payload"),
                    StartedAt = OptDate(j, "startedAt"),
                    FinishedAt = nonterminal ? DateTime.UtcNow : OptDate(j, "finishedAt"),
                });
            }
            foreach (var a in Rows(data, "activityLogs")) plan.Logs.Add(new ActivityLog
            {
                Id = Uuid(a, "id"), Action = ClientEnums.ParseClientEnum<ActivityAction>(Prop(a, "action"), "action"),
                TargetName = ReqText(a, "targetName"), Details = ReqJson(a, "details"),
                CreatedAt = ReqDate(a, "createdAt"),
            });
            foreach (var e in Rows(data, "recordEdits", optional: true)) plan.Edits.Add(new RecordEdit
            {
                Id = Uuid(e, "id"), RecordId = Uuid(e, "recordId"), FileId = Uuid(e, "fileId"),
                FileColumnId = OptUuid(e, "fileColumnId"), HeaderRaw = ReqText(e, "headerRaw"),
                OldValue = ReqText(e, "oldValue"), NewValue = ReqText(e, "newValue"),
                CreatedAt = ReqDate(e, "createdAt"),
            });

            plan.ValidateReferences();
            return plan;
        }

        public static DataQualityIssue QualityIssue(Record record, DataQualityIssueType type, string? raw) => new()
        {
            FileId = record.FileId, RowIndex = record.RowIndex, IssueType = type,
            ColumnName = "الرقم الوطني", RawValue = raw ?? "", CreatedAt = record.CreatedAt,
        };

        public static Record ParseRecord(JsonElement r) => new()
        {
            Id = Uuid(r, "id"), FileId = Uuid(r, "fileId"), RowIndex = ReqInt(r, "rowIndex"),
            Data = ReqJson(r, "data"),
            SfFirstName = OptText(r, "sfFirstName"), SfFatherName = OptText(r, "sfFatherName"),
            SfLastName = OptText(r, "sfLastName"), SfFullName = OptText(r, "sfFullName"),
            SfNationalId = OptBigInt(r, "sfNationalId"), SfShamCash = ParseSham(r),
            SfPersonalNo = OptText(r, "sfPersonalNo"), SfMotherName = OptText(r, "sfMotherName"),
            SfPhone = OptText(r, "sfPhone"), SfContractCode = OptText(r, "sfContractCode"),
            SfSecondaryContractCode = OptText(r, "sfSecondaryContractCode"),
            SfJobTitle = OptText(r, "sfJobTitle"), SfFunctionalCategory = OptInt(r, "sfFunctionalCategory"),
            SfOrganizationalLevel = OptText(r, "sfOrganizationalLevel"),
            NFirstName = OptText(r, "nFirstName"), NFatherName = OptText(r, "nFatherName"),
            NLastName = OptText(r, "nLastName"), NFullName = OptText(r, "nFullName"),
            NMotherName = OptText(r, "nMotherName"), NContractCode = OptText(r, "nContractCode"),
            NSecondaryContractCode = OptText(r, "nSecondaryContractCode"),
            NJobTitle = OptText(r, "nJobTitle"), NOrganizationalLevel = OptText(r, "nOrganizationalLevel"),
            DNationalId = OptText(r, "dNationalId"), DPersonalNo = OptText(r, "dPersonalNo"),
            DPhone = OptText(r, "dPhone"), NationalIdNum = OptBigInt(r, "nationalIdNum"),
            FmtFills = OptJson(r, "fmtFills"), FmtFontColors = OptJson(r, "fmtFontColors"),
            CreatedAt = ReqDate(r, "createdAt"),
        };

        public static long? ParseSham(JsonElement r)
        {
            if (!r.TryGetProperty("sfShamCash", out var el) || el.ValueKind == JsonValueKind.Null)
                return null;
            var digits = ArabicNormalizer.DigitsOnly(el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText());
            if (digits.Length == 0 || digits.Length > 16 || !long.TryParse(digits, out var value))
                throw new InvalidOperationException("رقم شام كاش في النسخة الاحتياطية غير صالح.");
            return value;
        }

        public static Dictionary<string, string?> CellMap(JsonDocument data)
        {
            var map = new Dictionary<string, string?>(StringComparer.Ordinal);
            if (data.RootElement.ValueKind != JsonValueKind.Object) return map;
            foreach (var prop in data.RootElement.EnumerateObject())
                map[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Null or JsonValueKind.Undefined => null,
                    _ => prop.Value.GetRawText(),
                };
            return map;
        }

        private void ValidateReferences()
        {
            var groups = new HashSet<Guid>(Groups.Select(g => g.Id));
            var files = new HashSet<Guid>(Files.Select(f => f.Id));
            var records = new HashSet<Guid>(Records.Select(r => r.Id));
            if (Files.Any(f => !groups.Contains(f.GroupId))
                || Columns.Any(c => !files.Contains(c.FileId))
                || Records.Any(r => !files.Contains(r.FileId))
                || Issues.Any(i => !files.Contains(i.FileId))
                || Templates.Any(t => !groups.Contains(t.GroupId))
                || Jobs.Any(j => j.FileId is not null && !files.Contains(j.FileId.Value))
                || Edits.Any(e => !records.Contains(e.RecordId) || !files.Contains(e.FileId)))
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            static void NoDuplicateIds<T>(IReadOnlyList<T> rows, Func<T, Guid> id)
            {
                var ids = new HashSet<Guid>();
                foreach (var row in rows)
                    if (!ids.Add(id(row)))
                        throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            }
            NoDuplicateIds(Groups, g => g.Id);
            NoDuplicateIds(Categories, c => c.Id);
            NoDuplicateIds(Files, f => f.Id);
            NoDuplicateIds(Columns, c => c.Id);
            NoDuplicateIds(Records, r => r.Id);
            NoDuplicateIds(Issues, i => i.Id);
            NoDuplicateIds(Templates, t => t.Id);
            NoDuplicateIds(Jobs, j => j.Id);
            NoDuplicateIds(Logs, a => a.Id);
            NoDuplicateIds(Edits, e => e.Id);
        }

        public static List<JsonElement> Rows(JsonElement data, string name, bool optional = false)
        {
            if (!data.TryGetProperty(name, out var el))
            {
                if (optional) return [];
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            }
            if (el.ValueKind != JsonValueKind.Array)
                throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
            return el.EnumerateArray().ToList();
        }

        public static JsonElement Prop(JsonElement el, string name) =>
            el.TryGetProperty(name, out var value)
                ? value
                : throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");

        public static Guid Uuid(JsonElement el, string name)
        {
            var prop = Prop(el, name);
            if (prop.ValueKind == JsonValueKind.String && Guid.TryParse(prop.GetString(), out var id))
                return id;
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static Guid? OptUuid(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            if (prop.ValueKind == JsonValueKind.String && Guid.TryParse(prop.GetString(), out var id)) return id;
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static string ReqText(JsonElement el, string name)
        {
            var prop = Prop(el, name);
            if (prop.ValueKind == JsonValueKind.String) return prop.GetString() ?? "";
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static string? OptText(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            if (prop.ValueKind == JsonValueKind.String) return prop.GetString();
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static int ReqInt(JsonElement el, string name)
        {
            var prop = Prop(el, name);
            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var value)) return value;
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static int? OptInt(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var value)) return value;
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static long? OptBigInt(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            var text = prop.ValueKind switch
            {
                JsonValueKind.String => prop.GetString() ?? "",
                JsonValueKind.Number => prop.GetRawText(),
                _ => throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق."),
            };
            // Bigint JSON strings preserve 16-digit sham values and other
            // numbers beyond JavaScript safe-integer range (docs/07.1).
            var digits = ArabicNormalizer.DigitsOnly(text);
            // V1 treats these as free text and recomputes real columns from
            // originals below; unparseable input yields null, not rejection.
            if (digits.Length == 0 || !long.TryParse(digits, out var value)) return null;
            return value;
        }

        public static DateTime ReqDate(JsonElement el, string name)
        {
            var prop = Prop(el, name);
            if (prop.ValueKind == JsonValueKind.String && DateTime.TryParse(prop.GetString(), out var date))
                return DateTime.SpecifyKind(date, DateTimeKind.Utc);
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static DateTime? OptDate(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            if (prop.ValueKind == JsonValueKind.String && DateTime.TryParse(prop.GetString(), out var date))
                return DateTime.SpecifyKind(date, DateTimeKind.Utc);
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        }

        public static JsonDocument ReqJson(JsonElement el, string name)
        {
            var prop = Prop(el, name);
            try
            {
                return JsonDocument.Parse(prop.GetRawText());
            }
            catch (JsonException)
            {
                throw new InvalidOperationException("قيمة JSON غير صالحة.");
            }
        }

        public static JsonDocument? OptJson(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var prop) || prop.ValueKind == JsonValueKind.Null) return null;
            try
            {
                return JsonDocument.Parse(prop.GetRawText());
            }
            catch (JsonException)
            {
                throw new InvalidOperationException("قيمة JSON غير صالحة.");
            }
        }
    }
