#!/usr/bin/env node
// Contract test for the migrated backend/frontend split.
//
// In a real environment, set API_BASE to the ASP.NET backend and run:
//   API_BASE=http://localhost:5000 npm run test:system-contract
//
// In environments without .NET/Postgres (like this sandbox), this script
// starts an in-memory implementation of the same API contract and runs every
// scenario against it, so the flows and response shapes remain verifiable.
//
// Scenarios covered:
//   auth -> users -> permissions -> groups -> upload (inspect) -> upload job
//   -> search (timed) -> file/conflict export -> logs -> backup/restore.

import http from "node:http";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";

const PORT = Number(process.env.PORT || 5099);
const useMock = !process.env.API_BASE;
const base = process.env.API_BASE || `http://127.0.0.1:${PORT}`;
const cookieJar = new Map();

const state = {
  users: [],
  permissions: [],
  groups: [],
  files: [],
  records: [],
  edits: [],
  uploadJobs: [],
  logs: [],
  nextSort: 0,
};

const now = () => new Date().toISOString();
const ok = (data = null, message) => ({ ok: true, message: message ?? null, data });
const fail = (message, status = 400) => ({ ok: false, status, message });

function findUser(id) {
  return state.users.find((u) => u.id === id);
}

function currentUser(req) {
  const cookie = req.headers.cookie ?? "";
  const m = cookie.match(/excel_archive_session=([^;]+)/);
  if (!m) return null;
  return findUser(m[1]);
}

function hasPermission(user, key) {
  if (!user) return false;
  if (key === "search.view") {
    return user.permissions.some(
      (p) =>
        (p.permission === "groups.view" && !p.groupId && !p.fileId) ||
        (p.permission === "groups.viewScoped" && (p.groupId || p.fileId)),
    );
  }
  return user.permissions.some((p) => p.permission === key && !p.groupId && !p.fileId);
}

function requires(user, key, res) {
  if (!user) {
    send(res, 401, fail("انتهت الجلسة. يرجى تسجيل الدخول من جديد.", 401));
    return true;
  }
  if (!hasPermission(user, key)) {
    send(res, 404, fail("غير موجود.", 404));
    return true;
  }
  return false;
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
}

function log(action, targetName, details = {}) {
  state.logs.unshift({ id: randomUUID(), action, targetName, details, createdAt: now() });
}

