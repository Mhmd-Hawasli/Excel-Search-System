import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const outputDirectory = path.resolve("test-artifacts");
const outputPath = path.join(outputDirectory, "production-e2e-arabic.xlsx");

await fs.mkdir(outputDirectory, { recursive: true });

const workbook = new ExcelJS.Workbook();
workbook.creator = "Excel Archive E2E";
workbook.created = new Date("2026-09-01T00:00:00Z");

const records = workbook.addWorksheet("الموظفون", { views: [{ rightToLeft: true }] });
records.columns = [
  { header: "الاسم", key: "firstName", width: 18 },
  { header: "اسم الأب", key: "fatherName", width: 18 },
  { header: "النسبة", key: "lastName", width: 18 },
  { header: "الرقم الوطني", key: "nationalId", width: 18 },
  { header: "رقم الهاتف", key: "phone", width: 18 },
  { header: "رمز العقد الأساسي", key: "contractCode", width: 18 },
  { header: "رمز العقد الثانوي", key: "secondaryContractCode", width: 18 },
  { header: "الشام كاش", key: "shamCash", width: 20 },
  { header: "ملاحظات", key: "notes", width: 28 },
];

records.addRows([
  {
    firstName: "سُهى",
    fatherName: "عبد الله",
    lastName: "النجار",
    nationalId: "00123456789",
    phone: "٠٩٤٤٥٥٦٦٧٧",
    contractCode: "E2E-2026-A",
    secondaryContractCode: "E2E-ALT-A",
    shamCash: "1234567890123456",
    notes: "اختبار بحث عربي",
  },
  {
    firstName: "لؤي",
    fatherName: "محمود",
    lastName: "الخطيب",
    nationalId: "98765432100",
    phone: "0933555777",
    contractCode: "E2E-2026-B",
    secondaryContractCode: "E2E-ALT-B",
    shamCash: "2345678901234567",
    notes: "سجل ثانٍ",
  },
  {
    firstName: "رنا",
    fatherName: "أحمد",
    lastName: "الحموي",
    nationalId: "12345098765",
    phone: "0944000111",
    contractCode: "E2E-2026-C",
    secondaryContractCode: "E2E-ALT-C",
    shamCash: "3456789012345678",
    notes: "سجل مكتمل",
  },
  {
    firstName: "نور",
    fatherName: "علي",
    lastName: "القدسي",
    nationalId: "12345",
    phone: "123",
    contractCode: "E2E-INVALID",
    secondaryContractCode: "E2E-ALT-INVALID",
    shamCash: "001",
    notes: "قيم جودة مقصودة",
  },
  {
    firstName: "سهى",
    fatherName: "عبدالله",
    lastName: "النجار",
    nationalId: "00123456789",
    phone: "0944556678",
    contractCode: "E2E-2026-DUP",
    secondaryContractCode: "E2E-ALT-DUP",
    shamCash: "4567890123456789",
    notes: "تكرار مقصود للرقم الوطني",
  },
  {
    firstName: "ميس",
    fatherName: "سليم",
    lastName: "الحسن",
    nationalId: "",
    phone: "0955000111",
    contractCode: "E2E-MISSING-ID",
    secondaryContractCode: "E2E-ALT-MISSING-ID",
    shamCash: "5678901234567890",
    notes: "رقم وطني مفقود مقصود",
  },
]);

records.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
records.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF175C4B" } };
records.autoFilter = { from: "A1", to: "I7" };
records.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];

const instructions = workbook.addWorksheet("تعليمات", { views: [{ rightToLeft: true }] });
instructions.addRow(["هذه الورقة موجودة لاختبار اختيار الورقة الصحيحة. استورد ورقة الموظفون."]);
instructions.getColumn(1).width = 72;

await workbook.xlsx.writeFile(outputPath);
console.log(outputPath);
