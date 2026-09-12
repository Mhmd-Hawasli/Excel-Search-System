import { DataQualityIssueType } from "@/generated/prisma/client";
import { nationalIdIssue } from "@/lib/format/national-id";
import { nationalIdDigits } from "@/lib/normalization/arabic";

export function nationalIdQualityIssue(value: unknown, seen: Set<string>) {
  const issue = nationalIdIssue(value);
  if (issue === "missing") return DataQualityIssueType.MISSING_NATIONAL_ID;
  if (issue !== null) return DataQualityIssueType.INVALID_NATIONAL_ID;
  const digits = nationalIdDigits(value)!;
  if (seen.has(digits)) return DataQualityIssueType.DUPLICATE_NATIONAL_ID;
  seen.add(digits);
  return null;
}