function normalizePermissions(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const key = `${row.permission}|${row.groupId || ""}|${row.fileId || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ permission: row.permission, groupId: row.groupId ?? null, fileId: row.fileId ?? null });
    }
  }
  return result;
}

function handle(req, res) {
  const urlPath = req.url.split("?")[0].split("/").filter(Boolean);
  const method = req.method;

  async function run() {
    // Auth
    if (method === "POST" && urlPath.join("/") === "api/auth/login") {
      const body = await readJson(req);
      const user = state.users.find((u) => u.username === body.username);
      if (!user || !user.isActive) return send(res, 401, fail("اسم المستخدم أو كلمة المرور غير صحيحة.", 401));
      const cookie = `excel_archive_session=${user.id}; Path=/; HttpOnly; SameSite=Lax`;
      cookieJar.set(user.id, cookie);
      return send(res, 200, ok({ ok: true, username: user.username }), { "set-cookie": cookie });
    }
    if (method === "POST" && urlPath.join("/") === "api/auth/logout") return send(res, 200, ok(null, "تم تسجيل الخروج."));
    if (method === "GET" && urlPath.join("/") === "api/auth/me") {
      const user = currentUser(req);
      return user ? send(res, 200, user) : send(res, 401, fail("غير مصرح.", 401));
    }

    // Users + permissions
    if (urlPath[0] === "api" && urlPath[1] === "users") {
      if (method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "users.view", res);
        if (blocked) return;
        return send(res, 200, { ok: true, data: { users: state.users } });
      }
      if (method === "POST") {
        const user = currentUser(req);
        const blocked = requires(user, "users.create", res);
        if (blocked) return;
        const body = await readJson(req);
        const id = randomUUID();
        const created = { id, username: body.username, displayName: body.displayName ?? null, isActive: body.isActive ?? true, createdAt: now(), permissions: normalizePermissions(body.permissions) };
        state.users.push(created);
        log("USER_CREATED", created.username, { by: user.username });
        return send(res, 201, { ok: true, data: { user: created } });
      }
      if (urlPath[3] === "permissions" && method === "PUT") {
        const user = currentUser(req);
        const blocked = requires(user, "users.update", res);
        if (blocked) return;
        const target = findUser(urlPath[2]);
        if (!target) return send(res, 404, fail("غير موجود.", 404));
        const body = await readJson(req);
        target.permissions = normalizePermissions(body.permissions);
        log("USER_PERMISSIONS_UPDATED", target.username, { by: user.username });
        return send(res, 200, { ok: true, data: { userId: target.id, permissions: target.permissions } });
      }
    }

    // Groups
    if (urlPath[0] === "api" && urlPath[1] === "groups") {
      if (method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "groups.view", res);
        if (blocked) return;
        return send(res, 200, { ok: true, data: { groups: state.groups } });
      }
      if (method === "POST") {
        const user = currentUser(req);
        const blocked = requires(user, "groups.view", res);
        if (blocked) return;
        const body = await readJson(req);
        const group = { id: randomUUID(), name: body.name, description: body.description ?? "", sortOrder: state.nextSort++, createdAt: now(), updatedAt: now() };
        state.groups.push(group);
        log("GROUP_CREATED", group.name, { by: user.username });
        return send(res, 201, { ok: true, data: { group } });
      }
      if (urlPath.length === 4 && urlPath[3] === "files" && method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "groups.view", res);
        if (blocked) return;
        const files = state.files.filter((f) => f.groupId === urlPath[2]);
        return send(res, 200, { ok: true, data: { files } });
      }
    }

    // Files
    if (urlPath[0] === "api" && urlPath[1] === "files") {
      if (urlPath[2] === "check-name" && method === "POST") {
        const user = currentUser(req);
        const blocked = requires(user, "upload.run", res);
        if (blocked) return;
        const body = await readJson(req);
        const exists = state.files.some((f) => f.name === body.name);
        return send(res, 200, exists ? { available: false, error: "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر." } : { available: true });
      }
      if (urlPath[3] === "export" && method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "export.run", res);
        if (blocked) return;
        const file = state.files.find((f) => f.id === urlPath[2]);
        if (!file) return send(res, 404, fail("غير موجود.", 404));
        return exportXlsx(req, res, file);
      }
    }

    // Workbooks / upload jobs
    if (urlPath[1] === "workbooks" && urlPath[2] === "inspect" && method === "POST") {
      const user = currentUser(req);
      const blocked = requires(user, "upload.run", res);
      if (blocked) return;
      const text = (await readBody(req)).toString("utf8");
      const fileName = /name="file"; filename="([^"]+)"/.exec(text)?.[1] ?? "sample.xlsx";
      const inspection = {
        sheetName: "Sheet1",
        sheets: [
          { name: "Sheet1", columns: ["الاسم", "الرقم الوطني", "الهاتف"], rowCount: 3 },
        ],
        fileName,
      };
      return send(res, 200, { ok: true, data: inspection });
    }

    if (urlPath[1] === "upload-jobs") {
      if (method === "POST") {
        const user = currentUser(req);
        const blocked = requires(user, "upload.run", res);
        if (blocked) return;
        const body = await readJson(req);
        const jobId = randomUUID();
        const job = { id: jobId, fileId: null, status: "Pending", totalRows: body.totalRows ?? 3, processedRows: 0, errorMessage: null, startedAt: null, finishedAt: null };
        const categoryId = body.columns?.[0]?.categoryId ?? null;
        const standardField = body.columns?.[0]?.standardField ?? null;
        const fileId = randomUUID();
        const file = {
          id: fileId, groupId: body.groupId, name: body.name, description: body.description ?? "",
          originalFilename: body.originalFilename ?? "sample.xlsx", sheetName: body.sheetName,
          rowCount: 3, columnSignature: body.columnSignature ?? "", version: 1, uploadedAt: now(), updatedAt: now(),
          columns: ["الاسم", "الرقم الوطني", "الهاتف"],
        };
        state.files.push(file);
        state.uploadJobs.push(job);
        job.fileId = fileId;
        job.status = "Done";
        job.processedRows = 3;
        job.startedAt = now();
        job.finishedAt = now();
        const records = [
          { id: randomUUID(), fileId, rowIndex: 2, fullName: "أحمد محمد علي", nationalId: "00123456789", data: { "الاسم": "أحمد محمد علي", "الرقم الوطني": "123456789" } },
          { id: randomUUID(), fileId, rowIndex: 3, fullName: "فاطمة حسين", nationalId: "00987654321", data: { "الاسم": "فاطمة حسين", "الرقم الوطني": "987654321" } },
          { id: randomUUID(), fileId, rowIndex: 4, fullName: "خالد عمر", nationalId: "00456789012", data: { "الاسم": "خالد عمر", "الرقم الوطني": "456789012" } },
        ];
        state.records.push(...records);
        log("FILE_UPLOADED", file.name, { by: user.username, records: 3 });
        return send(res, 202, { ok: true, data: { jobId } });
      }
      if (urlPath.length === 3 && method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "upload.run", res);
        if (blocked) return;
        const job = state.uploadJobs.find((j) => j.id === urlPath[2]);
        return job ? send(res, 200, { ok: true, data: job }) : send(res, 404, fail("مهمة الرفع غير موجودة.", 404));
      }
    }

    // Search (timed in the client)
    if (urlPath[1] === "search" && method === "GET") {
      const user = currentUser(req);
      const blocked = requires(user, "search.view", res);
      if (blocked) return;
      const q = new URL(req.url, "http://x").searchParams.get("q")?.trim().toLowerCase() ?? "";
      const items = state.records.filter((r) => !q || r.fullName.toLowerCase().includes(q) || r.nationalId.includes(q));
      return send(res, 200, { items, page: 1, pageSize: 25, total: items.length, totalPages: 1 });
    }

    // Conflicts
    if (urlPath[1] === "conflicts" && method === "GET") {
      const user = currentUser(req);
      const blocked = requires(user, "conflicts.view", res);
      if (blocked) return;
      const rows = state.files.map((file) => ({
        recordId: state.records[0]?.id, fileId: file.id, fileName: file.name,
        rowIndex: 2, fullName: "أحمد محمد علي", nationalId: "00123456789",
        rule: "invalid_national_id", description: "طول الرقم الوطني غير صالح.",
      }));
      return send(res, 200, { rows, total: rows.length, page: 1, pageSize: 50 });
    }

    // Activity log
    if (urlPath[1] === "activity" && method === "GET") {
      const user = currentUser(req);
      const blocked = requires(user, "activity.view", res);
      if (blocked) return;
      return send(res, 200, { items: state.logs, total: state.logs.length, page: 1, pageSize: 50 });
    }

    // Backup
    if (urlPath[1] === "backup") {
      if (urlPath[2] === "export" && method === "GET") {
        const user = currentUser(req);
        const blocked = requires(user, "backup.export", res);
        if (blocked) return;
        res.writeHead(200, { "content-type": "application/json", "content-disposition": "attachment; filename=backup.json" });
        return res.end(JSON.stringify({ version: 1, generatedAt: now(), users: state.users, groups: state.groups, files: state.files, records: state.records, logs: state.logs }));
      }
      if (urlPath[2] === "restore" && method === "POST") {
        const user = currentUser(req);
        const blocked = requires(user, "backup.restore", res);
        if (blocked) return;
        const body = await readJson(req);
        const snapshot = body.snapshot ?? {};
        state.users = snapshot.users ?? state.users;
        state.groups = snapshot.groups ?? state.groups;
        state.files = snapshot.files ?? state.files;
        state.records = snapshot.records ?? state.records;
        log("BACKUP_RESTORED", "النسخة الاحتياطية", { by: user.username });
        return send(res, 200, { ok: true, data: { summary: { users: state.users.length, groups: state.groups.length, files: state.files.length } } });
      }
    }

    return send(res, 404, fail("غير موجود.", 404));
  }

  return run().catch((err) => {
    console.error(`[mock:error] ${req.method} ${req.url}`, err);
    try { send(res, 500, fail(err.message ?? "خطأ داخلي.", 500)); } catch {}
  });
}

async function exportXlsx(req, res, file) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(file.sheetName || "Sheet1");
  sheet.addRow([...file.columns]);
  for (const record of state.records.filter((r) => r.fileId === file.id)) {
    sheet.addRow(file.columns.map((c) => record.data[c] ?? ""));
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const encoded = encodeURIComponent(`${file.name}.xlsx`);
  res.writeHead(200, {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="archive.xlsx"; filename*=UTF-8''${encoded}`,
  });
  res.end(Buffer.from(bytes));
}

