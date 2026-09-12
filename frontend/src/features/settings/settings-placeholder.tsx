import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export function SettingsPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="الإعدادات" title={title} description={description} />
      <EmptyState title="قيد الترحيل" description="هذه الشاشة ستُبنى على خدمة API في مرحلة الترحيل التالية." />
    </div>
  );
}
