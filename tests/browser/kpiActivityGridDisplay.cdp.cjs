const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9224);
const baseUrl = process.env.KPI_BASE || "http://127.0.0.1:8125";
const realApi = process.env.KPI_REAL_API === "1";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (response) => {
    let body = "";
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
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

const codes = ["A", "B", "C1", "C2", "D1", "F", "H"];
const rowsFor = (fiscalYear) => codes.map((code, index) => ({
  id: (fiscalYear === "FY27" ? 2700 : 2600) + index,
  versionNo: 1,
  manageTimeReflected: true,
  fiscalYear,
  kpiCode: code,
  quarter: "Q1",
  activityMonth: code === "A" ? "2026-08" : null,
  rawWorkload: ["B", "C1", "C2", "D1"].includes(code) ? "PARAMETA - Superconnect / OPPTY-123456" : null,
  workloadId: ["B", "C1", "C2", "D1"].includes(code) ? 4000 + index : null,
  mappingStatus: ["B", "C1", "C2", "D1"].includes(code) ? "VERIFIED" : "NOT_REQUIRED",
  srNumber: code === "H" ? "SR0001234567" : "SR0007654321",
  description: code === "D1" ? "Solution Deployment" : code === "H" ? "Technical content with full visible title" : `${code} complete operating description`,
  salesStage: code === "D1" ? "VALIDATED" : null,
  acrK: code === "D1" ? 2000 : null,
  targetQuarter: code === "D1" ? "Q1" : null,
  deliveryDate: "2026-08-19"
}));

(async () => {
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && !target.url.startsWith("devtools://")) || targets.find((target) => target.type === "page");
  if (!page) throw new Error("No CDP page target");
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  const cdpExceptions = [];
  const mutationCalls = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => cdpExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const fulfill = (status, payload) => cdp.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: encodeBody(payload)
    });
    const url = new URL(request.url);
    if (!url.pathname.includes("/api/v1/kpi-activities")) return cdp.send("Fetch.continueRequest", { requestId });
    if (request.method !== "GET") {
      mutationCalls.push({ method: request.method, url: request.url });
      return fulfill(409, { message: "display regression forbids mutations" });
    }
    const fiscalYear = url.searchParams.get("fiscalYear") || "FY27";
    if (url.pathname.endsWith("/overview")) return fulfill(200, {
      fiscalYear,
      asOf: "2026-08-19",
      items: codes.map((code) => ({ code, rows: 1, target: "Fixture", status: "In Progress", explanation: "Fixture" }))
    });
    if (url.pathname.endsWith("/workload-options")) return fulfill(200, { items: [], total: 0, hasMore: false });
    return fulfill(200, { items: rowsFor(fiscalYear) });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  if (!realApi) await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/kpi-activities*", requestStage: "Request" }] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__kpiGridDisplay = { errors: [], rejections: [] };
    addEventListener("error", event => window.__kpiGridDisplay.errors.push(String(event.error?.stack || event.error || event.message)));
    addEventListener("unhandledrejection", event => window.__kpiGridDisplay.rejections.push(String(event.reason?.stack || event.reason)));
  ` });
  await cdp.send("Page.navigate", { url: `${baseUrl}/activity-a?v=kpi-grid-display-${Date.now()}` });

  const evaluation = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const waitFor = async (fn, label, ms = 18000) => {
        const started = performance.now();
        while (performance.now() - started < ms) {
          const value = fn();
          if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        throw new Error("wait timeout: " + label);
      };
      const page = await waitFor(() => document.querySelector(".kpi-spreadsheet-page"), "page");
      const ContextModule = await new Promise((resolve, reject) => window.require(["ojs/ojcontext"], resolve, reject));
      const Context = ContextModule.default || ContextModule;
      const settle = async (element) => {
        await Context.getContext(element).getBusyContext().whenReady();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      const expected = ${JSON.stringify({
        A: ["Manage Time", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        B: ["Manage Time", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        C1: ["Manage Time", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        C2: ["Manage Time", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        D1: ["Manage Time", "Account / Workload / Oppty.No", "SR Number", "Activity", "Sales Stage", "ACR (K)", "Target Quarter", "Delivery Date"],
        F: ["Manage Time", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        H: ["Manage Time", "Content", "SR Number", "Target Quarter", "Delivery Date"]
      })};
      const labels = ${JSON.stringify({ A: "1 to many", B: "Early discovery", C1: "Workshops", C2: "POCs", D1: "New Workload", F: "References", H: "Blogs" })};
      const fixedFields = new Set(["manageTimeReflected", "srNumber", "title", "stage", "acrK", "targetQuarter", "quarter", "deliveryDate"]);
      const results = [];
      const buttonByText = (text, scope = document) => {
        const candidates = [...scope.querySelectorAll("button, oj-button")];
        if (scope !== document) candidates.push(...document.querySelectorAll("button, oj-button"));
        return candidates.find(button => {
          const label = button.textContent.replace(/\s+/g, " ").trim();
          return label === text || label.endsWith(text);
        });
      };
      const tabIndex = { A: 1, B: 2, C1: 3, C2: 4, D1: 5, F: 6, H: 7 };
      const selectGrid = async (fy, code) => {
        const fyButton = buttonByText(fy, document);
        if (fyButton && fyButton.getAttribute("aria-pressed") !== "true" && !fyButton.classList.contains("is-active")) fyButton.click();
        if (!location.pathname.endsWith("activity-" + code.toLowerCase())) {
          const tabButton = document.querySelectorAll(".kpi-sheet-tabs button")[tabIndex[code]];
          if (!tabButton) throw new Error("KPI tab control missing for " + code);
          tabButton.click();
        }
        const schema = fy + ":" + code;
        const grid = await waitFor(() => document.querySelector('oj-data-grid[data-kpi-grid-schema="' + schema + '"]'), schema);
        await settle(grid);
        await waitFor(() => grid.querySelectorAll(".kpi-grid-header-title").length > 0, schema + " headers");
        return grid;
      };
      const inspectGrid = async (fy, code) => {
        const grid = await selectGrid(fy, code);
        const wrapper = grid.closest(".kpi-jet-table-wrap");
        const totalWidth = Number.parseFloat(getComputedStyle(wrapper).getPropertyValue("--kpi-grid-content-width")) || grid.clientWidth;
        const positions = [];
        for (let x = 0; x <= Math.max(0, totalWidth - grid.clientWidth) + 400; x += 400) positions.push(Math.min(x, Math.max(0, totalWidth - grid.clientWidth)));
        const seen = new Set();
        const wrapFailures = [];
        const overlapFailures = [];
        const fixedEllipsis = [];
        for (const x of [...new Set(positions)]) {
          grid.scrollPosition = { x, y: 0 };
          await settle(grid);
          for (const title of grid.querySelectorAll(".kpi-grid-header-title")) {
            const text = title.textContent.trim();
            if (text) seen.add(text);
            const style = getComputedStyle(title);
            if (style.whiteSpace !== "nowrap") wrapFailures.push(text);
            const indicator = title.parentElement?.querySelector(".kpi-grid-sort-indicator");
            if (indicator && title.getBoundingClientRect().right > indicator.getBoundingClientRect().left + 1) overlapFailures.push(text);
          }
          for (const cell of grid.querySelectorAll(".kpi-grid-cell--fixed[data-kpi-grid-field]")) {
            const field = cell.dataset.kpiGridField;
            const span = cell.querySelector("span");
            if (fixedFields.has(field) && span && getComputedStyle(span).textOverflow === "ellipsis") fixedEllipsis.push(field);
          }
        }
        const missing = expected[code].filter(label => !seen.has(label));
        return { fy, code, schema: grid.dataset.kpiGridSchema, missing, wrapFailures, overlapFailures, fixedEllipsis,
          totalWidth, viewportWidth: grid.clientWidth, documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      };

      const gridA = await selectGrid(${JSON.stringify(realApi ? "FY26" : "FY27")}, "A");
      gridA.scrollPosition = { x: 0, y: 0 };
      await settle(gridA);
      const reflected = await waitFor(() => gridA.querySelector('.kpi-grid-cell.kpi-manage-time-reflected-row[data-kpi-grid-field="title"]'), "reflected title");
      reflected.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
      const textarea = await waitFor(() => document.querySelector('[data-kpi-editor-field="title"] textarea'), "title editor");
      const marker = "A changed reflected draft value";
      textarea.value = marker;
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: marker }));
      document.querySelector(".kpi-activity-toolbar").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      const changedCell = await waitFor(() => {
        const cell = gridA.querySelector('.is-unsaved-cell[data-kpi-grid-field="title"]');
        return cell?.textContent?.includes(marker) ? cell : null;
      }, "changed reflected cell");
      const lineBeforeSort = getComputedStyle(changedCell, "::after");
      const draftBeforeSort = { text: changedCell.textContent.trim(), background: lineBeforeSort.backgroundColor, height: lineBeforeSort.height };
      const titleSort = [...gridA.querySelectorAll(".kpi-grid-sort-button")].find(button => button.textContent.includes("SR Description"));
      if (!titleSort) throw new Error("SR Description sort missing after draft: " + JSON.stringify([...gridA.querySelectorAll(".kpi-grid-sort-button")].map(button => button.textContent.trim())));
      titleSort.click();
      await settle(gridA);
      const sortedCell = await waitFor(() => [...gridA.querySelectorAll('.is-unsaved-cell[data-kpi-grid-field="title"]')].find(cell => cell.textContent.includes(marker)), "sorted draft cell");
      const lineAfterSort = getComputedStyle(sortedCell, "::after");
      const draftAfterSort = { text: sortedCell.textContent.trim(), background: lineAfterSort.backgroundColor, height: lineAfterSort.height };
      const currentTab = buttonByText("1 to many", document.querySelector('[aria-label="KPI Activities tabs"]') || document);
      if (!currentTab) throw new Error("current KPI tab missing: " + [...document.querySelectorAll("button, oj-button")].map(button => button.textContent.replace(/\s+/g, " ").trim()).join(" | "));
      currentTab.click();
      await settle(gridA);
      const draftAfterCurrentTab = Boolean([...gridA.querySelectorAll('.is-unsaved-cell[data-kpi-grid-field="title"]')].find(cell => cell.textContent.includes(marker)));
      const cancelButton = buttonByText("Cancel", document.querySelector(".kpi-activity-toolbar") || document);
      if (!cancelButton) throw new Error("Cancel missing in phase " + page.dataset.kpiEditPhase + ": " + document.querySelector(".kpi-activity-toolbar")?.textContent);
      cancelButton.click();
      const cancelDialog = await waitFor(() => [...document.querySelectorAll("oj-dialog")].find(dialog => dialog.isOpen?.() && dialog.textContent.includes("Discard changes")), "cancel dialog");
      const discardLeaf = [...document.querySelectorAll("*")].find(element => element.childElementCount === 0 && element.textContent.trim() === "Discard changes");
      const discardButton = discardLeaf?.closest("oj-button") || discardLeaf;
      if (!discardButton) throw new Error("Discard changes missing: " + cancelDialog.textContent);
      discardButton.dispatchEvent(new CustomEvent("ojAction", { bubbles: true, composed: true }));
      await waitFor(() => page.dataset.kpiEditPhase === "view" && !document.querySelector(".is-unsaved-cell"), "discard settled");

      for (const fy of ["FY26", "FY27"]) {
        for (const code of ${JSON.stringify(codes)}) results.push(await inspectGrid(fy, code));
      }
      return { results, draftBeforeSort, draftAfterSort, draftAfterCurrentTab,
        errors: window.__kpiGridDisplay.errors, rejections: window.__kpiGridDisplay.rejections };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  const result = evaluation.result.value;
  cdp.close();
  console.log(JSON.stringify({ realApi, result, mutationCalls, cdpExceptions }, null, 2));

  assert.deepEqual(mutationCalls, [], "display regression must not mutate API data");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(cdpExceptions, []);
  assert.equal(result.draftAfterCurrentTab, true, "reselecting the current KPI must retain the draft render");
  for (const draft of [result.draftBeforeSort, result.draftAfterSort]) {
    assert.equal(draft.text, "A changed reflected draft value");
    assert.equal(draft.background, "rgb(217, 67, 143)");
    assert.equal(draft.height, "3px");
  }
  assert.equal(result.results.length, 14);
  for (const item of result.results) {
    assert.deepEqual(item.missing, [], `${item.schema} header titles`);
    assert.deepEqual(item.wrapFailures, [], `${item.schema} one-line headers`);
    assert.deepEqual(item.overlapFailures, [], `${item.schema} sort indicator separation`);
    assert.deepEqual(item.fixedEllipsis, [], `${item.schema} fixed values`);
    assert.ok(item.documentOverflow <= 1, `${item.schema} must not create page-level horizontal overflow`);
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
