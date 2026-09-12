namespace ExcelArchive.Foundation.Tests;

/// <summary>P1.2 SQL DDL parity tests (file content, no live server).
/// Live catalog inspection stays a Docker-host follow-up.</summary>
public sealed class SqlFilesTests
{
    private static readonly string[] RequiredIndexes =
    [
        "records_n_first_name_trgm_idx",
        "records_n_father_name_trgm_idx",
        "records_n_last_name_trgm_idx",
        "records_n_full_name_trgm_idx",
        "records_n_mother_name_trgm_idx",
        "records_n_contract_code_trgm_idx",
        "records_n_secondary_contract_code_trgm_idx",
        "records_n_job_title_trgm_idx",
        "records_n_organizational_level_trgm_idx",
        "records_d_national_id_trgm_idx",
        "records_sf_sham_cash_trgm_idx",
        "records_d_personal_no_trgm_idx",
        "records_d_phone_trgm_idx",
        "records_sf_functional_category_idx",
    ];

    [Fact]
    public void SearchIndexes_ContainAllFourteenV1Definitions()
    {
        var sql = TestHelpers.ApiDataFile("SearchIndexes.sql");
        Assert.Contains("CREATE EXTENSION IF NOT EXISTS pg_trgm;", sql);
        Assert.Contains("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;", sql);
        foreach (var index in RequiredIndexes)
            Assert.Contains(index, sql);
        Assert.Equal(14,
            sql.Split('\n').Count(l => l.TrimStart().StartsWith("CREATE INDEX", StringComparison.Ordinal)));
    }

    [Fact]
    public void SearchIndexes_HaveNoSupersededRawFieldIndexes()
    {
        var sql = TestHelpers.ApiDataFile("SearchIndexes.sql");
        Assert.DoesNotContain("records_sf_job_title_trgm_idx", sql);
        Assert.DoesNotContain("records_sf_full_name_trgm_idx", sql);
        Assert.DoesNotContain("records_sf_phone_trgm_idx", sql);
    }

    [Fact]
    public void SearchIndexes_PaddedShamExpression_Preserved()
        => Assert.Contains("LPAD(sf_sham_cash::TEXT, 16, '0')",
            TestHelpers.ApiDataFile("SearchIndexes.sql"));

    [Fact]
    public void ConflictCache_CoversAllFiveSourceTables()
    {
        var sql = TestHelpers.ApiDataFile("ConflictCache.sql");
        Assert.Contains("CREATE OR REPLACE FUNCTION public.invalidate_conflict_query_cache()", sql);
        foreach (var table in new[] { "records", "files", "file_columns", "upload_jobs", "ignored_conflicts" })
        {
            Assert.Contains($"ON {table}", sql);
            Assert.Contains("FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache()", sql);
        }
        Assert.Contains("INSERT INTO conflict_cache_state (id, revision)", sql);
        Assert.Contains("conflict_query_cache_rebuilt_at_idx", sql);
    }
}
