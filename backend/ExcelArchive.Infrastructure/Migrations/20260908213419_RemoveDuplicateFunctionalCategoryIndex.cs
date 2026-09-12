using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ExcelArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDuplicateFunctionalCategoryIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_records_sf_functional_category",
                table: "records");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_records_sf_functional_category",
                table: "records",
                column: "sf_functional_category");
        }
    }
}
