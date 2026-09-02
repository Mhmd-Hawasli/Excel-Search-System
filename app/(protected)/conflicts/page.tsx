import { PageHeader } from "@/components/page-header";
import { ConflictsInterface } from "@/components/conflicts-interface";

export default function ConflictsPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="مراجعة جودة الأرشيف"
        title="تضارب البيانات"
        description="راجع البيانات الخاطئة والناقصة وتشابه الأسماء والتضارب بين سجلات جميع الملفات، مع توضيح المشكلة في كل سجل."
      />
      <ConflictsInterface />
    </div>
  );
}
