using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ExcelArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupDefaultSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "record_id",
                table: "record_edits",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "edited_by",
                table: "record_edits",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "file_version",
                table: "record_edits",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "include_in_default_search",
                table: "groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "edited_by",
                table: "record_edits");

            migrationBuilder.DropColumn(
                name: "file_version",
                table: "record_edits");

            migrationBuilder.DropColumn(
                name: "include_in_default_search",
                table: "groups");

            migrationBuilder.AlterColumn<Guid>(
                name: "record_id",
                table: "record_edits",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
