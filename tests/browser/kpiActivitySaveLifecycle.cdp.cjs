const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9224);
const baseUrl = process.env.KPI_BASE || "http://127.0.0.1:8125";
const postDelayMs = Number(process.env.POST_DELAY_MS || 20);
const failPost = process.env.POST_FAIL === "1";
const marker = process.env.KPI_LIFECYCLE_MARKER || "KPI SAVE LIFECYCLE REGRESSION";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (response) => {
    let responseBody = "";
    response.on("data", (chunk) => { responseBody += chunk; });
    response.on("end", () => {
      try { resolve(JSON.parse(responseBody)); }
      catch (error) { reject(error); }
    });
  }).on("error", reject);
});
const encodeBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  close() { this.socket.close(); }
}

(async () => {
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No CDP page target");

  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  const cdpExceptions = [];
  let postCalls = 0;

  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    cdpExceptions.push({
      text: exceptionDetails.exception?.description || exceptionDetails.text,
      stack: exceptionDetails.stackTrace || null,
      url: exceptionDetails.url || null,
      lineNumber: exceptionDetails.lineNumber,
      columnNumber: exceptionDetails.columnNumber
    });
  });

  cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const fulfill = (status, payload, headers = [{ name: "Content-Type", value: "application/json" }]) => cdp.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: headers,
      body: payload == null ? undefined : encodeBody(payload)
    });
    const { url, method } = request;
    if (url.includes("/api/v1/kpi-activities/overview")) {
      return fulfill(200, { fiscalYear: "FY27", asOf: "2026-08-19", items: [{ code: "A", rows: 1, target: "Fixture", status: "In Progress", explanation: "Fixture" }] });
    }
    if (url.includes("/api/v1/kpi-activities/workload-options")) return fulfill(200, { total: 0, hasMore: false, items: [] });
    if (url.includes("/api/v1/kpi-activities") && method === "GET") return fulfill(200, { items: [] });
    if (url.includes("/api/v1/kpi-activities") && method === "POST") {
      postCalls += 1;
      await delay(postDelayMs);
      if (failPost) return fulfill(500, { message: "fixture failure" });
      const submitted = JSON.parse(request.postData || "{}");
      return fulfill(200, { id: 5999, versionNo: 1, ...submitted });
    }
    return cdp.send("Fetch.continueRequest", { requestId });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/kpi-activities*", requestStage: "Request" }] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__kpiSaveLifecycle = { errors: [], rejections: [], phases: [], dialogEvents: [], closeCalls: [], busyReadyAt: null };
    addEventListener("error", event => window.__kpiSaveLifecycle.errors.push(String(event.error?.stack || event.error || event.message)));
    addEventListener("unhandledrejection", event => window.__kpiSaveLifecycle.rejections.push(String(event.reason?.stack || event.reason)));
    document.addEventListener("ojOpen", event => {
      if (event.target?.classList?.contains("kpi-saving-dialog")) window.__kpiSaveLifecycle.dialogEvents.push({ type: "open", at: performance.now() });
    });
    document.addEventListener("ojClose", event => {
      if (event.target?.classList?.contains("kpi-saving-dialog")) window.__kpiSaveLifecycle.dialogEvents.push({ type: "close", at: performance.now() });
    });
  ` });

  await cdp.send("Page.navigate", { url: `${baseUrl}/activity-a?v=kpi-save-lifecycle-${Date.now()}` });
  const expectedPhase = failPost ? "dirty" : "view";
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const waitFor = async (fn, label, ms = 15000) => {
        const started = performance.now();
        while (performance.now() - started < ms) {
          const value = fn();
          if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        throw new Error("wait timeout: " + label);
      };
      const page = await waitFor(() => document.querySelector(".kpi-spreadsheet-page"), "page");
      const recordPhase = () => {
        const phase = page.dataset.kpiEditPhase;
        const last = window.__kpiSaveLifecycle.phases.at(-1);
        if (!last || last.phase !== phase) window.__kpiSaveLifecycle.phases.push({ phase, at: performance.now() });
      };
      recordPhase();
      new MutationObserver(recordPhase).observe(page, { attributes: true, attributeFilter: ["data-kpi-edit-phase"] });
      await waitFor(() => document.querySelector('.kpi-activities-table-wrap[data-kpi-table-scope="FY27:A"]'), "native table");
      const contextModule = await new Promise((resolve, reject) => window.require(["ojs/ojcontext"], resolve, reject));
      const Context = contextModule.default || contextModule;
      await Context.getContext(page).getBusyContext().whenReady();
      const add = await waitFor(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(button => button.textContent.trim() === "Add KPI Activity" && !button.disabled), "Add enabled");
      add.click();
      const draftCell = await waitFor(() => document.querySelector('[data-kpi-grid-row^="draft-"]'), "draft row");
      const draftKey = draftCell.dataset.kpiGridRow;
      const titleCell = await waitFor(() => document.querySelector('[data-kpi-grid-row="' + draftKey + '"][data-kpi-grid-field="title"]'), "draft title cell");
      titleCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
      const textarea = await waitFor(() => document.querySelector('[data-kpi-editor-field="title"] textarea'), "title textarea");
      textarea.value = ${JSON.stringify(marker)};
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(marker)} }));
      const dialog = await waitFor(() => document.querySelector("oj-dialog.kpi-saving-dialog"), "saving dialog");
      const nativeClose = dialog.close.bind(dialog);
      dialog.close = (...args) => {
        window.__kpiSaveLifecycle.closeCalls.push({ at: performance.now(), phase: page.dataset.kpiEditPhase });
        return nativeClose(...args);
      };
      const save = await waitFor(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(button => button.textContent.trim() === "Save" && !button.disabled), "Save enabled");
      save.click();
      await waitFor(() => page.dataset.kpiEditPhase === "saving", "saving phase");
      await waitFor(() => dialog.isOpen(), "dialog open");
      await waitFor(() => page.dataset.kpiEditPhase === ${JSON.stringify(expectedPhase)}, "terminal phase");
      await waitFor(() => window.__kpiSaveLifecycle.closeCalls.length > 0, "dialog.close call");
      await waitFor(() => window.__kpiSaveLifecycle.dialogEvents.some(event => event.type === "close"), "ojClose event");
      await Context.getContext(dialog).getBusyContext().whenReady();
      window.__kpiSaveLifecycle.busyReadyAt = performance.now();
      await waitFor(() => !dialog.isOpen(), "dialog isOpen false");
      recordPhase();
      const toolbar = Object.fromEntries([...document.querySelectorAll(".kpi-activity-toolbar button")].map(button => [button.textContent.trim(), button.disabled]));
      const retainedTextarea = document.querySelector('[data-kpi-editor-field="title"] textarea');
      const retainedTitleCell = document.querySelector('[data-kpi-grid-row="' + draftKey + '"][data-kpi-grid-field="title"]');
      return {
        phase: page.dataset.kpiEditPhase,
        dialogOpen: dialog.isOpen(),
        toolbar,
        dirtyCells: document.querySelectorAll(".is-unsaved-cell").length,
        editors: document.querySelectorAll("[data-kpi-single-editor]").length,
        draftKeys: [...new Set([...document.querySelectorAll("[data-kpi-grid-row]")].map(element => element.dataset.kpiGridRow))],
        retainedValue: retainedTextarea?.value || null,
        retainedCellText: retainedTitleCell?.textContent?.trim() || null,
        retrySaveEnabled: Boolean([...document.querySelectorAll(".kpi-activity-toolbar button")].find(button => button.textContent.trim() === "Save" && !button.disabled)),
        lifecycle: window.__kpiSaveLifecycle
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  const result = evaluation.result.value;
  cdp.close();
  console.log(JSON.stringify({ mode: failPost ? "failure" : "success", postDelayMs, postCalls, result, cdpExceptions }, null, 2));

  assert.equal(postCalls, 1, "Save must issue exactly one POST");
  assert.deepEqual(result.lifecycle.errors, []);
  assert.deepEqual(result.lifecycle.rejections, []);
  assert.deepEqual(cdpExceptions, []);
  assert.equal(result.dialogOpen, false);
  assert.ok(result.lifecycle.phases.some(({ phase }) => phase === "saving"), "saving phase must be observed");
  assert.equal(result.lifecycle.phases.at(-1).phase, expectedPhase);
  assert.ok(result.lifecycle.closeCalls.length >= 1, "public dialog.close() invocation must be observed");
  assert.ok(result.lifecycle.closeCalls.every(({ phase }) => phase === "saving"),
    "dialog close() must be requested before leaving the saving phase");
  assert.ok(result.lifecycle.busyReadyAt != null, "dialog BusyContext must settle");
  assert.ok(result.lifecycle.dialogEvents.some(({ type }) => type === "open"));
  assert.ok(result.lifecycle.dialogEvents.some(({ type }) => type === "close"));
  const terminalTransition = [...result.lifecycle.phases].reverse().find(({ phase }) => phase === expectedPhase);
  const closeEvent = [...result.lifecycle.dialogEvents].reverse().find(({ type }) => type === "close");
  assert.ok(terminalTransition && closeEvent && closeEvent.at <= terminalTransition.at,
    "terminal edit state must not precede ojClose completion");

  if (failPost) {
    assert.equal(result.phase, "dirty");
    assert.equal(result.retrySaveEnabled, true);
    assert.equal(result.toolbar.Save, false);
    assert.equal(result.toolbar.Cancel, false);
    assert.ok(result.dirtyCells > 0);
    assert.ok(result.draftKeys.some((key) => key.startsWith("draft-")));
    assert.equal(result.retainedCellText, marker);
  } else {
    assert.equal(result.phase, "view");
    assert.equal(result.dirtyCells, 0);
    assert.equal(result.editors, 0);
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
