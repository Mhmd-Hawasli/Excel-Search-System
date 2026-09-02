import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/db/prisma";
import { nationalIdColumns } from "../lib/format/national-id";
import { nationalIdQualityIssue } from "../lib/excel/national-id-quality";

async function main() {
  const sql = await readFile(
    "prisma/migrations/20260902140000_national_id_bigint/migration.sql",
    "utf8",
  );
  const statements = sql
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && part !== "BEGIN" && part !== "COMMIT");
  await prisma.$transaction(
    async (tx) => {
      for (const table of ["records", "file_columns", "data_quality_issues"]) {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`,
        );
      }
      await tx.$executeRaw`ALTER TABLE records ALTER COLUMN sf_national_id TYPE TEXT USING sf_national_id::text`;
      const fileId = randomUUID();
      const unmappedFileId = randomUUID();
      await tx.$executeRaw`INSERT INTO file_columns (id, file_id, header_raw, header_normalized, column_index, standard_field)
      VALUES (${randomUUID()}::uuid, ${fileId}::uuid, 'national', 'national', 1, 'national_id')`;
      const values = [
        "12345678",
        "00012345678",
        "123456789",
        "٠٠١٢٣\u00a0٤٥٦\t٧٨٩",
        "1234567890",
        "12345678901",
        "123456789012",
        "123456789A",
        "",
        " \t\ufeff",
        "0",
        "9223372036854775807",
        "9223372036854775808",
        "000000000123456789",
        "۱۲۳\u2009۴۵۶\u202f۷۸۹",
        "123456789A",
      ];
      for (const [index, raw] of values.entries()) {
        const unmapped = index === values.length - 1;
        await tx.$executeRaw`INSERT INTO records (id, file_id, row_index, data, sf_national_id, d_national_id, national_id_num)
        VALUES (${randomUUID()}::uuid, ${unmapped ? unmappedFileId : fileId}::uuid, ${index + 2}, ${JSON.stringify(unmapped ? {} : { national: raw })}::jsonb, ${raw}, 'stale', 1)`;
      }
      await tx.$executeRaw`INSERT INTO data_quality_issues (id, file_id, row_index, issue_type) VALUES (${randomUUID()}::uuid, ${fileId}::uuid, 2, 'invalid_phone'), (${randomUUID()}::uuid, ${fileId}::uuid, 2, 'missing_national_id')`;
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRaw<
        {
          sf: bigint | null;
          display: string | null;
          link: bigint | null;
          data: Record<string, string>;
        }[]
      >`SELECT sf_national_id AS sf, d_national_id AS display, national_id_num AS link, data FROM records ORDER BY row_index`;
      const issues = await tx.$queryRaw<
        { row: number; type: string }[]
      >`SELECT row_index AS row, issue_type::text AS type FROM data_quality_issues WHERE issue_type <> 'invalid_phone' ORDER BY row_index`;
      const seen = new Set<string>();
      const expectedIssues = [];
      for (const [index, raw] of values.entries()) {
        const expected = nationalIdColumns(raw);
        assert.deepEqual(
          [rows[index].sf, rows[index].display, rows[index].link],
          [expected.sfNationalId, expected.dNationalId, expected.nationalIdNum],
          `migration conversion of ${raw}`,
        );
        assert.deepEqual(
          rows[index].data,
          index === values.length - 1 ? { __national_id_original: raw } : { national: raw },
          "preserves original values",
        );
        const issue = nationalIdQualityIssue(raw, seen);
        if (issue) expectedIssues.push({ row: index + 2, type: issue.toLowerCase() });
      }
      assert.deepEqual(issues, expectedIssues);
      const [{ count }] = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM data_quality_issues WHERE issue_type = 'invalid_phone'`;
      assert.equal(count, 1n, "unrelated quality is untouched");
      console.log(
        "PASS: numeric migration, legacy originals, bigint limits and quality rebuilding (temporary tables only).",
      );
    },
    { timeout: 30_000 },
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
