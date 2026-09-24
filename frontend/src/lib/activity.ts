export type ActivityAction =
  | "FILE_UPLOADED" | "FILE_UPDATED" | "FILE_REPLACED" | "FILE_DELETED" | "FILE_VERSION_BUMPED"
  | "GROUP_CREATED" | "GROUP_UPDATED" | "GROUP_REORDERED" | "GROUP_DELETED"
  | "CATEGORY_CREATED" | "CATEGORY_UPDATED" | "CATEGORY_REORDERED" | "CATEGORY_DELETED"
  | "COLUMN_REORDERED" | "COLUMN_RECATEGORIZED" | "TEMPLATE_CREATED" | "BACKUP_RESTORED"
  | "RECORD_EDITED" | "RECORD_VISITED" | "RECORD_DELETED"
  | "USER_CREATED" | "USER_UPDATED" | "USER_DELETED" | "USER_PERMISSIONS_UPDATED";

export const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  FILE_UPLOADED: "رفع ملف",
  FILE_UPDATED: "تحديث ملف",
  FILE_REPLACED: "استبدال إصدار ملف",
  FILE_DELETED: "حذف ملف",
  FILE_VERSION_BUMPED: "تثبيت إصدار ملف",
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
  RECORD_DELETED: "حذف سجل",
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

export type EditDetails = {
  recordId?: string;
  fileId?: string;
  fileName?: string;
  fileVersion?: number;
  personName?: string;
  rowIndex?: number;
  headerRaw?: string;
  oldValue?: string;
  newValue?: string;
  editedBy?: string;
};

/** Typed reader for RECORD_EDITED activity details; null when absent.
 *  fileName/fileVersion are present only on rows written after the
 *  file-context enrichment; older rows resolve them via the top-level
 *  `fileName`/`fileVersion` fields the backend fills in from fileId. */
export function parseEditDetails(value: unknown): EditDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details = value as Record<string, unknown>;
  const rowIndex = details.rowIndex;
  const parsedRow =
    typeof rowIndex === "number"
      ? rowIndex
      : typeof rowIndex === "string" && rowIndex.trim() !== ""
        ? Number(rowIndex)
        : undefined;
  const versionRaw = details.fileVersion ?? details.version ?? details.newVersion;
  const parsedVersion =
    typeof versionRaw === "number"
      ? versionRaw
      : typeof versionRaw === "string" && versionRaw.trim() !== ""
        ? Number(versionRaw)
        : undefined;
  return {
    recordId: typeof details.recordId === "string" ? details.recordId : undefined,
    fileId: typeof details.fileId === "string" ? details.fileId : undefined,
    fileName: typeof details.fileName === "string" ? details.fileName : undefined,
    fileVersion: Number.isFinite(parsedVersion) ? (parsedVersion as number) : undefined,
    personName: typeof details.personName === "string" ? details.personName : undefined,
    rowIndex: Number.isFinite(parsedRow) ? parsedRow : undefined,
    headerRaw: typeof details.headerRaw === "string" ? details.headerRaw : undefined,
    oldValue: typeof details.oldValue === "string" ? details.oldValue : undefined,
    newValue: typeof details.newValue === "string" ? details.newValue : undefined,
    editedBy: typeof details.editedBy === "string" ? details.editedBy : undefined,
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

/** Minimal structural view of an activity row (mirrors ActivityLogItem). */
export type ActivityRowLike = {
  action: string;
  targetName: string;
  details?: Record<string, string | number | null> | null;
  fileName?: string | null;
  fileVersion?: number | null;
};

function toActionKeySafe(action: string): ActivityAction | null {
  const upper = action.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  const keys = new Set<string>(Object.keys(ACTIVITY_LABELS));
  return keys.has(upper) ? (upper as ActivityAction) : null;
}

/** Record-person actions whose targetName is a person's name. */
export function isPersonRecordAction(action: string): boolean {
  const key = toActionKeySafe(action);
  return key === "RECORD_EDITED" || key === "RECORD_VISITED" || key === "RECORD_DELETED";
}

/**
 * Virtual target-filter entries that stand in for the thousands of
 * person names inside record logs. Selecting one filters by action kind
 * instead of by person.
 */
export const VIRTUAL_TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "__RECORD_EDITED__", label: "تعديل سجل ضمن أي ملف" },
  { value: "__RECORD_VISITED__", label: "زيارة سجل ضمن أي ملف" },
  { value: "__RECORD_DELETED__", label: "حذف سجل ضمن أي ملف" },
];

export function virtualTargetAction(value: string): ActivityAction | null {
  if (value === "__RECORD_EDITED__") return "RECORD_EDITED";
  if (value === "__RECORD_VISITED__") return "RECORD_VISITED";
  if (value === "__RECORD_DELETED__") return "RECORD_DELETED";
  return null;
}

/** File name for a row: enriched top-level field first (works for old
 *  rows resolved via fileId), then historical details keys. */
export function resolveFileName(log: ActivityRowLike): string | null {
  if (log.fileName) return log.fileName;
  const details = (log.details ?? {}) as Record<string, unknown>;
  if (typeof details.fileName === "string" && details.fileName.trim() !== "") return details.fileName;
  return null;
}

/** File version for a row: enriched field first, then stored details
 *  keys (fileVersion/version/newVersion). Null when unknown (e.g. old
 *  rows whose file was deleted). */
export function resolveFileVersion(log: ActivityRowLike): number | null {
  if (typeof log.fileVersion === "number" && Number.isFinite(log.fileVersion)) return log.fileVersion;
  const details = (log.details ?? {}) as Record<string, unknown>;
  for (const key of ["fileVersion", "version", "newVersion"] as const) {
    const raw = details[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** Target-filter predicate shared by the logs page: virtual entries
 *  match by action kind, file names match the row's file context,
 *  everything else matches targetName. Person names never appear as
 *  options, so they can never be selected here. */
export function matchesTargetFilter(log: ActivityRowLike, person: string): boolean {
  if (!person) return true;
  const virtual = virtualTargetAction(person);
  if (virtual) return toActionKeySafe(log.action) === virtual;
  if (resolveFileName(log) === person) return true;
  return log.targetName === person;
}
