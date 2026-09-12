using System.Text.Json;
using EFCore.NamingConventions;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Infrastructure.Implementations.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<FileEntity> Files => Set<FileEntity>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<FileColumn> FileColumns => Set<FileColumn>();
    public DbSet<Record> Records => Set<Record>();
    public DbSet<UploadJob> UploadJobs => Set<UploadJob>();
    public DbSet<DataQualityIssue> DataQualityIssues => Set<DataQualityIssue>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<RecordEdit> RecordEdits => Set<RecordEdit>();
    public DbSet<MappingTemplate> MappingTemplates => Set<MappingTemplate>();
    public DbSet<IgnoredConflict> IgnoredConflicts => Set<IgnoredConflict>();
    public DbSet<ConflictCacheState> ConflictCacheStates => Set<ConflictCacheState>();
    public DbSet<ConflictQueryCache> ConflictQueryCaches => Set<ConflictQueryCache>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // Snake-case table/column names are already applied via
        // UseSnakeCaseNamingConvention() on the DbContextOptionsBuilder
        // in Program.cs. Do NOT call it on ModelBuilder (not supported).

        // Enums persist as the same lowercase/snake_case strings used by Prisma
        // so an existing PostgreSQL database can be adopted without a destructive
        // migration.
        modelBuilder.Entity<FileColumn>()
            .Property(p => p.StandardField)
            .HasConversion<EnumToPrismaConverter<StandardField>>()
            .HasColumnType("varchar");

        modelBuilder.Entity<UploadJob>()
            .Property(p => p.Status)
            .HasConversion<EnumToPrismaConverter<UploadJobStatus>>()
            .HasColumnType("varchar");

        modelBuilder.Entity<DataQualityIssue>()
            .Property(p => p.IssueType)
            .HasConversion<EnumToPrismaConverter<DataQualityIssueType>>()
            .HasColumnType("varchar");

        modelBuilder.Entity<ActivityLog>()
            .Property(p => p.Action)
            .HasConversion<EnumToPrismaConverter<ActivityAction>>()
            .HasColumnType("varchar");

        modelBuilder.Entity<Record>()
            .Property(r => r.Data).HasColumnType("jsonb");
        modelBuilder.Entity<Record>()
            .Property(r => r.FmtFills).HasColumnType("jsonb");
        modelBuilder.Entity<Record>()
            .Property(r => r.FmtFontColors).HasColumnType("jsonb");
        modelBuilder.Entity<UploadJob>()
            .Property(j => j.Payload).HasColumnType("jsonb");
        modelBuilder.Entity<ActivityLog>()
            .Property(a => a.Details).HasColumnType("jsonb");
        modelBuilder.Entity<MappingTemplate>()
            .Property(t => t.Mapping).HasColumnType("jsonb");

        modelBuilder.Entity<Group>(e =>
        {
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).IsRequired();
        });

        modelBuilder.Entity<FileEntity>(e =>
        {
            e.HasIndex(x => x.Name).IsUnique();
            e.HasOne(x => x.Group)
                .WithMany(g => g.Files)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.GroupId);
        });

        modelBuilder.Entity<Category>(e => e.HasIndex(x => x.Name).IsUnique());

        modelBuilder.Entity<FileColumn>(e =>
        {
            e.HasOne(x => x.File)
                .WithMany(f => f.Columns)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Category)
                .WithMany(c => c.Columns)
                .HasForeignKey(x => x.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.FileId, x.ColumnIndex }).IsUnique();
            e.HasIndex(x => x.FileId);
            e.HasIndex(x => x.CategoryId);
            e.HasIndex(x => new { x.CategoryId, x.SortOrder });
        });

        modelBuilder.Entity<Record>(e =>
        {
            e.HasOne(x => x.File)
                .WithMany(f => f.Records)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.FileId, x.RowIndex }).IsUnique();
            e.HasIndex(x => x.FileId);
            e.HasIndex(x => x.NationalIdNum);
            // No EF index on SfFunctionalCategory: Data/SearchIndexes.sql provides
            // the V1-named btree (records_sf_functional_category_idx); a second
            // EF index on the same column would be a pure duplicate (docs/07).
        });

        modelBuilder.Entity<UploadJob>(e =>
        {
            e.HasOne(x => x.File)
                .WithMany(f => f.UploadJobs)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.FileId);
            e.HasIndex(x => x.Status);
        });

        modelBuilder.Entity<DataQualityIssue>(e =>
        {
            e.HasOne(x => x.File)
                .WithMany(f => f.DataQualityIssues)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.FileId);
            e.HasIndex(x => new { x.FileId, x.IssueType });
        });

        modelBuilder.Entity<ActivityLog>(e =>
        {
            // V1 table is activity_log (singular); the DbSet name would pluralize it.
            e.ToTable("activity_log");
            e.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<RecordEdit>(e =>
        {
            e.HasOne(x => x.Record)
                .WithMany(r => r.Edits)
                .HasForeignKey(x => x.RecordId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.File)
                .WithMany(f => f.RecordEdits)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.FileColumn)
                .WithMany(c => c.RecordEdits)
                .HasForeignKey(x => x.FileColumnId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => x.RecordId);
            e.HasIndex(x => x.FileId);
            e.HasIndex(x => new { x.FileId, x.CreatedAt });
        });

        modelBuilder.Entity<MappingTemplate>(e =>
        {
            e.HasOne(x => x.Group)
                .WithMany(g => g.Templates)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.GroupId, x.Name }).IsUnique();
            e.HasIndex(x => new { x.GroupId, x.HeaderSignature });
        });

        modelBuilder.Entity<IgnoredConflict>(e =>
        {
            e.HasOne(x => x.Record)
                .WithMany(r => r.Ignores)
                .HasForeignKey(x => x.RecordId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.Rule, x.RecordId }).IsUnique();
            e.HasIndex(x => x.RecordId);
            e.HasIndex(x => x.Rule);
        });

        modelBuilder.Entity<ConflictCacheState>(e =>
        {
            e.ToTable("conflict_cache_state");
            e.HasKey(x => x.Id);
            // Single-row guard matches V1 CHECK (id = 1); enforced in SQL DDL.
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        modelBuilder.Entity<ConflictQueryCache>(e =>
        {
            e.ToTable("conflict_query_cache");
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasColumnType("text");
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.Property(x => x.CheckedDate).HasColumnType("date");
            e.Property(x => x.RebuiltAt).HasColumnType("timestamptz(3)");
            e.HasIndex(x => x.RebuiltAt);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.Username).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
        });

        modelBuilder.Entity<UserPermission>(e =>
        {
            e.HasOne(x => x.User)
                .WithMany(u => u.Permissions)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Group)
                .WithMany(g => g.ScopedPermissions)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.File)
                .WithMany(f => f.ScopedPermissions)
                .HasForeignKey(x => x.FileId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.GroupId);
            e.HasIndex(x => x.FileId);
        });

        // V1 uses timestamptz(3) for every timestamp. Normalize explicitly so a
        // future migration adopts an existing Prisma database without precision drift.
        // ConflictQueryCache.CheckedDate stays date (V1 @db.Date).
        // Non-nullable audit stamps also get a DB-level CURRENT_TIMESTAMP default
        // mirroring Prisma @default(now()): raw-SQL/bulk writers then behave.
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType == typeof(DateTime) || property.ClrType == typeof(DateTime?))
                {
                    if (property.GetColumnType() is null)
                        property.SetColumnType("timestamptz(3)");
                    if (property.ClrType == typeof(DateTime) && property.GetDefaultValueSql() is null)
                        property.SetDefaultValueSql("CURRENT_TIMESTAMP");
                }
            }
        }
    }
}
