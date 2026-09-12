-- Dismissed conflict problems: (rule, record) pairs hidden from the
-- conflict report, statistics and exports until the record is deleted.

CREATE TABLE "ignored_conflicts" (
  "id" UUID NOT NULL,
  "rule" TEXT NOT NULL,
  "record_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ignored_conflicts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ignored_conflicts_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ignored_conflicts_rule_record_id_key" ON "ignored_conflicts"("rule", "record_id");
CREATE INDEX "ignored_conflicts_record_id_idx" ON "ignored_conflicts"("record_id");
CREATE INDEX "ignored_conflicts_rule_idx" ON "ignored_conflicts"("rule");
