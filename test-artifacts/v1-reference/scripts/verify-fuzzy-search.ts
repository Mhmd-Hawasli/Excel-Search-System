import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { normalizeStored } from "@/lib/normalization/arabic";
import { searchRecords } from "@/lib/search/query";

// Verifies fuzzy Arabic-name search against the live database with uniquely
// named fixtures. Cleanup deletes the temporary group (files and records
// follow via cascade), leaving the archive untouched.
async function main() {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch");
  const groupId = randomUUID();
  const names = ["عبد الكريم خالد العبد", "محمد احمد سلمان", "ليلى حسن إبراهيم"];
  await prisma.group.create({ data: { id: groupId, name: `اختبار البحث الضبابي ${groupId}` } });
  try {
    await prisma.file.create({
      data: {
        name: `fuzzy-search-${groupId}`,
        originalFilename: "fuzzy-test.xlsx",
        sheetName: "Sheet1",
        columnSignature: "fuzzy",
        groupId,
        records: {
          create: names.map((name, index) => ({
            rowIndex: index + 1,
            data: {},
            sfFullName: name,
            nFullName: normalizeStored(name),
          })),
        },
      },
    });
    async function expectFound(query: string, expected: string) {
      const result = await searchRecords({
        query,
        mode: "full",
        groupIds: [groupId],
        page: 1,
        pageSize: 25,
      });
      const values = result.rows.map((row) => row.sfFullName);
      assert(
        values.includes(expected),
        `query "${query}" should find "${expected}" (got ${JSON.stringify(values)})`,
      );
    }
    await expectFound("عبد الكريم خالة العيد", "عبد الكريم خالد العبد");
    await expectFound("محمد احمد سليمان", "محمد احمد سلمان");
    await expectFound("ليلى حسن إبراهيم", "ليلى حسن إبراهيم");
    await expectFound("محمد احمد", "محمد احمد سلمان");
    await expectFound("عبد الكريم", "عبد الكريم خالد العبد");
    const unrelated = await searchRecords({
      query: "عبد الكريم خالة العيد",
      mode: "full",
      groupIds: [groupId],
      page: 1,
      pageSize: 25,
    });
    assert(
      !unrelated.rows.some((row) => row.sfFullName === "ليلى حسن إبراهيم"),
      "fuzzy query must not match unrelated names",
    );
    console.log(
      "PASS: fuzzy search tolerates one/two-letter Arabic typos and still rejects unrelated names.",
    );
  } finally {
    await prisma.group.delete({ where: { id: groupId } });
    console.log("Temporary fuzzy-search fixtures removed; archive untouched.");
  }
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
