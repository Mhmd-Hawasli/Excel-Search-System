import { ActivityAction, StandardField } from "../generated/prisma/client";
import { prisma } from "../lib/db/prisma";
import { digitsOnly, normalizeStored } from "../lib/normalization/arabic";
import { nationalIdColumns } from "../lib/format/national-id";
import { shamCashAsBigInt } from "../lib/format/sham-cash";


function searchableRecord(
  fileId: string,
  rowIndex: number,
  data: Record<string, string>,
  fields: {
    firstName?: string;
    fatherName?: string;
    lastName?: string;
    fullName?: string;
    nationalId?: string;
    motherName?: string;
    phone?: string;
    shamCash?: string;
    personalNo?: string;
    contractCode?: string;
    secondaryContractCode?: string;
  },
) {
  const fullName =
    fields.fullName ??
    [fields.firstName, fields.fatherName, fields.lastName].filter(Boolean).join(" ");
  return {
    fileId,
    rowIndex,
    data,
    sfFirstName: fields.firstName ?? null,
    sfFatherName: fields.fatherName ?? null,
    sfLastName: fields.lastName ?? null,
    sfFullName: fullName || null,
    ...nationalIdColumns(fields.nationalId),
    sfShamCash: shamCashAsBigInt(fields.shamCash),
    sfPersonalNo: fields.personalNo ?? null,
    sfMotherName: fields.motherName ?? null,
    sfPhone: fields.phone ?? null,
    sfContractCode: fields.contractCode ?? null,
    sfSecondaryContractCode: fields.secondaryContractCode ?? null,
    nFirstName: fields.firstName ? normalizeStored(fields.firstName) : null,
    nFatherName: fields.fatherName ? normalizeStored(fields.fatherName) : null,
    nLastName: fields.lastName ? normalizeStored(fields.lastName) : null,
    nFullName: fullName ? normalizeStored(fullName) : null,
    nMotherName: fields.motherName ? normalizeStored(fields.motherName) : null,
    nContractCode: fields.contractCode ? normalizeStored(fields.contractCode) : null,
    nSecondaryContractCode: fields.secondaryContractCode
      ? normalizeStored(fields.secondaryContractCode)
      : null,
    dPersonalNo: fields.personalNo ? digitsOnly(fields.personalNo) : null,
    dPhone: fields.phone ? digitsOnly(fields.phone) : null,
  };
}

