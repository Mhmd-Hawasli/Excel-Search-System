import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { CONFLICT_RULES, type ConflictRuleKey } from "../lib/conflicts/catalog";
import { normalizeTextSql, queryConflicts } from "../lib/conflicts/query";
import { normalizeStored } from "../lib/normalization/arabic";
import { recordInput } from "../lib/excel/import-worker";
import { STANDARD_FIELD_KEYS } from "../lib/excel/types";
import type { UploadConfig } from "../lib/excel/config";

async function main() {
  await prisma.$transaction(
    async (tx) => {
      // These connection-local tables shadow the archive only for raw SQL in this transaction.
      // No permanent file, record, mapping or job is inserted, updated or deleted.
      for (const table of ["files", "file_columns", "records", "upload_jobs"]) {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`,
        );
      }
      const groupId = randomUUID();
      async function file(mapped: boolean, active = false) {
        const id = randomUUID();
        await tx.$executeRaw`INSERT INTO files (id, group_id, name, original_filename, sheet_name, column_signature, updated_at)
        VALUES (${id}::uuid, ${groupId}::uuid, ${id}, 'اختبار.xlsx', 'Sheet1', '', now())`;
        const columns: UploadConfig["columns"] = mapped
          ? STANDARD_FIELD_KEYS.map((key, index) => ({
              headerRaw: key,
              headerNormalized: key,
              columnIndex: index + 1,
              standardField: key,
              categoryId: null,
            }))
          : [];
        for (const header of ["تاريخ الميلاد", "تاريخ المباشرة", "المسمى الوظيفي", "ملاحظة"]) {
          columns.push({
            headerRaw: header,
            headerNormalized: normalizeStored(header),
            columnIndex: columns.length + 1,
            standardField: null,
            categoryId: null,
          });
        }
        for (const column of columns)
          await tx.$executeRaw`INSERT INTO file_columns (id, file_id, header_raw, header_normalized, column_index, standard_field)
        VALUES (${randomUUID()}::uuid, ${id}::uuid, ${column.headerRaw}, ${column.headerNormalized}, ${column.columnIndex}, ${column.standardField}::standard_field)`;
        if (active)
          await tx.$executeRaw`INSERT INTO upload_jobs (id, file_id, status, payload) VALUES (${randomUUID()}::uuid, ${id}::uuid, 'inserting', '{}'::jsonb)`;
        return {
          id,
          config: {
            token: randomUUID(),
            groupId,
            name: id,
            description: "",
            originalFilename: "اختبار.xlsx",
            sheetName: "Sheet1",
            sheetIndex: 1,
            totalRows: 0,
            columns,
          } satisfies UploadConfig,
        };
      }
      const firstFile = await file(true);
      const secondFile = await file(true);
      const unmappedFile = await file(false);
      const activeFile = await file(true, true);
      let index = 1;
      async function row(values: Record<string, string> = {}, target = firstFile) {
        index++;
        const data = {
          first_name: `شخص${index}`,
          father_name: "علي",
          last_name: "النجار",
          full_name: `شخص${index} علي النجار`,
          mother_name: "فاطمة",
          national_id: String(80000000000 + index),
          sham_cash: String(1234000000000000 + index),
          personal_no: String(index),
          contract_code: `عقد-${index}`,
          "تاريخ الميلاد": "2000-01-01",
          "المسمى الوظيفي": "موظف",
          ...values,
        };
        const id = randomUUID();
        const input = { id, ...recordInput(target.id, index, data, target.config) };
        const columns = Object.keys(input).map((key) =>
          Prisma.raw(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)),
        );
        const sqlValues = Object.entries(input).map(([key, value]) =>
          key === "data"
            ? Prisma.sql`${JSON.stringify(value)}::jsonb`
            : key === "id" || key === "fileId"
              ? Prisma.sql`${value}::uuid`
              : Prisma.sql`${value}`,
        );
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO records (${Prisma.join(columns)}) VALUES (${Prisma.join(sqlValues)})`,
        );
        return id;
      }
      const expected = new Map<ConflictRuleKey, string[]>();
      function expectRows(key: ConflictRuleKey, ids: string[]) {
        expected.set(key, ids);
      }
      const short1 = await row({ national_id: "1" });
      const short8 = await row({ national_id: "٠٠١٢٣٤٥٦" });
      const paddedShort = await row({ national_id: "00012345678" });
      await row({ national_id: "123456789" });
      await row({ national_id: "1234567890" });
      await row({ national_id: "12345678901" });
      expectRows("national_short", [short1, short8, paddedShort]);
      const long = await row({ national_id: "123456789012" });
      const oversized = await row({ national_id: "9223372036854775808" });
      const letters = await row({ national_id: "12345678901A" });
      expectRows("national_long", [long, oversized]);
      const lettersOnly = await row({ national_id: "abc" });
      expectRows("national_characters", [letters, lettersOnly]);
      const shamShort = await row({ sham_cash: "012345678901234" });
      const shamLong = await row({ sham_cash: "01234567890123456" });
      const shamChars = await row({ sham_cash: "012345678901234A" });
      const shamHidden = await row({ sham_cash: "0123456789012345A" });
      await row({ sham_cash: "0123 4567 8901 2345" });
      await row({ sham_cash: "٠١٢٣ ٤٥٦٧ ٨٩٠١ ٢٣٤٦" });
      await row({ sham_cash: "\u00a0۰۱۲۳\u00a0۴۵۶۷\t۸۹۰۱\r\n۲۳۴۷\ufeff" });
      await row({ sham_cash: "0123\u2009\u202f4567\u3000\u20078901\u2028\u20292348" });
      await row({ sham_cash: "9999 9999 9999 9999" });
      const shamSpacedShort = await row({ sham_cash: "0123 4567 8901 239" });
      const shamSpacedLong = await row({ sham_cash: "0123 4567 8901 23499" });
      const shamSymbol = await row({ sham_cash: "0123-4567 8901 2345" });
      expectRows("sham_short", [shamShort, shamSpacedShort]);
      expectRows("sham_long", [shamLong, shamHidden, shamSpacedLong, shamSymbol]);
      expectRows("sham_characters", [shamChars, shamHidden, shamSymbol]);
      const mismatch = await row({ full_name: "اسم مخالف للاجزاء" });
      await row({
        first_name: "أحمد",
        father_name: "عبد الله",
        last_name: "مصطفى",
        full_name: "احمد عبدالله مصطفي",
      });
      expectRows("name_mismatch", [mismatch]);
      const missingNamePart = await row({ father_name: "" });
      expected.get("name_mismatch")!.push(missingNamePart);
      const invalidDate = await row({ "تاريخ الميلاد": "31/02/2000", "تاريخ المباشرة": "نص" });
      const early = await row({ "تاريخ الميلاد": "31/12/1939" });
      const future = await row({ "تاريخ الميلاد": "2999-01-01" });
      await row({
        "تاريخ الميلاد": "٠١/٠١/١٩٤٠",
        "تاريخ المباشرة": "Wed Aug 04 1999 03:00:00 GMT+0300",
        ملاحظة: "31/02/2000",
      });
      const [{ today }] = await tx.$queryRaw<
        { today: string }[]
      >`SELECT CURRENT_DATE::text AS today`;
      await row({ "تاريخ الميلاد": today, "تاريخ المباشرة": "2000-02-29T00:00:00.000Z" });
      expectRows("date_invalid", [invalidDate]);
      expectRows("date_early", [early]);
      expectRows("date_future", [future]);
      const missingAll = await row(
        Object.fromEntries(STANDARD_FIELD_KEYS.map((key) => [key, " \t "])),
      );
      const missingMappedFull = await row({ full_name: "" });
      const shamWhitespaceOnly = await row({ sham_cash: " \t\n\u00a0\u202f\ufeff" });
      const unmapped = await row({}, unmappedFile);
      for (const key of [
        "missing_national",
        "missing_sham",
        "missing_personal",
        "missing_mother",
      ] as const)
        expectRows(key, [missingAll, unmapped]);
      expected.get("missing_sham")!.push(shamWhitespaceOnly);
      expectRows("missing_full", [missingAll, missingMappedFull]);
      for (const key of ["missing_first", "missing_father", "missing_last"] as const)
        expectRows(key, [missingAll]);
      expected.get("missing_father")!.push(missingNamePart);

      const person = {
        first_name: "محمد",
        father_name: "أحمد",
        last_name: "قاسم",
        full_name: "محمد احمد قاسم",
        mother_name: "هدى",
      };
      const duplicateValues = {
        ...person,
        national_id: "99111111111",
        sham_cash: "9999111111111111",
        personal_no: "9111",
        contract_code: "مكرر",
      };
      const duplicateA = await row(duplicateValues);
      const duplicateB = await row({ ...duplicateValues, sham_cash: "9999 1111 1111 1111" });
      await row(duplicateValues, secondFile);
      for (const key of [
        "duplicate_national",
        "duplicate_sham",
        "duplicate_personal",
        "duplicate_contract",
      ] as const)
        expectRows(key, [duplicateA, duplicateB]);
      const peopleValues = {
        national_id: "99222222222",
        sham_cash: "9999222222222222",
        personal_no: "9222",
      };
      const peopleA = await row(peopleValues);
      const peopleB = await row(
        { ...peopleValues, sham_cash: "٩٩٩٩\u00a0٢٢٢٢\t٢٢٢٢ ٢٢٢٢" },
        secondFile,
      );
      for (const key of ["national_people", "sham_people", "personal_people"] as const)
        expectRows(key, [peopleA, peopleB]);
      const samePerson = {
        first_name: "سهى",
        father_name: "عبد الله",
        last_name: "النجار",
        full_name: "سهى عبد الله النجار",
        mother_name: "أمينة",
      };
      const sameA = await row({ ...samePerson, "المسمى الوظيفي": "مهندس" });
      const sameB = await row(
        {
          ...samePerson,
          full_name: "سهي عبدالله النجار",
          mother_name: "امينه",
          "المسمى الوظيفي": "مدير",
        },
        secondFile,
      );
      for (const key of [
        "person_national",
        "person_sham",
        "person_personal",
        "person_contract",
        "person_job",
      ] as const)
        expectRows(key, [sameA, sameB]);
      const similarA = await row({
        first_name: "حسن",
        father_name: "محمود",
        last_name: "الطيب",
        full_name: "حسن محمود الطيب",
        mother_name: "مريم",
      });
      const similarB = await row(
        {
          first_name: "حسن",
          father_name: "محمود",
          last_name: "الطيب",
          full_name: "حسن محمود الطيب",
          mother_name: "سارة",
        },
        secondFile,
      );
      const noMother = await row({
        first_name: "حسن",
        father_name: "محمود",
        last_name: "الطيب",
        full_name: "حسن محمود الطيب",
        mother_name: "",
      });
      expected.get("missing_mother")!.push(noMother);
      expectRows("similar_names", [similarA, similarB]);
      await row({ national_id: "2", sham_cash: "bad", "تاريخ الميلاد": "bad" }, activeFile);

      for (const rule of CONFLICT_RULES) {
        const result = await queryConflicts(
          { category: rule.category, field: rule.field, rule: rule.key, page: 1, pageSize: 100 },
          tx,
        );
        assert.deepEqual(
          result.rows.map((entry) => entry.id).sort(),
          expected.get(rule.key)!.sort(),
          rule.key,
        );
        assert.equal(result.total, expected.get(rule.key)!.length, `${rule.key} total`);
        assert(
          result.rows.every((entry) => entry.issues.every((issue) => issue.rule === rule.key)),
        );
        if (rule.key === "date_invalid")
          assert.equal(result.rows[0].issues.length, 2, "two bad dates share one record row");
        if (rule.key === "national_short")
          assert.equal(
            result.rows.find((entry) => entry.id === paddedShort)?.nationalId,
            "00012345678",
            "display padding does not hide the short numeric ID",
          );
        if (rule.key === "national_long")
          assert.equal(
            result.rows.find((entry) => entry.id === oversized)?.nationalId,
            "9223372036854775808",
            "oversized original is retained and never truncated",
          );
      }
      const page1 = await queryConflicts(
        { category: "invalid", field: "all", rule: "all", page: 1, pageSize: 10 },
        tx,
      );
      const page2 = await queryConflicts(
        { category: "invalid", field: "all", rule: "all", page: 2, pageSize: 10 },
        tx,
      );
      assert.equal(page1.total, page2.total);
      assert.equal(page1.rows.length, 10);
      assert(!page1.rows.some((entry) => page2.rows.some((other) => other.id === entry.id)));
      const pastEnd = await queryConflicts(
        { category: "invalid", field: "all", rule: "all", page: 999, pageSize: 10 },
        tx,
      );
      assert.equal(pastEnd.rows.length, 0);
      assert.equal(pastEnd.total, page1.total);
      const allConflicts = await queryConflicts(
        { category: "conflicting", field: "all", rule: "all", page: 1, pageSize: 100 },
        tx,
      );
      assert.equal(allConflicts.rows.find((entry) => entry.id === sameA)?.issues.length, 5);
      const names = allConflicts.rows.map((entry) => normalizeStored(entry.fullName));
      for (const name of new Set(names)) {
        const positions = names.flatMap((value, position) => (value === name ? [position] : []));
        assert.equal(
          positions.at(-1)! - positions[0] + 1,
          positions.length,
          "matching names remain adjacent",
        );
      }
      for (const text of [
        "  أَحمد   عبد الله مُصطفى  ",
        "٠١۲۳",
        "إآٱؤئةىء",
        "\tفاطمة\n",
        "مُحَمَّــد",
        "قاسم",
        "ABC",
      ]) {
        const [normalized] = await tx.$queryRaw<{ value: string }[]>(
          Prisma.sql`SELECT ${normalizeTextSql(Prisma.sql`${text}`)} AS value`,
        );
        assert.equal(
          normalized.value,
          normalizeStored(text),
          "SQL normalization matches stored normalization",
        );
      }
      await tx.$executeRaw`DELETE FROM records`;
      const sameShamValues = { ...person, sham_cash: "9999999999999999" };
      const sameShamA = await row(sameShamValues);
      const sameShamB = await row(
        { ...sameShamValues, sham_cash: "٩٩٩٩\u00a0٩٩٩٩\t٩٩٩٩ ٩٩٩٩" },
        secondFile,
      );
      const equivalentSham = await queryConflicts(
        { category: "conflicting", field: "sham_cash", rule: "all", page: 1, pageSize: 25 },
        tx,
      );
      assert.equal(
        equivalentSham.total,
        0,
        "same person and account across files is not a conflict regardless of whitespace",
      );
      await tx.$executeRaw`UPDATE records SET data = jsonb_set(data, '{sham_cash}', '"9999 9999 9999 9998"'::jsonb) WHERE id = ${sameShamB}::uuid`;
      const distinctSham = await queryConflicts(
        { category: "conflicting", field: "sham_cash", rule: "person_sham", page: 1, pageSize: 25 },
        tx,
      );
      assert.deepEqual(
        distinctSham.rows.map((entry) => entry.id).sort(),
        [sameShamA, sameShamB].sort(),
        "16-digit accounts differing by one digit remain distinct without Number rounding",
      );
      await tx.$executeRaw`DELETE FROM records`;
      for (const category of ["invalid", "missing", "similar", "conflicting"] as const) {
        const result = await queryConflicts(
          { category, field: "all", rule: "all", page: 1, pageSize: 25 },
          tx,
        );
        assert.equal(result.total, 0);
        assert.deepEqual(result.rows, []);
      }
      const nationalA = await row({ ...person, national_id: "123456789" });
      const nationalB = await row({ ...person, national_id: "٠٠١٢٣\u00a0٤٥٦\t٧٨٩" }, secondFile);
      const equivalentNational = await queryConflicts(
        { category: "conflicting", field: "national_id", rule: "all", page: 1, pageSize: 25 },
        tx,
      );
      assert.equal(
        equivalentNational.total,
        0,
        "same numeric national ID across files is not a conflict",
      );
      await tx.$executeRaw`UPDATE records SET sf_mother_name = 'أم أخرى' WHERE id = ${nationalB}::uuid`;
      const linkedNational = await queryConflicts(
        {
          category: "conflicting",
          field: "national_id",
          rule: "national_people",
          page: 1,
          pageSize: 25,
        },
        tx,
      );
      assert.deepEqual(
        linkedNational.rows.map((entry) => entry.id).sort(),
        [nationalA, nationalB].sort(),
      );
      assert(
        linkedNational.rows.every((entry) => entry.nationalId === "00123456789"),
        "all conflicts display the same eleven-digit national ID",
      );
      console.log(
        "PASS: 31 rules, raw/mapped values, date boundaries, normalization, complete conflict groups, pagination, empty archive and in-progress import exclusion (temporary tables only).",
      );
    },
    { timeout: 120_000 },
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
