import { z } from "zod";
import { isPermissionKey, permissionScopeKind } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export const permissionAssignmentSchema = z
  .object({
    permission: z.string().min(1),
    // The permission form and serialized database rows use null for an unused scope.
    groupId: z.string().uuid().nullish(),
    fileId: z.string().uuid().nullish(),
  })
  .superRefine((value, context) => {
    if (!isPermissionKey(value.permission)) {
      context.addIssue({ code: "custom", message: "صلاحية غير معروفة." });
      return;
    }
    const scope = permissionScopeKind(value.permission);
    if (scope === null && (value.groupId ?? value.fileId)) {
      context.addIssue({ code: "custom", message: "هذه الصلاحية عامة ولا تقبل نطاقًا." });
    } else if (scope === "group" && (!value.groupId || value.fileId)) {
      context.addIssue({ code: "custom", message: "صلاحية المجموعة تتطلب مجموعة واحدة فقط." });
    } else if (scope === "file" && (!value.fileId || value.groupId)) {
      context.addIssue({ code: "custom", message: "صلاحية الملف تتطلب ملفًا واحدًا فقط." });
    } else if (
      scope === "groupOrFile" &&
      ((value.groupId && value.fileId) || (!value.groupId && !value.fileId))
    ) {
      context.addIssue({ code: "custom", message: "حدد مجموعة أو ملفًا (وليس كليهما)." });
    }
  });

export const createUserSchema = z.object({
  username: z.string().trim().min(3, "اسم المستخدم قصير جدًا.").max(64, "اسم المستخدم طويل جدًا."),
  password: z.string().min(6, "كلمة المرور قصيرة جدًا.").max(200),
  displayName: z.string().trim().max(120).optional(),
  isActive: z.boolean().default(true),
  permissions: z.array(permissionAssignmentSchema).default([]),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6, "كلمة المرور قصيرة جدًا.").max(200).optional(),
});

export const replacePermissionsSchema = z.object({
  permissions: z.array(permissionAssignmentSchema),
});

export type PermissionAssignment = z.infer<typeof permissionAssignmentSchema>;

/** Removes exact duplicate rows while preserving order. */
export function dedupeAssignments(rows: PermissionAssignment[]): PermissionAssignment[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.permission}|${row.groupId ?? ""}|${row.fileId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ensures every referenced group/file exists. Returns an Arabic error or null. */
export async function validateAssignmentTargets(rows: PermissionAssignment[]): Promise<string | null> {
  const groupIds = [...new Set(rows.map((row) => row.groupId).filter((id): id is string => Boolean(id)))];
  const fileIds = [...new Set(rows.map((row) => row.fileId).filter((id): id is string => Boolean(id)))];
  if (groupIds.length > 0) {
    const found = await prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true } });
    if (found.length !== groupIds.length) return "إحدى المجموعات المحددة غير موجودة.";
  }
  if (fileIds.length > 0) {
    const found = await prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true } });
    if (found.length !== fileIds.length) return "إحدى الملفات المحددة غير موجودة.";
  }
  return null;
}

export function serializeUser<T extends {
  id: string;
  username: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: Date;
  permissions: { permission: string; groupId: string | null; fileId: string | null }[];
}>(user: T) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    permissions: user.permissions.map((row) => ({
      permission: row.permission,
      groupId: row.groupId,
      fileId: row.fileId,
    })),
  };
}
