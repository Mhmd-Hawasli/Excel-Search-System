using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ExcelArchive.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Baseline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "activity_log",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "varchar", nullable: false),
                    target_name = table.Column<string>(type: "text", nullable: false),
                    details = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_activity_log", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "conflict_cache_state",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    revision = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conflict_cache_state", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "conflict_query_cache",
                columns: table => new
                {
                    key = table.Column<string>(type: "text", nullable: false),
                    source_revision = table.Column<long>(type: "bigint", nullable: false),
                    checked_date = table.Column<DateOnly>(type: "date", nullable: false),
                    payload = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    rebuilt_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conflict_query_cache", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "groups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_groups", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "text", nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "files",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    original_filename = table.Column<string>(type: "text", nullable: false),
                    sheet_name = table.Column<string>(type: "text", nullable: false),
                    row_count = table.Column<int>(type: "integer", nullable: false),
                    column_signature = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    uploaded_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_files", x => x.id);
                    table.ForeignKey(
                        name: "fk_files_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "mapping_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    header_signature = table.Column<string>(type: "text", nullable: false),
                    mapping = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_mapping_templates", x => x.id);
                    table.ForeignKey(
                        name: "fk_mapping_templates_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "data_quality_issues",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    row_index = table.Column<int>(type: "integer", nullable: false),
                    issue_type = table.Column<string>(type: "varchar", nullable: false),
                    column_name = table.Column<string>(type: "text", nullable: true),
                    raw_value = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_quality_issues", x => x.id);
                    table.ForeignKey(
                        name: "fk_data_quality_issues_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "file_columns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    header_raw = table.Column<string>(type: "text", nullable: false),
                    header_normalized = table.Column<string>(type: "text", nullable: false),
                    column_index = table.Column<int>(type: "integer", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: true),
                    standard_field = table.Column<string>(type: "varchar", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_file_columns", x => x.id);
                    table.ForeignKey(
                        name: "fk_file_columns_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_file_columns_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    row_index = table.Column<int>(type: "integer", nullable: false),
                    data = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    sf_first_name = table.Column<string>(type: "text", nullable: true),
                    sf_father_name = table.Column<string>(type: "text", nullable: true),
                    sf_last_name = table.Column<string>(type: "text", nullable: true),
                    sf_full_name = table.Column<string>(type: "text", nullable: true),
                    sf_national_id = table.Column<long>(type: "bigint", nullable: true),
                    sf_sham_cash = table.Column<long>(type: "bigint", nullable: true),
                    sf_personal_no = table.Column<string>(type: "text", nullable: true),
                    sf_mother_name = table.Column<string>(type: "text", nullable: true),
                    sf_phone = table.Column<string>(type: "text", nullable: true),
                    sf_contract_code = table.Column<string>(type: "text", nullable: true),
                    sf_secondary_contract_code = table.Column<string>(type: "text", nullable: true),
                    sf_job_title = table.Column<string>(type: "text", nullable: true),
                    sf_functional_category = table.Column<int>(type: "integer", nullable: true),
                    sf_organizational_level = table.Column<string>(type: "text", nullable: true),
                    n_first_name = table.Column<string>(type: "text", nullable: true),
                    n_father_name = table.Column<string>(type: "text", nullable: true),
                    n_last_name = table.Column<string>(type: "text", nullable: true),
                    n_full_name = table.Column<string>(type: "text", nullable: true),
                    n_mother_name = table.Column<string>(type: "text", nullable: true),
                    n_contract_code = table.Column<string>(type: "text", nullable: true),
                    n_secondary_contract_code = table.Column<string>(type: "text", nullable: true),
                    n_job_title = table.Column<string>(type: "text", nullable: true),
                    n_organizational_level = table.Column<string>(type: "text", nullable: true),
                    d_national_id = table.Column<string>(type: "text", nullable: true),
                    d_personal_no = table.Column<string>(type: "text", nullable: true),
                    d_phone = table.Column<string>(type: "text", nullable: true),
                    fmt_fills = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    fmt_font_colors = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    national_id_num = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_records", x => x.id);
                    table.ForeignKey(
                        name: "fk_records_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "upload_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "varchar", nullable: false),
                    total_rows = table.Column<int>(type: "integer", nullable: false),
                    processed_rows = table.Column<int>(type: "integer", nullable: false),
                    error_message = table.Column<string>(type: "text", nullable: true),
                    payload = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    started_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: true),
                    finished_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_upload_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_upload_jobs_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "user_permissions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    permission = table.Column<string>(type: "text", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    file_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_permissions", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_permissions_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_permissions_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_permissions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ignored_conflicts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    rule = table.Column<string>(type: "text", nullable: false),
                    record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ignored_conflicts", x => x.id);
                    table.ForeignKey(
                        name: "fk_ignored_conflicts_records_record_id",
                        column: x => x.record_id,
                        principalTable: "records",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "record_edits",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_column_id = table.Column<Guid>(type: "uuid", nullable: true),
                    header_raw = table.Column<string>(type: "text", nullable: false),
                    old_value = table.Column<string>(type: "text", nullable: false),
                    new_value = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp(3) with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_record_edits", x => x.id);
                    table.ForeignKey(
                        name: "fk_record_edits_file_columns_file_column_id",
                        column: x => x.file_column_id,
                        principalTable: "file_columns",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_record_edits_files_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_record_edits_records_record_id",
                        column: x => x.record_id,
                        principalTable: "records",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_activity_log_created_at",
                table: "activity_log",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_categories_name",
                table: "categories",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_conflict_query_cache_rebuilt_at",
                table: "conflict_query_cache",
                column: "rebuilt_at");

            migrationBuilder.CreateIndex(
                name: "ix_data_quality_issues_file_id",
                table: "data_quality_issues",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_data_quality_issues_file_id_issue_type",
                table: "data_quality_issues",
                columns: new[] { "file_id", "issue_type" });

            migrationBuilder.CreateIndex(
                name: "ix_file_columns_category_id",
                table: "file_columns",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_columns_category_id_sort_order",
                table: "file_columns",
                columns: new[] { "category_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "ix_file_columns_file_id",
                table: "file_columns",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_columns_file_id_column_index",
                table: "file_columns",
                columns: new[] { "file_id", "column_index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_files_group_id",
                table: "files",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_files_name",
                table: "files",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_groups_name",
                table: "groups",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ignored_conflicts_record_id",
                table: "ignored_conflicts",
                column: "record_id");

            migrationBuilder.CreateIndex(
                name: "ix_ignored_conflicts_rule",
                table: "ignored_conflicts",
                column: "rule");

            migrationBuilder.CreateIndex(
                name: "ix_ignored_conflicts_rule_record_id",
                table: "ignored_conflicts",
                columns: new[] { "rule", "record_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_mapping_templates_group_id_header_signature",
                table: "mapping_templates",
                columns: new[] { "group_id", "header_signature" });

            migrationBuilder.CreateIndex(
                name: "ix_mapping_templates_group_id_name",
                table: "mapping_templates",
                columns: new[] { "group_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_record_edits_file_column_id",
                table: "record_edits",
                column: "file_column_id");

            migrationBuilder.CreateIndex(
                name: "ix_record_edits_file_id",
                table: "record_edits",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_record_edits_file_id_created_at",
                table: "record_edits",
                columns: new[] { "file_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_record_edits_record_id",
                table: "record_edits",
                column: "record_id");

            migrationBuilder.CreateIndex(
                name: "ix_records_file_id",
                table: "records",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_records_file_id_row_index",
                table: "records",
                columns: new[] { "file_id", "row_index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_records_national_id_num",
                table: "records",
                column: "national_id_num");

            migrationBuilder.CreateIndex(
                name: "ix_records_sf_functional_category",
                table: "records",
                column: "sf_functional_category");

            migrationBuilder.CreateIndex(
                name: "ix_upload_jobs_file_id",
                table: "upload_jobs",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_upload_jobs_status",
                table: "upload_jobs",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_user_permissions_file_id",
                table: "user_permissions",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_permissions_group_id",
                table: "user_permissions",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_permissions_user_id",
                table: "user_permissions",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_username",
                table: "users",
                column: "username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "activity_log");

            migrationBuilder.DropTable(
                name: "conflict_cache_state");

            migrationBuilder.DropTable(
                name: "conflict_query_cache");

            migrationBuilder.DropTable(
                name: "data_quality_issues");

            migrationBuilder.DropTable(
                name: "ignored_conflicts");

            migrationBuilder.DropTable(
                name: "mapping_templates");

            migrationBuilder.DropTable(
                name: "record_edits");

            migrationBuilder.DropTable(
                name: "upload_jobs");

            migrationBuilder.DropTable(
                name: "user_permissions");

            migrationBuilder.DropTable(
                name: "file_columns");

            migrationBuilder.DropTable(
                name: "records");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "categories");

            migrationBuilder.DropTable(
                name: "files");

            migrationBuilder.DropTable(
                name: "groups");
        }
    }
}
