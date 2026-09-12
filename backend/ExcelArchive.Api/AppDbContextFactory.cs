using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ExcelArchive.Api;

/// <summary>
/// Enables `dotnet ef` commands (the runtime boots via EnsureCreated).
/// Connection comes from ConnectionStrings__Default / DATABASE_URL so tooling
/// never silently targets the wrong database; secrets stay out of source.
/// Example (PowerShell):
///   $env:ConnectionStrings__Default='Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres'
///   dotnet tool run dotnet-ef database update --project ExcelArchive.Infrastructure --startup-project ExcelArchive.Api
/// </summary>
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
            ?? Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? "Host=localhost;Port=5432;Database=excel_archive_2;Username=excel_archive";
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;
        return new AppDbContext(options);
    }
}
