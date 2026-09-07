import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { revertRecordEdit, saveRecordEdit } from "@/lib/edits/service";

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const group = await prisma.group.create({
    data: { name: `verify-revert-${suffix}`, description: "temporary revert check" },
  });
  let recordId = "";
  try {
    const file = await prisma.file.create({
      data: {
        groupId: group.id,
        name: `verify-revert-${suffix}.xlsx`,
        originalFilename: "verify-revert.xlsx",
        sheetName: "Sheet1",
        columnSignature: "الأم",
        columns: {
          create: [
            {
              headerRaw: "الأم",
              headerNormalized: "الام",
              columnIndex: 1,
              standardField: "MOTHER_NAME",
            },
          ],
        },
      },
    });
    const record = await prisma.record.create({
      data: { fileId: file.id, rowIndex: 1, data: { الأم: "مريم" } },
    });
    recordId = record.id;

    const first = await saveRecordEdit({ recordId, headerRaw: "الأم", newValue: "سارة" });
    assert.equal(first.changed, true);
    assert.equal(first.oldValue, "مريم");
    assert.equal(first.newValue, "سارة");
    assert.deepEqual((await prisma.record.findUniqueOrThrow({ where: { id: recordId } })).data, {
      الأم: "سارة",
    });

    const undo = await revertRecordEdit({ recordId, headerRaw: "الأم" });
    assert.equal(undo.changed, true);
    assert.equal(undo.newValue, "مريم");
    const afterUndo = await prisma.record.findUniqueOrThrow({ where: { id: recordId } });
    assert.deepEqual(afterUndo.data, { الأم: "مريم" });
    assert.equal(afterUndo.sfMotherName, "مريم");
    const reverts = await prisma.activityLog.findMany({
      where: { action: "RECORD_EDITED", details: { path: ["recordId"], equals: recordId } },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(reverts.length, 2);
    assert.equal((reverts[0].details as { reverted?: boolean }).reverted, true);

    // Undoing the undo restores the edited value (single-level history).
    const redo = await revertRecordEdit({ recordId, headerRaw: "الأم" });
    assert.equal(redo.newValue, "سارة");

    await assert.rejects(
      revertRecordEdit({ recordId, headerRaw: "عمود وهمي" }),
      /العمود غير موجود/,
    );
    const other = await prisma.fileColumn.create({
      data: {
        fileId: file.id,
        headerRaw: "ملاحظة",
        headerNormalized: "ملاحظه",
        columnIndex: 2,
      },
    });
    await assert.rejects(
      revertRecordEdit({ recordId, fileColumnId: other.id }),
      /لا يوجد تعديل للتراجع عنه/,
    );
    console.log("PASS: revert restores the pre-edit value, chains history and flags the activity.");
  } finally {
    if (recordId) {
      await prisma.activityLog.deleteMany({
        where: { details: { path: ["recordId"], equals: recordId } },
      });
    }
    await prisma.group.delete({ where: { id: group.id } }).catch(() => undefined);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
