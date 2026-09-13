import type { MergeFieldKey } from "@/services/misc.service";
export { MERGE_FIELD_KEYS, MERGE_FIELD_LABELS } from "@/services/misc.service";
export type { MergeFieldKey, MergeInspection } from "@/services/misc.service";
export type MergeMapping = Partial<Record<MergeFieldKey, number>>;
export const MERGE_RULE_KEYS = [
  "full_name",
  "composed_name",
  "national_id",
  "personal_no",
  "sham_cash",
  "phone",
] as const;

export type MergeRuleKey = (typeof MERGE_RULE_KEYS)[number];

/** Canonical display names without baked-in order words (execution order is dynamic). */
export const MERGE_RULE_SHORT_LABELS: Record<MergeRuleKey, string> = {
  full_name: "الربط بالاسم الثلاثي مع التأكد باسم الأم",
  composed_name: "دمج الاسم مع اسم الأب مع النسبة",
  national_id: "الربط بالرقم الوطني",
  personal_no: "الربط بالرقم الذاتي",
  sham_cash: "الربط بالشام كاش",
  phone: "الربط برقم الهاتف",
};

/** Arabic ordinals used to prefix rules by execution position (1-based). */
export const ARABIC_ORDINALS: ReadonlyArray<string> = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
];

export function ruleExecutionLabel(position: number, key: MergeRuleKey): string {
  const ordinal = ARABIC_ORDINALS[position - 1] ?? String(position);
  return `القاعدة ${ordinal} — ${MERGE_RULE_SHORT_LABELS[key]}`;
}

export const MERGE_RULES: ReadonlyArray<{
  key: MergeRuleKey;
  order: number;
  label: string;
  /** Short "match via ..." phrase shown in the setup cards, e.g. "مطابقة عن طريق الرقم الوطني". */
  method: string;
  description: string;
  /** Fields needed on BOTH tables for the rule to be available. */
  required: ReadonlyArray<MergeFieldKey>;
}> = [
  {
    key: "full_name",
    order: 1,
    label: "القاعدة الأولى — الربط بالاسم الثلاثي مع التأكد باسم الأم",
    method: "مطابقة عن طريق الاسم الثلاثي",
    description:
      "شرطها ظهور الاسم الثلاثي مرة واحدة فقط في الملف الواحد. يُقارن الاسم الثلاثي بعد التنميط، والتأكد بمقارنة الكلمة الأولى من اسم الأم.",
    required: ["fullName"],
  },
  {
    key: "composed_name",
    order: 2,
    label: "القاعدة الثانية — دمج الاسم مع اسم الأب مع النسبة",
    method: "مطابقة عن طريق الاسم واسم الأب والنسبة",
    description:
      "تُطبَّق على الأسطر التي لم يرتبط اسمها الثلاثي: يُكوَّن الاسم الثلاثي من الاسم + اسم الأب + النسبة ويُربط بالاسم الثلاثي في الجدول الآخر أو بالاسم المكوَّن إن كان غير مربوط، بشرط ظهوره مرة واحدة فقط في الملف الواحد، مع التأكد باسم الأم.",
    required: ["fullName", "firstName", "fatherName", "lastName"],
  },
  {
    key: "national_id",
    order: 3,
    label: "القاعدة الثالثة — الربط بالرقم الوطني",
    method: "مطابقة عن طريق الرقم الوطني",
    description:
      "شرطها ظهور الرقم الوطني مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
    required: ["nationalId"],
  },
  {
    key: "personal_no",
    order: 4,
    label: "القاعدة الرابعة — الربط بالرقم الذاتي",
    method: "مطابقة عن طريق الرقم الذاتي",
    description:
      "شرطها ظهور الرقم الذاتي مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
    required: ["personalNo"],
  },
  {
    key: "sham_cash",
    order: 5,
    label: "القاعدة الخامسة — الربط بالشام كاش",
    method: "مطابقة عن طريق الشام كاش",
    description:
      "شرطها ظهور الشام كاش مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
    required: ["shamCash"],
  },
  {
    key: "phone",
    order: 6,
    label: "القاعدة السادسة — الربط برقم الهاتف",
    method: "مطابقة عن طريق رقم الهاتف",
    description:
      "شرطها ظهور رقم الهاتف مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
    required: ["phone"],
  },
];