async function main() {
  const [personal, employment] = await Promise.all([
    prisma.category.upsert({
      where: { name: "البيانات الذاتية" },
      update: { sortOrder: 0 },
      create: { name: "البيانات الذاتية", sortOrder: 0 },
    }),
    prisma.category.upsert({
      where: { name: "بيانات العمل" },
      update: { sortOrder: 1 },
      create: { name: "بيانات العمل", sortOrder: 1 },
    }),
  ]);
  const [contracts, ministry] = await Promise.all([
    prisma.group.upsert({
      where: { name: "ملفات العقود" },
      update: { description: "بيانات العقود التجريبية" },
      create: { name: "ملفات العقود", description: "بيانات العقود التجريبية", sortOrder: 0 },
    }),
    prisma.group.upsert({
      where: { name: "ملفات الوزارة" },
      update: { description: "كشوف الوزارة التجريبية" },
      create: { name: "ملفات الوزارة", description: "كشوف الوزارة التجريبية", sortOrder: 1 },
    }),
  ]);
  await prisma.file.deleteMany({ where: { name: { in: ["عقود تجريبية", "كشف وزارة تجريبي"] } } });
  const contractFile = await prisma.file.create({
    data: {
      groupId: contracts.id,
      name: "عقود تجريبية",
      description: "سجلات عربية لاختبار البحث والربط",
      originalFilename: "عقود-تجريبية.xlsx",
      sheetName: "العقود",
      rowCount: 2,
      columnSignature: "seed-contracts-v1",
      columns: {
        create: [
          {
            headerRaw: "الاسم",
            headerNormalized: normalizeStored("الاسم"),
            columnIndex: 1,
            sortOrder: 0,
            categoryId: personal.id,
            standardField: StandardField.FIRST_NAME,
          },
          {
            headerRaw: "اسم الأب",
            headerNormalized: normalizeStored("اسم الأب"),
            columnIndex: 2,
            sortOrder: 1,
            categoryId: personal.id,
            standardField: StandardField.FATHER_NAME,
          },
          {
            headerRaw: "النسبة",
            headerNormalized: normalizeStored("النسبة"),
            columnIndex: 3,
            sortOrder: 2,
            categoryId: personal.id,
            standardField: StandardField.LAST_NAME,
          },
          {
            headerRaw: "الرقم الوطني",
            headerNormalized: normalizeStored("الرقم الوطني"),
            columnIndex: 4,
            sortOrder: 3,
            categoryId: personal.id,
            standardField: StandardField.NATIONAL_ID,
          },
          {
            headerRaw: "رمز العقد الأساسي",
            headerNormalized: normalizeStored("رمز العقد الأساسي"),
            columnIndex: 5,
            sortOrder: 0,
            categoryId: employment.id,
            standardField: StandardField.CONTRACT_CODE,
          },
          {
            headerRaw: "رمز العقد الثانوي",
            headerNormalized: normalizeStored("رمز العقد الثانوي"),
            columnIndex: 6,
            sortOrder: 1,
            categoryId: employment.id,
            standardField: StandardField.SECONDARY_CONTRACT_CODE,
          },
          {
            headerRaw: "الشام كاش",
            headerNormalized: normalizeStored("الشام كاش"),
            columnIndex: 7,
            sortOrder: 2,
            categoryId: employment.id,
            standardField: StandardField.SHAM_CASH,
          },
        ],
      },
    },
  });
  const ministryFile = await prisma.file.create({
    data: {
      groupId: ministry.id,
      name: "كشف وزارة تجريبي",
      description: "كشف يكرر شخصًا من ملف العقود لإظهار الربط",
      originalFilename: "كشف-وزارة-تجريبي.xlsx",
      sheetName: "الموظفون",
      rowCount: 2,
      columnSignature: "seed-ministry-v1",
      columns: {
        create: [
          {
            headerRaw: "الاسم الثلاثي",
            headerNormalized: normalizeStored("الاسم الثلاثي"),
            columnIndex: 1,
            sortOrder: 4,
            categoryId: personal.id,
            standardField: StandardField.FULL_NAME,
          },
          {
            headerRaw: "الرقم الوطني",
            headerNormalized: normalizeStored("الرقم الوطني"),
            columnIndex: 2,
            sortOrder: 5,
            categoryId: personal.id,
            standardField: StandardField.NATIONAL_ID,
          },
          {
            headerRaw: "اسم الأم",
            headerNormalized: normalizeStored("اسم الأم"),
            columnIndex: 3,
            sortOrder: 6,
            categoryId: personal.id,
            standardField: StandardField.MOTHER_NAME,
          },
          {
            headerRaw: "رقم الهاتف",
            headerNormalized: normalizeStored("رقم الهاتف"),
            columnIndex: 4,
            sortOrder: 7,
            categoryId: personal.id,
            standardField: StandardField.PHONE,
          },
          {
            headerRaw: "الدرجة العلمية",
            headerNormalized: normalizeStored("الدرجة العلمية"),
            columnIndex: 5,
            sortOrder: 3,
            categoryId: employment.id,
          },
        ],
      },
    },
  });
  await prisma.record.createMany({
    data: [
      searchableRecord(
        contractFile.id,
        2,
        {
          الاسم: "أحمد",
          "اسم الأب": "علي",
          النسبة: "القاسم",
          "الرقم الوطني": "12345678901",
          "رمز العقد الأساسي": "A-104",
          "رمز العقد الثانوي": "ALT-104",
          "الشام كاش": "1234567890123456",
        },
        {
          firstName: "أحمد",
          fatherName: "علي",
          lastName: "القاسم",
          nationalId: "12345678901",
          contractCode: "A-104",
          secondaryContractCode: "ALT-104",
          shamCash: "1234567890123456",
        },
      ),
      searchableRecord(
        contractFile.id,
        3,
        {
          الاسم: "فاطمة",
          "اسم الأب": "عبد الله",
          النسبة: "مصطفى",
          "الرقم الوطني": "00012345678",
          "رمز العقد الأساسي": "B-220",
          "رمز العقد الثانوي": "ALT-220",
          "الشام كاش": "9876543210987654",
        },
        {
          firstName: "فاطمة",
          fatherName: "عبد الله",
          lastName: "مصطفى",
          nationalId: "00012345678",
          contractCode: "B-220",
          secondaryContractCode: "ALT-220",
          shamCash: "9876543210987654",
        },
      ),
      searchableRecord(
        ministryFile.id,
        2,
        {
          "الاسم الثلاثي": "احمد علي القاسم",
          "الرقم الوطني": "12345678901",
          "اسم الأم": "مريم",
          "رقم الهاتف": "0944555123",
          "الدرجة العلمية": "إجازة جامعية",
        },
        {
          fullName: "احمد علي القاسم",
          nationalId: "12345678901",
          motherName: "مريم",
          phone: "0944555123",
        },
      ),
      searchableRecord(
        ministryFile.id,
        3,
        {
          "الاسم الثلاثي": "يحيى عبد الرحمن",
          "الرقم الوطني": "98765432109",
          "اسم الأم": "فاطمة",
          "رقم الهاتف": "0933123456",
          "الدرجة العلمية": "دبلوم",
        },
        {
          fullName: "يحيى عبد الرحمن",
          nationalId: "98765432109",
          motherName: "فاطمة",
          phone: "0933123456",
        },
      ),
    ],
  });
  await prisma.activityLog.createMany({
    data: [
      {
        action: ActivityAction.FILE_UPLOADED,
        targetName: contractFile.name,
        details: { seed: true, rows: 2 },
      },
      {
        action: ActivityAction.FILE_UPLOADED,
        targetName: ministryFile.name,
        details: { seed: true, rows: 2 },
      },
    ],
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
