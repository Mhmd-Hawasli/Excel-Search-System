export type ActivityAction =
  | "FILE_UPLOADED" | "FILE_UPDATED" | "FILE_REPLACED" | "FILE_DELETED"
  | "GROUP_CREATED" | "GROUP_UPDATED" | "GROUP_REORDERED" | "GROUP_DELETED"
  | "CATEGORY_CREATED" | "CATEGORY_UPDATED" | "CATEGORY_REORDERED" | "CATEGORY_DELETED"
  | "COLUMN_REORDERED" | "COLUMN_RECATEGORIZED" | "TEMPLATE_CREATED" | "BACKUP_RESTORED"
  | "RECORD_EDITED" | "RECORD_VISITED"
  | "USER_CREATED" | "USER_UPDATED" | "USER_DELETED" | "USER_PERMISSIONS_UPDATED";

export const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  FILE_UPLOADED: "رفع ملف",
  FILE_UPDATED: "تحديث ملف",
  FILE_REPLACED: "استبدال إصدار ملف",
  FILE_DELETED: "حذف ملف",
  GROUP_CREATED: "إنشاء مجموعة",
  GROUP_UPDATED: "تحديث مجموعة",
  GROUP_REORDERED: "ترتيب مجموعة",
  GROUP_DELETED: "حذف مجموعة",
  CATEGORY_CREATED: "إنشاء فئة",
  CATEGORY_UPDATED: "تحديث فئة",
  CATEGORY_REORDERED: "ترتيب فئة",
  CATEGORY_DELETED: "حذف فئة",
  COLUMN_REORDERED: "ترتيب عمود",
  COLUMN_RECATEGORIZED: "نقل عمود بين الفئات",
  TEMPLATE_CREATED: "حفظ قالب ربط",
  BACKUP_RESTORED: "استعادة نسخة احتياطية",
  RECORD_EDITED: "تعديل سجل",
  RECORD_VISITED: "زيارة صفحة سجل",
  USER_CREATED: "إنشاء مستخدم",
  USER_UPDATED: "تحديث مستخدم",
  USER_DELETED: "حذف مستخدم",
  USER_PERMISSIONS_UPDATED: "تحديث صلاحيات مستخدم",
};

export type VisitDetails = {
  recordId?: string;
  fileName?: string;
  personName?: string;
  visitorUsername?: string;
  visitorDisplayName?: string;
};

/** Typed reader for RECORD_VISITED activity details; null when absent. */
export function parseVisitDetails(value: unknown): VisitDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  if (typeof details.visitorUsername !== "string") return null;
  return {
    recordId: typeof details.recordId === "string" ? details.recordId : undefined,
    fileName: typeof details.fileName === "string" ? details.fileName : undefined,
    personName: typeof details.personName === "string" ? details.personName : undefined,
    visitorUsername: details.visitorUsername,
    visitorDisplayName:
      typeof details.visitorDisplayName === "string"
        ? details.visitorDisplayName
        : details.visitorUsername,
  };
}

export function relativeArabic(date: Date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
