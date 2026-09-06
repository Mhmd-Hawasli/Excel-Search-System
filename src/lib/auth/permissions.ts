/**
 * Single source of truth for user permissions.
 *
 * - Global permissions have no scope (`groupId`/`fileId` are null).
 * - Scoped permissions carry exactly one scope: a group (`groups.viewScoped`,
 *   `search.scoped`) or a file (`files.viewScoped`, `search.scoped`).
 * - Anything a user is not granted is hidden from the UI and rejected by the
 *   API with 404, so restricted users never learn it exists.
 */
export const PERMISSION_GROUPS = [
  {
    key: "users",
    label: "إدارة المستخدمين",
    permissions: [
      { key: "users.view", label: "إظهار صفحة المستخدمين" },
      { key: "users.create", label: "إضافة مستخدم جديد" },
      { key: "users.update", label: "تعديل بيانات مستخدم موجود مسبقاً" },
      { key: "users.delete", label: "حذف مستخدم" },
    ],
  },
  {
    key: "backup",
    label: "النسخ الاحتياطي",
    permissions: [
      { key: "backup.view", label: "إظهار قسم النسخ الاحتياطي" },
      { key: "backup.export", label: "القيام بنسخ احتياطي" },
      { key: "backup.restore", label: "استرجاع نسخة احتياطية" },
    ],
  },
  {
    key: "activity",
    label: "سجل النشاطات",
    permissions: [
      { key: "activity.view", label: "إظهار سجل النشاطات" },
      { key: "activity.browse", label: "الدخول والتصفح داخل سجل النشاطات" },
    ],
  },
  {
    key: "merge",
    label: "الدمج",
    permissions: [
      { key: "merge.view", label: "إظهار دمج الملفات" },
      { key: "sheetMerge.view", label: "إظهار قسم دمج صفحات ملف إكسل" },
    ],
  },
  {
    key: "export",
    label: "التصدير",
    permissions: [
      { key: "export.view", label: "إظهار قسم تصدير ملف إكسل" },
      { key: "export.run", label: "تصدير ملف إكسل" },
    ],
  },
  {
    key: "edits",
    label: "التعديلات",
    permissions: [
      { key: "edits.view", label: "عرض تعديلات الملفات" },
      { key: "edits.badge", label: "إظهار علامة معدّل عند الملف أو أي حقل في النظام" },
      { key: "edits.update", label: "تعديل أي حقل من بيانات الملف أو الشخص" },
    ],
  },
  {
    key: "upload",
    label: "رفع الملفات",
    permissions: [
      { key: "upload.view", label: "إظهار قسم رفع ملف إكسل" },
      { key: "upload.run", label: "رفع ملف إكسل" },
    ],
  },
  {
    key: "conflicts",
    label: "تضارب البيانات",
    permissions: [
      { key: "conflicts.view", label: "إظهار صفحة تضارب البيانات" },
      { key: "conflicts.filters", label: "تعديل الفلاتر داخل صفحة تضارب البيانات" },
    ],
  },
  {
    key: "categories",
    label: "الفئات",
    permissions: [
      { key: "categories.view", label: "إظهار صفحة الفئات" },
      {
        key: "categories.manage",
        label: "تعديل فئة أو إدخال فئة جديدة أو حذف فئة أو ترتيب الأعمدة داخل الفئات",
      },
    ],
  },
  {
    key: "groups",
    label: "المجموعات والملفات",
    permissions: [
      { key: "groups.view", label: "إظهار المجموعات" },
      { key: "groups.viewScoped", label: "إظهار مجموعة معينة فقط", scoped: "group" as const },
      {
        key: "files.viewScoped",
        label: "إظهار ملف ضمن مجموعة معينة فقط",
        scoped: "file" as const,
      },
    ],
  },
  {
    key: "search",
    label: "البحث",
    permissions: [
      { key: "search.view", label: "البحث" },
      {
        key: "search.scoped",
        label: "البحث فقط في مجموعات وملفات يحددها مالك النظام",
        scoped: "groupOrFile" as const,
      },
    ],
  },
] as const;

export type PermissionScopeKind = "group" | "file" | "groupOrFile";

export type PermissionDefinition = {
  key: string;
  label: string;
  scoped?: PermissionScopeKind;
};

export const PERMISSIONS: PermissionDefinition[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => ({ ...permission })),
);

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = new Set<string>(PERMISSIONS.map((permission) => permission.key));

const SCOPED_KEYS = new Map<string, PermissionScopeKind>(
  PERMISSIONS.filter((permission) => permission.scoped).map((permission) => [
    permission.key,
    permission.scoped as PermissionScopeKind,
  ]),
);

export function permissionScopeKind(key: string): PermissionScopeKind | null {
  return SCOPED_KEYS.get(key) ?? null;
}

export function isPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_KEYS.has(key);
}

/** Global (unscoped) permission keys granted to a fully privileged owner. */
export const OWNER_GLOBAL_PERMISSIONS: PermissionKey[] = PERMISSIONS.filter(
  (permission) => !permission.scoped,
).map((permission) => permission.key);
