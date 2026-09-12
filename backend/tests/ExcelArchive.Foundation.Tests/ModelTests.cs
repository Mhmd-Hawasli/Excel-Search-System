using ExcelArchive.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P1.2 EF model tests against the Npgsql provider (metadata only,
/// no live connection). Guards the V1 parity contract in docs/07.1.</summary>
public sealed class ModelTests
{
    private static Microsoft.EntityFrameworkCore.Metadata.IModel Model()
    {
        using var db = TestHelpers.ModelOnlyDb();
        return db.Model;
    }

    [Fact]
    public void HasAllFifteenDomainSets()
    {
        var tables = Model().GetEntityTypes()
            .Select(e => e.GetTableName()).OrderBy(t => t).ToList();
        Assert.Equal(
        [
            "activity_log", "categories", "conflict_cache_state", "conflict_query_cache",
            "data_quality_issues", "file_columns", "files", "groups", "ignored_conflicts",
            "mapping_templates", "record_edits", "records", "upload_jobs", "user_permissions", "users",
        ], tables);
    }

    [Fact]
    public void ActivityLog_UsesSingularTable()
        => Assert.Equal("activity_log",
            Model().FindEntityType(typeof(ActivityLog))!.GetTableName());

    [Fact]
    public void CacheTables_UseSpecialKeys_NotGuidBase()
    {
        var model = Model();
        var state = model.FindEntityType(typeof(ConflictCacheState))!;
        Assert.Equal("conflict_cache_state", state.GetTableName());
        Assert.Equal(["Id"], state.FindPrimaryKey()!.Properties.Select(p => p.Name));
        Assert.Equal(typeof(int), state.FindPrimaryKey()!.Properties.Single().ClrType);

        var query = model.FindEntityType(typeof(ConflictQueryCache))!;
        Assert.Equal("conflict_query_cache", query.GetTableName());
        Assert.Equal(["Key"], query.FindPrimaryKey()!.Properties.Select(p => p.Name));
        Assert.Equal(typeof(string), query.FindPrimaryKey()!.Properties.Single().ClrType);
        Assert.Equal("date", query.FindProperty(nameof(ConflictQueryCache.CheckedDate))!.GetColumnType());
    }

    public static TheoryData<Type, string[]> UniqueIndexes => new()
    {
        { typeof(Group), ["Name"] },
        { typeof(FileEntity), ["Name"] },
        { typeof(Category), ["Name"] },
        { typeof(Domain.Entities.User), ["Username"] },
        { typeof(FileColumn), ["FileId", "ColumnIndex"] },
        { typeof(RecordEntity), ["FileId", "RowIndex"] },
        { typeof(MappingTemplate), ["GroupId", "Name"] },
        { typeof(IgnoredConflict), ["Rule", "RecordId"] },
    };

    [Theory]
    [MemberData(nameof(UniqueIndexes))]
    public void UniqueConstraints_Preserved(Type entity, string[] properties)
    {
        var indexes = Model().FindEntityType(entity)!.GetIndexes().Where(i => i.IsUnique);
        Assert.Contains(indexes,
            i => i.Properties.Select(p => p.Name).OrderBy(n => n)
                .SequenceEqual(properties.OrderBy(n => n)));
    }

    [Fact]
    public void DeleteBehaviors_MatchV1()
    {
        static string Delete(Type entity, string nav)
        {
            using var db = TestHelpers.ModelOnlyDb();
            return db.Model.FindEntityType(entity)!.GetForeignKeys()
                .Single(fk => fk.DependentToPrincipal!.Name == nav)
                .DeleteBehavior.ToString();
        }

        Assert.Equal("Cascade", Delete(typeof(FileEntity), "Group"));
        Assert.Equal("SetNull", Delete(typeof(FileColumn), "Category"));
        Assert.Equal("SetNull", Delete(typeof(UploadJob), "File"));
        Assert.Equal("Cascade", Delete(typeof(UserPermission), "User"));
    }

    [Fact]
    public void AllTimestamps_AreTimestamptz3()
    {
        // Npgsql resolves the timestamptz(3) alias to "timestamp(3) with time zone".
        static bool IsTz3(string? type) => type is "timestamptz(3)" or "timestamp(3) with time zone";
        using var db = TestHelpers.ModelOnlyDb();
        var bad = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties()
                .Where(p => p.ClrType == typeof(DateTime) || p.ClrType == typeof(DateTime?))
                .Select(p => $"{e.ClrType.Name}.{p.Name}={p.GetColumnType()}"))
            .Where(s => !IsTz3(s.Split('=').Last()))
            .ToList();
        Assert.Empty(bad);
    }

    [Fact]
    public void Enums_PersistAsVarcharStrings()
    {
        using var db = TestHelpers.ModelOnlyDb();
        var model = db.Model;
        Assert.Equal("varchar",
            model.FindEntityType(typeof(FileColumn))!.FindProperty("StandardField")!.GetColumnType());
        Assert.Equal("varchar",
            model.FindEntityType(typeof(UploadJob))!.FindProperty("Status")!.GetColumnType());
        Assert.Equal("varchar",
            model.FindEntityType(typeof(DataQualityIssue))!.FindProperty("IssueType")!.GetColumnType());
        Assert.Equal("varchar",
            model.FindEntityType(typeof(ActivityLog))!.FindProperty("Action")!.GetColumnType());
    }

    [Fact]
    public void SnakeCase_Columns()
    {
        using var db = TestHelpers.ModelOnlyDb();
        var model = db.Model;
        Assert.Equal("group_id",
            model.FindEntityType(typeof(FileEntity))!.FindProperty("GroupId")!.GetColumnName());
        Assert.Equal("national_id_num",
            model.FindEntityType(typeof(RecordEntity))!.FindProperty("NationalIdNum")!.GetColumnName());
        Assert.Equal("source_revision",
            model.FindEntityType(typeof(ConflictQueryCache))!.FindProperty("SourceRevision")!.GetColumnName());
    }
}
