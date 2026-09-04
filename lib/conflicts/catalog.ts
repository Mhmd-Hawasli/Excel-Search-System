export const CONFLICT_CATEGORIES = [
  { key: "invalid", label: "بيانات خاطئة", description: "قيم غير صالحة أو لا تطابق تركيبها" },
  { key: "missing", label: "بيانات ناقصة", description: "حقول أساسية أو أعمدة مرتبطة فارغة" },
  { key: "similar", label: "تشابه الأسماء", description: "الاسم الثلاثي نفسه مع اختلاف اسم الأم" },
  {
    key: "conflicting",
    label: "تضارب البيانات",
    description: "تكرار المعرّفات واختلاف بيانات الشخص",
  },
] as const;

export type ConflictCategory = (typeof CONFLICT_CATEGORIES)[number]["key"];
export const CONFLICT_FIELDS = {
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
} as const;
export type ConflictField = keyof typeof CONFLICT_FIELDS;

export const CONFLICT_RULES = [
  {
    key: "national_short",
    category: "invalid",
    field: "national_id",
    label: "رقم وطني من 8 أرقام أو أقل",
  },
  {
    key: "national_long",
    category: "invalid",
    field: "national_id",
    label: "رقم وطني من 12 خانة أو أكثر",
  },
  {
    key: "national_characters",
    category: "invalid",
    field: "national_id",
    label: "محارف داخل الرقم الوطني",
  },
  { key: "sham_short", category: "invalid", field: "sham_cash", label: "الشام كاش أقل من 16 خانة" },
  { key: "sham_long", category: "invalid", field: "sham_cash", label: "الشام كاش أكثر من 16 خانة" },
  {
    key: "sham_characters",
    category: "invalid",
    field: "sham_cash",
    label: "محارف داخل الشام كاش",
  },
  {
    key: "name_mismatch",
    category: "invalid",
    field: "full_name",
    label: "الاسم الثلاثي لا يطابق تركيب الاسم",
  },
  { key: "date_invalid", category: "invalid", field: "date", label: "تاريخ تعذر تحويله" },
  { key: "date_early", category: "invalid", field: "date", label: "تاريخ قبل عام 1940" },
  { key: "date_future", category: "invalid", field: "date", label: "تاريخ بعد اليوم" },
  {
    key: "missing_national",
    category: "missing",
    field: "national_id",
    label: "الرقم الوطني مفقود",
  },
  { key: "missing_sham", category: "missing", field: "sham_cash", label: "الشام كاش مفقود" },
  {
    key: "missing_personal",
    category: "missing",
    field: "personal_no",
    label: "الرقم الذاتي مفقود",
  },
  { key: "missing_mother", category: "missing", field: "mother_name", label: "اسم الأم مفقود" },
  {
    key: "missing_full",
    category: "missing",
    field: "full_name",
    label: "الاسم الثلاثي المربوط فارغ",
  },
  { key: "missing_first", category: "missing", field: "first_name", label: "الاسم المربوط فارغ" },
  {
    key: "missing_father",
    category: "missing",
    field: "father_name",
    label: "اسم الأب المربوط فارغ",
  },
  { key: "missing_last", category: "missing", field: "last_name", label: "النسبة المربوطة فارغة" },
  {
    key: "similar_names",
    category: "similar",
    field: "full_name",
    label: "اسم ثلاثي واحد وأسماء أمهات مختلفة",
  },
  {
    key: "duplicate_national",
    category: "conflicting",
    field: "national_id",
    label: "الرقم الوطني مكرر داخل الملف",
  },
  {
    key: "duplicate_sham",
    category: "conflicting",
    field: "sham_cash",
    label: "الشام كاش مكرر داخل الملف",
  },
  {
    key: "duplicate_personal",
    category: "conflicting",
    field: "personal_no",
    label: "الرقم الذاتي مكرر داخل الملف",
  },
  {
    key: "duplicate_contract",
    category: "conflicting",
    field: "contract_code",
    label: "رمز العقد الرئيسي مكرر داخل الملف",
  },
  {
    key: "national_people",
    category: "conflicting",
    field: "national_id",
    label: "الرقم الوطني مرتبط بأكثر من شخص",
  },
  {
    key: "sham_people",
    category: "conflicting",
    field: "sham_cash",
    label: "الشام كاش مرتبط بأكثر من شخص",
  },
  {
    key: "personal_people",
    category: "conflicting",
    field: "personal_no",
    label: "الرقم الذاتي مرتبط بأكثر من شخص",
  },
  {
    key: "person_national",
    category: "conflicting",
    field: "national_id",
    label: "الشخص مرتبط بأكثر من رقم وطني",
  },
  {
    key: "person_sham",
    category: "conflicting",
    field: "sham_cash",
    label: "الشخص مرتبط بأكثر من شام كاش",
  },
  {
    key: "person_contract",
    category: "conflicting",
    field: "contract_code",
    label: "الشخص مرتبط بأكثر من رمز عقد رئيسي",
  },
  {
    key: "person_personal",
    category: "conflicting",
    field: "personal_no",
    label: "الشخص مرتبط بأكثر من رقم ذاتي",
  },
  {
    key: "person_job",
    category: "conflicting",
    field: "job_title",
    label: "الشخص مرتبط بأكثر من مسمى وظيفي",
  },
] as const satisfies readonly {
  key: string;
  category: ConflictCategory;
  field: ConflictField;
  label: string;
}[];

export type ConflictRuleKey = (typeof CONFLICT_RULES)[number]["key"];
export type ConflictIssue = { rule: ConflictRuleKey; label: string; explanation: string };
export type ConflictRow = {
  id: string;
  fileId: string;
  groupId: string;
  fileName: string;
  originalFilename: string;
  rowIndex: number;
  fullName: string;
  motherName: string;
  nationalId: string;
  shamCash: string;
  personalNo: string;
  issueNumber: number;
  groupKey: string | null;
  issues: ConflictIssue[];
};
export const CONFLICT_SORTABLE = [
  "issueNumber",
  "fileName",
  "fullName",
  "motherName",
  "nationalId",
  "shamCash",
  "personalNo",
] as const;
export type ConflictSortBy = (typeof CONFLICT_SORTABLE)[number];
export type ConflictSortDir = "asc" | "desc";

export type ConflictResponse = {
  rows: ConflictRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
