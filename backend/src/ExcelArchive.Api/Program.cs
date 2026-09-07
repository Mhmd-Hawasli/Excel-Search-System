using System.Text.Json;
using EFCore.NamingConventions;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.Middleware;
using ExcelArchive.Api.Repositories;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, cfg) => cfg.WriteTo.Console());

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? builder.Configuration["DATABASE_URL"]
    ?? "Host=localhost;Port=5432;Database=excel_archive;Username=excel_archive;Password=excel_archive";

builder.Services.AddDbContext<AppDbContext>(options =>
    options
        .UseNpgsql(connectionString)
        .UseSnakeCaseNamingConvention());

// Services
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IGroupRepository, GroupRepository>();
builder.Services.AddScoped<IFileRepository, FileRepository>();
builder.Services.AddScoped<IRecordRepository, RecordRepository>();
builder.Services.AddScoped<IActivityLogRepository, ActivityLogRepository>();
builder.Services.AddScoped<IUploadJobRepository, UploadJobRepository>();

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IActivityService, ActivityService>();
builder.Services.AddScoped<IGroupService, GroupService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IFileService, FileService>();
builder.Services.AddScoped<ISearchService, SearchService>();
builder.Services.AddScoped<IConflictService, ConflictService>();
builder.Services.AddScoped<IEditsService, EditsService>();
builder.Services.AddScoped<IBackupService, BackupService>();
builder.Services.AddScoped<IUploadService, UploadService>();

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"];
builder.Services.AddCors(options =>
    options.AddPolicy("frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("frontend");
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<AuthMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.MapControllers();

await DbSeeder.SeedAsync(app.Services, app.Configuration);

app.Run();
