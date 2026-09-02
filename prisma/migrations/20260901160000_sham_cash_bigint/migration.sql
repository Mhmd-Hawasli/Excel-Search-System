ALTER TYPE "data_quality_issue_type" ADD VALUE IF NOT EXISTS 'invalid_sham_cash';

ALTER TABLE "records"
  ALTER COLUMN "sf_sham_cash" TYPE BIGINT
  USING (
    CASE
      WHEN regexp_replace(
        translate(COALESCE("sf_sham_cash", ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
        '[^0-9]', '', 'g'
      ) ~ '^[0-9]{1,16}$'
      THEN regexp_replace(
        translate("sf_sham_cash", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
        '[^0-9]', '', 'g'
      )::BIGINT
      ELSE NULL
    END
  );

UPDATE "records"
SET "d_sham_cash" = LPAD("sf_sham_cash"::TEXT, 16, '0')
WHERE "sf_sham_cash" IS NOT NULL;

ALTER TABLE "records"
  ADD CONSTRAINT "records_sf_sham_cash_16_digits_check"
  CHECK ("sf_sham_cash" IS NULL OR ("sf_sham_cash" >= 0 AND "sf_sham_cash" <= 9999999999999999));
