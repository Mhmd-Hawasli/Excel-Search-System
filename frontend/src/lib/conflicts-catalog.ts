/**
 * Conflicts catalog for the UI (P4.5/UI-13). Ported verbatim from V1
 * lib/conflicts/catalog.ts: categories, fields, 58 rule keys + labels.
 * The backend remains authoritative for validation and evaluation.
 */

export interface ConflictCategory {
  key: string;
  label: string;
  description: string;
}

export const CONFLICT_CATEGORIES: ConflictCategory[] = [
  { key: "invalid", label: "بيانات خاطئة", description: "قيم غير صالحة أو لا تطابق تركيبها" },
  { key: "missing", label: "بيانات ناقصة", description: "حقول أساسية أو أعمدة مرتبطة فارغة" },
  { key: "similar", label: "تشابه الأسماء", description: "الاسم الثلاثي نفسه مع اختلاف اسم الأم" },
  { key: "conflicting", label: "تضارب البيانات", description: "تكرار المعرّفات واختلاف بيانات الشخص" },
];

export const CONFLICT_FIELDS: Record<string, string> = {
  national_id: "الرقم الوطني",
  sham_cash: "الشام كاش",
  personal_no: "الرقم الذاتي",
  contract_code: "رمز العقد الرئيسي",
  full_name: "الاسم الثلاثي",
  mother_name: "اسم الأم",
  first_name: "الاسم",
  father_name: "اسم الأب",
  last_name: "النسبة",
  date: "التواريخ",
  job_title: "المسمى الوظيفي",
  functional_category: "الفئة الوظيفية",
  organizational_level: "السوية التنظيمية الأساسية",
  phone: "رقم الهاتف",
  contract_pair: "رمز العقد (أساسي + ثانوي)",
};

export interface ConflictRule {
  key: string;
  category: string;
  field: string;
  label: string;
}

