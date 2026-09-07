import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileStack,
  IdCard,
  PencilLine,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  getSessionUser,
  hasPermission,
  isFileVisible,
  resolveDataScope,
} from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { RecordDetails } from "@/features/records/record-details";
import { RecordPrintButton } from "@/features/records/record-print-button";
import { RecordVisitLogger } from "@/features/records/record-visit-logger";
import { getRecordEdits } from "@/lib/edits/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNationalId } from "@/lib/format/national-id";
import { formatUploadDateTime } from "@/lib/format/date";
import type { StandardFieldKey } from "@/lib/excel/types";

export const dynamic = "force-dynamic";

const RELATED_LIMIT = 50;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await prisma.record.findUnique({
    where: { id },
    select: { sfFullName: true, sfFirstName: true, sfFatherName: true, sfLastName: true },
  });
  if (!record) return { title: { absolute: "السجل غير موجود" } };
  const displayName =
    record.sfFullName ||
    [record.sfFirstName, record.sfFatherName, record.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم";
  return { title: { absolute: displayName } };
}

function rowData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : item == null ? "" : String(item),
    ]),
  );
}

type RelatedRow = {
  id: string;
  sfFullName: string | null;
  sfFirstName: string | null;
  sfFatherName: string | null;
  sfLastName: string | null;
  sfMotherName: string | null;
  dNationalId: string | null;
  file: { name: string; uploadedAt: Date; group: { name: string } };
};

