"use client";

import { useEffect, useState } from "react";
import { BackupManager } from "@/features/backup/backup-manager";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";

export default function BackupPage() {
  const [rights, setRights] = useState({ canExport: false, canRestore: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void authService.me().then((me) => {
      if (!active) return;
      const perms = me?.permissions ?? [];
      setRights({
        canExport: hasPermission(perms, "backup.export"),
        canRestore: hasPermission(perms, "backup.restore"),
      });
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="ملكية البيانات"
        title="النسخ الاحتياطي والاستعادة"
        description="احتفظ بنسخة مستقلة من الأرشيف على جهازك، واستعدها عند الحاجة."
      />
      {ready ? <BackupManager canExport={rights.canExport} canRestore={rights.canRestore} /> : null}
    </div>
  );
}
