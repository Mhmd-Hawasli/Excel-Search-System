import { BackupManager } from "@/components/backup-manager";
import { PageHeader } from "@/components/page-header";

export default function BackupPage() {
  return <div className="space-y-7"><PageHeader eyebrow="ملكية البيانات" title="النسخ الاحتياطي والاستعادة" description="احتفظ بنسخة مستقلة من الأرشيف على جهازك، واستعدها عند الحاجة." /><BackupManager /></div>;
}