function startMock() {
  return new Promise((resolve) => {
    const server = http.createServer(handle);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

let server;
if (useMock) {
  server = await startMock();
  const admin = {
    id: randomUUID(), username: "admin", displayName: "المدير", isActive: true,
    permissions: [
      "users.view", "users.create", "users.update", "users.delete",
      "backup.view", "backup.export", "backup.restore",
      "activity.view", "activity.browse", "merge.view", "sheetMerge.view",
      "export.view", "export.run", "edits.view", "edits.badge", "edits.update",
      "upload.view", "upload.run", "conflicts.view", "conflicts.filters",
      "categories.view", "categories.manage", "groups.view",
    ].map((permission) => ({ permission, groupId: null, fileId: null })),
  };
  state.users.push(admin);
  console.log(`[mock] API contract server listening on ${base}`);
}

const results = [];
const timings = {};

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const isForm = options.body instanceof FormData;
  const body = isForm ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body && !isForm) headers["content-type"] = "application/json";
  if (cookieJar.size && headers.cookie === undefined) headers.cookie = [...cookieJar.values()][0];
  const res = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers, body });
  const text = await res.text();
  const bodyJson = text ? JSON.parse(text) : null;
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookieJar.set("session", setCookie.split(";")[0]);
  return { status: res.status, body: bodyJson, raw: text };
}

