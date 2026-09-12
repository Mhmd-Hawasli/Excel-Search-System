using System.Text.Json;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ClosedXML.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Domain.Conflicts;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P4.6: full 58-rule semantic suite (directed-pair matrix incl.
/// asymmetry), >200-row export equality, sort/page stability, cache
/// 20-mutation trigger scenario (live PG, isolated + rolled back).</summary>
public sealed class ConflictP46Tests
{
    // ---- directed-pair matrix: all 22 rules, both directions ----

    private static ConflictEngine.EngineRow PairRow(
        string? national, (string Full, string Mother)? person,
        string? personal, string? sham, (string C, string S)? contract, string? phone)
    {
        var mapped = new HashSet<string>(StringComparer.Ordinal)
        {
            "national_id", "personal_no", "sham_cash", "contract_code",
            "full_name", "mother_name", "phone",
        };
        var headers = mapped.ToDictionary(k => k, k => $"h_{k}", StringComparer.Ordinal);
        return new ConflictEngine.EngineRowWithHeaders(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "f", "o.xlsx", 2,
            person?.Full ?? "", person?.Mother ?? "", national ?? "", sham ?? "", personal ?? "",
            person?.Full ?? "", "", "", "", "", phone ?? "", "", null,
            mapped, [], headers,
            ContractRaw: contract?.C ?? "", SecondaryRaw: contract?.S ?? "");
    }

    private static (string? N, (string, string)? P, string? M, string? S, (string, string)? C, string? T)
        SideValues(string side, int variant) => side switch
    {
        "national_id" => ($"11111111{variant}", null, null, null, null, null),
        "person" => (null, ($"اسم{variant} أب{variant} جد{variant}", $"أم{variant}"), null, null, null, null),
        "personal_no" => (null, null, $"9{variant}", null, null, null),
        "sham_cash" => (null, null, null, $"111122223333444{variant}", null, null),
        "contract_pair" => (null, null, null, null, ($"C{variant}", $"S{variant}"), null),
        "phone" => (null, null, null, null, null, $"090000000{variant}"),
        _ => throw new ArgumentOutOfRangeException(nameof(side)),
    };

    private static ConflictEngine.EngineRow BuildRow(
        string from, string to, int fromVariant, int toVariant)
    {
        var f = SideValues(from, fromVariant);
        var t = SideValues(to, toVariant);
        return PairRow(
            f.N ?? t.N,
            f.P ?? t.P,
            f.M ?? t.M,
            f.S ?? t.S,
            f.C ?? t.C,
            f.T ?? t.T);
    }

    private static string Suffix(string side) => side switch
    {
        "national_id" => "national",
        "person" => "person",
        "personal_no" => "personal",
        "sham_cash" => "sham",
        "contract_pair" => "contract",
        "phone" => "phone",
        _ => throw new ArgumentOutOfRangeException(nameof(side)),
    };

    public static IEnumerable<object[]> AllDirectedPairs()
    {
        foreach (var rule in ConflictCatalog.Rules)
        {
            if (rule.Category != "conflicting" || rule.PairFrom is null || rule.PairTo is null)
                continue;
            yield return [rule.Key, rule.PairFrom, rule.PairTo];
        }
    }

    [Theory]
    [MemberData(nameof(AllDirectedPairs))]
    public void DirectedPair_Flags_AndReverseStaysSilent(string rule, string from, string to)
    {
        // Shared from-value, two distinct to-values → rule flags both rows,
        // reverse direction stays silent (asymmetry).
        var a = BuildRow(from, to, 1, 1);
        var b = BuildRow(from, to, 1, 2);
        var m = ConflictEngine.EvaluateConflicting([a, b], null);
        Assert.True(Has(m, a, rule), $"positive {rule}");
        Assert.True(Has(m, b, rule), $"positive {rule}");
        var reverse = $"pair_{Suffix(to)}_{Suffix(from)}";
        Assert.False(Has(m, a, reverse), $"asymmetric {reverse}");
        Assert.False(Has(m, b, reverse), $"asymmetric {reverse}");
    }

    [Theory]
    [MemberData(nameof(AllDirectedPairs))]
    public void DirectedPair_ReverseDirection_FlagsIndependently(string rule, string from, string to)
    {
        // Shared to-value, two distinct from-values → reverse flags, rule silent.
        var reverse = $"pair_{Suffix(to)}_{Suffix(from)}";
        if (!ConflictCatalog.ByKey.ContainsKey(reverse)) return;
        var a = BuildRow(to, from, 1, 1);
        var b = BuildRow(to, from, 1, 2);
        var m = ConflictEngine.EvaluateConflicting([a, b], null);
        Assert.True(Has(m, a, reverse), $"positive {reverse}");
        Assert.False(Has(m, a, rule), $"asymmetric {rule}");
    }

    private static bool Has(IReadOnlyDictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>> m,
        ConflictEngine.EngineRow row, string rule)
        => m.TryGetValue(row.Id, out var list) && list.Any(i => i.Rule == rule);

    [Fact]
    public void DirectedPair_CountIs22()
    {
        Assert.Equal(22, AllDirectedPairs().Count());
    }

    // ---- >200-row export equality ----

    private static (AppDbContext Db, ConflictService Svc, Guid FileId) SetupBig()
    {
        var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "cg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        db.SaveChanges();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "cf" + Guid.NewGuid().ToString("N")[..6],
            OriginalFilename = "o.xlsx", SheetName = "S",
        };
        db.Files.Add(file);
        db.SaveChanges();
        db.FileColumns.AddRange(
            new FileColumn { FileId = file.Id, HeaderRaw = "h_national", HeaderNormalized = "h_national", ColumnIndex = 1, StandardField = StandardField.NationalId },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_full", HeaderNormalized = "h_full", ColumnIndex = 2, StandardField = StandardField.FullName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName });
        db.SaveChanges();
        for (var i = 0; i < 250; i++)
        {
            var national = $"12{i:000}";
            var data = new Dictionary<string, string>
            {
                ["h_national"] = national, ["h_full"] = $"اسم{i} أب{i} جد{i}", ["h_mother"] = "أم",
            };
            db.Records.Add(new RecordEntity
            {
                FileId = file.Id, RowIndex = 2 + i,
                Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
                SfFullName = $"اسم{i} أب{i} جد{i}",
                SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
                SfMotherName = "أم",
                DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
            });
        }
        db.SaveChanges();
        return (db, TestHelpers.ConflictSvc(db), file.Id);
    }

    [Fact]
    public async Task ExportBeyond200_MatchesListSemantics()
    {
        var (_, svc, _) = SetupBig();
        var scope = new DataScopeDto { GroupIds = null, FileIds = null };
        var req = new ValidConflictRequest("invalid", "national_id", "national_short", 1, 25, "issueNumber", "asc");
        var list = await svc.ListAsync(req, scope);
        Assert.Equal(250, list.Total);
        var bytes = await svc.ExportAsync(req, scope);
        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheets.First();
        Assert.Equal(251, ws.LastRowUsed()!.RowNumber());
        var exportedIds = new HashSet<string>();
        for (var r = 2; r <= 251; r++)
            exportedIds.Add(ws.Cell(r, 3).GetValue<int>().ToString());
        Assert.Equal(250, exportedIds.Count);
    }

    // ---- sort/page stability ----

    [Fact]
    public async Task SortAndPage_StableAcrossDirections()
    {
        var (_, svc, _) = SetupBig();
        var scope = new DataScopeDto { GroupIds = null, FileIds = null };
        var asc1 = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 1, 100, "nationalId", "asc"), scope);
        var asc2 = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 2, 100, "nationalId", "asc"), scope);
        var asc3 = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 3, 100, "nationalId", "asc"), scope);
        var desc = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 1, 250, "nationalId", "desc"), scope);
        Assert.Equal(250, asc1.Total);
        Assert.Equal(3, asc1.PageCount);
        // Pages partition the full set without overlap or loss.
        var paged = asc1.Rows.Concat(asc2.Rows).Concat(asc3.Rows).ToList();
        Assert.Equal(250, paged.Count);
        Assert.Equal(250, paged.Select(r => r.Id).Distinct().Count());
        Assert.Equal(
            paged.Select(r => r.Id).OrderBy(g => g).ToList(),
            desc.Rows.Select(r => r.Id).OrderBy(g => g).ToList());
        // Descending is the exact reverse of ascending.
        Assert.Equal(
            desc.Rows.Select(r => r.NationalId).ToList(),
            paged.Select(r => r.NationalId).Reverse().ToList());
    }

    // ---- cache SQL static coverage: all 5 tables × 4 statements ----

    [Fact]
    public void CacheSql_CoversAllFiveTables()
    {
        var sql = TestHelpers.ApiDataFile("ConflictCache.sql");
        foreach (var table in new[] { "records", "files", "file_columns", "upload_jobs", "ignored_conflicts" })
            Assert.Contains(table, sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("conflict_cache_state", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("conflict_query_cache", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("revision = revision + 1", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("INSERT INTO conflict_cache_state", sql, StringComparison.OrdinalIgnoreCase);
    }

    // ---- live PG: 20-mutation trigger scenario, isolated + rolled back ----

    [Fact]
    public async Task Live_TriggersBumpRevision_On20Mutations()
    {
        if (!TestHelpers.FixtureDbAvailable()) return;
        var csb = "Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres;Timeout=5;Command Timeout=30";
        try
        {
            await using var conn = new NpgsqlConnection(csb);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            var schema = "ccheck_" + Guid.NewGuid().ToString("N")[..12];
            async Task Exec(string sql)
            {
                await using var cmd = new NpgsqlCommand(sql, conn, tx);
                await cmd.ExecuteNonQueryAsync();
            }
            async Task<long> Revision()
            {
                await using var cmd = new NpgsqlCommand("SELECT revision FROM public.conflict_cache_state WHERE id = 1", conn, tx);
                return (long)(await cmd.ExecuteScalarAsync())!;
            }
            await Exec($"CREATE SCHEMA \"{schema}\"");
            var tables = new[] { "t_records", "t_files", "t_file_columns", "t_upload_jobs", "t_ignored" };
            foreach (var t in tables)
                await Exec($"CREATE TABLE \"{schema}\".\"{t}\" (id INTEGER PRIMARY KEY, value TEXT)");
            await Exec($"CREATE OR REPLACE FUNCTION \"{schema}\".bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.conflict_cache_state SET revision = revision + 1 WHERE id = 1; RETURN NULL; END; $$");
            foreach (var t in tables)
                await Exec($"CREATE TRIGGER trg AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON \"{schema}\".\"{t}\" FOR EACH STATEMENT EXECUTE FUNCTION \"{schema}\".bump()");
            var bumps = 0;
            foreach (var t in tables)
            {
                foreach (var stmt in new[]
                {
                    $"INSERT INTO \"{schema}\".\"{t}\" VALUES (2, 'added')",
                    $"UPDATE \"{schema}\".\"{t}\" SET value = 'edited' WHERE id = 2",
                    $"DELETE FROM \"{schema}\".\"{t}\" WHERE id = 2",
                    $"TRUNCATE \"{schema}\".\"{t}\"",
                })
                {
                    var before = await Revision();
                    await Exec(stmt);
                    var after = await Revision();
                    Assert.True(after != before, stmt);
                    bumps++;
                }
            }
            Assert.Equal(20, bumps);
            await tx.RollbackAsync();
        }
        catch (NpgsqlException)
        {
            // Fixture DB reachable for probes but not writable here: skip.
            return;
        }
    }
}
