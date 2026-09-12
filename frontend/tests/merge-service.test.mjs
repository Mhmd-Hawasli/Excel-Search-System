import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Exercise the real service and stream reader without a browser or live credentials.
function loadService(globals = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule.exports);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "module", "exports", ...Object.keys(globals), source)(
      (id) => load(path.resolve(path.dirname(filename), `${id}.ts`)),
      loadedModule, loadedModule.exports, ...Object.values(globals),
    );
    return loadedModule.exports;
  }
  return load(path.resolve(import.meta.dirname, "../src/services/misc.service.ts")).mergeService;
}

test("inspection unwraps the V2 envelope and reports upload before inspection finishes", async () => {

  class XHR {
    static instances = [];
    upload = {};
    constructor() { XHR.instances.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    send(form) { this.form = form; }
  }
  const service = loadService({ XMLHttpRequest: XHR });
  const progress = [];
  const pending = service.inspect(new File(["fixture"], "test.xlsx"), (p) => progress.push(p));
  const xhr = XHR.instances[0];
  assert.equal(xhr.method, "POST");
  assert.equal(xhr.url, "/api/merge/inspect");
  assert.equal(xhr.withCredentials, true);
  assert.equal(xhr.form.get("file").name, "test.xlsx");
  xhr.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
  xhr.upload.onload();
  assert.deepEqual(progress, [50, 100]);
  const inspection = { token: "fixture", selected: { sheetName: "الأولى", rowCount: 2 } };
  xhr.status = 200;
  xhr.responseText = JSON.stringify({ success: true, data: inspection });
  xhr.onload();
  assert.deepEqual(await pending, inspection);
});

test("sheet changes use the V2 sheet parameter and return the new row count and suggestions", async () => {
  const selected = { sheetName: "الثانية", rowCount: 7, headers: ["الرقم الوطني"], suggestedMapping: { nationalId: 0 } };
  const service = loadService({ fetch: async (url, init) => {
    assert.equal(url, "/api/merge/sheet");
    assert.deepEqual(JSON.parse(init.body), { token: "fixture", sheet: "الثانية" });
    assert.equal(init.credentials, "include");
    return Response.json({ success: true, data: selected });
  } });
  assert.deepEqual(await service.sheet("fixture", "الثانية"), selected);
});

test("merge consumes split Arabic NDJSON and a final result without a trailing newline", async () => {
  const result = { sessionId: "fixture", rules: [], status: { state: "complete", percent: 100 } };
  const bytes = new TextEncoder().encode(JSON.stringify({ type: "progress", percent: 25, detail: "جارٍ الربط" }) + "\n" + JSON.stringify({ type: "result", payload: result }));
  const service = loadService({ fetch: async () => new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  }), { headers: { "content-type": "application/x-ndjson" } }) });
  const progress = [];
  assert.deepEqual(await service.run({}, (p, detail) => progress.push([p, detail])), result);
  assert.deepEqual(progress, [[25, "جارٍ الربط"], [100, null]]);
});

test("merge surfaces validation failures instead of treating them as results", async () => {
  const service = loadService({ fetch: async () => Response.json({ error: "لا توجد قاعدة ربط ممكنة" }, { status: 422 }) });
  await assert.rejects(service.run({}, () => {}), /لا توجد قاعدة ربط ممكنة/);
});

