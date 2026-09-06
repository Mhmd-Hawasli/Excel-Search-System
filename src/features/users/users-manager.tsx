"use client";

import { useMemo, useState } from "react";
import { Pencil, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

export type PermissionRow = { permission: string; groupId: string | null; fileId: string | null };

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  permissions: PermissionRow[];
};

export type GroupOption = { id: string; name: string; files: { id: string; name: string }[] };

export type CatalogGroup = {
  key: string;
  label: string;
  permissions: { key: string; label: string; scoped?: "group" | "file" | "groupOrFile" }[];
};

async function requestJson(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    return { ok: false as const, error: (data as { error?: string } | null)?.error ?? "تعذر تنفيذ العملية." };
  return { ok: true as const, data };
}

function hasAssignment(assignments: PermissionRow[], permission: string, groupId?: string, fileId?: string) {
  return assignments.some(
    (row) =>
      row.permission === permission && (row.groupId ?? undefined) === groupId && (row.fileId ?? undefined) === fileId,
  );
}

function toggleAssignment(
  assignments: PermissionRow[],
  assignment: PermissionRow,
): PermissionRow[] {
  return hasAssignment(assignments, assignment.permission, assignment.groupId ?? undefined, assignment.fileId ?? undefined)
    ? assignments.filter(
        (row) =>
          !(
            row.permission === assignment.permission &&
            (row.groupId ?? undefined) === (assignment.groupId ?? undefined) &&
            (row.fileId ?? undefined) === (assignment.fileId ?? undefined)
          ),
      )
    : [...assignments, assignment];
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 transition hover:border-primary/40">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-6">{label}</span>
        {hint ? <span className="block text-xs leading-5 text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function PermissionMatrix({
  idPrefix,
  assignments,
  onChange,
  groups,
  catalog,
}: {
  idPrefix: string;
  assignments: PermissionRow[];
  onChange: (next: PermissionRow[]) => void;
  groups: GroupOption[];
  catalog: CatalogGroup[];
}) {
  const files = useMemo(
    () => groups.flatMap((group) => group.files.map((file) => ({ ...file, groupName: group.name }))),
    [groups],
  );
  return (
    <div className="space-y-5">
      {catalog.map((group) => (
        <fieldset key={group.key} className="space-y-2.5">
          <legend className="mb-1 text-sm font-extrabold text-primary">{group.label}</legend>
          {group.permissions.map((permission) => {
            if (!permission.scoped) {
              const checked = hasAssignment(assignments, permission.key);
              return (
                <CheckRow
                  key={permission.key}
                  id={`${idPrefix}-${permission.key}`}
                  checked={checked}
                  onChange={() => onChange(toggleAssignment(assignments, { permission: permission.key, groupId: null, fileId: null }))}
                  label={permission.label}
                />
              );
            }
            return (
              <div key={permission.key} className="space-y-2.5 rounded-lg border border-dashed p-3">
                <p className="text-sm font-bold">{permission.label}</p>
                {(permission.scoped === "group" || permission.scoped === "groupOrFile") && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">المجموعات</p>
                    {groups.length === 0 && <p className="text-xs text-muted-foreground">لا توجد مجموعات بعد.</p>}
                    <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {groups.map((group) => (
                        <CheckRow
                          key={`${permission.key}-${group.id}`}
                          id={`${idPrefix}-${permission.key}-g-${group.id}`}
                          checked={hasAssignment(assignments, permission.key, group.id, undefined)}
                          onChange={() =>
                            onChange(toggleAssignment(assignments, { permission: permission.key, groupId: group.id, fileId: null }))
                          }
                          label={group.name}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {(permission.scoped === "file" || permission.scoped === "groupOrFile") && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">الملفات</p>
                    {files.length === 0 && <p className="text-xs text-muted-foreground">لا توجد ملفات بعد.</p>}
                    <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {files.map((file) => (
                        <CheckRow
                          key={`${permission.key}-${file.id}`}
                          id={`${idPrefix}-${permission.key}-f-${file.id}`}
                          checked={hasAssignment(assignments, permission.key, undefined, file.id)}
                          onChange={() =>
                            onChange(toggleAssignment(assignments, { permission: permission.key, groupId: null, fileId: file.id }))
                          }
                          label={file.name}
                          hint={file.groupName}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function permissionSummary(user: ManagedUser) {
  const global = user.permissions.filter((row) => !row.groupId && !row.fileId).length;
  const scoped = user.permissions.length - global;
  if (global === 0 && scoped === 0) return "بلا صلاحيات";
  const parts = [];
  if (global > 0) parts.push(`${global} عامة`);
  if (scoped > 0) parts.push(`${scoped} مخصصة`);
  return parts.join(" + ");
}

export function UsersManager({
  initialUsers,
  groups,
  catalog,
  canCreate,
  canUpdate,
  canDelete,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  groups: GroupOption[];
  catalog: CatalogGroup[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", displayName: "", isActive: true });
  const [createPermissions, setCreatePermissions] = useState<PermissionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", password: "", isActive: true });
  const [permsUserId, setPermsUserId] = useState<string | null>(null);
  const [permsAssignments, setPermsAssignments] = useState<PermissionRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  function flash(kind: "ok" | "error", text: string) {
    setNotice({ kind, text });
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);
    const result = await requestJson("/api/users", "POST", {
      username: createForm.username,
      password: createForm.password,
      displayName: createForm.displayName || undefined,
      isActive: createForm.isActive,
      permissions: createPermissions,
    });
    setPending(false);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    const created = (result.data as { user: ManagedUser }).user;
    setUsers((current) => [...current, created]);
    setCreateForm({ username: "", password: "", displayName: "", isActive: true });
    setCreatePermissions([]);
    setShowCreate(false);
    flash("ok", `تم إنشاء المستخدم ${created.username}.`);
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id);
    setEditForm({ displayName: user.displayName ?? "", password: "", isActive: user.isActive });
    setPermsUserId(null);
    setNotice(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);
    const body: Record<string, unknown> = {
      displayName: editForm.displayName,
      isActive: editForm.isActive,
    };
    if (editForm.password) body.password = editForm.password;
    const result = await requestJson(`/api/users/${user.id}`, "PATCH", body);
    setPending(false);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    const updated = (result.data as { user: ManagedUser }).user;
    setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingId(null);
    flash("ok", `تم حفظ بيانات ${updated.username}.`);
  }

  function startPermissions(user: ManagedUser) {
    setPermsUserId(user.id);
    setPermsAssignments(user.permissions.map((row) => ({ ...row })));
    setEditingId(null);
    setNotice(null);
  }

  async function savePermissions(user: ManagedUser) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const result = await requestJson(`/api/users/${user.id}/permissions`, "PUT", {
      permissions: permsAssignments,
    });
    setPending(false);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    const next = (result.data as { permissions: PermissionRow[] }).permissions;
    setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, permissions: next } : item)));
    setPermsUserId(null);
    flash("ok", `تم حفظ صلاحيات ${user.username}.`);
  }

  async function deleteUser() {
    if (!deleteTarget || pending) return;
    if (deleteConfirm.trim() !== deleteTarget.username) {
      flash("error", `اكتب "${deleteTarget.username}" للتأكيد.`);
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await requestJson(`/api/users/${deleteTarget.id}`, "DELETE");
    setPending(false);
    if (!result.ok) {
      flash("error", result.error);
      return;
    }
    setUsers((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleteConfirm("");
    flash("ok", `تم حذف المستخدم ${deleteTarget.username}.`);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="إدارة النظام"
        title="إدارة المستخدمين"
        description="إنشاء المستخدمين وتعديل بياناتهم وحذفهم والتحكم الكامل بصلاحيات كل مستخدم."
        actions={
          canCreate ? (
            <Button type="button" onClick={() => { setShowCreate((value) => !value); setNotice(null); }}>
              <UserPlus className="size-4" />
              مستخدم جديد
            </Button>
          ) : undefined
        }
      />
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/25 bg-primary/5 text-primary"}`}>
          {notice.text}
        </p>
      ) : null}

      {showCreate && canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">مستخدم جديد</CardTitle>
            <CardDescription>حدد اسم المستخدم وكلمة المرور ثم اختر صلاحياته.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="new-username">اسم المستخدم</Label>
                  <Input id="new-username" value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} autoComplete="off" required minLength={3} maxLength={64} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">كلمة المرور</Label>
                  <Input id="new-password" type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} autoComplete="new-password" required minLength={6} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-display">الاسم المعروض (اختياري)</Label>
                  <Input id="new-display" value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} autoComplete="off" maxLength={120} />
                </div>
              </div>
              <label htmlFor="new-active" className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input id="new-active" type="checkbox" checked={createForm.isActive} onChange={(event) => setCreateForm({ ...createForm, isActive: event.target.checked })} className="size-4 accent-primary" />
                حساب مفعّل
              </label>
              <PermissionMatrix idPrefix="new" assignments={createPermissions} onChange={setCreatePermissions} groups={groups} catalog={catalog} />
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ…" : "إنشاء المستخدم"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersRound className="size-5 text-primary" />
            المستخدمون ({users.length})
          </CardTitle>
          <CardDescription>جميع حسابات النظام وصلاحياتها.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد مستخدمون بعد.</p>}
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <div key={user.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold" dir="ltr">{user.username}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {user.displayName ? `${user.displayName} · ` : ""}{permissionSummary(user)}
                      {isSelf ? " · حسابك" : ""}
                    </p>
                  </div>
                  <Badge variant={user.isActive ? "default" : "secondary"}>{user.isActive ? "نشط" : "معطّل"}</Badge>
                  {canUpdate ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => (editingId === user.id ? setEditingId(null) : startEdit(user))}>
                      <Pencil className="size-4" />
                      تعديل
                    </Button>
                  ) : null}
                  {canUpdate && !isSelf ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => (permsUserId === user.id ? setPermsUserId(null) : startPermissions(user))}>
                      <ShieldCheck className="size-4" />
                      الصلاحيات
                    </Button>
                  ) : null}
                  {canDelete && !isSelf ? (
                    <AlertDialog
                      open={deleteTarget?.id === user.id}
                      onOpenChange={(open) => {
                        setDeleteTarget(open ? user : null);
                        setDeleteConfirm("");
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" size="sm">
                          <Trash2 className="size-4" />
                          حذف
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>تأكيد حذف المستخدم</AlertDialogTitle>
                          <AlertDialogDescription>
                            سيتم حذف {user.username} نهائيًا مع جميع صلاحياته. اكتب اسم المستخدم للتأكيد.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor={`delete-confirm-${user.id}`}>اكتب «{user.username}»</Label>
                          <Input id={`delete-confirm-${user.id}`} value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} autoComplete="off" dir="ltr" />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel>تراجع</AlertDialogCancel>
                          <Button type="button" variant="destructive" disabled={pending} onClick={deleteUser}>
                            {pending ? "جارٍ الحذف…" : "حذف نهائي"}
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>

                {editingId === user.id && canUpdate ? (
                  <form onSubmit={(event) => saveEdit(event, user)} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor={`edit-display-${user.id}`}>الاسم المعروض</Label>
                      <Input id={`edit-display-${user.id}`} value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} maxLength={120} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-password-${user.id}`}>كلمة مرور جديدة (اتركها فارغة للإبقاء)</Label>
                      <Input id={`edit-password-${user.id}`} type="password" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} autoComplete="new-password" minLength={6} dir="ltr" />
                    </div>
                    <div className="flex items-end gap-2">
                      <label htmlFor={`edit-active-${user.id}`} className={`flex cursor-pointer items-center gap-2 text-sm font-semibold ${isSelf ? "opacity-50" : ""}`}>
                        <input id={`edit-active-${user.id}`} type="checkbox" checked={editForm.isActive} disabled={isSelf} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} className="size-4 accent-primary" />
                        حساب مفعّل
                      </label>
                    </div>
                    <div className="flex gap-2 sm:col-span-3">
                      <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}</Button>
                      <Button type="button" variant="outline" onClick={() => setEditingId(null)}>إلغاء</Button>
                    </div>
                  </form>
                ) : null}

                {permsUserId === user.id && canUpdate && !isSelf ? (
                  <div className="space-y-4 rounded-lg border border-dashed p-4">
                    <PermissionMatrix idPrefix={`perms-${user.id}`} assignments={permsAssignments} onChange={setPermsAssignments} groups={groups} catalog={catalog} />
                    <div className="flex gap-2">
                      <Button type="button" disabled={pending} onClick={() => savePermissions(user)}>
                        {pending ? "جارٍ الحفظ…" : "حفظ الصلاحيات"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setPermsUserId(null)}>إلغاء</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