export const CONFLICT_RULES: ConflictRule[] = [
  { key: "national_short", category: "invalid", field: "national_id", label: "رقم وطني من 8 أرقام أو أقل" },
  { key: "national_long", category: "invalid", field: "national_id", label: "رقم وطني من 12 خانة أو أكثر" },
  { key: "national_characters", category: "invalid", field: "national_id", label: "محارف داخل الرقم الوطني" },
  { key: "sham_short", category: "invalid", field: "sham_cash", label: "الشام كاش أقل من 16 خانة" },
  { key: "sham_long", category: "invalid", field: "sham_cash", label: "الشام كاش أكثر من 16 خانة" },
  { key: "sham_characters", category: "invalid", field: "sham_cash", label: "محارف داخل الشام كاش" },
  { key: "name_mismatch", category: "invalid", field: "full_name", label: "الاسم الثلاثي لا يطابق تركيب الاسم" },
  { key: "category_invalid", category: "invalid", field: "functional_category", label: "الفئة الوظيفية غير معروفة" },
  { key: "date_invalid", category: "invalid", field: "date", label: "تاريخ تعذر تحويله" },
  { key: "date_early", category: "invalid", field: "date", label: "تاريخ قبل عام 1940" },
  { key: "date_future", category: "invalid", field: "date", label: "تاريخ بعد اليوم" },
  { key: "missing_national", category: "missing", field: "national_id", label: "الرقم الوطني مفقود" },
  { key: "missing_sham", category: "missing", field: "sham_cash", label: "الشام كاش مفقود" },
  { key: "missing_personal", category: "missing", field: "personal_no", label: "الرقم الذاتي مفقود" },
  { key: "missing_mother", category: "missing", field: "mother_name", label: "اسم الأم مفقود" },
  { key: "missing_full", category: "missing", field: "full_name", label: "الاسم الثلاثي المربوط فارغ" },
  { key: "missing_first", category: "missing", field: "first_name", label: "الاسم المربوط فارغ" },
  { key: "missing_father", category: "missing", field: "father_name", label: "اسم الأب المربوط فارغ" },
  { key: "missing_last", category: "missing", field: "last_name", label: "النسبة المربوطة فارغة" },
  { key: "missing_job", category: "missing", field: "job_title", label: "المسمى الوظيفي المربوط فارغ" },
  { key: "similar_names", category: "similar", field: "full_name", label: "اسم ثلاثي واحد وأسماء أمهات مختلفة" },
  { key: "similar_national", category: "similar", field: "full_name", label: "اسم ثلاثي واحد وأرقام وطنية مختلفة" },
  { key: "duplicate_national", category: "conflicting", field: "national_id", label: "الرقم الوطني مكرر داخل الملف" },
  { key: "duplicate_sham", category: "conflicting", field: "sham_cash", label: "الشام كاش مكرر داخل الملف" },
  { key: "duplicate_personal", category: "conflicting", field: "personal_no", label: "الرقم الذاتي مكرر داخل الملف" },
  { key: "duplicate_contract", category: "conflicting", field: "contract_code", label: "رمز العقد الرئيسي مكرر داخل الملف" },
  { key: "national_people", category: "conflicting", field: "national_id", label: "الرقم الوطني مرتبط بأكثر من شخص" },
  { key: "sham_people", category: "conflicting", field: "sham_cash", label: "الشام كاش مرتبط بأكثر من شخص" },
  { key: "personal_people", category: "conflicting", field: "personal_no", label: "الرقم الذاتي مرتبط بأكثر من شخص" },
  { key: "person_national", category: "conflicting", field: "national_id", label: "الشخص مرتبط بأكثر من رقم وطني" },
  { key: "person_sham", category: "conflicting", field: "sham_cash", label: "الشخص مرتبط بأكثر من شام كاش" },
  { key: "person_contract", category: "conflicting", field: "contract_code", label: "الشخص مرتبط بأكثر من رمز عقد رئيسي" },
  { key: "person_personal", category: "conflicting", field: "personal_no", label: "الشخص مرتبط بأكثر من رقم ذاتي" },
  { key: "person_job", category: "conflicting", field: "job_title", label: "الشخص مرتبط بأكثر من مسمى وظيفي" },
  { key: "person_category", category: "conflicting", field: "functional_category", label: "الشخص مرتبط بأكثر من فئة وظيفية" },
  { key: "person_org_level", category: "conflicting", field: "organizational_level", label: "الشخص مرتبط بأكثر من سوية تنظيمية أساسية" },
  { key: "pair_national_personal", category: "conflicting", field: "personal_no", label: "الرقم الوطني مرتبط بأكثر من رقم ذاتي" },
  { key: "pair_national_sham", category: "conflicting", field: "sham_cash", label: "الرقم الوطني مرتبط بأكثر من شام كاش" },
  { key: "pair_national_contract", category: "conflicting", field: "contract_pair", label: "الرقم الوطني مرتبط بأكثر من رمز عقد" },
  { key: "pair_national_phone", category: "conflicting", field: "phone", label: "الرقم الوطني مرتبط بأكثر من رقم هاتف" },
  { key: "pair_personal_national", category: "conflicting", field: "national_id", label: "الرقم الذاتي مرتبط بأكثر من رقم وطني" },
  { key: "pair_personal_sham", category: "conflicting", field: "sham_cash", label: "الرقم الذاتي مرتبط بأكثر من شام كاش" },
  { key: "pair_personal_contract", category: "conflicting", field: "contract_pair", label: "الرقم الذاتي مرتبط بأكثر من رمز عقد" },
  { key: "pair_personal_phone", category: "conflicting", field: "phone", label: "الرقم الذاتي مرتبط بأكثر من رقم هاتف" },
  { key: "pair_sham_national", category: "conflicting", field: "national_id", label: "الشام كاش مرتبط بأكثر من رقم وطني" },
  { key: "pair_sham_personal", category: "conflicting", field: "personal_no", label: "الشام كاش مرتبط بأكثر من رقم ذاتي" },
  { key: "pair_sham_contract", category: "conflicting", field: "contract_pair", label: "الشام كاش مرتبط بأكثر من رمز عقد" },
  { key: "pair_sham_phone", category: "conflicting", field: "phone", label: "الشام كاش مرتبط بأكثر من رقم هاتف" },
  { key: "pair_contract_national", category: "conflicting", field: "national_id", label: "رمز العقد مرتبط بأكثر من رقم وطني" },
  { key: "pair_contract_personal", category: "conflicting", field: "personal_no", label: "رمز العقد مرتبط بأكثر من رقم ذاتي" },
  { key: "pair_contract_sham", category: "conflicting", field: "sham_cash", label: "رمز العقد مرتبط بأكثر من شام كاش" },
  { key: "pair_contract_phone", category: "conflicting", field: "phone", label: "رمز العقد مرتبط بأكثر من رقم هاتف" },
  { key: "pair_phone_national", category: "conflicting", field: "national_id", label: "رقم الهاتف مرتبط بأكثر من رقم وطني" },
  { key: "pair_phone_personal", category: "conflicting", field: "personal_no", label: "رقم الهاتف مرتبط بأكثر من رقم ذاتي" },
  { key: "pair_phone_sham", category: "conflicting", field: "sham_cash", label: "رقم الهاتف مرتبط بأكثر من شام كاش" },
  { key: "pair_phone_contract", category: "conflicting", field: "contract_pair", label: "رقم الهاتف مرتبط بأكثر من رمز عقد" },
  { key: "pair_person_contract", category: "conflicting", field: "contract_pair", label: "الشخص مرتبط بأكثر من رمز عقد (أساسي + ثانوي)" },
  { key: "pair_person_phone", category: "conflicting", field: "phone", label: "الشخص مرتبط بأكثر من رقم هاتف" },
];

export const CONFLICT_SORTABLE = [
  { key: "issueNumber", label: "رقم المشكلة" },
  { key: "fileName", label: "ملف المصدر" },
  { key: "fullName", label: "الاسم الثلاثي" },
  { key: "motherName", label: "اسم الأم" },
  { key: "nationalId", label: "الرقم الوطني" },
  { key: "shamCash", label: "الشام كاش" },
  { key: "personalNo", label: "الرقم الذاتي" },
  { key: "functionalCategory", label: "الفئة الوظيفية" },
] as const;
