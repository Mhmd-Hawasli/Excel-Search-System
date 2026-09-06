import { getSessionUser, hasPermission, requirePagePermission } from "@/lib/auth/session-user";
import { BackupManager } from "@/features/backup/backup-manager";
import { PageHeader } from "@/components/page-header";

export default async function BackupPage() {
  await requirePagePermission("backup.view");
  const actor = await getSessionUser();
  const canExport = actor ? hasPermission(actor, "backup.export") : false;
  const canRestore = actor ? hasPermission(actor, "backup.restore") : false;
  return <div className="space-y-7"><PageHeader eyebrow="ملكية البيانات" title="النسخ الاحتياطي والاستعادة" description="احتفظ بنسخة مستقلة من الأرشيف على جهازك، واستعدها عند الحاجة." /><BackupManager canExport={canExport} canRestore={canRestore} /></div>;
}
