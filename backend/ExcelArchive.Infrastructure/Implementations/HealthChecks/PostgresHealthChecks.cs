using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ExcelArchive.Infrastructure.Implementations.HealthChecks;

/// <summary>PostgreSQL liveness (same query/message as the previous inline check).</summary>
public sealed class PostgresHealthCheck(IConfiguration configuration) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            using var conn = new Npgsql.NpgsqlConnection(ConnectionString(configuration));
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT 1";
            cmd.ExecuteScalar();
            return Task.FromResult(HealthCheckResult.Healthy());
        }
        catch (Exception ex) { return Task.FromResult(HealthCheckResult.Unhealthy(exception: ex)); }
    }

    internal static string ConnectionString(IConfiguration configuration) =>
        configuration.GetConnectionString("Default")
        ?? configuration["DATABASE_URL"]
        ?? "Host=localhost;Port=5434;Database=excel_archive_2;Username=excel_archive;Password=excel_archive";
}

/// <summary>Search/cache schema readiness (extensions + 14 indexes + cache tables).</summary>
public sealed class SearchSchemaHealthCheck(IConfiguration configuration) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            using var conn = new Npgsql.NpgsqlConnection(PostgresHealthCheck.ConnectionString(configuration));
            conn.Open();
            static int Scalar(Npgsql.NpgsqlConnection c, string sql)
            {
                using var cmd = c.CreateCommand();
                cmd.CommandText = sql;
                return Convert.ToInt32(cmd.ExecuteScalar());
            }
            var ext = Scalar(conn,
                "SELECT COUNT(*) FROM pg_extension WHERE extname IN ('pg_trgm','fuzzystrmatch')");
            if (ext < 2)
                return Task.FromResult(HealthCheckResult.Unhealthy(description:
                    $"missing Postgres extensions (found {ext}/2: pg_trgm, fuzzystrmatch)"));
            var idx = Scalar(conn,
                "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'records\\_%' ESCAPE '\\'");
            if (idx < 14)
                return Task.FromResult(HealthCheckResult.Unhealthy(description:
                    $"missing search indexes (found {idx}, expected >= 14)"));
            var cache = Scalar(conn,
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('conflict_cache_state','conflict_query_cache')");
            if (cache < 2)
                return Task.FromResult(HealthCheckResult.Unhealthy(description:
                    "missing conflict cache tables (conflict_cache_state/conflict_query_cache)"));
            // Search results share this revision. Every source that changes
            // their rows, labels, or visibility must invalidate cached pages.
            var triggers = Scalar(conn,
                "SELECT COUNT(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (" +
                "'records_conflict_cache_changed','files_conflict_cache_changed'," +
                "'groups_conflict_cache_changed','file_columns_conflict_cache_changed'," +
                "'upload_jobs_conflict_cache_changed','ignored_conflicts_cache_changed')");
            if (triggers < 6)
                return Task.FromResult(HealthCheckResult.Unhealthy(description:
                    $"missing cache invalidation triggers (found {triggers}/6)"));
            return Task.FromResult(HealthCheckResult.Healthy());
        }
        catch (Exception ex) { return Task.FromResult(HealthCheckResult.Unhealthy(exception: ex)); }
    }
}
