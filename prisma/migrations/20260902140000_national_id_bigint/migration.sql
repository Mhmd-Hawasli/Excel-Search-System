BEGIN;

-- Keep original Excel cells for diagnostics while making the standardized value numeric.
LOCK TABLE records, file_columns, data_quality_issues IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE national_id_conversion ON COMMIT DROP AS
WITH originals AS (
  SELECT r.id, r.file_id, r.row_index, r.created_at,
    CASE WHEN r.data ? c.header_raw THEN r.data ->> c.header_raw
      ELSE COALESCE(r.data ->> '__national_id_original', r.sf_national_id) END AS raw_value,
    NOT COALESCE(r.data ? c.header_raw, false) AS needs_original
  FROM records r
  LEFT JOIN file_columns c ON c.file_id = r.file_id AND c.standard_field = 'national_id'
), cleaned AS (
  SELECT *, translate(translate(COALESCE(raw_value, ''),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '') AS cleaned_value
  FROM originals
), canonical AS (
  SELECT *, CASE WHEN cleaned_value ~ '^[0-9]+$'
    THEN COALESCE(NULLIF(ltrim(cleaned_value, '0'), ''), '0') END AS digits
  FROM cleaned
)
SELECT *, row_number() OVER (PARTITION BY file_id, digits ORDER BY row_index, id) AS occurrence
FROM canonical;

-- Legacy/unmapped originals must remain available after changing the column type.
UPDATE records r SET data = r.data || jsonb_build_object('__national_id_original', n.raw_value)
FROM national_id_conversion n
WHERE r.id = n.id AND n.needs_original AND n.raw_value IS NOT NULL
  AND NOT (r.data ? '__national_id_original');

ALTER TABLE records ALTER COLUMN sf_national_id TYPE BIGINT USING NULL::bigint;
UPDATE records r SET
  sf_national_id = CASE
    WHEN length(n.digits) < 19 THEN n.digits::bigint
    WHEN length(n.digits) = 19 AND n.digits::numeric <= 9223372036854775807 THEN n.digits::bigint
    ELSE NULL END,
  d_national_id = lpad(n.digits, GREATEST(11, length(n.digits)), '0'),
  national_id_num = CASE WHEN length(n.digits) BETWEEN 9 AND 11 THEN n.digits::bigint END
FROM national_id_conversion n WHERE r.id = n.id;

-- Rebuild national-ID quality only; retain all other quality findings.
DELETE FROM data_quality_issues
WHERE issue_type IN ('missing_national_id', 'invalid_national_id', 'duplicate_national_id');
INSERT INTO data_quality_issues (id, file_id, row_index, issue_type, column_name, raw_value, created_at)
SELECT gen_random_uuid(), file_id, row_index,
  (CASE WHEN cleaned_value = '' THEN 'missing_national_id'
    WHEN digits IS NULL OR length(digits) NOT BETWEEN 9 AND 11 THEN 'invalid_national_id'
    ELSE 'duplicate_national_id' END)::data_quality_issue_type,
  'الرقم الوطني', COALESCE(raw_value, ''), created_at
FROM national_id_conversion
WHERE cleaned_value = '' OR digits IS NULL OR length(digits) NOT BETWEEN 9 AND 11 OR occurrence > 1;

COMMIT;
