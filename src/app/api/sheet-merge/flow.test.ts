import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { POST as upload } from "@/app/api/sheet-merge/upload/route";
import { POST as run } from "@/app/api/sheet-merge/run/route";
import { POST as exportRoute } from "@/app/api/sheet-merge/export/route";
import { GET as download } from "@/app/api/sheet-merge/download/route";
import type { SheetMergeResult, UploadInspection } from "@/lib/sheet-merge/types";

/**
 * End-to-end check of the section's own API: upload → run → export →
 * download, through the real route handlers and their NDJSON progress
 * streams. Nothing here touches the archive database or the disk.
 */

type Message = {
  type?: "progress" | "ready" | "result" | "error";
  percent?: number;
  detail?: string | null;
  payload?: unknown;
  error?: string;
};

/** Reads every NDJSON message of a streamed response. */
async function readMessages(response: Response): Promise<Message[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const messages: Message[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) messages.push(JSON.parse(line) as Message);
      newline = buffer.indexOf("\n");
    }
  }
  return messages;
}

function payloadOf<T>(messages: Message[]): T {
  const message = messages.find((entry) => entry.payload);
  if (!message) throw new Error(`no payload in stream: ${JSON.stringify(messages)}`);
  return message.payload as T;
}

async function workbookFile(name = "الموظفون.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet("الأساسية");
  main.addRows([
    ["الاسم", "الرقم الوطني", "المدينة"],
    ["أحمد", "123456789", "دمشق"],
    ["ليلى", "٩٨٧٦٥٤٣٢١", "حلب"],
    ["سامي", "123", "حمص"],
  ]);
  // A filtered sheet: the auto-filter hides row 4 until the filter is removed.
  main.autoFilter = "A1:C1";
  main.getRow(4).hidden = true;

  workbook.addWorksheet("الرواتب").addRows([
    ["الرقم الوطني", "الراتب"],
    ["123456789", "5000"],
    ["123456789", "6000"],
    ["111222333", "7000"],
  ]);
  workbook.addWorksheet("العناوين").addRows([
    ["الرقم الوطني", "العنوان"],
    ["987654321", "شارع النيل"],
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer as unknown as ArrayBuffer)], name);
}

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sheet-merge API flow", () => {
  it("uploads, merges, exports and downloads without touching the archive", async () => {
    const form = new FormData();
    form.set("file", await workbookFile());
    const uploadResponse = await upload(
      new Request("http://localhost:3000/api/sheet-merge/upload", { method: "POST", body: form }),
    );
    expect(uploadResponse.headers.get("content-type")).toContain("ndjson");
    const uploadMessages = await readMessages(uploadResponse);
    expect(uploadMessages.filter((message) => message.type === "progress").length).toBeGreaterThan(
      3,
    );
    const inspection = payloadOf<UploadInspection>(uploadMessages);
    expect(inspection.sheetCount).toBe(3);
    expect(inspection.suggestion.index).toBe(1);
    expect(inspection.sheets[0].filtersRemoved).toBe(true);
    // The filtered-out row is readable again.
    expect(inspection.main.rowCount).toBe(3);

    const runMessages = await readMessages(
      await run(
        postJson("http://localhost:3000/api/sheet-merge/run", {
          uploadId: inspection.uploadId,
          nationalIdColumn: 1,
          sheetNames: ["العناوين", "الرواتب"],
        }),
      ),
    );
    expect(runMessages.some((message) => message.detail?.includes("الرواتب"))).toBe(true);
    const result = payloadOf<SheetMergeResult>(runMessages);
    expect(result.exportHeaders).toEqual(["الاسم", "الرقم الوطني", "المدينة", "الراتب", "العنوان"]);
    expect(result.exportRowCount).toBe(3);
    const [main, salaries, addresses] = result.sheets;
    expect([main.rowCount, main.linkedCount, main.percent]).toEqual([3, 2, 66.7]);
    expect(main.unlinked[0].reason).toContain("7 محارف");
    expect([salaries.rowCount, salaries.linkedCount, salaries.duplicateCount]).toEqual([3, 1, 1]);
    expect(salaries.unlinked.map((row) => row.rowNumber)).toEqual([3, 4]);
    expect(addresses.percent).toBe(100);
    expect(result.linkPercent).toBe(50);

    const ready = payloadOf<{ downloadId: string; filename: string; sheetCount: number }>(
      await readMessages(
        await exportRoute(
          postJson("http://localhost:3000/api/sheet-merge/export", {
            sessionId: result.sessionId,
          }),
        ),
      ),
    );
    expect(ready.filename).toMatch(/^دمج-الصفحات-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(ready.sheetCount).toBe(3);

    const fileResponse = await download(
      new Request(`http://localhost:3000/api/sheet-merge/download?id=${ready.downloadId}`),
    );
    expect(fileResponse.status).toBe(200);
    const bytes = await fileResponse.arrayBuffer();
    expect(fileResponse.headers.get("content-length")).toBe(String(bytes.byteLength));
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.load(bytes);
    expect(exported.worksheets.map((sheet) => sheet.name)).toEqual([
      "الدمج",
      "غير مرتبط - الأساسية",
      "غير مرتبط - الرواتب",
    ]);
    const merged = exported.getWorksheet("الدمج")!;
    expect(merged.getCell("A2").value).toBe("أحمد");
    expect(merged.getCell("D2").value).toBe("5000");
    expect(merged.getCell("E3").value).toBe("شارع النيل");
  });

  it("rejects a workbook with a single sheet and a wrong extension", async () => {
    const single = new ExcelJS.Workbook();
    single.addWorksheet("وحيدة").addRows([["الرقم الوطني"], ["123456789"]]);
    const form = new FormData();
    form.set(
      "file",
      new File(
        [new Uint8Array((await single.xlsx.writeBuffer()) as unknown as ArrayBuffer)],
        "صفحة.xlsx",
      ),
    );
    const messages = await readMessages(
      await upload(
        new Request("http://localhost:3000/api/sheet-merge/upload", { method: "POST", body: form }),
      ),
    );
    expect(messages.some((message) => message.error?.includes("أكثر من صفحة واحدة"))).toBe(true);

    const wrongType = new FormData();
    wrongType.set("file", new File(["x"], "ملف.csv"));
    const rejected = await upload(
      new Request("http://localhost:3000/api/sheet-merge/upload", {
        method: "POST",
        body: wrongType,
      }),
    );
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { error: string }).error).toContain("XLSX");
  });

  it("rejects an unknown session and an unknown download", async () => {
    const messages = await readMessages(
      await exportRoute(
        postJson("http://localhost:3000/api/sheet-merge/export", {
          sessionId: "00000000-0000-4000-8000-000000000000",
        }),
      ),
    );
    expect(messages.some((message) => message.error?.includes("انتهت جلسة الدمج"))).toBe(true);

    const missing = await download(
      new Request(
        "http://localhost:3000/api/sheet-merge/download?id=00000000-0000-4000-8000-000000000000",
      ),
    );
    expect(missing.status).toBe(404);
  });
});
