using System.Text.Json;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.Caching;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Repositories;
using ExcelArchive.Infrastructure.Implementations.Security;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;
using Npgsql;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Shared factories for Phase 1 foundation tests. No network, no Postgres server.</summary>
internal static class TestHelpers
{
    public const string DevSecret = "phase1-test-secret-with-at-least-32-characters";

    public static IConfiguration Config(string? secret = DevSecret, string? environment = "Development")
    {
        var values = new Dictionary<string, string>();
        if (secret is not null) values["SESSION_SECRET"] = secret;
        if (environment is not null) values["ASPNETCORE_ENVIRONMENT"] = environment;
        return new TestConfig(values);
    }

    public static AppDbContext InMemoryDb() => new TestDb();

    /// <summary>
    /// Test-only context: the Npgsql provider maps JsonDocument natively
    /// (jsonb) but InMemory does not. The converter below is test-only;
    /// production mapping is untouched.
    /// </summary>
    private sealed class TestDb : AppDbContext
    {
        public TestDb()
            : base(new DbContextOptionsBuilder<AppDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options)
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            var converter = new ValueConverter<JsonDocument, string>(
                v => v.RootElement.GetRawText(),
                s => JsonDocument.Parse(s));
            foreach (var entity in modelBuilder.Model.GetEntityTypes())
                foreach (var prop in entity.GetProperties()
                    .Where(p => p.ClrType == typeof(JsonDocument)).ToList())
                    modelBuilder.Entity(entity.ClrType).Property(prop.Name).HasConversion(converter);
        }
    }

    /// <summary>Npgsql model without a live connection (metadata inspection only).</summary>
    public static AppDbContext ModelOnlyDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Port=5432;Database=unused;Username=unused;Password=unused")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new AppDbContext(options);
    }

    public static AuthService Auth(AppDbContext db, IConfiguration? config = null)
    {
        var uow = Uow(db);
        var passwords = new PasswordHasher();
        var sessions = new SessionTokenService(config ?? Config());
        return new AuthService(uow, passwords, sessions, new ScopedArchiveQuery(uow));
    }

    /// <summary>Unit of work over a test database (wires the real repositories).</summary>
    public static IUnitOfWork Uow(AppDbContext db) => new UnitOfWork(db,
        new UserRepository(db), new GroupRepository(db), new FileRepository(db),
        new RecordRepository(db), new ActivityLogRepository(db), new UploadJobRepository(db),
        new CategoryRepository(db), new FileColumnRepository(db), new RecordEditRepository(db),
        new DataQualityRepository(db), new MappingTemplateRepository(db));

    public static IColumnOrderService ColumnOrders(AppDbContext db) => new ColumnOrderService(Uow(db));

    public static UploadJobProcessor UploadProcessor(AppDbContext db, IServiceProvider sp)
    {
        var uow = Uow(db);
        var activity = sp.GetRequiredService<IActivityService>();
        var columns = sp.GetService<IColumnOrderService>() ?? new ColumnOrderService(uow);
        var headers = sp.GetService<IHeaderMappingValidator>() ?? new HeaderMappingValidatorAdapter();
        var store = sp.GetRequiredService<WorkbookFileStore>();
        return new UploadJobProcessor(uow, activity, columns, headers, new WorkbookInspector(store), store);
    }

    public static ConflictService ConflictSvc(AppDbContext db)
        => new(new ConflictRepository(db), new ConflictCacheService(db), new ConflictExportBuilderAdapter());

    public static BackupService BackupSvc(AppDbContext db)
        => new(new BackupRepository(db), Uow(db), new ActivityService(Uow(db)));

    public static CurrentUserDto User(params PermissionDto[] permissions)
        => new(Guid.NewGuid(), "test", null, permissions);

    public static PermissionDto Perm(string key, Guid? groupId = null, Guid? fileId = null)
        => new(key, groupId, fileId);

    /// <summary>Walks up to the backend/ dir to find Api SQL sources regardless of runner cwd.</summary>
    public static string ApiDataFile(string name)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !System.IO.File.Exists(Path.Combine(dir.FullName, "ExcelArchive.Api.sln")))
            dir = dir.Parent;
        if (dir is null) throw new DirectoryNotFoundException("backend/ solution root not found.");
        var candidates = new[]
        {
            Path.Combine(dir.FullName, "ExcelArchive.Infrastructure", "Implementations", "Persistence", "Sql", name),
            Path.Combine(dir.FullName, "ExcelArchive.Api", "Data", name),
            Path.Combine(dir.FullName, "src", "ExcelArchive.Api", "Data", name),
        };
        var path = candidates.FirstOrDefault(System.IO.File.Exists)
            ?? throw new FileNotFoundException(candidates[0]);
        if (!System.IO.File.Exists(path)) throw new FileNotFoundException(path);
        return System.IO.File.ReadAllText(path);
    }

    private sealed class TestConfig(Dictionary<string, string> values) : IConfiguration
    {
        public string? this[string key]
        {
            get => values.TryGetValue(key, out var v) ? v : null;
            set => values[key] = value!;
        }

        public IEnumerable<IConfigurationSection> GetChildren() => [];
        public IChangeToken GetReloadToken() => NeverToken.Instance;
        public IConfigurationSection GetSection(string key)
            => new TestSection(this, key, values.TryGetValue(key, out var v) ? v : null);
    }

    private sealed class NeverToken : Microsoft.Extensions.Primitives.IChangeToken
    {
        public static readonly NeverToken Instance = new();
        public bool HasChanged => false;
        public bool ActiveChangeCallbacks => false;
        public IDisposable RegisterChangeCallback(Action<object?> callback, object? state)
            => Nop.Instance;
        private sealed class Nop : IDisposable
        {
            public static readonly Nop Instance = new();
            public void Dispose() { }
        }
    }

    private sealed class TestSection(IConfiguration root, string path, string? value) : IConfigurationSection
    {
        public string? this[string key]
        {
            get => root[(string.IsNullOrEmpty(path) ? key : path + ":" + key)];
            set { }
        }
        public string Key => path;
        public string Path => path;
        public string? Value { get => value; set { } }
        public IEnumerable<IConfigurationSection> GetChildren() => [];
        public IChangeToken GetReloadToken() => NeverToken.Instance;
        public IConfigurationSection GetSection(string key)
            => new TestSection(root, string.IsNullOrEmpty(path) ? key : path + ":" + key,
                root[string.IsNullOrEmpty(path) ? key : path + ":" + key]);
    }

    /// <summary>Live fixture-DB probe: true when localhost:5433 answers.</summary>
    public static bool FixtureDbAvailable()
    {
        try
        {
            using var conn = new NpgsqlConnection(
                "Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres;Timeout=3;Command Timeout=5");
            conn.Open();
            return true;
        }
        catch { return false; }
    }

    public static IConfiguration FixtureConfig()
    {
        var config = Config();
        config["ConnectionStrings:Default"] = "Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres";
        return config;
    }
}
