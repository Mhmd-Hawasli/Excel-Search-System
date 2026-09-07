import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { queryWithConflictCache } from "@/lib/conflicts/cache";
import {
  CONFLICT_FIELDS,
  CONFLICT_PAIR_LABELS,
  CONFLICT_RULES,
  type ConflictPairSide,
  type ConflictResponse,
  type ConflictRuleKey,
} from "@/lib/conflicts/catalog";
import type { ConflictRequest } from "@/lib/conflicts/request";
import type { DataScope } from "@/lib/auth/session-user";
import { FUNCTIONAL_CATEGORY_LABELS } from "@/lib/format/functional-category";

/** Restricts the conflict report to visible groups/files (empty = nothing). */
export function conflictScopeFilter(scope: DataScope): Prisma.Sql {
  if (scope.groupIds === null) return Prisma.empty;
  // Parent groups are navigation containers, not grants to sibling files.
  if (!scope.fileIds?.length) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND f.id IN (${Prisma.join([...new Set(scope.fileIds)].sort().map((id) => Prisma.sql`${id}::uuid`))})`;
}

// Keep the SQL equivalent of normalizeStored local to this read-only report.
// In particular, do not strip characters before validating an identifier.
export function latinDigitsSql(value: Prisma.Sql) {
  return Prisma.sql`translate(${value}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')`;
}

export function normalizeTextSql(value: Prisma.Sql) {
  return Prisma.sql`lower(regexp_replace(translate(regexp_replace(
    ${latinDigitsSql(Prisma.sql`btrim(regexp_replace(COALESCE(${value}, ''), ${"\\s+"}, ' ', 'g'))`)},
    ${"[\u064B-\u0655\u0670\u0640]"}, '', 'g'), 'أإآٱؤئةىء', 'ااااويهي'), ${"عبد\\s+"}, 'عبد', 'g'))`;
}

function numericKey(value: Prisma.Sql) {
  const latin = latinDigitsSql(value);
  return Prisma.sql`CASE WHEN ${latin} ~ '^[0-9]+$' THEN COALESCE(NULLIF(ltrim(${latin}, '0'), ''), '0') END`;
}

function categoryDisplaySql(value: Prisma.Sql) {
  const [first, second, third, fourth, fifth] = FUNCTIONAL_CATEGORY_LABELS;
  return Prisma.sql`CASE WHEN COALESCE(TRIM(COALESCE(${value}, '')), '') ~ '^[0-9]+$'
    THEN CASE COALESCE(NULLIF(${value}, '')::integer, 0)
      WHEN 1 THEN ${first}
      WHEN 2 THEN ${second}
      WHEN 3 THEN ${third}
      WHEN 4 THEN ${fourth}
      WHEN 5 THEN ${fifth}
      ELSE 'فئة غير معروفة'
    END
    ELSE 'فئة غير معروفة'
  END`;
}

const rawFields = [
  "first_name",
  "father_name",
  "last_name",
  "full_name",
  "national_id",
  "sham_cash",
  "personal_no",
  "mother_name",
  "contract_code",
  "job_title",
  "functional_category",
  "organizational_level",
] as const;
const trimCharacters =
  " \t\n\r\f\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

function numericInputSql(value: Prisma.Sql) {
  // Ignore formatting whitespace, but retain nonnumeric characters for validation.
  // Keep digit text exact: Number conversion can round 16-digit identifiers.
  return Prisma.sql`translate(${latinDigitsSql(value)}, ${trimCharacters}, '')`;
}

function rawField(field: (typeof rawFields)[number]) {
  const fallback =
    field === "sham_cash"
      ? Prisma.sql`lpad(r.sf_sham_cash::text, 16, '0')`
      : field === "national_id"
        ? Prisma.sql`COALESCE(r.data ->> '__national_id_original', r.sf_national_id::text)`
        : field === "functional_category"
          ? Prisma.sql`COALESCE(r.sf_functional_category::text, '')`
          : Prisma.raw(`r.sf_${field}`);
  const originalCell = Prisma.sql`r.data ->> (m.mapping ->> ${field})`;
  // Read originals for synthesized names and numeric standardized identifiers.
  const original =
    field === "national_id"
      ? Prisma.sql`CASE WHEN r.data ? (m.mapping ->> ${field}) THEN ${originalCell} ELSE ${fallback} END`
      : field === "full_name" || field === "sham_cash" || field === "functional_category"
        ? Prisma.sql`CASE WHEN m.mapping ? ${field} THEN ${originalCell} ELSE ${fallback} END`
        : Prisma.sql`COALESCE(${fallback}, ${originalCell})`;
  return Prisma.sql`btrim(COALESCE(${original}, ''), ${trimCharacters}) AS ${Prisma.raw(field)}`;
}

function baseCtes(scope: Prisma.Sql) {
  return Prisma.sql`
  mappings AS (
    SELECT file_id, jsonb_object_agg(standard_field::text, header_raw) FILTER (WHERE standard_field IS NOT NULL) AS mapping
    FROM file_columns GROUP BY file_id
  ),
  source AS MATERIALIZED (
    SELECT r.id, r.file_id, r.row_index, f.group_id, f.name AS file_name, f.original_filename,
      COALESCE(m.mapping, '{}'::jsonb) AS mapping,
      COALESCE(NULLIF(btrim(r.sf_full_name), ''), concat_ws(' ', NULLIF(btrim(r.sf_first_name), ''), NULLIF(btrim(r.sf_father_name), ''), NULLIF(btrim(r.sf_last_name), ''))) AS display_name,
      ${Prisma.join(rawFields.map(rawField))},
      r.sf_functional_category::text AS functional_category_stored,
      -- Never NULL: NULL display values poison the '||' explanation
      -- concatenation for rows with a missing phone inside a flagged group.
      COALESCE(r.sf_phone, '') AS phone,
      r.sf_secondary_contract_code AS secondary_contract_code,
      -- Leading zeros are trunk prefixes, not identity: "0995…" and "995…"
      -- must share one key, mirroring numericKey for the other identifiers.
      NULLIF(ltrim(COALESCE(r.d_phone, ''), '0'), '') AS phone_key
    FROM records r JOIN files f ON f.id = r.file_id LEFT JOIN mappings m ON m.file_id = r.file_id
    WHERE NOT EXISTS (SELECT 1 FROM upload_jobs j WHERE j.file_id = f.id AND j.status IN ('pending', 'parsing', 'inserting'))
    ${scope}
  ),
  normalized AS MATERIALIZED (
    SELECT s.*, ${normalizeTextSql(Prisma.sql`display_name`)} AS name_key,
      ${normalizeTextSql(Prisma.sql`mother_name`)} AS mother_key,
      ${numericKey(numericInputSql(Prisma.sql`national_id`))} AS national_key,
      ${numericKey(numericInputSql(Prisma.sql`sham_cash`))} AS sham_key,
      ${numericKey(Prisma.sql`personal_no`)} AS personal_key,
      NULLIF(${normalizeTextSql(Prisma.sql`contract_code`)}, '') AS contract_key,
      NULLIF(${normalizeTextSql(Prisma.sql`secondary_contract_code`)}, '') AS secondary_key,
      NULLIF(COALESCE(${normalizeTextSql(Prisma.sql`contract_code`)}, '') || '|' || COALESCE(${normalizeTextSql(Prisma.sql`secondary_contract_code`)}, ''), '|') AS contract_pair_key,
      NULLIF(btrim(s.functional_category_stored, ${trimCharacters}), '') AS functional_category_key,
      NULLIF(${normalizeTextSql(Prisma.sql`job_title`)}, '') AS job_key,
      NULLIF(${normalizeTextSql(Prisma.sql`organizational_level`)}, '') AS org_level_key
    FROM source s
  ),
  base AS MATERIALIZED (
    SELECT n.*, CASE WHEN name_key <> '' AND mother_key <> '' THEN jsonb_build_array(name_key, mother_key) END AS person_key
    FROM normalized n
  )`;
}

const dateCtes = Prisma.sql`,
  -- Resolve date-bearing columns once over file_columns (hundreds of rows),
  -- not once per record × column pair (hundreds of thousands of pairs).
  date_columns AS MATERIALIZED (
    SELECT file_id, header_raw FROM file_columns c
    WHERE ${normalizeTextSql(Prisma.sql`c.header_raw`)} LIKE '%تاريخ%'
  ),
  date_originals AS MATERIALIZED (
    SELECT b.id, dc.header_raw, COALESCE(r.data ->> dc.header_raw, '') AS raw_value
    FROM base b JOIN records r ON r.id = b.id JOIN date_columns dc ON dc.file_id = b.file_id
  ),
  date_values AS MATERIALIZED (
    SELECT *, ${latinDigitsSql(Prisma.sql`btrim(raw_value, ${trimCharacters})`)} AS value FROM date_originals
  ),
  date_parts AS MATERIALIZED (
    SELECT *, regexp_match(value, ${"^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$"}) AS dmy,
      regexp_match(value, ${"^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[T\\s].*)?$"}) AS ymd,
      regexp_match(value, ${"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{1,2})\\s+(\\d{4})(?:\\s|$)"}) AS excel
    FROM date_values WHERE value <> ''
  ),
  date_iso AS MATERIALIZED (
    SELECT *, CASE
      WHEN dmy IS NOT NULL THEN dmy[3] || '-' || lpad(dmy[2], 2, '0') || '-' || lpad(dmy[1], 2, '0')
      WHEN ymd IS NOT NULL THEN ymd[1] || '-' || lpad(ymd[2], 2, '0') || '-' || lpad(ymd[3], 2, '0')
      WHEN excel IS NOT NULL THEN excel[3] || '-' || lpad(array_position(ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], excel[1])::text, 2, '0') || '-' || lpad(excel[2], 2, '0')
    END AS iso FROM date_parts
  ),
  dates AS (
    SELECT *, CASE WHEN pg_input_is_valid(iso, 'date') THEN iso::date END AS parsed FROM date_iso
  )`;

const jobCtes = Prisma.sql`,
  -- Same once-per-column resolution for job-title columns.
  job_columns AS MATERIALIZED (
    SELECT file_id, header_raw FROM file_columns c
    WHERE c.standard_field = 'job_title'
      OR ${normalizeTextSql(Prisma.sql`regexp_replace(c.header_raw, ${" \\[[^]]+\\]( \\([0-9]+\\))?$"}, '')`)} IN ('المسمي الوظيفي', 'مسمي وظيفي', 'المسمي', 'مسمي الوظيفة', 'المسمي الوظيفي الحالي')
  ),
  job_values AS MATERIALIZED (
    SELECT b.id, b.person_key, b.name_key, b.mother_key, jc.header_raw,
      COALESCE(NULLIF(btrim(r.data ->> jc.header_raw), ''), b.job_title) AS value,
      ${normalizeTextSql(Prisma.sql`COALESCE(NULLIF(btrim(r.data ->> jc.header_raw), ''), b.job_title)`)} AS value_key
    FROM base b JOIN records r ON r.id = b.id JOIN job_columns jc ON jc.file_id = b.file_id
    WHERE b.person_key IS NOT NULL
  )`;

function issueSelectFor(includeDetails: boolean) {
  return function issueSelect(
    key: ConflictRuleKey,
    explanation: Prisma.Sql,
    from: Prisma.Sql,
    where: Prisma.Sql,
  ) {
    const rule = CONFLICT_RULES.find((entry) => entry.key === key)!;
    return Prisma.sql`SELECT b.id, ${key}::text AS rule, ${includeDetails ? Prisma.sql`${rule.label}::text` : Prisma.sql`NULL::text`} AS label, ${includeDetails ? explanation : Prisma.sql`NULL::text`} AS explanation FROM ${from} WHERE ${where}`;
  };
}

/** Grouping key expression for one side of a directed n*m pair rule. */
function pairSideKey(side: ConflictPairSide, row: Prisma.Sql): Prisma.Sql {
  switch (side) {
    case "national_id":
      return Prisma.sql`${row}.national_key`;
    case "person":
      return Prisma.sql`${row}.person_key`;
    case "personal_no":
      return Prisma.sql`${row}.personal_key`;
    case "sham_cash":
      return Prisma.sql`${row}.sham_key`;
    case "contract_pair":
      return Prisma.sql`${row}.contract_pair_key`;
    case "phone":
      return Prisma.sql`${row}.phone_key`;
  }
}

/** Human-readable value of one side, evaluated on the given row expression. */
function pairSideDisplay(side: ConflictPairSide, row: Prisma.Sql): Prisma.Sql {
  switch (side) {
    case "national_id":
      return Prisma.sql`${row}.national_id`;
    case "person":
      return Prisma.sql`${row}.display_name || ' (الأم: ' || ${row}.mother_name || ')'`;
    case "personal_no":
      return Prisma.sql`${row}.personal_no`;
    case "sham_cash":
      return Prisma.sql`${row}.sham_cash`;
    case "contract_pair":
      return Prisma.sql`COALESCE(NULLIF(split_part(${row}.contract_pair_key, '|', 1), ''), '—') || ' + ' || COALESCE(NULLIF(split_part(${row}.contract_pair_key, '|', 2), ''), '—')`;
    case "phone":
      return Prisma.sql`COALESCE(${row}.phone, '')`;
  }
}

/**
 * Directed n*m rule (from → more than one to): flags every row whose `from`
 * value maps to several distinct `to` values across the archive, e.g. one
 * national ID linked to several wallets. Null keys on either side are
 * excluded; a row with a null `to` still belongs to its flagged `from` group.
 */
function pairDifferenceRule(
  key: ConflictRuleKey,
  from: ConflictPairSide,
  to: ConflictPairSide,
  includeDetails = true,
) {
  const issueSelect = issueSelectFor(includeDetails);
  const outerFrom = pairSideKey(from, Prisma.sql`b`);
  const innerFrom = pairSideKey(from, Prisma.sql`sample`);
  const innerTo = pairSideKey(to, Prisma.sql`sample`);
  const toLabel = CONFLICT_PAIR_LABELS[to];
  return issueSelect(
    key,
    Prisma.sql`'«' || ${pairSideDisplay(from, Prisma.sql`b`)} || '» مرتبط بـ ' || g.total || ' قيم مختلفة لـ «' || ${toLabel} || '»، منها «' || g.first_value || '» و«' || g.last_value || '». قيمة هذا السجل: «' || ${pairSideDisplay(to, Prisma.sql`b`)} || '».'`,
    Prisma.sql`base b JOIN (SELECT ${innerFrom} AS a_key, COUNT(DISTINCT ${innerTo}) AS total, MIN(${pairSideDisplay(to, Prisma.sql`sample`)}) AS first_value, MAX(${pairSideDisplay(to, Prisma.sql`sample`)}) AS last_value FROM base sample WHERE ${innerFrom} IS NOT NULL AND ${innerTo} IS NOT NULL GROUP BY ${innerFrom} HAVING COUNT(DISTINCT ${innerTo}) > 1) g ON g.a_key = ${outerFrom}`,
    Prisma.sql`${outerFrom} IS NOT NULL`,
  );
}

function localRule(key: ConflictRuleKey, includeDetails = true) {
  const issueSelect = issueSelectFor(includeDetails);
  const from = Prisma.sql`base b`;
  const national = numericInputSql(Prisma.sql`b.national_id`);
  const sham = numericInputSql(Prisma.sql`b.sham_cash`);
  switch (key) {
    case "national_short":
      return issueSelect(
        key,
        Prisma.sql`'الرقم «' || b.national_key || '» يتكون من ' || length(b.national_key) || ' أرقام قبل تعبئة أصفار العرض؛ المطلوب من 9 إلى 11 رقماً. القيمة الأصلية «' || b.national_id || '».'`,
        from,
        Prisma.sql`length(b.national_key) <= 8`,
      );
    case "national_long":
      return issueSelect(
        key,
        Prisma.sql`'الرقم «' || b.national_key || '» يتكون من ' || length(b.national_key) || ' أرقام قبل تعبئة أصفار العرض؛ الحد الأعلى 11. القيمة الأصلية «' || b.national_id || '».'`,
        from,
        Prisma.sql`length(b.national_key) >= 12`,
      );
    case "national_characters":
      return issueSelect(
        key,
        Prisma.sql`'القيمة الأصلية «' || b.national_id || '» تحتوي على محارف غير رقمية.'`,
        from,
        Prisma.sql`b.national_id <> '' AND ${national} !~ '^[0-9]+$'`,
      );
    case "sham_short":
      return issueSelect(
        key,
        Prisma.sql`'القيمة الأصلية «' || b.sham_cash || '» تحتوي بعد تحويل الأرقام وحذف جميع الفراغات على ' || length(${sham}) || ' خانة، والمطلوب 16.'`,
        from,
        Prisma.sql`${sham} <> '' AND length(${sham}) < 16`,
      );
    case "sham_long":
      return issueSelect(
        key,
        Prisma.sql`'القيمة الأصلية «' || b.sham_cash || '» تحتوي بعد تحويل الأرقام وحذف جميع الفراغات على ' || length(${sham}) || ' خانة، والمطلوب 16.'`,
        from,
        Prisma.sql`length(${sham}) > 16`,
      );
    case "sham_characters":
      return issueSelect(
        key,
        Prisma.sql`'القيمة الأصلية «' || b.sham_cash || '» تحتوي بعد حذف الفراغات على محارف غير رقمية؛ الشام كاش يجب أن يتكون من 16 رقماً فقط.'`,
        from,
        Prisma.sql`${sham} <> '' AND ${sham} !~ '^[0-9]+$'`,
      );
    case "name_mismatch": {
      const composed = Prisma.sql`concat_ws(' ', NULLIF(b.first_name, ''), NULLIF(b.father_name, ''), NULLIF(b.last_name, ''))`;
      return issueSelect(
        key,
        Prisma.sql`'الاسم المربوط «' || b.full_name || '» لا يساوي «' || ${composed} || '» (الاسم + اسم الأب + النسبة) بعد التطبيع.'`,
        from,
        Prisma.sql`b.mapping ?& ARRAY['full_name','first_name','father_name','last_name'] AND b.full_name <> '' AND ${normalizeTextSql(Prisma.sql`b.full_name`)} <> ${normalizeTextSql(composed)}`,
      );
    }
    case "category_invalid":
      return issueSelect(
        key,
        Prisma.sql`'القيمة الأصلية «' || b.functional_category || '» لا يمكن تحويلها إلى فئة وظيفية من 1 إلى 5، وتُخزن كـ 0 للخطأ.'`,
        from,
        Prisma.sql`b.functional_category_key = '0'`,
      );
    case "date_invalid":
    case "date_early":
    case "date_future": {
      // Contract end dates legitimately lie in the future and are excluded
      // from the future-date rule only (invalid and early dates still count).
      const contractEndColumn = Prisma.sql`(((${normalizeTextSql(Prisma.sql`b.header_raw`)} LIKE '%نهاي%' OR ${normalizeTextSql(Prisma.sql`b.header_raw`)} LIKE '%انتهاء%')) AND ${normalizeTextSql(Prisma.sql`b.header_raw`)} LIKE '%عقد%')`;
      const condition =
        key === "date_invalid"
          ? Prisma.sql`b.parsed IS NULL`
          : key === "date_early"
            ? Prisma.sql`b.parsed < DATE '1940-01-01'`
            : Prisma.sql`b.parsed > CURRENT_DATE AND NOT ${contractEndColumn}`;
      const reason =
        key === "date_invalid"
          ? "تعذر تحويلها إلى تاريخ معتمد."
          : key === "date_early"
            ? "تسبق 01/01/1940."
            : "تتجاوز تاريخ اليوم.";
      return issueSelect(
        key,
        Prisma.sql`'العمود «' || b.header_raw || '»، القيمة «' || b.raw_value || '»: ' || ${reason}`,
        Prisma.sql`dates b`,
        condition,
      );
    }
    default: {
      const rule = CONFLICT_RULES.find((entry) => entry.key === key)!;
      if (rule.category !== "missing") return null;
      const value = Prisma.raw(`b.${rule.field}`);
      // Missing values count only when the field is mapped to an Excel
      // column; unmapped files never raise missing-data issues.
      return issueSelect(
        key,
        Prisma.sql`${CONFLICT_FIELDS[rule.field] + ": "} || CASE WHEN b.mapping ? ${rule.field} THEN 'الخلية في العمود «' || (b.mapping ->> ${rule.field}) || '» فارغة.' ELSE 'لا توجد قيمة مسجلة أو عمود مربوط بهذا الحقل.' END`,
        from,
        Prisma.sql`${value} = '' AND b.mapping ? ${rule.field}`,
      );
    }
  }
}

const identifierColumns = {
  national_id: ["national_key", "national_id"],
  sham_cash: ["sham_key", "sham_cash"],
  personal_no: ["personal_key", "personal_no"],
  contract_code: ["contract_key", "contract_code"],
  job_title: ["job_key", "job_title"],
  functional_category: ["functional_category_key", "functional_category_key"],
  organizational_level: ["org_level_key", "organizational_level"],
} as const;

function relationalRule(key: ConflictRuleKey, includeDetails = true) {
  const issueSelect = issueSelectFor(includeDetails);
  if (key === "similar_names")
    return issueSelect(
      key,
      Prisma.sql`'هذا الاسم الثلاثي مرتبط بـ ' || g.total || ' أسماء أمهات مختلفة بعد التطبيع، منها «' || g.first_value || '» و«' || g.last_value || '».'`,
      Prisma.sql`base b JOIN (SELECT name_key, COUNT(DISTINCT mother_key) AS total, MIN(mother_name) AS first_value, MAX(mother_name) AS last_value FROM base WHERE person_key IS NOT NULL GROUP BY name_key HAVING COUNT(DISTINCT mother_key) > 1) g ON g.name_key = b.name_key`,
      Prisma.sql`b.person_key IS NOT NULL`,
    );
  if (key === "similar_national")
    return issueSelect(
      key,
      Prisma.sql`'هذا الاسم الثلاثي مرتبط بـ ' || g.total || ' أرقام وطنية مختلفة بعد التطبيع، منها «' || g.first_value || '» و«' || g.last_value || '».'`,
      Prisma.sql`base b JOIN (SELECT name_key, COUNT(DISTINCT national_key) AS total, MIN(national_id) AS first_value, MAX(national_id) AS last_value FROM base WHERE name_key <> '' AND national_key IS NOT NULL GROUP BY name_key HAVING COUNT(DISTINCT national_key) > 1) g ON g.name_key = b.name_key`,
      Prisma.sql`b.name_key <> '' AND b.national_key IS NOT NULL`,
    );
  if (key === "person_job")
    return issueSelect(
      key,
      Prisma.sql`'الشخص نفسه مرتبط بـ ' || g.total || ' مسميات وظيفية مختلفة: منها «' || g.first_value || '» و«' || g.last_value || '». عمود هذا السجل «' || b.header_raw || '»، وقيمته «' || b.value || '».'`,
      Prisma.sql`job_values b JOIN (SELECT person_key, COUNT(DISTINCT value_key) AS total, MIN(value) AS first_value, MAX(value) AS last_value FROM job_values WHERE value_key <> '' GROUP BY person_key HAVING COUNT(DISTINCT value_key) > 1) g ON g.person_key = b.person_key`,
      Prisma.sql`b.value_key <> ''`,
    );
  const rule = CONFLICT_RULES.find((entry) => entry.key === key)!;
  const pairMeta = (rule as { pair?: { from: ConflictPairSide; to: ConflictPairSide } }).pair;
  if (pairMeta) return pairDifferenceRule(key, pairMeta.from, pairMeta.to, includeDetails);
  if (!(rule.field in identifierColumns)) throw new Error("Unsupported conflict rule");
  const [keyName, valueName] = identifierColumns[rule.field as keyof typeof identifierColumns];
  const keyColumn = Prisma.raw(keyName);
  const valueColumn = Prisma.raw(valueName);
  const currentKey = Prisma.raw(`b.${keyName}`);
  const currentValue = Prisma.raw(`b.${valueName}`);
  if (key.startsWith("duplicate_"))
    return issueSelect(
      key,
      Prisma.sql`'القيمة «' || ${currentValue} || '» مكررة في ' || g.total || ' صفوف داخل ملف المصدر نفسه.'`,
      Prisma.sql`base b JOIN (SELECT file_id, ${keyColumn} AS value_key, COUNT(*) AS total FROM base WHERE ${keyColumn} IS NOT NULL GROUP BY file_id, ${keyColumn} HAVING COUNT(*) > 1) g ON g.file_id = b.file_id AND g.value_key = ${currentKey}`,
      Prisma.sql`TRUE`,
    );
  if (key.endsWith("_people"))
    return issueSelect(
      key,
      Prisma.sql`'القيمة «' || ${currentValue} || '» مرتبطة بـ ' || g.total || ' أشخاص مختلفين في جميع الملفات؛ الشخص هو الاسم الثلاثي مع اسم الأم.'`,
      Prisma.sql`base b JOIN (SELECT ${keyColumn} AS value_key, COUNT(DISTINCT person_key) AS total FROM base WHERE person_key IS NOT NULL AND ${keyColumn} IS NOT NULL GROUP BY ${keyColumn} HAVING COUNT(DISTINCT person_key) > 1) g ON g.value_key = ${currentKey}`,
      Prisma.sql`b.person_key IS NOT NULL`,
    );
  const displayValue = (value: Prisma.Sql) =>
    rule.field === "functional_category" ? categoryDisplaySql(value) : value;
  const currentDisplay = displayValue(currentValue);
  return issueSelect(
    key,
    Prisma.sql`'الشخص نفسه مرتبط بـ ' || g.total || ${" قيم مختلفة لحقل «" + CONFLICT_FIELDS[rule.field] + "»، منها «"} || ${displayValue(Prisma.sql`g.first_value`)} || '» و«' || ${displayValue(Prisma.sql`g.last_value`)} || '». قيمة هذا السجل «' || ${currentDisplay} || '».'`,
    Prisma.sql`base b JOIN (SELECT person_key, COUNT(DISTINCT ${keyColumn}) AS total, MIN(${valueColumn}) AS first_value, MAX(${valueColumn}) AS last_value FROM base WHERE person_key IS NOT NULL AND ${keyColumn} IS NOT NULL GROUP BY person_key HAVING COUNT(DISTINCT ${keyColumn}) > 1) g ON g.person_key = b.person_key`,
    Prisma.sql`${currentKey} IS NOT NULL`,
  );
}

function groupKeyExpression(input: import("@/lib/conflicts/request").ConflictRequest): {
  sql: Prisma.Sql;
  isPerRow: boolean;
} {
  // For categories where each row is isolated, use per-row id
  if (input.category === "invalid" || input.category === "missing") {
    return { sql: Prisma.sql`b.id::text`, isPerRow: true };
  }
  if (input.category === "similar") {
    return { sql: Prisma.sql`b.name_key`, isPerRow: false };
  }
  // conflicting
  if (input.category === "conflicting") {
    if (input.rule !== "all") {
      const rule = CONFLICT_RULES.find((r) => r.key === input.rule);
      if (!rule) return { sql: Prisma.sql`b.id::text`, isPerRow: true };
      if (rule.key.startsWith("duplicate_")) {
        const field = rule.field as keyof typeof identifierColumns;
        const keyName = identifierColumns[field]?.[0];
        if (keyName) {
          return {
            sql: Prisma.sql`b.file_name || '|' || COALESCE(${Prisma.raw(`b.${keyName}`)}::text, '')`,
            isPerRow: false,
          };
        }
      }
      if (rule.key.endsWith("_people")) {
        const field = rule.field as keyof typeof identifierColumns;
        const keyName = identifierColumns[field]?.[0];
        if (keyName) {
          return { sql: Prisma.raw(`COALESCE(b.${keyName}::text, '')`), isPerRow: false };
        }
      }
      if (rule.key.startsWith("person_") || rule.key === "person_job") {
        return {
          sql: Prisma.sql`COALESCE(b.name_key, '') || '|' || COALESCE(b.mother_key, '')`,
          isPerRow: false,
        };
      }
      if (rule.key.startsWith("pair_")) {
        const pair = (rule as { pair?: { from: ConflictPairSide } }).pair;
        if (pair) {
          switch (pair.from) {
            case "national_id":
              return { sql: Prisma.sql`COALESCE(b.national_key::text, '')`, isPerRow: false };
            case "person":
              return {
                sql: Prisma.sql`COALESCE(b.name_key, '') || '|' || COALESCE(b.mother_key, '')`,
                isPerRow: false,
              };
            case "personal_no":
              return { sql: Prisma.sql`COALESCE(b.personal_key::text, '')`, isPerRow: false };
            case "sham_cash":
              return { sql: Prisma.sql`COALESCE(b.sham_key::text, '')`, isPerRow: false };
            case "contract_pair":
              return { sql: Prisma.sql`COALESCE(b.contract_pair_key::text, '')`, isPerRow: false };
            case "phone":
              return { sql: Prisma.sql`COALESCE(b.phone_key::text, '')`, isPerRow: false };
          }
        }
      }
    }
    // For broad conflicting queries (multiple rules / fields), fallback to per-row to avoid incorrect lumping
    return { sql: Prisma.sql`b.id::text`, isPerRow: true };
  }
  return { sql: Prisma.sql`b.id::text`, isPerRow: true };
}

function sortOrderSql(input: import("@/lib/conflicts/request").ConflictRequest): Prisma.Sql {
  const dir = input.sortDir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const nulls = input.sortDir === "desc" ? Prisma.sql`NULLS LAST` : Prisma.sql`NULLS FIRST`;
  const base = (() => {
    switch (input.sortBy) {
      case "issueNumber":
        return Prisma.sql`issue_number`;
      case "fileName":
        return Prisma.sql`file_name`;
      case "fullName":
        return Prisma.sql`name_key`;
      case "motherName":
        return Prisma.sql`mother_key`;
      case "nationalId":
        return Prisma.sql`national_key`;
      case "shamCash":
        return Prisma.sql`sham_key`;
      case "personalNo":
        return Prisma.sql`personal_key`;
      case "functionalCategory":
        return Prisma.sql`functional_category_key`;
      default:
        return Prisma.sql`issue_number`;
    }
  })();
  // For stable secondary sort, append default ordering
  if (input.sortBy === "issueNumber") {
    return Prisma.sql`${base} ${dir} ${nulls}, name_key ASC, mother_key ASC, file_name ASC, row_index ASC`;
  }
  return Prisma.sql`${base} ${dir} ${nulls}, issue_number ASC, name_key ASC`;
}

function selectedRules(input: ConflictRequest) {
  const rules = CONFLICT_RULES.filter(
    (rule) =>
      rule.category === input.category &&
      (input.field === "all" || rule.field === input.field) &&
      (input.rule === "all" || rule.key === input.rule),
  );
  if (!rules.length) throw new Error("No matching conflict rules");
  return rules;
}

function reportCtes(input: ConflictRequest) {
  const groupInfo = groupKeyExpression(input);

  // Determine ranking window: DENSE_RANK for grouped issues (same group_key = same issue number), ROW_NUMBER for per-row
  const issueNumberWindow = groupInfo.isPerRow
    ? Prisma.sql`ROW_NUMBER() OVER (ORDER BY name_key ASC, mother_key ASC, file_name ASC, row_index ASC, id ASC)`
    : Prisma.sql`DENSE_RANK() OVER (ORDER BY group_key ASC)`;

  return Prisma.sql`
    matched AS MATERIALIZED (
      SELECT id, jsonb_agg(jsonb_build_object('rule', rule, 'label', label, 'explanation', explanation) ORDER BY rule, explanation) AS issues
      FROM filtered GROUP BY id
    ),
    grouped AS (
      SELECT b.*, m.issues AS issues_agg, ${groupInfo.sql} AS group_key
      FROM matched m JOIN base b ON b.id = m.id
    ),
    ranked AS (
      SELECT *, ${issueNumberWindow} AS issue_number
      FROM grouped
    ),
    page_rows AS (
      SELECT b.id, b.file_id AS "fileId", b.group_id AS "groupId", b.file_name AS "fileName", b.original_filename AS "originalFilename",
        b.row_index AS "rowIndex", b.display_name AS "fullName", b.mother_name AS "motherName",
        COALESCE(lpad(b.national_key, GREATEST(11, length(b.national_key)), '0'), ${latinDigitsSql(Prisma.sql`b.national_id`)}) AS "nationalId",
        COALESCE(b.sham_cash, '') AS "shamCash",
        COALESCE(b.personal_no, '') AS "personalNo",
        COALESCE(b.phone, '') AS "phone",
        b.functional_category_key::integer AS "functionalCategory",
        b.group_key AS "groupKey",
        b.issue_number::integer AS "issueNumber",
        b.issues_agg AS issues
      FROM ranked b
      ORDER BY ${sortOrderSql(input)}, id ASC
      LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}
    )`;
}

const reportSelect = Prisma.sql`(SELECT COUNT(*)::integer FROM matched) AS total,
  COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM page_rows p), '[]'::jsonb) AS rows`;

export function buildConflictQuery(input: ConflictRequest, scope: Prisma.Sql = Prisma.empty) {
  const rules = selectedRules(input);
  const selects = rules.map((rule) => localRule(rule.key) ?? relationalRule(rule.key));
  return Prisma.sql`WITH ${baseCtes(scope)}
    ${rules.some((rule) => rule.field === "date") ? dateCtes : Prisma.empty}
    ${rules.some((rule) => rule.key === "person_job") ? jobCtes : Prisma.empty},
    issues AS (${Prisma.join(selects, " UNION ALL ")}),
    filtered AS MATERIALIZED (
      SELECT issues.* FROM issues WHERE NOT EXISTS (
        SELECT 1 FROM ignored_conflicts ig WHERE ig.record_id = issues.id AND ig.rule = issues.rule
      )
    ), ${reportCtes(input)}
    SELECT ${reportSelect}`;
}

export async function queryConflicts(
  input: ConflictRequest,
  database: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
  scope: Prisma.Sql = Prisma.empty,
): Promise<ConflictResponse> {
  const query = buildConflictQuery(input, scope);
  const [result] = database === prisma
    ? await queryWithConflictCache<Pick<ConflictResponse, "total" | "rows">>(query)
    : await database.$queryRaw<Pick<ConflictResponse, "total" | "rows">[]>(query);
  const total = result?.total ?? 0;
  return {
    rows: result?.rows ?? [],
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.ceil(total / input.pageSize),
  };
}

export type ConflictStatsRule = {
  rule: string;
  label: string;
  category: string;
  instances: number;
  records: number;
};

export type ConflictStatsFile = {
  fileId: string;
  fileName: string;
  groupId: string;
  instances: number;
};

export type ConflictStats = {
  instances: number;
  records: number;
  filesScanned: number;
  recordsScanned: number;
  ignored: number;
  rules: ConflictStatsRule[];
  files: ConflictStatsFile[];
};

type ConflictStatsRow = {
  rules: Array<{ rule: string; instances: number; records: number }>;
  files: ConflictStatsFile[];
  totalInstances: number;
  totalRecords: number;
  filesScanned: number;
  recordsScanned: number;
  ignored: number;
};

function statsCtes(filter: Prisma.Sql, issues: Prisma.Sql) {
  return Prisma.sql`
    rule_stats AS (
      SELECT rule, COUNT(*)::integer AS instances, COUNT(DISTINCT id)::integer AS records
      FROM ${issues} GROUP BY rule
    ),
    file_stats AS (
      SELECT b.file_id AS "fileId", b.file_name AS "fileName", b.group_id AS "groupId",
        COUNT(*)::integer AS instances
      FROM ${issues} f JOIN base b ON b.id = f.id
      GROUP BY b.file_id, b.file_name, b.group_id
    ),
    totals AS (
      SELECT COUNT(*)::integer AS instances, COUNT(DISTINCT id)::integer AS records FROM ${issues}
    ),
    base_totals AS (
      SELECT COUNT(DISTINCT file_id)::integer AS files, COUNT(*)::integer AS records FROM base
    ),
    ignored_total AS (
      SELECT COUNT(*)::integer AS ignored
      FROM ignored_conflicts ig
      JOIN records r ON r.id = ig.record_id
      JOIN files f ON f.id = r.file_id
      WHERE TRUE ${filter}
    )`;
}

const statsSelect = Prisma.sql`
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.instances DESC, r.rule), '[]'::jsonb) FROM rule_stats r) AS rules,
      (SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.instances DESC, f."fileId"), '[]'::jsonb) FROM (SELECT * FROM file_stats ORDER BY instances DESC, "fileId" LIMIT 50) f) AS files,
      (SELECT instances FROM totals) AS "totalInstances",
      (SELECT records FROM totals) AS "totalRecords",
      (SELECT files FROM base_totals) AS "filesScanned",
      (SELECT records FROM base_totals) AS "recordsScanned",
      (SELECT ignored FROM ignored_total) AS ignored`;

function formatStats(result?: ConflictStatsRow): ConflictStats {
  const rules = (result?.rules ?? []).map((entry) => {
    const definition = CONFLICT_RULES.find((rule) => rule.key === entry.rule);
    return {
      rule: entry.rule,
      label: definition?.label ?? entry.rule,
      category: definition?.category ?? "conflicting",
      instances: entry.instances,
      records: entry.records,
    };
  });
  return {
    instances: result?.totalInstances ?? 0,
    records: result?.totalRecords ?? 0,
    filesScanned: result?.filesScanned ?? 0,
    recordsScanned: result?.recordsScanned ?? 0,
    ignored: result?.ignored ?? 0,
    rules,
    files: result?.files ?? [],
  };
}

/** Standalone statistics skip explanations and the aggregates used only to render them. */
export async function queryConflictStats(
  scope: DataScope,
  database: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<ConflictStats> {
  const filter = conflictScopeFilter(scope);
  const selects = CONFLICT_RULES.map(
    (rule) => localRule(rule.key, false) ?? relationalRule(rule.key, false),
  );
  const query = Prisma.sql`WITH ${baseCtes(filter)}
    ${dateCtes} ${jobCtes},
    issues AS (${Prisma.join(selects, " UNION ALL ")}),
    filtered AS MATERIALIZED (
      SELECT id, rule FROM issues WHERE NOT EXISTS (
        SELECT 1 FROM ignored_conflicts ig WHERE ig.record_id = issues.id AND ig.rule = issues.rule
      )
    ), ${statsCtes(filter, Prisma.sql`filtered`)}
    SELECT ${statsSelect}`;
  const [result] = database === prisma
    ? await queryWithConflictCache<ConflictStatsRow>(query)
    : await database.$queryRaw<ConflictStatsRow[]>(query);
  return formatStats(result);
}

export type ConflictDashboard = { stats: ConflictStats; results: ConflictResponse };

/** One statement/snapshot: scan and normalize once, evaluate each rule once. */
export function buildConflictDashboardQuery(input: ConflictRequest, scope: DataScope) {
  const selected = selectedRules(input).map((rule) => rule.key);
  const selects = CONFLICT_RULES.map((rule) => {
    const includeDetails = selected.includes(rule.key);
    return localRule(rule.key, includeDetails) ?? relationalRule(rule.key, includeDetails);
  });
  const filter = conflictScopeFilter(scope);
  return Prisma.sql`WITH ${baseCtes(filter)} ${dateCtes} ${jobCtes},
    issues AS (${Prisma.join(selects, " UNION ALL ")}),
    all_filtered AS MATERIALIZED (
      SELECT issues.* FROM issues WHERE NOT EXISTS (
        SELECT 1 FROM ignored_conflicts ig WHERE ig.record_id = issues.id AND ig.rule = issues.rule
      )
    ),
    filtered AS (
      SELECT * FROM all_filtered WHERE rule IN (${Prisma.join(selected)})
    ), ${reportCtes(input)}, ${statsCtes(filter, Prisma.sql`all_filtered`)}
    SELECT ${reportSelect}, ${statsSelect}`;
}

export async function queryConflictDashboard(
  input: ConflictRequest,
  scope: DataScope,
  database: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<ConflictDashboard> {
  type Row = ConflictStatsRow & Pick<ConflictResponse, "total" | "rows">;
  const query = buildConflictDashboardQuery(input, scope);
  const [result] = database === prisma
    ? await queryWithConflictCache<Row>(query)
    : await database.$queryRaw<Row[]>(query);
  const total = result?.total ?? 0;
  return {
    stats: formatStats(result),
    results: {
      rows: result?.rows ?? [],
      total,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.ceil(total / input.pageSize),
    },
  };
}
