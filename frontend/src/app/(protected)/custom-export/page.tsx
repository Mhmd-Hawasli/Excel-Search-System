import { Suspense } from "react";
import { CustomExportPage } from "@/features/custom-export/custom-export-page";
import { LoadingScreen } from "@/components/loading-screen";

export const dynamic = "force-dynamic";

export default function CustomExportRoute() {
  return (
    <Suspense fallback={<LoadingScreen message="جارٍ تحميل التصدير المخصص…" />}>
      <CustomExportPage />
    </Suspense>
  );
}
