import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { StandardFieldKey } from "@/lib/excel/types";
import { buildSearchPlan, type SearchMode } from "@/lib/search/plan";
import { functionalCategoryQuery } from "@/lib/format/functional-category";
import type { SearchField } from "@/lib/search/fields";
import type { SearchSortDirection, SearchSortKey } from "@/lib/search/sort";

export type SearchRequest = {
  query: string;
  mode: SearchMode;
  field?: StandardFieldKey;
  groupIds?: string[];
  fileIds?: string[];
  page: number;
  pageSize: number;
  sortBy?: SearchSortKey;
  sortDirection?: SearchSortDirection;
};
type SearchDatabaseRow = {
  id: string;
  groupId: string;
  groupName: string;
  fileId: string;
  fileName: string;
  sfFullName: string | null;
  sfNationalId: string | null;
  dNationalId: string | null;
  sfMotherName: string | null;
  sfShamCash: string | null;
  sfPersonalNo: string | null;
  sfFirstName: string | null;
  sfFatherName: string | null;
  sfLastName: string | null;
  sfPhone: string | null;
  sfContractCode: string | null;
  sfSecondaryContractCode: string | null;
  sfJobTitle: string | null;
  sfFunctionalCategory: number | null;
  sfOrganizationalLevel: string | null;
  matchedField: StandardFieldKey | null;
  matchedValue: string | null;
  matchRank: number;
};

export type SearchResultRow = SearchDatabaseRow;

function column(field: SearchField) {
  if (field.key === "sham_cash") return Prisma.sql`LPAD(r."sf_sham_cash"::text, 16, '0')`;
  return Prisma.raw(`r."${field.column}"`);
}

