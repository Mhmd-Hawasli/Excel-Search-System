import { PageHeader } from "@/components/page-header";
import { MergeInterface } from "@/features/merge/merge-interface";

export default function MergePage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="أدوات الدمج"
        title="دمج الملفات"
        description="ارفع ملفي Excel مستقلاً، حدد أعمدة الربط، ثم طبّق قواعد الربط تباعاً حتى تكتمل المطابقة أو تظهر النسبة النهائية. النتائج لا تُحفظ في قاعدة بيانات الأرشيف وتبقى داخل هذه الجلسة فقط."
      />
      <MergeInterface />
    </div>
  );
}
