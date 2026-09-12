using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ExcelArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AuditTimestampDefaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "users",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "users",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "user_permissions",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "records",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "record_edits",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "mapping_templates",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "mapping_templates",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "ignored_conflicts",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "groups",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "groups",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "uploaded_at",
                table: "files",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "files",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "file_columns",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "data_quality_issues",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "rebuilt_at",
                table: "conflict_query_cache",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "categories",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "activity_log",
                type: "timestamp(3) with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP",
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "users",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "users",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "user_permissions",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "records",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "record_edits",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "mapping_templates",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "mapping_templates",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "ignored_conflicts",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "groups",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "groups",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "uploaded_at",
                table: "files",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "updated_at",
                table: "files",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "file_columns",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "data_quality_issues",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "rebuilt_at",
                table: "conflict_query_cache",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "categories",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.AlterColumn<DateTime>(
                name: "created_at",
                table: "activity_log",
                type: "timestamp(3) with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp(3) with time zone",
                oldDefaultValueSql: "CURRENT_TIMESTAMP");
        }
    }
}