function conditionFor(
  field: SearchField,
  textTokens: string[],
  numericNeedle: string,
  categoryNeedle: number | null,
) {
  if (field.type === "functional_category")
    return categoryNeedle === null
      ? Prisma.sql`FALSE`
      : Prisma.sql`r."sf_functional_category" = ${categoryNeedle}`;
  const fieldColumn = column(field);
  if (field.type === "numeric")
    return numericNeedle
      ? Prisma.sql`${fieldColumn} ILIKE ${`%${numericNeedle}%`}`
      : Prisma.sql`FALSE`;
  if (!textTokens.length) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    textTokens.map((token) => Prisma.sql`${fieldColumn} ILIKE ${`%${token}%`}`),
    " AND ",
  )})`;
}

function exactFor(
  field: SearchField,
  normalizedText: string,
  numericNeedle: string,
  categoryNeedle: number | null,
) {
  if (field.type === "functional_category")
    return categoryNeedle === null
      ? Prisma.sql`FALSE`
      : Prisma.sql`r."sf_functional_category" = ${categoryNeedle}`;
  const needle = field.type === "numeric" ? numericNeedle : normalizedText;
  return needle ? Prisma.sql`${column(field)} = ${needle}` : Prisma.sql`FALSE`;
}

function prefixFor(
  field: SearchField,
  normalizedText: string,
  numericNeedle: string,
  categoryNeedle: number | null,
) {
  if (field.type === "functional_category")
    return categoryNeedle === null
      ? Prisma.sql`FALSE`
      : Prisma.sql`r."sf_functional_category" = ${categoryNeedle}`;
  const needle = field.type === "numeric" ? numericNeedle : normalizedText;
  return needle ? Prisma.sql`${column(field)} ILIKE ${`${needle}%`}` : Prisma.sql`FALSE`;
}

function displayColumn(field: SearchField) {
  const columns: Record<StandardFieldKey, string> = {
    first_name: "sf_first_name",
    father_name: "sf_father_name",
    last_name: "sf_last_name",
    full_name: "sf_full_name",
    national_id: "d_national_id",
    sham_cash: "sf_sham_cash",
    personal_no: "d_personal_no",
    mother_name: "sf_mother_name",
    phone: "sf_phone",
    contract_code: "sf_contract_code",
    secondary_contract_code: "sf_secondary_contract_code",
    job_title: "sf_job_title",
    functional_category: "sf_functional_category",
    organizational_level: "sf_organizational_level",
  };
  if (field.key === "sham_cash") return Prisma.sql`LPAD(r."sf_sham_cash"::text, 16, '0')`;
  if (field.type === "functional_category") return Prisma.sql`r."sf_functional_category"::text`;
  return Prisma.raw(`r."${columns[field.key]}"`);
}

function searchOrder(sortBy?: SearchSortKey, sortDirection: SearchSortDirection = "asc") {
  if (!sortBy) return Prisma.sql`"matchRank" ASC, r."created_at" DESC, r.id ASC`;
  const direction = Prisma.raw(sortDirection === "desc" ? "DESC" : "ASC");
  switch (sortBy) {
    case "source":
      return Prisma.sql`g.name ${direction} NULLS LAST, f.name ${direction} NULLS LAST, r.id ASC`;
    case "full_name":
      return Prisma.sql`r."n_full_name" ${direction} NULLS LAST, r.id ASC`;
    case "national_id":
      return Prisma.sql`NULLIF(r."d_national_id", '')::numeric ${direction} NULLS LAST, r.id ASC`;
    case "mother_name":
      return Prisma.sql`r."n_mother_name" ${direction} NULLS LAST, r.id ASC`;
    case "sham_cash":
      return Prisma.sql`r."sf_sham_cash" ${direction} NULLS LAST, r.id ASC`;
    case "personal_no":
      return Prisma.sql`NULLIF(r."d_personal_no", '')::numeric ${direction} NULLS LAST, r.id ASC`;
    case "job_title":
      return Prisma.sql`r."n_job_title" ${direction} NULLS LAST, r.id ASC`;
    case "functional_category":
      return Prisma.sql`r."sf_functional_category" ${direction} NULLS LAST, r.id ASC`;
    case "organizational_level":
      return Prisma.sql`r."n_organizational_level" ${direction} NULLS LAST, r.id ASC`;
    case "match":
      return Prisma.sql`"matchedValue" ${direction} NULLS LAST, "matchedField" ${direction} NULLS LAST, r.id ASC`;
  }
}

export async function searchRecords(input: SearchRequest) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(10, input.pageSize));
  const plan = buildSearchPlan(input);
  if (!input.query.trim() || plan.fields.length === 0)
    return { rows: [] as SearchResultRow[], total: 0, page, pageSize, pageCount: 0 };
  const categoryNeedle = functionalCategoryQuery(input.query);
  const conditions = plan.fields.map((field) =>
    conditionFor(field, plan.textTokens, plan.numericNeedle, categoryNeedle),
  );
  const exact = plan.fields.map((field) =>
    exactFor(field, plan.normalizedText, plan.numericNeedle, categoryNeedle),
  );
  const prefix = plan.fields.map((field) =>
    prefixFor(field, plan.normalizedText, plan.numericNeedle, categoryNeedle),
  );
  const groupIds = Array.from(new Set(input.groupIds ?? []));
  const fileIds = Array.from(new Set(input.fileIds ?? []));
  const groupScope = groupIds.length
    ? Prisma.sql`AND f."group_id" IN (${Prisma.join(groupIds.map((groupId) => Prisma.sql`${groupId}::uuid`))})`
    : Prisma.empty;
  const fileScope = fileIds.length
    ? Prisma.sql`AND f.id IN (${Prisma.join(fileIds.map((fileId) => Prisma.sql`${fileId}::uuid`))})`
    : Prisma.empty;
  const scope =
    groupIds.length && fileIds.length
      ? Prisma.sql`AND (f."group_id" IN (${Prisma.join(groupIds.map((groupId) => Prisma.sql`${groupId}::uuid`))}) OR f.id IN (${Prisma.join(fileIds.map((fileId) => Prisma.sql`${fileId}::uuid`))}))`
      : groupIds.length
        ? groupScope
        : fileScope;
  const where = Prisma.sql`(${Prisma.join(conditions, " OR ")}) ${scope}`;
  const fieldCases = plan.fields.map(
    (field, index) => Prisma.sql`WHEN ${conditions[index]} THEN ${field.key}`,
  );
  const matchedValueCases = plan.fields.map(
    (field, index) => Prisma.sql`WHEN ${conditions[index]} THEN ${displayColumn(field)}`,
  );
  const order = searchOrder(input.sortBy, input.sortDirection);
  const offset = (page - 1) * pageSize;
  const [countRows, databaseRows] = await prisma.$transaction([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS total FROM "records" r JOIN "files" f ON f.id = r."file_id" WHERE ${where}`,
    ),
    prisma.$queryRaw<SearchDatabaseRow[]>(Prisma.sql`
      SELECT r.id, g.id AS "groupId", g.name AS "groupName", f.id AS "fileId", f.name AS "fileName",
        r."sf_full_name" AS "sfFullName", r."sf_national_id"::text AS "sfNationalId", r."d_national_id" AS "dNationalId",
        r."sf_mother_name" AS "sfMotherName", r."sf_sham_cash"::text AS "sfShamCash", r."sf_personal_no" AS "sfPersonalNo",
        r."sf_first_name" AS "sfFirstName", r."sf_father_name" AS "sfFatherName", r."sf_last_name" AS "sfLastName",
        r."sf_phone" AS "sfPhone", r."sf_contract_code" AS "sfContractCode", r."sf_secondary_contract_code" AS "sfSecondaryContractCode",
        r."sf_job_title" AS "sfJobTitle", r."sf_functional_category" AS "sfFunctionalCategory", r."sf_organizational_level" AS "sfOrganizationalLevel",
        CASE ${Prisma.join(fieldCases, " ")} ELSE NULL END AS "matchedField",
        CASE ${Prisma.join(matchedValueCases, " ")} ELSE NULL END AS "matchedValue",
        CASE WHEN (${Prisma.join(exact, " OR ")}) THEN 0 WHEN (${Prisma.join(prefix, " OR ")}) THEN 1 ELSE 2 END AS "matchRank"
      FROM "records" r JOIN "files" f ON f.id = r."file_id" JOIN "groups" g ON g.id = f."group_id"
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${offset}
    `),
  ]);
  const total = Number(countRows[0]?.total ?? 0n);
  return { rows: databaseRows, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}
