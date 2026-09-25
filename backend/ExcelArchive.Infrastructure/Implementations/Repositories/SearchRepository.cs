using System.Text;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Interfaces.Repositories;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

/// <summary>Parameterized search SQL over Npgsql: count + page in one plan.
/// Connection/credentials stay in Infrastructure; the service owns the logical plan.</summary>
public sealed class SearchRepository(IConfiguration config) : ISearchRepository
{
    private const int FuzzyDivisor = 5;

    public async Task<SearchResultSet> ExecuteAsync(
        SearchPlan plan,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        string? sortBy,
        string sortDirection,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var parameters = new List<NpgsqlParameter>();
        var conditions = plan.Fields.Select(f => ConditionFor(f, plan, parameters)).ToList();
        var fuzzy = plan.Fields.Select(f => FuzzyCondition(f, plan, parameters)).ToList();
        var exact = plan.Fields.Select(f => ExactFor(f, plan, parameters)).ToList();
        var prefix = plan.Fields.Select(f => PrefixFor(f, plan, parameters)).ToList();
        // «عرض المتشابه» (افتراضي true): عند false يقتصر التطابق على التام فقط.
        var matchBranches = plan.IncludeSimilar
            ? plan.Fields.Select((f, i) => (f.Key, Sql: conditions[i]))
                .Concat(plan.Fields.Select((f, i) => (f.Key, Sql: fuzzy[i]))).ToList()
            : plan.Fields.Select((f, i) => (f.Key, Sql: exact[i])).ToList();
        var where = new StringBuilder("(")
            .Append(matchBranches.Count > 0 ? string.Join(" OR ", matchBranches.Select(b => b.Sql)) : "FALSE")
            .Append(')');
        AppendScope(where, groupIds, fileIds, allowedFileIds, parameters);

        var fieldCases = matchBranches.Select(b => $"WHEN {b.Sql} THEN '{b.Key}'").ToList();
        var valueCases = matchBranches
            .Select(b => $"WHEN {b.Sql} THEN {DisplayColumn(plan.Fields.First(f => f.Key == b.Key))}").ToList();
        var rank = $"CASE WHEN ({string.Join(" OR ", exact)}) THEN 0 WHEN ({string.Join(" OR ", prefix)}) THEN 1 " +
            $"WHEN ({string.Join(" OR ", conditions)}) THEN 2 WHEN ({string.Join(" OR ", fuzzy)}) THEN 3 ELSE 4 END";
        var offset = (page - 1) * pageSize;

        using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        long total;
        using (var count = conn.CreateCommand())
        {
            count.CommandText = $"SELECT COUNT(*) FROM \"records\" r JOIN \"files\" f ON f.\"id\" = r.\"file_id\" WHERE {where}";
            foreach (var p in parameters) count.Parameters.AddWithValue(p.ParameterName, p.Value ?? DBNull.Value);
            total = Convert.ToInt64(await count.ExecuteScalarAsync(ct));
        }
        var rows = new List<SearchResultRow>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"""
                SELECT r."id", g."id", g."name", f."id", f."name",
                       r."sf_full_name", r."sf_national_id"::text, r."d_national_id",
                       r."sf_mother_name", r."sf_sham_cash"::text, r."sf_personal_no",
                       r."sf_first_name", r."sf_father_name", r."sf_last_name",
                       r."sf_phone", r."sf_contract_code", r."sf_secondary_contract_code",
                       r."sf_job_title", r."sf_functional_category", r."sf_organizational_level",
                       CASE {string.Join(" ", fieldCases)} ELSE NULL END AS "matchedField",
                        CASE {string.Join(" ", valueCases)} ELSE NULL END AS "matchedValue",
                        {rank} AS "matchRank", r."row_index"
                 FROM "records" r JOIN "files" f ON f."id" = r."file_id" JOIN "groups" g ON g."id" = f."group_id"
                 WHERE {where}
                 {OrderSql(sortBy, sortDirection)}
                 LIMIT {pageSize} OFFSET {offset}
                """;
            foreach (var p in parameters) cmd.Parameters.AddWithValue(p.ParameterName, p.Value ?? DBNull.Value);
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                string? Str(int i) => reader.IsDBNull(i) ? null : reader.GetString(i);
                int? Int(int i) => reader.IsDBNull(i) ? null : reader.GetInt32(i);
                rows.Add(new SearchResultRow(
                    reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetGuid(3), reader.GetString(4),
                    Str(5), Str(6), Str(7), Str(8), Str(9), Str(10), Str(11), Str(12), Str(13),
                    Str(14), Str(15), Str(16), Str(17), Int(18), Str(19),
                    Str(20), Str(21), reader.GetInt32(22), reader.GetInt32(23)));
            }
        }
        return new SearchResultSet(rows, total, page, pageSize, (int)Math.Ceiling(total / (double)pageSize));
    }

    /// <summary>
    /// Single-SELECT top-N variant (no COUNT) for the bulk fast path.
    /// Same match branches as the single search (exact conditions OR the
    /// full_name fuzzy levenshtein branch): bulk values with typos must find
    /// the same rows the single search finds. The caller still refines with
    /// the ≥80% whole-word closeness check, which is the same gate as the
    /// fuzzy predicate (distance * 5 &lt;= length), so no low match leaks in.
    /// </summary>
    public async Task<IReadOnlyList<SearchResultRow>> ExecuteTopAsync(
        SearchPlan plan,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        int take,
        CancellationToken ct = default)
    {
        var parameters = new List<NpgsqlParameter>();
        var conditions = plan.Fields.Select(f => ConditionFor(f, plan, parameters)).ToList();
        // Same fuzzy branch as the single search (full_name only; FALSE for
        // every other field): keeps bulk/single parity for typo'd values.
        var fuzzy = plan.Fields.Select(f => FuzzyCondition(f, plan, parameters)).ToList();
        var exact = plan.Fields.Select(f => ExactFor(f, plan, parameters)).ToList();
        var prefix = plan.Fields.Select(f => PrefixFor(f, plan, parameters)).ToList();
        var matchBranches = plan.IncludeSimilar
            ? plan.Fields.Select((f, i) => (f.Key, Sql: conditions[i]))
                .Concat(plan.Fields.Select((f, i) => (f.Key, Sql: fuzzy[i]))).ToList()
            : plan.Fields.Select((f, i) => (f.Key, Sql: exact[i])).ToList();
        var where = new StringBuilder("(")
            .Append(matchBranches.Count > 0 ? string.Join(" OR ", matchBranches.Select(b => b.Sql)) : "FALSE")
            .Append(')');
        AppendScope(where, groupIds, fileIds, allowedFileIds, parameters);

        var fieldCases = matchBranches.Select(b => $"WHEN {b.Sql} THEN '{b.Key}'").ToList();
        var valueCases = matchBranches
            .Select(b => $"WHEN {b.Sql} THEN {DisplayColumn(plan.Fields.First(f => f.Key == b.Key))}").ToList();
        // نفس ترتيب البحث المفرد: التام أولاً والتشبيهي أخيراً.
        var rank = $"CASE WHEN ({string.Join(" OR ", exact)}) THEN 0 WHEN ({string.Join(" OR ", prefix)}) THEN 1 " +
            $"WHEN ({string.Join(" OR ", conditions)}) THEN 2 WHEN ({string.Join(" OR ", fuzzy)}) THEN 3 ELSE 4 END";
        var limit = Math.Clamp(take, 1, 100);

        using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        var rows = new List<SearchResultRow>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"""
                SELECT r."id", g."id", g."name", f."id", f."name",
                       r."sf_full_name", r."sf_national_id"::text, r."d_national_id",
                       r."sf_mother_name", r."sf_sham_cash"::text, r."sf_personal_no",
                       r."sf_first_name", r."sf_father_name", r."sf_last_name",
                       r."sf_phone", r."sf_contract_code", r."sf_secondary_contract_code",
                       r."sf_job_title", r."sf_functional_category", r."sf_organizational_level",
                       CASE {string.Join(" ", fieldCases)} ELSE NULL END AS "matchedField",
                        CASE {string.Join(" ", valueCases)} ELSE NULL END AS "matchedValue",
                        {rank} AS "matchRank", r."row_index"
                 FROM "records" r JOIN "files" f ON f."id" = r."file_id" JOIN "groups" g ON g."id" = f."group_id"
                 WHERE {where}
                 {OrderSql(null, "asc")}
                 LIMIT {limit}
                """;
            foreach (var p in parameters) cmd.Parameters.AddWithValue(p.ParameterName, p.Value ?? DBNull.Value);
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                string? Str(int i) => reader.IsDBNull(i) ? null : reader.GetString(i);
                int? Int(int i) => reader.IsDBNull(i) ? null : reader.GetInt32(i);
                rows.Add(new SearchResultRow(
                    reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetGuid(3), reader.GetString(4),
                    Str(5), Str(6), Str(7), Str(8), Str(9), Str(10), Str(11), Str(12), Str(13),
                    Str(14), Str(15), Str(16), Str(17), Int(18), Str(19),
                    Str(20), Str(21), reader.GetInt32(22), reader.GetInt32(23)));
            }
        }
        return rows;
    }

    private static string Param(List<NpgsqlParameter> parameters, object value)
    {
        var name = $"p{parameters.Count}";
        parameters.Add(new NpgsqlParameter(name, value));
        return "@" + name;
    }

    private static string ColumnSql(SearchField field) =>
        field.Key == "name_parts" ? NamePartsSql :
        field.Key == "sham_cash" ? "LPAD(r.\"sf_sham_cash\"::TEXT, 16, '0')" : $"r.\"{field.Column}\"";

    /// <summary>تركيب الاسم الثلاثي: دمج الاسم والأب والنسبة للمطابقة عبر الأجزاء.</summary>
    private static string NamePartsSql =>
        "COALESCE(r.\"n_first_name\",'') || ' ' || COALESCE(r.\"n_father_name\",'') || ' ' || COALESCE(r.\"n_last_name\",'')";

    /// <summary>تطبيع كامل للطرف المخزن: الاستعلام يصل مجرداً من «ال» التعريف
    /// بينما العمود يحتفظ بها، فيُجرَّد العمود أيضاً ليتطابق التام والبداية بعد التطبيع.</summary>
    private static string StrippedColumn(SearchField field) =>
        $"regexp_replace({ColumnSql(field)}, '(^| )ال', '\\1', 'g')";

    private static string ConditionFor(SearchField field, SearchPlan plan, List<NpgsqlParameter> parameters)
    {
        if (field.Kind == "functional_category")
            return plan.CategoryNeedle is null ? "FALSE" : $"r.\"sf_functional_category\" = {plan.CategoryNeedle.Value}";
        if (field.Kind == "numeric")
            return plan.NumericNeedle.Length == 0
                ? "FALSE" : $"{ColumnSql(field)} ILIKE {Param(parameters, "%" + plan.NumericNeedle + "%")}";
        if (plan.TextTokens.Count == 0) return "FALSE";
        return "(" + string.Join(" AND ", plan.TextTokens.Select(t =>
            $"{ColumnSql(field)} ILIKE {Param(parameters, "%" + t + "%")}")) + ")";
    }

    private static string FuzzyCondition(SearchField field, SearchPlan plan, List<NpgsqlParameter> parameters)
    {
        if (field.Key != "full_name" || plan.TextTokens.Count == 0) return "FALSE";
        var baseLength = string.Concat(plan.TextTokens).EnumerateRunes().Count();
        var tokens = string.Join(",", plan.TextTokens.Select(t => Param(parameters, t)));
        var divisor = Param(parameters, FuzzyDivisor);
        var length = Param(parameters, baseLength);
        return $"""
            (SELECT COALESCE(SUM(best.distance), 0) * {divisor} <= {length}
             FROM unnest(ARRAY[{tokens}]) AS token
             CROSS JOIN LATERAL (
               SELECT COALESCE(
                 MIN(levenshtein(
                   CASE WHEN word LIKE 'ال%' AND char_length(word) >= 5 THEN substring(word FROM 3) ELSE word END,
                   token
                 )),
                 char_length(token)
               ) AS distance
               FROM string_to_table(COALESCE(r."n_full_name", ''), ' ') AS word
               WHERE word <> ''
             ) AS best)
            """;
    }

    private static string ExactFor(SearchField field, SearchPlan plan, List<NpgsqlParameter> parameters)
    {
        if (field.Kind == "functional_category")
            return plan.CategoryNeedle is null ? "FALSE" : $"r.\"sf_functional_category\" = {plan.CategoryNeedle.Value}";
        var needle = field.Kind == "numeric" ? plan.NumericNeedle : plan.NormalizedText;
        if (needle.Length == 0) return "FALSE";
        return field.Kind == "numeric"
            ? $"{ColumnSql(field)} = {Param(parameters, needle)}"
            : $"{StrippedColumn(field)} = {Param(parameters, needle)}";
    }

    private static string PrefixFor(SearchField field, SearchPlan plan, List<NpgsqlParameter> parameters)
    {
        if (field.Kind == "functional_category")
            return plan.CategoryNeedle is null ? "FALSE" : $"r.\"sf_functional_category\" = {plan.CategoryNeedle.Value}";
        var needle = field.Kind == "numeric" ? plan.NumericNeedle : plan.NormalizedText;
        if (needle.Length == 0) return "FALSE";
        return field.Kind == "numeric"
            ? $"{ColumnSql(field)} ILIKE {Param(parameters, needle + "%")}"
            : $"{StrippedColumn(field)} ILIKE {Param(parameters, needle + "%")}";
    }

    private static string DisplayColumn(SearchField field) => field.Key switch
    {
        "name_parts" => NamePartsSql,
        "sham_cash" => "LPAD(r.\"sf_sham_cash\"::TEXT, 16, '0')",
        "functional_category" => "r.\"sf_functional_category\"::text",
        "first_name" => "r.\"sf_first_name\"",
        "father_name" => "r.\"sf_father_name\"",
        "last_name" => "r.\"sf_last_name\"",
        "full_name" => "r.\"sf_full_name\"",
        "national_id" => "r.\"d_national_id\"",
        "personal_no" => "r.\"d_personal_no\"",
        "mother_name" => "r.\"sf_mother_name\"",
        "phone" => "r.\"sf_phone\"",
        "contract_code" => "r.\"sf_contract_code\"",
        "secondary_contract_code" => "r.\"sf_secondary_contract_code\"",
        "job_title" => "r.\"sf_job_title\"",
        "organizational_level" => "r.\"sf_organizational_level\"",
        _ => $"r.\"{field.Column}\"",
    };

    private static void AppendScope(
        StringBuilder where,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        List<NpgsqlParameter> parameters)
    {
        string InList(string sql, IEnumerable<Guid> ids)
        {
            var names = ids.Select(id => Param(parameters, id)).ToList();
            return $"{sql} IN ({string.Join(",", names)})";
        }
        // V1 query.ts: requested group AND file filters combine with OR; the
        // authorized-file boundary always ANDs.
        if (groupIds.Count > 0 && fileIds.Count > 0)
            where.Append(" AND (").Append(InList("f.\"group_id\"", groupIds))
                .Append(" OR ").Append(InList("f.\"id\"", fileIds)).Append(')');
        else if (groupIds.Count > 0)
            where.Append(" AND ").Append(InList("f.\"group_id\"", groupIds));
        else if (fileIds.Count > 0)
            where.Append(" AND ").Append(InList("f.\"id\"", fileIds));
        if (allowedFileIds is not null)
            where.Append(" AND ").Append(InList("f.\"id\"", allowedFileIds));
    }

    private static string OrderSql(string? sortBy, string sortDirection)
    {
        var desc = string.Equals(sortDirection, "desc", StringComparison.OrdinalIgnoreCase);
        var dir = desc ? "DESC" : "ASC";
        return sortBy?.Trim().ToLowerInvariant() switch
        {
            "source" => $"ORDER BY g.\"name\" {dir} NULLS LAST, f.\"name\" {dir} NULLS LAST, r.\"id\" ASC",
            "full_name" => $"ORDER BY r.\"n_full_name\" {dir} NULLS LAST, r.\"id\" ASC",
            "national_id" => $"ORDER BY NULLIF(r.\"d_national_id\", '')::numeric {dir} NULLS LAST, r.\"id\" ASC",
            "mother_name" => $"ORDER BY r.\"n_mother_name\" {dir} NULLS LAST, r.\"id\" ASC",
            "sham_cash" => $"ORDER BY r.\"sf_sham_cash\" {dir} NULLS LAST, r.\"id\" ASC",
            "personal_no" => $"ORDER BY NULLIF(r.\"d_personal_no\", '')::numeric {dir} NULLS LAST, r.\"id\" ASC",
            "job_title" => $"ORDER BY r.\"n_job_title\" {dir} NULLS LAST, r.\"id\" ASC",
            "functional_category" => $"ORDER BY r.\"sf_functional_category\" {dir} NULLS LAST, r.\"id\" ASC",
            "organizational_level" => $"ORDER BY r.\"n_organizational_level\" {dir} NULLS LAST, r.\"id\" ASC",
            "match" => $"ORDER BY \"matchedValue\" {dir} NULLS LAST, \"matchedField\" {dir} NULLS LAST, r.\"id\" ASC",
            _ => "ORDER BY \"matchRank\" ASC, r.\"created_at\" DESC, r.\"id\" ASC",
        };
    }

    private string ConnectionString =>
        config.GetConnectionString("Default") ?? config["DATABASE_URL"]
        ?? "Host=localhost;Port=5434;Database=excel_archive_2;Username=excel_archive;Password=excel_archive";
}