function relatedName(row: RelatedRow): string {
  return (
    row.sfFullName ||
    [row.sfFirstName, row.sfFatherName, row.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم"
  );
}

function RelatedLink({ item }: { item: RelatedRow }) {
  return (
    <Link
      key={item.id}
      href={`/records/${item.id}`}
      className="flex items-center justify-between rounded-lg border p-4 transition hover:border-primary hover:bg-primary/5"
    >
      <div>
        <p className="font-bold">{relatedName(item)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.file.group.name} — {item.file.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground ltr-numbers text-right">
          {formatUploadDateTime(item.file.uploadedAt)}
        </p>
      </div>
      <ExternalLink className="size-4 shrink-0 text-primary" />
    </Link>
  );
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getSessionUser();
  if (!actor) redirect("/login");
  const canViewHistory = hasPermission(actor, "edits.view");
  const canEdit = hasPermission(actor, "edits.update");
  const showEditedBadge = hasPermission(actor, "edits.badge");
  const record = await prisma.record.findUnique({
    where: { id },
    include: {
      file: {
        include: {
          group: true,
          columns: {
            orderBy: [{ sortOrder: "asc" }, { columnIndex: "asc" }],
            include: { category: true },
          },
        },
      },
    },
  });
  if (!record) notFound();
  if (!(await isFileVisible(actor, record.file))) notFound();
  const scope = await resolveDataScope(actor);
  const scopeFilter = scope.fileIds === null ? {} : { fileId: { in: scope.fileIds } };
  const { edits: recordEdits, editedHeaders } = canViewHistory
    ? await getRecordEdits(id)
    : { edits: [], editedHeaders: {} };

  const relatedSelect = {
    id: true,
    sfFullName: true,
    sfFirstName: true,
    sfFatherName: true,
    sfLastName: true,
    sfMotherName: true,
    dNationalId: true,
    file: { select: { name: true, uploadedAt: true, group: { select: { name: true } } } },
  } as const;
  const relatedOrder = { createdAt: "desc" } as const;

  // Other files for the same person: exact valid national number.
  const byNationalId =
    record.nationalIdNum === null
      ? []
      : await prisma.record.findMany({
          where: {
            nationalIdNum: record.nationalIdNum,
            id: { not: record.id },
            ...scopeFilter,
          },
          orderBy: relatedOrder,
          take: RELATED_LIMIT + 1,
          select: relatedSelect,
        });

  // Same person by normalized full name + mother name.
  const hasPersonKey = record.nFullName !== null && record.nMotherName !== null;
  const byPersonName: RelatedRow[] = hasPersonKey
    ? await prisma.record.findMany({
        where: {
          nFullName: record.nFullName,
          nMotherName: record.nMotherName,
          id: { not: record.id },
          ...scopeFilter,
        },
        orderBy: relatedOrder,
        take: RELATED_LIMIT + 1,
        select: relatedSelect,
      })
    : [];

  // Conflicts for this record: same normalized full name, different identifier.
  const hasName = record.nFullName !== null;
  const conflictNational: RelatedRow[] = hasName
    ? await prisma.record.findMany({
        where: {
          nFullName: record.nFullName,
          nationalIdNum: { not: record.nationalIdNum },
          id: { not: record.id },
          ...scopeFilter,
        },
        orderBy: relatedOrder,
        take: RELATED_LIMIT + 1,
        select: relatedSelect,
      })
    : [];
  const conflictMother: RelatedRow[] = hasName
    ? await prisma.record.findMany({
        where: {
          nFullName: record.nFullName,
          nMotherName: { not: record.nMotherName },
          id: { not: record.id },
          ...scopeFilter,
        },
        orderBy: relatedOrder,
        take: RELATED_LIMIT + 1,
        select: relatedSelect,
      })
    : [];

  function capped<T>(rows: T[]): { rows: T[]; truncated: boolean } {
    return rows.length > RELATED_LIMIT
      ? { rows: rows.slice(0, RELATED_LIMIT), truncated: true }
      : { rows, truncated: false };
  }
  const national = capped(byNationalId);
  const person = capped(byPersonName);
  const nationalConflict = capped(conflictNational);
  const motherConflict = capped(conflictMother);

  const data = rowData(record.data);
  const columns = record.file.columns.map((column) => ({
    id: column.id,
    headerRaw: column.headerRaw,
    categoryId: column.categoryId,
    categoryName: column.category?.name ?? null,
    categoryOrder: column.category?.sortOrder ?? null,
    standardField: column.standardField
      ? (column.standardField.toLowerCase() as StandardFieldKey)
      : null,
    value: data[column.headerRaw] ?? "",
  }));
  const displayName =
    record.sfFullName ||
    [record.sfFirstName, record.sfFatherName, record.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم";
  return (
    <div className="space-y-7">
      <RecordVisitLogger recordId={record.id} />
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/search">
            <ArrowRight className="size-4" />
            العودة إلى البحث
          </Link>
        </Button>
        <RecordPrintButton />
      </div>
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/12 via-card to-card p-6 shadow-soft md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-bold text-primary">سجل شخصي</p>
            <h1 className="mt-2 text-3xl font-black">{displayName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <IdCard className="size-3" />
                <span className="ltr-numbers">
                  {formatNationalId(record.sfNationalId ?? record.dNationalId) ||
                    "لا يوجد رقم وطني صالح"}
                </span>
              </Badge>
              <Badge variant="secondary">
                {record.file.group.name} — {record.file.name}
              </Badge>
              {showEditedBadge && recordEdits.length ? (
                <Badge
                  variant="outline"
                  className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <PencilLine className="size-3" />
                  يحتوي {recordEdits.length} {recordEdits.length === 1 ? "تعديل" : "تعديلات"} يدوية
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>{record.file.description || record.file.originalFilename}</p>
            <p className="mt-1 ltr-numbers text-right">
              تاريخ الرفع: {formatUploadDateTime(record.file.uploadedAt)}
            </p>
          </div>
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>بيانات السجل الأصلية</CardTitle>
          <CardDescription>
            القيم الأصلية محفوظة كما وردت في Excel. تُنسّق التواريخ ويُعرض الرقم الوطني بـ11 خانة مع
            تعبئة الأصفار على اليسار، دون اقتطاع القيم الأطول. يمكن تعديل أي حقل بزر القلم، والتراجع
            عن آخر تعديل بزر التراجع (يُسجَّل التراجع في السجل أيضًا)؛ يُحفظ التعديل في سجل منفصل مع
            القيمة القديمة والجديدة ويُحدَّث البحث فورًا، والحقل المعدّل يحمل شارة «معدّل».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecordDetails
            recordId={record.id}
            canEdit={canEdit}
            columns={columns}
            editedHeaders={
              showEditedBadge
                ? Object.fromEntries(
                    Object.entries(editedHeaders).map(([header, info]) => [
                      header,
                      { ...info, lastAt: info.lastAt.toISOString() },
                    ]),
                  )
                : {}
            }
          />
        </CardContent>
      </Card>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="size-5 text-primary" />
            ملفات أخرى لهذا الشخص <Badge>{national.rows.length + person.rows.length}</Badge>
          </CardTitle>
          <CardDescription>
            الربط بالرقم الوطني الصالح أو بالاسم الثلاثي مع اسم الأم (بعد التطبيع)، عبر كل المجموعات
            والملفات الظاهرة لحسابك.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="national" dir="rtl">
            <TabsList className="no-print">
              <TabsTrigger value="national">
                الرقم الوطني <Badge variant="secondary">{national.rows.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="person">
                الاسم الثلاثي واسم الأم <Badge variant="secondary">{person.rows.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="national">
              {record.nationalIdNum === null ? (
                <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  لا يمكن الربط بالرقم الوطني لأن هذا السجل لا يحتوي رقمًا وطنيًا صالحًا.
                </p>
              ) : national.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  لا توجد سجلات أخرى تحمل الرقم الوطني نفسه.
                </p>
              ) : (
                <div className="grid gap-3">
                  {national.rows.map((item) => (
                    <RelatedLink key={item.id} item={item} />
                  ))}
                  {national.truncated ? (
                    <p className="text-xs text-muted-foreground">
                      يعرض أول {RELATED_LIMIT} سجل — ضيّق البحث لرؤية البقية.
                    </p>
                  ) : null}
                </div>
              )}
            </TabsContent>
            <TabsContent value="person">
              {!hasPersonKey ? (
                <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  لا يمكن الربط بالاسم لأن الاسم الثلاثي أو اسم الأم فارغ في هذا السجل.
                </p>
              ) : person.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  لا توجد سجلات أخرى بالاسم الثلاثي واسم الأم نفسيهما.
                </p>
              ) : (
                <div className="grid gap-3">
                  {person.rows.map((item) => (
                    <RelatedLink key={item.id} item={item} />
                  ))}
                  {person.truncated ? (
                    <p className="text-xs text-muted-foreground">
                      يعرض أول {RELATED_LIMIT} سجل — ضيّق البحث لرؤية البقية.
                    </p>
                  ) : null}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Card className="border-amber-400/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            تضارب بيانات هذا السجل{" "}
            <Badge variant="secondary">
              {nationalConflict.rows.length + motherConflict.rows.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            سجلات أخرى تحمل الاسم الثلاثي نفسه بعد التطبيع لكن برقم وطني مختلف أو باسم أم مختلف —
            للمراجعة اليدوية قبل الاعتماد.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasName ? (
            <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              لا يمكن فحص التضارب لأن الاسم الثلاثي فارغ في هذا السجل.
            </p>
          ) : (
            <>
              <section aria-label="نفس الاسم برقم وطني مختلف">
                <h3 className="text-sm font-bold">
                  نفس الاسم الثلاثي مع اختلاف الرقم الوطني{" "}
                  <Badge variant="outline">{nationalConflict.rows.length}</Badge>
                </h3>
                {nationalConflict.rows.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    لا يوجد.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-3">
                    {nationalConflict.rows.map((item) => (
                      <Link
                        key={item.id}
                        href={`/records/${item.id}`}
                        className="flex items-center justify-between rounded-lg border p-4 transition hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                      >
                        <div>
                          <p className="font-bold">{relatedName(item)}</p>
                          <p className="mt-1 text-xs">
                            الرقم الوطني:{" "}
                            <bdi className="font-mono ltr-numbers">
                              {formatNationalId(item.dNationalId) || "—"}
                            </bdi>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.file.group.name} — {item.file.name}
                          </p>
                        </div>
                        <ExternalLink className="size-4 shrink-0 text-amber-600" />
                      </Link>
                    ))}
                    {nationalConflict.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        يعرض أول {RELATED_LIMIT} سجل — راجع صفحة تضارب البيانات للبقية.
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
              <section aria-label="نفس الاسم باسم أم مختلف">
                <h3 className="text-sm font-bold">
                  نفس الاسم الثلاثي مع اختلاف اسم الأم{" "}
                  <Badge variant="outline">{motherConflict.rows.length}</Badge>
                </h3>
                {motherConflict.rows.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    لا يوجد.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-3">
                    {motherConflict.rows.map((item) => (
                      <Link
                        key={item.id}
                        href={`/records/${item.id}`}
                        className="flex items-center justify-between rounded-lg border p-4 transition hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                      >
                        <div>
                          <p className="font-bold">{relatedName(item)}</p>
                          <p className="mt-1 text-xs">اسم الأم: {item.sfMotherName || "—"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.file.group.name} — {item.file.name}
                          </p>
                        </div>
                        <ExternalLink className="size-4 shrink-0 text-amber-600" />
                      </Link>
                    ))}
                    {motherConflict.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        يعرض أول {RELATED_LIMIT} سجل — راجع صفحة تضارب البيانات للبقية.
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
