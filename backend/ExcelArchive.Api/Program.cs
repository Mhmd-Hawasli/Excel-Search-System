using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ExcelArchive.Api.Common.Context;
using ExcelArchive.Api.Middlewares;
using ExcelArchive.Application.Common.Context;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Caching;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Application.Interfaces.Security;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.BackgroundServices;
using ExcelArchive.Infrastructure.Implementations.Caching;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.HealthChecks;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Repositories;
using ExcelArchive.Infrastructure.Implementations.Security;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, cfg) => cfg
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"));

// Composition root (Mandoob-style): the API wires data access (DbContext),
// repositories, UnitOfWork, security/storage/cache/excel adapters, application
// services and the background worker. Infrastructure exposes no Add* extension.
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? builder.Configuration["DATABASE_URL"]
    ?? "Host=localhost;Port=5432;Database=excel_archive_2;Username=excel_archive;Password=excel_archive";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorCodesToAdd: null);
            npgsql.CommandTimeout(60);
        })
        .UseSnakeCaseNamingConvention());

builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IGroupRepository, GroupRepository>();
builder.Services.AddScoped<IFileRepository, FileRepository>();
builder.Services.AddScoped<IRecordRepository, RecordRepository>();
builder.Services.AddScoped<IActivityLogRepository, ActivityLogRepository>();
builder.Services.AddScoped<IUploadJobRepository, UploadJobRepository>();
builder.Services.AddScoped<ICategoryRepository, CategoryRepository>();
builder.Services.AddScoped<IFileColumnRepository, FileColumnRepository>();
builder.Services.AddScoped<IRecordEditRepository, RecordEditRepository>();
builder.Services.AddScoped<IDataQualityRepository, DataQualityRepository>();
builder.Services.AddScoped<IMappingTemplateRepository, MappingTemplateRepository>();
builder.Services.AddScoped<ISearchRepository, SearchRepository>();
builder.Services.AddScoped<IConflictRepository, ConflictRepository>();
builder.Services.AddScoped<IBackupRepository, BackupRepository>();
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();

builder.Services.AddSingleton<IPasswordHasher, PasswordHasher>();
builder.Services.AddSingleton<ISessionTokenService, SessionTokenService>();
builder.Services.AddSingleton<WorkbookFileStore>();
builder.Services.AddSingleton<IWorkbookFileStore>(sp => sp.GetRequiredService<WorkbookFileStore>());
builder.Services.AddSingleton<WorkbookInspector>();
builder.Services.AddSingleton<IWorkbookReader>(sp => sp.GetRequiredService<WorkbookInspector>());
builder.Services.AddSingleton<IWorkbookInspector>(sp => sp.GetRequiredService<WorkbookInspector>());
builder.Services.AddSingleton<MergeFileStore>();
builder.Services.AddSingleton<IMergeFileStore>(sp => sp.GetRequiredService<MergeFileStore>());
builder.Services.AddSingleton<MergeSessionStore>();
builder.Services.AddSingleton<IMergeSessionStore>(sp => sp.GetRequiredService<MergeSessionStore>());
builder.Services.AddSingleton<MergeExportStore>();
builder.Services.AddSingleton<IMergeExportStore>(sp => sp.GetRequiredService<MergeExportStore>());
builder.Services.AddSingleton<SheetMergeStore>();
builder.Services.AddSingleton<ISheetMergeStore>(sp => sp.GetRequiredService<SheetMergeStore>());
builder.Services.AddSingleton<IMergeService, MergeService>();
builder.Services.AddSingleton<ISheetMergeService, SheetMergeService>();
builder.Services.AddScoped<IConflictCacheService, ConflictCacheService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IScopedArchiveQuery, ScopedArchiveQuery>();
builder.Services.AddScoped<IActivityService, ActivityService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IColumnOrderService, ColumnOrderService>();
builder.Services.AddTransient<IFileExportBuilder, FileExportBuilderAdapter>();
builder.Services.AddTransient<IConflictExportBuilder, ConflictExportBuilderAdapter>();
builder.Services.AddTransient<IHeaderMappingValidator, HeaderMappingValidatorAdapter>();
builder.Services.AddTransient<IMergeExcelReader, MergeWorkbookReader>();
builder.Services.AddTransient<ISheetMergeParser, SheetMergeParser>();
builder.Services.AddTransient<IMergeExportBuilder, MergeExportBuilderAdapter>();
builder.Services.AddTransient<ISheetMergeExportBuilder, SheetMergeExportBuilderAdapter>();
builder.Services.AddScoped<IGroupService, GroupService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IFileService, FileService>();
builder.Services.AddScoped<ISearchService, SearchService>();
builder.Services.AddScoped<IConflictService, ConflictService>();
builder.Services.AddScoped<IEditsService, EditsService>();
builder.Services.AddScoped<IRecordService, RecordService>();
builder.Services.AddScoped<IBackupService, BackupService>();
builder.Services.AddScoped<IUploadService, UploadService>();
builder.Services.AddScoped<IUploadJobProcessor, UploadJobProcessor>();
builder.Services.AddHostedService<UploadBackgroundService>();

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();

// Performance: in-memory cache (search/conflicts/groups), response caching + compression
builder.Services.AddMemoryCache(options => options.SizeLimit = 2048);
builder.Services.AddResponseCaching();
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<GzipCompressionProvider>();
});
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

// Health (liveness + Postgres readiness, no extra package)
// P7.5: readiness must fail visibly when required search/cache schema is
// missing (docs/04) — SELECT 1 alone hides index/extension regressions.
builder.Services.AddHealthChecks()
    .AddCheck<PostgresHealthCheck>("postgres", tags: ["ready"])
    .AddCheck<SearchSchemaHealthCheck>("search-schema", tags: ["ready"]);

// Rate limiting: strict for login, permissive general API
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("login", o =>
    {
        o.PermitLimit = 20; o.Window = TimeSpan.FromMinutes(1); o.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("api", o =>
    {
        o.PermitLimit = 300; o.Window = TimeSpan.FromMinutes(1); o.QueueLimit = 50;
    });
});

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"];
builder.Services.AddCors(options =>
    options.AddPolicy("frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

builder.Services
    .AddControllers(options =>
    {
        options.CacheProfiles.Add("never", new() { NoStore = true, Duration = 0 });
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        // V1 parity: preserve explicit null vs absent (docs/04). Do not drop
        // nulls — job fileId/errorMessage, record shadows, and paging sentinels
        // rely on null presence. Zero/false must also survive as data.
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    });

// Transport limits live in code per endpoint (50 MiB uploads, 250 MiB restore),
// mirroring V1's route handlers; the server/form parsers must not cap first.
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = 300L * 1024 * 1024;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear(); o.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}
app.UseResponseCompression();
app.UseResponseCaching();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Security headers (cheap, no package)
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    ctx.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    await next();
});

app.UseCors("frontend");
// Exception first so auth/logging failures are also standardized
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<AuthMiddleware>();

app.MapHealthChecks("/health/live").RequireRateLimiting("api");
app.MapHealthChecks("/health/ready").RequireRateLimiting("api");
app.MapControllers().RequireRateLimiting("api");

await DbSeeder.SeedAsync(app.Services, app.Configuration);

app.Run();
