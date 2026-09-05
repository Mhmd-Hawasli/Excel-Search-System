import { ActivityAction } from "@/generated/prisma/client";

export const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  FILE_UPLOADED: "رفع ملف", FILE_UPDATED: "تحديث ملف", FILE_REPLACED: "استبدال إصدار ملف", FILE_DELETED: "حذف ملف",
  GROUP_CREATED: "إنشاء مجموعة", GROUP_UPDATED: "تحديث مجموعة", GROUP_REORDERED: "ترتيب مجموعة", GROUP_DELETED: "حذف مجموعة",
  CATEGORY_CREATED: "إنشاء فئة", CATEGORY_UPDATED: "تحديث فئة", CATEGORY_REORDERED: "ترتيب فئة", CATEGORY_DELETED: "حذف فئة",
  COLUMN_REORDERED: "ترتيب عمود", COLUMN_RECATEGORIZED: "نقل عمود بين الفئات",
  TEMPLATE_CREATED: "حفظ قالب ربط", BACKUP_RESTORED: "استعادة نسخة احتياطية",
  RECORD_EDITED: "تعديل سجل",
};

export function relativeArabic(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
