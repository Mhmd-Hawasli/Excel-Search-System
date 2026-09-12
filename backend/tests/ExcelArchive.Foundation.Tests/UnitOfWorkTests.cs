using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit.Abstractions;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2: UnitOfWork contract tests. Shared-context assertions run on
/// InMemory; real transaction rollback is PostgreSQL-only and is skipped
/// (recorded, not counted as success) when no fixture DB is available.</summary>
public sealed class UnitOfWorkTests(ITestOutputHelper output)
{
    private static ServiceProvider Wiring(AppDbContext db)
    {
        var services = new ServiceCollection();
        // Shared instance per provider: InMemory via TestHelpers carries the
        // JsonDocument converter that raw UseInMemoryDatabase lacks.
        services.AddScoped<AppDbContext>(_ => db);
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IGroupRepository, GroupRepository>();
        services.AddScoped<IFileRepository, FileRepository>();
        services.AddScoped<IRecordRepository, RecordRepository>();
        services.AddScoped<IActivityLogRepository, ActivityLogRepository>();
        services.AddScoped<IUploadJobRepository, UploadJobRepository>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<IFileColumnRepository, FileColumnRepository>();
        services.AddScoped<IRecordEditRepository, RecordEditRepository>();
        services.AddScoped<IDataQualityRepository, DataQualityRepository>();
        services.AddScoped<IMappingTemplateRepository, MappingTemplateRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        return services.BuildServiceProvider();
    }

    [Fact]
    public void UnitOfWork_Resolves_With_All_Repositories()
    {
        using var provider = Wiring(TestHelpers.InMemoryDb());
        using var scope = provider.CreateScope();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        Assert.NotNull(uow.Users);
        Assert.NotNull(uow.Groups);
        Assert.NotNull(uow.Files);
        Assert.NotNull(uow.Records);
        Assert.NotNull(uow.ActivityLogs);
        Assert.NotNull(uow.UploadJobs);
        Assert.NotNull(uow.Categories);
        Assert.NotNull(uow.FileColumns);
        Assert.NotNull(uow.RecordEdits);
        Assert.NotNull(uow.DataQuality);
        Assert.NotNull(uow.MappingTemplates);
    }

    [Fact]
    public async Task Repositories_Share_One_Context_And_Save_Once()
    {
        using var provider = Wiring(TestHelpers.InMemoryDb());
        using var scope = provider.CreateScope();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        Assert.NotNull(uow.Users);
        Assert.NotNull(uow.Groups);
        Assert.NotNull(uow.Files);
        Assert.NotNull(uow.Records);
        Assert.NotNull(uow.ActivityLogs);
        Assert.NotNull(uow.UploadJobs);

        var user = uow.Users.Add(new User { Username = "uow-user", PasswordHash = "x", DisplayName = "d", IsActive = true });
        var group = uow.Groups.Add(new Group { Name = "uow-group" });
        var saved = await uow.SaveChangesAsync();
        Assert.True(saved >= 2);
        Assert.NotEqual(Guid.Empty, user.Id);
        Assert.NotEqual(Guid.Empty, group.Id);

        Assert.NotNull(await uow.Users.FindAsync(user.Id));
        Assert.NotNull(await uow.Groups.FindAsync(group.Id));
    }

    [Fact]
    public async Task ExecuteInTransaction_Commits_And_Rolls_Back_On_Postgres()
    {
        if (!TestHelpers.FixtureDbAvailable())
        {
            output.WriteLine("SKIPPED: no fixture PostgreSQL on localhost:5433; transaction proof requires PostgreSQL, InMemory does not prove it.");
            return;
        }
        var cs = "Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres";
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(cs).UseSnakeCaseNamingConvention().Options;
        using var provider = Wiring(new AppDbContext(options));
        using var scope = provider.CreateScope();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var committedId = Guid.Empty;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            var u = uow.Users.Add(new User { Username = "uow-tx-" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", DisplayName = "d", IsActive = true });
            await Task.CompletedTask;
            committedId = u.Id;
        });
        Assert.NotNull(await uow.Users.FindAsync(committedId));

        var rolledBackId = Guid.Empty;
        await Assert.ThrowsAsync<InvalidOperationException>(() => uow.ExecuteInTransactionAsync(() =>
        {
            var u = uow.Users.Add(new User { Username = "uow-rb-" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", DisplayName = "d", IsActive = true });
            rolledBackId = u.Id;
            throw new InvalidOperationException("boom");
        }));
        Assert.Null(await uow.Users.FindAsync(rolledBackId));
    }
}