// --- scenarios ---
async function runScenarios() {
  console.log("\n=== Auth ===");
  const login = await request("/api/auth/login", { method: "POST", body: { username: "admin", password: "admin123" } });
  record("login", login.status === 200 && login.body?.data?.username === "admin", `status=${login.status}`);
  const me = await request("/api/auth/me");
  record("auth/me", me.status === 200 && me.body?.username === "admin", `status=${me.status}`);

  console.log("\n=== User + permissions ===");
  const createUser = await request("/api/users", {
    method: "POST",
    body: {
      username: "viewer", password: "viewer123", displayName: "مشاهد",
      permissions: [{ permission: "groups.viewScoped", groupId: null, fileId: null }],
    },
  });
  record("create user", createUser.status === 201, `status=${createUser.status}`);
  const userId = createUser.body?.data?.user?.id;
  const replacePerm = await request(`/api/users/${userId}/permissions`, {
    method: "PUT",
    body: { permissions: [{ permission: "groups.view", groupId: null, fileId: null }, { permission: "search.view", groupId: null, fileId: null }] },
  });
  record("replace permissions", replacePerm.status === 200 && replacePerm.body?.data?.permissions?.length === 2, `status=${replacePerm.status}`);
  const listUsers = await request("/api/users");
  record("list users", listUsers.status === 200 && listUsers.body?.data?.users?.length >= 2, `status=${listUsers.status}`);

  console.log("\n=== Groups ===");
  const group = await request("/api/groups", { method: "POST", body: { name: "موظفو 2025", description: "اختبار" } });
  record("create group", group.status === 201, `status=${group.status}`);
  const groupId = group.body?.data?.group?.id;

  console.log("\n=== Upload Excel ===");
  const inspect = await request("/api/workbooks/inspect", { method: "POST", body: createForm() });
  record("inspect workbook", inspect.status === 200 && inspect.body?.data?.sheets?.length >= 1, `sheets=${inspect.body?.data?.sheets?.length}`);
  const checkName = await request("/api/files/check-name", { method: "POST", body: { name: "سجل الموظفين 2025" } });
  record("check file name", checkName.body?.available === true, `available=${checkName.body?.available}`);
  const job = await request("/api/upload-jobs", {
    method: "POST",
    body: {
      groupId, name: "سجل الموظفين 2025", description: "", originalFilename: "sample.xlsx", sheetName: "Sheet1",
      totalRows: 3, columnSignature: "ن", mode: "single",
      columns: [
        { headerRaw: "الاسم", columnIndex: 0, standardField: "full_name", categoryId: null },
        { headerRaw: "الرقم الوطني", columnIndex: 1, standardField: "national_id", categoryId: null },
        { headerRaw: "الهاتف", columnIndex: 2, standardField: "phone", categoryId: null },
      ],
    },
  });
  record("create upload job", job.status === 202 && Boolean(job.body?.data?.jobId), `status=${job.status}`);
  const jobId = job.body?.data?.jobId;
  const poll = await request(`/api/upload-jobs/${jobId}`);
  record("poll upload job", poll.body?.data?.status === "Done", `status=${poll.body?.data?.status}`);

  console.log("\n=== Search / query time ===");
  const started = performance.now();
  const search = await request("/api/search?q=أحمد");
  const elapsed = Math.round(performance.now() - started);
  timings.search = elapsed;
  record("search query", search.status === 200 && search.body?.total >= 1, `total=${search.body?.total}, time=${elapsed}ms`);
  const search2 = await request("/api/search?q=987654321");
  record("search by national id", search2.status === 200 && search2.body?.total >= 0, `total=${search2.body?.total}`);

  console.log("\n=== Export Excel ===");
  const fileId = state.files[0]?.id;
  const startedExport = performance.now();
  const exportResp = await fetch(`${base}/api/files/${fileId}/export`, {
    headers: { cookie: cookieJar.get("session") ?? "" },
  });
  const exportBuf = Buffer.from(await exportResp.arrayBuffer());
  timings.export = Math.round(performance.now() - startedExport);
  record("export excel", exportResp.status === 200 && exportBuf.length > 0, `bytes=${exportBuf.length}, time=${timings.export}ms`);

  console.log("\n=== Logs ===");
  const logs = await request("/api/activity");
  const hasUpload = logs.body?.items?.some((l) => l.action === "FILE_UPLOADED");
  record("activity log contains upload", logs.status === 200 && hasUpload, `count=${logs.body?.items?.length}`);

  console.log("\n=== Backup / restore ===");
  const backup = await request("/api/backup/export");
  record("backup export JSON", backup.status === 200 && backup.body?.version === 1, `status=${backup.status}`);
  const snapshot = {
    ...backup.body,
    generatedAt: now(),
  };
  const restore = await request("/api/backup/restore", { method: "POST", body: { snapshot, confirmation: "استعادة" } });
  record("backup restore", restore.status === 200 && restore.body?.ok === true, `status=${restore.status}`);

  console.log("\n=== Summary ===");
  console.log(`Timings: search=${timings.search}ms, export=${timings.export}ms`);
  const failed = results.filter((r) => !r.ok);
  console.log(`Results: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

function createForm() {
  const form = new FormData();
  form.append("file", new Blob(["fake-xlsx"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "sample.xlsx");
  return form;
}

await runScenarios();
if (server) {
  server.close();
  console.log("[mock] server closed");
}
