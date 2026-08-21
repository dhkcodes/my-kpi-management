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
const fixtureCounts = {
  FY26: { A: 3, B: 37, C1: 14, C2: 14, D1: 40, F: 3, H: 3 },
  FY27: { A: 0, B: 9, C1: 3, C2: 0, D1: 11, F: 0, H: 1 }
};
const rowsFor = (fiscalYear) => codes.flatMap((code, codeIndex) =>
  Array.from({ length: fixtureCounts[fiscalYear][code] }, (_, rowIndex) => ({
  id: (fiscalYear === "FY27" ? 270000 : 260000) + codeIndex * 1000 + rowIndex,
  versionNo: 1,
  manageTimeReflected: rowIndex % 2 === 0,
  fiscalYear,
  kpiCode: code,
  quarter: ["Q1", "Q2", "Q3", "Q4"][rowIndex % 4],
  activityMonth: code === "A" ? `2026-${String((rowIndex % 12) + 1).padStart(2, "0")}` : null,
  rawWorkload: ["B", "C1", "C2", "D1"].includes(code) ? `PARAMETA ${rowIndex} - Superconnect / OPPTY-${123456 + rowIndex}` : null,
  workloadId: ["B", "C1", "C2", "D1"].includes(code) ? 4000 + codeIndex * 100 + rowIndex : null,
  mappingStatus: ["B", "C1", "C2", "D1"].includes(code) ? "VERIFIED" : "NOT_REQUIRED",
  srNumber: `SR${String(7654321 + rowIndex).padStart(10, "0")}`,
  description: code === "D1" ? ["Solution Design", "Solution Proposal", "Solution Deployment"][rowIndex % 3] : code === "H" ? `Technical content ${rowIndex} with full visible title` : `${code} complete operating description ${rowIndex}`,
  salesStage: code === "D1" ? ["IDENTIFIED", "VALIDATED", "ONBOARDED"][rowIndex % 3] : null,
  acrK: code === "D1" ? 500 + rowIndex * 10 : null,
  targetQuarter: code === "D1" ? ["Q1", "Q2", "Q3", "Q4"][rowIndex % 4] : null,
  deliveryDate: `2026-${String((rowIndex % 12) + 1).padStart(2, "0")}-${String((rowIndex % 27) + 1).padStart(2, "0")}`
})));
const guidesFor = (fiscalYear) => codes.map((code, index) => ({
  kpiGuideId: index + 1,
  fiscalYear,
  kpiCode: code,
  srType: `${code} SR Type`,
  businessSrType: `${code} Business SR Type`,
  combinedSrType: code === "H" ? "H combined non-SR activity" : null,
  targetPerQuarter: `${fiscalYear} ${code} target per quarter`,
  activity: `${fiscalYear} ${code} guide activity`,
  taskType: "Delivery",
  measuring: `${fiscalYear} ${code} guide measurement`,
  details: `${code} guide details`,
  notes: `${code} guide notes`,
  versionNo: 1
}));

(async () => {
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && !target.url.startsWith("devtools://")) || targets.find((target) => target.type === "page");
  if (!page) throw new Error("No CDP page target");
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  const cdpExceptions = [];
  const mutationCalls = [];
  let guideFixtureMode = "full";
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => cdpExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const fulfill = (status, payload) => cdp.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: encodeBody(payload)
    });
    const url = new URL(request.url);
    if (url.pathname.endsWith("/api/v1/__test-guide-mode") && request.method === "GET") {
      guideFixtureMode = url.searchParams.get("mode") || "full";
      return fulfill(200, { mode: guideFixtureMode });
    }
    if (url.pathname.endsWith("/api/v1/kpi-guides") && request.method === "GET") {
      const guideFiscalYear = url.searchParams.get("fiscalYear") || "FY27";
      if (guideFiscalYear === "FY27") await delay(120);
      if (guideFixtureMode === "empty") return fulfill(200, { items: [] });
      if (guideFixtureMode === "error") return fulfill(503, { message: `Guide fixture error ${guideFiscalYear}` });
      return fulfill(200, { items: guidesFor(guideFiscalYear) });
    }
    if (!url.pathname.includes("/api/v1/kpi-activities")) return cdp.send("Fetch.continueRequest", { requestId });
    if (request.method !== "GET") {
      mutationCalls.push({ method: request.method, url: request.url });
      return fulfill(409, { message: "display regression forbids mutations" });
    }
    const fiscalYear = url.searchParams.get("fiscalYear") || "FY27";
    if (url.pathname.endsWith("/overview")) return fulfill(200, {
      fiscalYear,
      asOf: "2026-08-19",
      items: codes.map((code) => ({ code, rows: fixtureCounts[fiscalYear][code], target: "Fixture", status: "In Progress", explanation: "Fixture" }))
    });
    if (url.pathname.endsWith("/workload-options")) return fulfill(200, {
      items: [
        { workloadId: 9101, accountName: "Keyboard Account A", workloadName: "Workload Alpha", opptyNo: "OPPTY-KB-001" },
        { workloadId: 9102, accountName: "Keyboard Account B", workloadName: "Workload Beta", opptyNo: "OPPTY-KB-002" },
        { workloadId: 9103, accountName: "Keyboard Account C", workloadName: "Workload Gamma", opptyNo: null }
      ],
      total: 3,
      hasMore: false
    });
    return fulfill(200, { items: rowsFor(fiscalYear) });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.clearBrowserCache");
  if (!realApi) await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/*", requestStage: "Request" }] });
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
        await Promise.race([
          Context.getContext(element).getBusyContext().whenReady(),
          new Promise(resolve => window.setTimeout(resolve, 3000))
        ]);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      const expected = ${JSON.stringify({
        A: ["Reflected", "SR Number", "SR Description", "Delivery Date"],
        B: ["Reflected", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        C1: ["Reflected", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        C2: ["Reflected", "Account / Workload / Oppty.No", "SR Number", "SR Description", "Target Quarter", "Delivery Date"],
        D1: ["Reflected", "Account / Workload / Oppty.No", "SR Number", "Activity", "Sales Stage", "ACR (K)", "Target Quarter", "Delivery Date"],
        F: ["Reflected", "SR Number", "SR Description", "Delivery Date"],
        H: ["Reflected", "Content", "Delivery Date"]
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
      let stableTable = null;
      let maxEditors = 0;
      const selectGrid = async (fy, code) => {
        const fyButton = buttonByText(fy, document);
        if (fyButton && fyButton.getAttribute("aria-pressed") !== "true" && !fyButton.classList.contains("is-active")) fyButton.click();
        if (!location.pathname.endsWith("activity-" + code.toLowerCase())) {
          const tabButton = document.querySelectorAll(".kpi-sheet-tabs button")[tabIndex[code]];
          if (!tabButton) throw new Error("KPI tab control missing for " + code);
          tabButton.click();
        }
        const schema = fy + ":" + code;
        const wrapper = await waitFor(() => document.querySelector('.kpi-activities-table-wrap[data-kpi-table-scope="' + schema + '"]'), schema);
        const table = await waitFor(() => wrapper.querySelector(".kpi-activities-table"), schema + " table");
        await settle(table);
        await waitFor(() => table.querySelectorAll(".kpi-grid-header-title").length === expected[code].length, schema + " headers");
        maxEditors = Math.max(maxEditors, document.querySelectorAll("[data-kpi-single-editor]").length);
        if (maxEditors > 1) throw new Error("duplicate KPI editors detected at " + schema);
        if (stableTable === null) stableTable = table;
        else if (table !== stableTable) throw new Error("native KPI table DOM identity changed at " + schema);
        return table;
      };
      const inspectGrid = async (fy, code) => {
        const grid = await selectGrid(fy, code);
        const wrapper = grid.closest(".kpi-activities-table-wrap");
        const totalWidth = grid.scrollWidth;
        const positions = [];
        for (let x = 0; x <= Math.max(0, totalWidth - wrapper.clientWidth) + 400; x += 400) positions.push(Math.min(x, Math.max(0, totalWidth - wrapper.clientWidth)));
        const seen = new Set();
        const wrapFailures = [];
        const overlapFailures = [];
        const fixedEllipsis = [];
        for (const x of [...new Set(positions)]) {
          wrapper.scrollLeft = x;
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
        const pagePanel = document.querySelector(".kpi-spreadsheet-page");
        const previousPanel = pagePanel.previousElementSibling;
        return { fy, code, schema: wrapper.dataset.kpiTableScope, missing, wrapFailures, overlapFailures, fixedEllipsis,
          rowCount: grid.querySelectorAll("tbody tr").length, totalWidth, viewportWidth: wrapper.clientWidth,
          targetQuarterTextCount: code === "F" ? (pagePanel.textContent.match(/Target Quarter/g) || []).length : null,
          wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
          tableHeight: wrapper.getBoundingClientRect().height,
          contentAlign: getComputedStyle(pagePanel.parentElement).alignContent,
          topGap: pagePanel.getBoundingClientRect().top - previousPanel.getBoundingClientRect().bottom,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      };

      const gridA = await selectGrid("FY26", "A");
      gridA.closest(".kpi-activities-table-wrap").scrollLeft = 0;
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
      const draftViewport = gridA.closest(".kpi-activities-table-wrap");
      draftViewport.scrollLeft = draftViewport.scrollWidth;
      draftViewport.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => window.setTimeout(resolve, 32));
      const viewportCell = await waitFor(() => [...gridA.querySelectorAll('.is-unsaved-cell[data-kpi-grid-field="title"]')].find(cell => cell.textContent.includes(marker)), "viewport draft cell");
      const lineAfterViewport = getComputedStyle(viewportCell, "::after");
      const draftAfterViewport = { text: viewportCell.textContent.trim(), background: lineAfterViewport.backgroundColor, height: lineAfterViewport.height };
      const currentTab = buttonByText("1 to many", document.querySelector('[aria-label="KPI Activities tabs"]') || document);
      if (!currentTab) throw new Error("current KPI tab missing: " + [...document.querySelectorAll("button, oj-button")].map(button => button.textContent.replace(/\s+/g, " ").trim()).join(" | "));
      currentTab.click();
      await settle(gridA);
      const draftAfterCurrentTab = Boolean([...gridA.querySelectorAll('.is-unsaved-cell[data-kpi-grid-field="title"]')].find(cell => cell.textContent.includes(marker)));
      const cancelButton = buttonByText("Cancel", document.querySelector(".kpi-activity-toolbar") || document);
      if (!cancelButton) throw new Error("Cancel missing in phase " + page.dataset.kpiEditPhase + ": " + document.querySelector(".kpi-activity-toolbar")?.textContent);
      cancelButton.click();
      let cancelDialog = await waitFor(() => [...document.querySelectorAll("oj-dialog")].find(dialog => dialog.isOpen?.() && dialog.textContent.includes("Discard changes")), "cancel dialog");
      const cancelOptions = ["Save changes", "Keep editing", "Discard changes"].filter(label => cancelDialog.textContent.includes(label));
      const keepLeaf = [...cancelDialog.querySelectorAll("*")].find(element => element.childElementCount === 0 && element.textContent.trim() === "Keep editing");
      const keepButton = keepLeaf?.closest("oj-button") || keepLeaf;
      if (!keepButton) throw new Error("Keep editing missing: " + cancelDialog.textContent);
      keepButton.dispatchEvent(new CustomEvent("ojAction", { bubbles: true, composed: true }));
      await waitFor(() => !cancelDialog.isOpen?.(), "keep editing close");
      const draftAfterKeepEditing = Boolean(document.querySelector(".is-unsaved-cell"));
      cancelButton.click();
      cancelDialog = await waitFor(() => [...document.querySelectorAll("oj-dialog")].find(dialog => dialog.isOpen?.() && dialog.textContent.includes("Discard changes")), "cancel dialog reopen");
      const discardLeaf = [...document.querySelectorAll("*")].find(element => element.childElementCount === 0 && element.textContent.trim() === "Discard changes");
      const discardButton = discardLeaf?.closest("oj-button") || discardLeaf;
      if (!discardButton) throw new Error("Discard changes missing: " + cancelDialog.textContent);
      discardButton.dispatchEvent(new CustomEvent("ojAction", { bubbles: true, composed: true }));
      await waitFor(() => page.dataset.kpiEditPhase === "view" && !document.querySelector(".is-unsaved-cell"), "discard settled");

      const gridB = await selectGrid("FY26", "B");
      const selectedRow = gridB.querySelector("tbody tr");
      const selectedRowId = selectedRow?.dataset.kpiRowId;
      const rowCheckbox = selectedRow?.querySelector('input[data-kpi-row-selector]');
      if (!selectedRowId || !rowCheckbox) throw new Error("B selection fixture missing");
      rowCheckbox.click();
      await waitFor(() => rowCheckbox.checked, "B row selected");
      const workloadSort = gridB.querySelector('[data-kpi-sort-field="accountWorkload"]');
      workloadSort.click();
      await waitFor(() => workloadSort.closest("th")?.getAttribute("aria-sort") === "ascending", "B workload sort");
      const toolbarLabels = [...document.querySelectorAll(".kpi-activity-toolbar button")].map(button => button.textContent.trim());
      const deleteOnly = {
        delete: toolbarLabels.includes("Delete"),
        save: toolbarLabels.includes("Save"),
        cancel: toolbarLabels.includes("Cancel")
      };
      await selectGrid("FY26", "C1");
      const gridBAgain = await selectGrid("FY26", "B");
      const restoredCheckbox = gridBAgain.querySelector('input[data-kpi-row-selector="' + selectedRowId + '"]');
      const restoredSort = gridBAgain.querySelector('[data-kpi-sort-field="accountWorkload"]')?.closest("th")?.getAttribute("aria-sort");
      const scopedState = { selection: Boolean(restoredCheckbox?.checked), sort: restoredSort };
      const workloadCell = await waitFor(() => gridBAgain.querySelector('[data-kpi-grid-field="accountWorkload"]'), "workload cell");
      workloadCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
      const workloadInput = await waitFor(() => document.querySelector('[data-kpi-single-editor] input[aria-label="Search Account, Workload, or Oppty.No"]'), "workload editor");
      const workloadPopup = await waitFor(() => [...document.querySelectorAll("oj-popup.kpi-workload-results-popup")].find(popup => popup.isOpen?.()), "workload popup");
      maxEditors = Math.max(maxEditors, document.querySelectorAll("[data-kpi-single-editor]").length);
      const workloadRect = workloadCell.getBoundingClientRect();
      const editorRect = document.querySelector("[data-kpi-single-editor]").getBoundingClientRect();
      const popupPosition = workloadPopup.getProperty("position");
      const popupContract = {
        open: workloadPopup.isOpen(),
        anchoredToLauncher: popupPosition?.of === "#" + workloadInput.id,
        editorMatchesCell: Math.abs(editorRect.left - workloadRect.left) <= 1 && Math.abs(editorRect.top - workloadRect.top) <= 1
      };
      document.querySelector(".kpi-activity-toolbar").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      await waitFor(() => !document.querySelector("[data-kpi-single-editor]"), "workload editor close");

      const discardDrafts = async () => {
        const cancel = buttonByText("Cancel", document.querySelector(".kpi-activity-toolbar") || document);
        if (!cancel) return;
        cancel.click();
        const dialog = await waitFor(() => [...document.querySelectorAll("oj-dialog")].find(item => item.isOpen?.() && item.textContent.includes("Discard changes")), "discard dialog");
        const leaf = [...dialog.querySelectorAll("*")].find(element => element.childElementCount === 0 && element.textContent.trim() === "Discard changes");
        (leaf.closest("oj-button") || leaf).dispatchEvent(new CustomEvent("ojAction", { bubbles: true, composed: true }));
        await waitFor(() => page.dataset.kpiEditPhase === "view" && !document.querySelector(".is-unsaved-cell"), "discard clean");
      };

      await selectGrid("FY26", "A");
      const aSummaryHidden = !document.querySelector('.kpi-summary-toggle') && !document.getElementById("kpiTargetQuarterCountSummary");
      await selectGrid("FY26", "B");
      const quarterToggle = await waitFor(() => document.querySelector('.kpi-summary-toggle[aria-controls="kpiTargetQuarterCountSummary"]'), "quarter summary toggle");
      const quarterSummary = document.getElementById("kpiTargetQuarterCountSummary");
      const quarterDefaultHidden = quarterToggle.getAttribute("aria-expanded") === "false" && quarterSummary.hidden && quarterSummary.getBoundingClientRect().height === 0;
      const tableBeforeQuarterShow = document.querySelector(".kpi-activities-table-wrap").getBoundingClientRect().top;
      quarterToggle.click();
      await waitFor(() => quarterToggle.getAttribute("aria-expanded") === "true" && !quarterSummary.hidden, "quarter summary shown");
      const quarterShown = { tableMoved: document.querySelector(".kpi-activities-table-wrap").getBoundingClientRect().top > tableBeforeQuarterShow, label: quarterToggle.textContent.replace(/\s+/g, " ").trim() };
      await selectGrid("FY27", "B");
      const quarterRetained = document.querySelector('.kpi-summary-toggle')?.getAttribute("aria-expanded") === "true" && !document.getElementById("kpiTargetQuarterCountSummary")?.hidden;
      await selectGrid("FY26", "H");
      const hSummaryHidden = !document.querySelector('.kpi-summary-toggle') && !document.getElementById("kpiTargetQuarterCountSummary");
      await selectGrid("FY26", "F");
      const fSummaryHidden = !document.querySelector('.kpi-summary-toggle') && !document.getElementById("kpiTargetQuarterCountSummary");
      await selectGrid("FY26", "D1");
      const salesToggle = await waitFor(() => document.querySelector('.kpi-summary-toggle[aria-controls="kpiSalesStageAcrSummary"]'), "sales summary toggle");
      const salesSummary = document.getElementById("kpiSalesStageAcrSummary");
      const salesDefaultHidden = salesToggle.getAttribute("aria-expanded") === "false" && salesSummary.hidden;
      salesToggle.click();
      await waitFor(() => salesToggle.getAttribute("aria-expanded") === "true" && !salesSummary.hidden, "sales summary shown");
      await selectGrid("FY27", "D1");
      const salesRetained = document.querySelector('.kpi-summary-toggle')?.getAttribute("aria-expanded") === "true" && !document.getElementById("kpiSalesStageAcrSummary")?.hidden;
      document.querySelector('.kpi-summary-toggle').click();
      const summaryContract = { aSummaryHidden, fSummaryHidden, hSummaryHidden, quarterDefaultHidden, quarterShown, quarterRetained, salesDefaultHidden, salesRetained };

      const guideContract = [];
      for (const code of ${JSON.stringify(codes)}) {
        await selectGrid("FY26", code);
        const toggle = await waitFor(() => document.querySelector('.kpi-guide-toggle'), code + " guide toggle");
        const guide = document.getElementById("kpiActivityGuide" + code);
        const defaultHidden = toggle.getAttribute("aria-expanded") === "false" && guide.hidden && guide.getBoundingClientRect().height === 0;
        toggle.click();
        await waitFor(() => toggle.getAttribute("aria-expanded") === "true" && !guide.hidden && guide.textContent.includes("FY26 " + code + " guide measurement"), code + " guide shown");
        guideContract.push({ code, defaultHidden, label: toggle.textContent.replace(/\s+/g, " ").trim(), controls: toggle.getAttribute("aria-controls"), content: guide.textContent.includes("FY26 " + code + " guide activity") && guide.textContent.includes("FY26 " + code + " target per quarter") });
      }
      await selectGrid("FY27", "A");
      const guideTransitionText = document.getElementById("kpiActivityGuideA")?.textContent || "";
      const guideTransition = { staleFy26: guideTransitionText.includes("FY26 A guide"), loading: guideTransitionText.includes("Loading KPI Guide") };
      const guideRetained = await waitFor(() => {
        const toggle = document.querySelector('.kpi-guide-toggle');
        const guide = document.getElementById("kpiActivityGuideA");
        return toggle?.getAttribute("aria-expanded") === "true" && !guide?.hidden && guide?.textContent.includes("FY27 A guide measurement") && !guide.textContent.includes("FY26 A guide")
          ? { expanded: true, currentFy: true, staleFy: false } : null;
      }, "FY27 A Guide replacement");

      await fetch("/api/v1/__test-guide-mode?mode=empty");
      await selectGrid("FY26", "A");
      await waitFor(() => document.getElementById("kpiActivityGuideA")?.textContent.includes("No KPI Guide is available for A"), "FY26 empty Guide result");
      await fetch("/api/v1/__test-guide-mode?mode=full");
      await selectGrid("FY27", "A");
      const emptyTransitionText = document.getElementById("kpiActivityGuideA")?.textContent || "";
      const emptyTransition = {
        loading: emptyTransitionText.includes("Loading KPI Guide"),
        staleEmpty: emptyTransitionText.includes("No KPI Guide is available for A"),
        currentFy: emptyTransitionText.includes("FY27 A guide measurement")
      };
      await waitFor(() => document.getElementById("kpiActivityGuideA")?.textContent.includes("FY27 A guide measurement"), "FY27 Guide after empty result");

      await fetch("/api/v1/__test-guide-mode?mode=error");
      await selectGrid("FY26", "A");
      await waitFor(() => document.getElementById("kpiActivityGuideA")?.textContent.includes("Guide fixture error FY26"), "FY26 Guide error");
      await fetch("/api/v1/__test-guide-mode?mode=full");
      await selectGrid("FY27", "A");
      const errorTransitionText = document.getElementById("kpiActivityGuideA")?.textContent || "";
      const errorTransition = {
        loading: errorTransitionText.includes("Loading KPI Guide"),
        staleError: errorTransitionText.includes("KPI Guide API request failed") || errorTransitionText.includes("Guide fixture error"),
        currentFy: errorTransitionText.includes("FY27 A guide measurement")
      };
      await waitFor(() => document.getElementById("kpiActivityGuideA")?.textContent.includes("FY27 A guide measurement"), "FY27 Guide after error result");

      await selectGrid("FY26", "D1");
      document.querySelector('.kpi-summary-toggle[aria-expanded="true"]')?.click();
      document.querySelector('.kpi-guide-toggle[aria-expanded="true"]')?.click();
      const longTable = document.querySelector(".kpi-activities-table-wrap");
      const longFooter = document.querySelector(".kpi-footer");
      const longContentContract = { rows: longTable.querySelectorAll("tbody tr").length, wrapperVerticalOverflow: longTable.scrollHeight - longTable.clientHeight,
        documentScroll: document.documentElement.scrollHeight > innerHeight + 1, footerAfterTable: longFooter.getBoundingClientRect().top >= longTable.getBoundingClientRect().bottom - 1 };
      await selectGrid("FY26", "A");
      document.querySelector('.kpi-guide-toggle[aria-expanded="true"]')?.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const shortPage = document.querySelector(".kpi-spreadsheet-page").getBoundingClientRect();
      const shortFooter = document.querySelector(".kpi-footer").getBoundingClientRect();
      const shortFooterContract = { documentOverflow: document.documentElement.scrollHeight - innerHeight, bottom: Math.abs(shortFooter.bottom - innerHeight),
        left: Math.abs(shortFooter.left - shortPage.left), right: Math.abs(shortFooter.right - shortPage.right), linksCentered: getComputedStyle(document.querySelector(".kpi-footer .oj-web-applayout-footer-item")).justifyContent };

      const deliveryExisting = [];
      for (const code of ${JSON.stringify(codes)}) {
        const dateGrid = await selectGrid("FY26", code);
        const wrapper = dateGrid.closest(".kpi-activities-table-wrap");
        wrapper.scrollLeft = wrapper.scrollWidth;
        wrapper.dispatchEvent(new Event("scroll"));
        await settle(dateGrid);
        const dateCell = await waitFor(() => dateGrid.querySelector('tbody [data-kpi-grid-field="deliveryDate"]'), code + " existing date cell");
        const original = dateCell.textContent.trim();
        dateCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
        const dateInput = await waitFor(() => document.querySelector('[data-kpi-editor-field="deliveryDate"] oj-input-date'), code + " date editor");
        dateInput.show();
        const popup = await waitFor(() => [...document.querySelectorAll('.oj-datepicker-popup')].find(item => item.getAttribute('aria-hidden') !== 'true'), code + " date popup");
        const day = [...popup.querySelectorAll('td[data-handler="selectDay"]')].find(item => item.textContent.trim() === "2" && !item.classList.contains("oj-datepicker-unselectable"));
        if (!day) throw new Error(code + " selectable date missing");
        day.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerId: 1, pointerType: "mouse" }));
        (day.querySelector("a") || day).click();
        const changed = await waitFor(() => {
          const cell = dateGrid.querySelector('tbody [data-kpi-grid-field="deliveryDate"]');
          return !document.querySelector('[data-kpi-single-editor]') && cell?.classList.contains("is-unsaved-cell") && cell.textContent.trim() !== original ? cell : null;
        }, code + " date draft");
        const line = getComputedStyle(changed, "::after");
        deliveryExisting.push({ code, value: changed.textContent.trim(), line: line.height, save: Boolean(buttonByText("Save", document.querySelector(".kpi-activity-toolbar") || document)), cancel: Boolean(buttonByText("Cancel", document.querySelector(".kpi-activity-toolbar") || document)) });
        await discardDrafts();
      }

      const sameGrid = await selectGrid("FY26", "A");
      sameGrid.closest(".kpi-activities-table-wrap").scrollLeft = sameGrid.scrollWidth;
      const sameCell = sameGrid.querySelector('tbody [data-kpi-grid-field="deliveryDate"]');
      const sameValue = sameCell.textContent.trim();
      sameCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
      const sameInput = await waitFor(() => document.querySelector('[data-kpi-editor-field="deliveryDate"] oj-input-date'), "same date editor");
      sameInput.dispatchEvent(new CustomEvent("valueChanged", { detail: { value: sameValue }, bubbles: true, composed: true }));
      await waitFor(() => !document.querySelector('[data-kpi-single-editor]'), "same date finish");
      const sameDateNoDirty = !sameCell.classList.contains("is-unsaved-cell") && !buttonByText("Save", document.querySelector(".kpi-activity-toolbar") || document);

      buttonByText("Add KPI Activity", document.querySelector(".kpi-activity-toolbar") || document).click();
      const draftRow = await waitFor(() => sameGrid.querySelector('tbody tr[data-kpi-row-id^="draft-"]'), "new row");
      document.querySelector(".kpi-activity-toolbar").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      await waitFor(() => !document.querySelector('[data-kpi-single-editor]'), "new row first editor finish");
      sameGrid.closest(".kpi-activities-table-wrap").scrollLeft = sameGrid.scrollWidth;
      const newDateCell = draftRow.querySelector('[data-kpi-grid-field="deliveryDate"]');
      newDateCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
      const newDateInput = await waitFor(() => document.querySelector('[data-kpi-editor-field="deliveryDate"] oj-input-date'), "new row date editor");
      newDateInput.dispatchEvent(new CustomEvent("valueChanged", { detail: { value: "2026-08-19" }, bubbles: true, composed: true }));
      const newDateDraft = await waitFor(() => !document.querySelector('[data-kpi-single-editor]') && newDateCell.textContent.includes("2026-08-19") && newDateCell.classList.contains("is-unsaved-cell"), "new row date draft");
      await discardDrafts();

      // Warm the native table through one schema transition before measuring widths.
      // Oracle JET/Chromium can retain the initial scrollbar gutter until the first
      // route-scoped table switch even after BusyContext resolves.
      await selectGrid("FY26", "B");
      await selectGrid("FY26", "A");

      const forward = ["FY26", "FY27"].flatMap(fy => ${JSON.stringify(codes)}.map(code => [fy, code]));
      const reverse = [...forward].reverse();
      for (let cycle = 0; cycle < 3; cycle += 1) {
        for (const [fy, code] of forward) results.push({ cycle, direction: "forward", ...(await inspectGrid(fy, code)) });
        for (const [fy, code] of reverse) results.push({ cycle, direction: "reverse", ...(await inspectGrid(fy, code)) });
      }
      return { results, draftBeforeSort, draftAfterSort, draftAfterViewport, draftAfterCurrentTab, cancelOptions, draftAfterKeepEditing, deleteOnly, scopedState, popupContract,
        summaryContract, guideContract, guideTransition, guideRetained, emptyTransition, errorTransition, longContentContract, shortFooterContract, deliveryExisting, sameDateNoDirty, newDateDraft: Boolean(newDateDraft),
        maxEditors, jetGridCount: document.querySelectorAll("oj-data-grid").length,
        errors: window.__kpiGridDisplay.errors, rejections: window.__kpiGridDisplay.rejections };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  const result = evaluation.result.value;
  const evalPage = async (expression) => {
    const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const waitPage = async (expression, label, timeoutMs = 18000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await evalPage(expression);
      if (value) return value;
      await delay(40);
    }
    throw new Error(`wait timeout: ${label}`);
  };
  const pressKey = async (key, code, windowsVirtualKeyCode, modifiers = 0, text = undefined) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers, text });
    await delay(20);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers });
  };


  await cdp.send("Page.bringToFront");
  const initialSelectAll = await evalPage(`(() => { const input=document.querySelector('thead input[aria-label="Select all KPI activities"]'); return { checked: input.checked, indeterminate: input.indeterminate }; })()`);
  if (initialSelectAll.indeterminate) {
    await evalPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]').click(); true`);
    await waitPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]')?.checked === true`, "normalize Select All checked");
  }
  if (initialSelectAll.checked || initialSelectAll.indeterminate) {
    await evalPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]').click(); true`);
    await waitPage(`(() => { const input=document.querySelector('thead input[aria-label="Select all KPI activities"]'); return !input?.checked && !input?.indeterminate; })()`, "normalize Select All unchecked");
  }
  await evalPage(`document.querySelector('tbody input[data-kpi-row-selector]').click(); true`);
  const selectAllIndeterminate = await waitPage(`(() => { const input=document.querySelector('thead input[aria-label="Select all KPI activities"]'); return input?.indeterminate && !input.checked ? { checked: input.checked, indeterminate: input.indeterminate } : null; })()`, "Select All indeterminate");
  await evalPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]').click(); true`);
  const selectAllChecked = await waitPage(`(() => { const input=document.querySelector('thead input[aria-label="Select all KPI activities"]'); return input?.checked && !input.indeterminate ? { checked: input.checked, indeterminate: input.indeterminate } : null; })()`, "Select All checked");
  await evalPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]').click(); true`);
  const selectAllUnchecked = await waitPage(`(() => { const input=document.querySelector('thead input[aria-label="Select all KPI activities"]'); return !input?.checked && !input?.indeterminate ? { checked: input.checked, indeterminate: input.indeterminate } : null; })()`, "Select All unchecked");
  result.selectAllContract = { indeterminate: selectAllIndeterminate, checked: selectAllChecked, unchecked: selectAllUnchecked };
  const selectorCellContract = {};
  await evalPage(`document.querySelector('tbody td.kpi-selector-cell').click(); true`);
  selectorCellContract.rowCellClick = await waitPage(`document.querySelector('tbody td.kpi-selector-cell input[data-kpi-row-selector]')?.checked === true`, "row selector cell click");
  await evalPage(`document.querySelector('tbody td.kpi-selector-cell input[data-kpi-row-selector]').click(); true`);
  selectorCellContract.actualInputSingleToggle = await waitPage(`document.querySelector('tbody td.kpi-selector-cell input[data-kpi-row-selector]')?.checked === false`, "actual row input single toggle");
  await waitPage(`(() => { const cell=document.querySelector('tbody td.kpi-selector-cell'); cell?.focus(); return document.activeElement === cell; })()`, "row selector cell focus");
  await pressKey(" ", "Space", 32, 0, " ");
  selectorCellContract.rowCellKeyboard = await waitPage(`document.querySelector('tbody td.kpi-selector-cell input[data-kpi-row-selector]')?.checked === true`, "row selector cell Space");
  await evalPage(`document.querySelector('thead th.kpi-selector-cell').click(); true`);
  selectorCellContract.headerCellClick = await waitPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]')?.checked === true`, "header selector cell click all on");
  await waitPage(`(() => { const cell=document.querySelector('thead th.kpi-selector-cell'); cell?.focus(); return document.activeElement === cell; })()`, "header selector cell focus");
  await pressKey("Enter", "Enter", 13);
  selectorCellContract.headerCellKeyboard = await waitPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]')?.checked === false`, "header selector cell Enter");
  await evalPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]').click(); true`);
  selectorCellContract.headerInputSingleToggle = await waitPage(`document.querySelector('thead input[aria-label="Select all KPI activities"]')?.checked === true`, "actual header input single toggle");
  result.selectorCellContract = selectorCellContract;

  await evalPage(`document.querySelectorAll(".kpi-sheet-tabs button")[2].click(); true`);
  await waitPage(`location.pathname.endsWith("activity-b") && document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="accountWorkload"]')`, "keyboard B route");
  await evalPage(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await waitPage(`(() => { const cell=document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="accountWorkload"]'); cell?.focus(); return document.activeElement === cell; })()`, "workload cell focus");
  await pressKey("Enter", "Enter", 13);
  await waitPage(`document.querySelector('[data-kpi-single-editor] input[aria-label="Search Account, Workload, or Oppty.No"]')`, "trusted Enter workload editor");
  await waitPage(`document.querySelectorAll('oj-popup.kpi-workload-results-popup [role="option"]').length > 1`, "trusted workload options");
  const keyboardAria = await evalPage(`(() => {
    const input = document.querySelector('[data-kpi-single-editor] input[aria-label="Search Account, Workload, or Oppty.No"]');
    const options = [...document.querySelectorAll('oj-popup.kpi-workload-results-popup [role="option"]')];
    const cell = document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="accountWorkload"]');
    const editor = document.querySelector('[data-kpi-single-editor]');
    const popup = [...document.querySelectorAll('oj-popup.kpi-workload-results-popup')].find(item => item.isOpen?.());
    const cellRect = cell.getBoundingClientRect(); const editorRect = editor.getBoundingClientRect();
    return { controls: input.getAttribute("aria-controls"), expanded: input.getAttribute("aria-expanded"),
      activeDescendant: input.getAttribute("aria-activedescendant"), selected: options.map(option => option.getAttribute("aria-selected")),
      anchor: popup.getProperty("position")?.of === "#" + input.id,
      deltaLeft: Math.abs(editorRect.left - cellRect.left), deltaTop: Math.abs(editorRect.top - cellRect.top),
      editorMatchesCell: Math.abs(editorRect.left - cellRect.left) <= 1 && Math.abs(editorRect.top - cellRect.top) <= 1 };
  })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await delay(20);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await waitPage(`(() => { const input=document.querySelector('[data-kpi-single-editor] input'); const options=document.querySelectorAll('oj-popup.kpi-workload-results-popup [role="option"]'); return input?.getAttribute("aria-activedescendant")?.endsWith("-1") && options[1]?.getAttribute("aria-selected") === "true"; })()`, "ArrowDown option");
  await pressKey("ArrowUp", "ArrowUp", 38);
  await waitPage(`(() => { const input=document.querySelector('[data-kpi-single-editor] input'); const options=document.querySelectorAll('oj-popup.kpi-workload-results-popup [role="option"]'); return input?.getAttribute("aria-activedescendant")?.endsWith("-0") && options[0]?.getAttribute("aria-selected") === "true"; })()`, "ArrowUp option");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await delay(20);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  const selectedWorkloadText = await evalPage(`document.querySelectorAll('oj-popup.kpi-workload-results-popup [role="option"]')[1].querySelector("strong").textContent.trim()`);
  await pressKey("Enter", "Enter", 13);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]') && document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="accountWorkload"]')?.textContent.includes(${JSON.stringify(selectedWorkloadText)})`, "Enter workload draft");

  await evalPage(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await waitPage(`(() => { const cell=document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]'); cell?.focus(); return document.activeElement === cell; })()`, "Space title focus");
  await delay(80);
  if (!(await evalPage(`document.activeElement === document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]')`))) {
    await waitPage(`(() => { const cell=document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]'); cell?.focus(); return document.activeElement === cell; })()`, "Space title refocus");
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await delay(20);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await waitPage(`document.querySelector('[data-kpi-editor-field="title"] textarea')`, "trusted Space title editor");
  await pressKey("Escape", "Escape", 27);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]')`, "title Space Escape close");

  await waitPage(`(() => { const cell=document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="accountWorkload"]'); cell?.focus(); return document.activeElement === cell; })()`, "workload cell focus");
  await pressKey("Enter", "Enter", 13);
  await waitPage(`document.querySelector('[data-kpi-single-editor] input[aria-label="Search Account, Workload, or Oppty.No"]')`, "workload Escape editor");
  await waitPage(`document.querySelector('[data-kpi-single-editor] input')?.getAttribute("aria-activedescendant")?.endsWith("-0")`, "workload generation active option reset");
  await pressKey("Escape", "Escape", 27);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]')`, "workload Escape close");

  await evalPage(`document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]').focus(); true`);
  await pressKey("Enter", "Enter", 13);
  await waitPage(`document.querySelector('[data-kpi-editor-field="title"] textarea')`, "title Enter editor");
  await waitPage(`document.activeElement === document.querySelector('[data-kpi-editor-field="title"] textarea')`, "title textarea focus before Shift Enter");
  const titleBeforeShiftEnter = await evalPage(`document.querySelector('[data-kpi-editor-field="title"] textarea').value`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 8 });
  await delay(20);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 8 });
  await waitPage(`document.querySelectorAll('[data-kpi-single-editor]').length === 1 && document.querySelector('[data-kpi-editor-field="title"] textarea')`, "Shift Enter keeps one textarea editor");
  await cdp.send("Input.insertText", { text: "\n" });
  const titleAfterShiftEnter = await waitPage(`(() => { const textarea=document.querySelector('[data-kpi-editor-field="title"] textarea'); return textarea && textarea.value.includes("\\n") && textarea.value !== ${JSON.stringify(titleBeforeShiftEnter)} ? textarea.value : false; })()`, "Shift Enter native newline");
  await waitPage(`document.querySelectorAll('[data-kpi-single-editor]').length === 1 && document.querySelector('[data-kpi-editor-field="title"] textarea')`, "Shift Enter keeps one textarea editor");
  await pressKey("Enter", "Enter", 13);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]') && document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]')?.textContent.includes(${JSON.stringify(titleAfterShiftEnter)})`, "plain Enter commits multiline draft and closes");
  await evalPage(`document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]').focus(); true`);
  await pressKey("Enter", "Enter", 13);
  await waitPage(`document.querySelector('[data-kpi-editor-field="title"] textarea')`, "title re-enter before Tab");
  await pressKey("Tab", "Tab", 9);
  await waitPage(`document.querySelector('[data-kpi-editor-field="quarter"] select')`, "Tab next editor");
  await pressKey("Escape", "Escape", 27);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]')`, "quarter Escape close before Shift Tab");
  await evalPage(`document.querySelector('[data-kpi-table-scope="FY26:B"] [data-kpi-grid-field="title"]').focus(); true`);
  await pressKey("Enter", "Enter", 13);
  await waitPage(`document.querySelector('[data-kpi-editor-field="title"] textarea')`, "title editor before Shift Tab");
  await pressKey("Tab", "Tab", 9);
  await waitPage(`document.querySelector('[data-kpi-editor-field="quarter"] select')`, "Tab next editor before Shift Tab");
  await pressKey("Tab", "Tab", 9, 8);
  await waitPage(`document.querySelector('[data-kpi-editor-field="title"] textarea')`, "Shift Tab previous editor");
  await pressKey("Escape", "Escape", 27);
  await waitPage(`!document.querySelector('[data-kpi-single-editor]')`, "title Escape close");

  const maxTrustedEditors = await evalPage(`document.querySelectorAll('[data-kpi-single-editor]').length`);
  await evalPage(`[...document.querySelectorAll('.kpi-activity-toolbar button')].find(button => button.textContent.trim() === "Cancel").click(); true`);
  await waitPage(`[...document.querySelectorAll("oj-dialog")].some(dialog => dialog.isOpen?.() && dialog.textContent.includes("Discard changes"))`, "keyboard cleanup dialog");
  await evalPage(`(() => { const dialog=[...document.querySelectorAll("oj-dialog")].find(item => item.isOpen?.() && item.textContent.includes("Discard changes")); const leaf=[...dialog.querySelectorAll("*")].find(element => element.childElementCount===0 && element.textContent.trim()==="Discard changes"); (leaf.closest("oj-button") || leaf).dispatchEvent(new CustomEvent("ojAction",{bubbles:true,composed:true})); return true; })()`);
  await waitPage(`document.querySelector('.kpi-spreadsheet-page')?.dataset.kpiEditPhase === "view" && !document.querySelector(".is-unsaved-cell")`, "keyboard cleanup settled");
  const postKeyboardRuntime = await evalPage(`({ errors: window.__kpiGridDisplay.errors, rejections: window.__kpiGridDisplay.rejections })`);
  result.errors = postKeyboardRuntime.errors;
  result.rejections = postKeyboardRuntime.rejections;
  result.keyboardContract = { enter: true, shiftEnter: titleAfterShiftEnter.includes("\n"), space: true, tab: true, shiftTab: true, escape: true,
    workloadDraft: true, aria: keyboardAria, maxEditors: Math.max(result.maxEditors, maxTrustedEditors) };

  result.reflectedBulkContract = await evalPage(`(async () => {
    const wait = async (fn, label) => { for (let i=0;i<250;i+=1) { const value=fn(); if (value) return value; await new Promise(r=>setTimeout(r,40)); } throw new Error(label); };
    const button = text => [...document.querySelectorAll('.kpi-activity-toolbar button')].find(item => item.textContent.trim()===text);
    const normalizeSelectAll=document.querySelector('thead input[aria-label="Select all KPI activities"]');
    if (normalizeSelectAll.checked || normalizeSelectAll.indeterminate) normalizeSelectAll.click();
    if (normalizeSelectAll.checked || normalizeSelectAll.indeterminate) normalizeSelectAll.click();
    await wait(() => !normalizeSelectAll.checked && !normalizeSelectAll.indeterminate, 'bulk selection normalized');
    const zero = { hidden: !button('Mark reflected') && !button('Mark not reflected') };
    const candidates = [...document.querySelectorAll('.kpi-activities-table tbody tr')].filter(row => row.querySelector('.kpi-reflected-status-badge.is-not-reflected')).slice(0,2);
    if (candidates.length !== 2) throw new Error('two not-reflected fixture rows required');
    const candidateIds = candidates.map(row => row.dataset.kpiRowId);
    const candidateRows = () => candidateIds.map(id => document.querySelector('.kpi-activities-table tbody tr[data-kpi-row-id="' + id + '"]'));
    candidates.forEach(row => row.querySelector('input[data-kpi-row-selector]').click());
    await wait(() => button('Mark reflected') && !button('Mark not reflected'), 'bulk toolbar reflected action');
    button('Mark reflected').click();
    await wait(() => candidateRows().every(row => row?.querySelector('.kpi-reflected-status-badge.is-reflected')) && document.querySelectorAll('.kpi-grid-cell.is-unsaved-cell').length >= 2 && button('Mark not reflected'), 'bulk reflected draft');
    const reflected = { selected: candidateIds.length, reflected: candidateRows().filter(row => row?.querySelector('.kpi-reflected-status-badge.is-reflected')).length, save: Boolean(button('Save')), label: button('Mark not reflected').textContent.trim() };
    button('Mark not reflected').click();
    await wait(() => candidateRows().every(row => row?.querySelector('.kpi-reflected-status-badge.is-not-reflected')) && !button('Save'), 'bulk not-reflected revert');
    const selectAll=document.querySelector('thead input[aria-label="Select all KPI activities"]'); if (selectAll.checked || selectAll.indeterminate) selectAll.click();
    button('Add KPI Activity').click();
    const draft = await wait(() => document.querySelector('.kpi-activities-table tbody tr[data-kpi-row-id^="draft-"]'), 'new draft row');
    const draftId = draft.dataset.kpiRowId;
    const draftRow = () => document.querySelector('.kpi-activities-table tbody tr[data-kpi-row-id="' + draftId + '"]');
    document.querySelector('.kpi-activity-toolbar').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}));
    await wait(() => !document.querySelector('[data-kpi-single-editor]'), 'new draft editor close');
    draft.querySelector('input[data-kpi-row-selector]').click();
    await wait(() => button('Mark reflected'), 'new draft toolbar enabled');
    button('Mark reflected').click();
    await wait(() => draftRow()?.querySelector('.kpi-reflected-status-badge.is-reflected') && button('Mark not reflected'), 'new draft reflected');
    const newReflected = draftRow().querySelector('.kpi-reflected-status-badge').getAttribute('aria-label');
    button('Mark not reflected').click();
    await wait(() => draftRow()?.querySelector('.kpi-reflected-status-badge.is-not-reflected'), 'new draft not reflected');
    button('Cancel').click();
    const dialog = await wait(() => [...document.querySelectorAll('oj-dialog')].find(item => item.isOpen?.() && item.textContent.includes('Discard changes')), 'new draft discard');
    const leaf=[...dialog.querySelectorAll('*')].find(element => element.childElementCount===0 && element.textContent.trim()==='Discard changes');
    (leaf.closest('oj-button')||leaf).dispatchEvent(new CustomEvent('ojAction',{bubbles:true,composed:true}));
    await wait(() => !document.querySelector('tr[data-kpi-row-id^="draft-"]'), 'new draft removed');
    return { zero, reflected, reverted: candidateRows().every(row => row?.querySelector('.kpi-reflected-status-badge.is-not-reflected')), newReflected, newReverted: true };
  })()`);
  await evalPage(`document.querySelectorAll(".kpi-sheet-tabs button")[1].click(); true`);
  await delay(80);
  await evalPage(`(() => {
    const dialog=[...document.querySelectorAll("oj-dialog")].find(item => item.isOpen?.() && item.textContent.includes("Discard and Continue"));
    if (!dialog) return false;
    const leaf=[...dialog.querySelectorAll("*")].find(element => element.childElementCount===0 && element.textContent.trim()==="Discard and Continue");
    (leaf?.closest("oj-button") || leaf)?.dispatchEvent(new CustomEvent("ojAction",{bubbles:true,composed:true}));
    return true;
  })()`);
  await waitPage(`location.pathname.endsWith("activity-a") && document.querySelector('[data-kpi-table-scope$=":A"]')`, "viewport A route");
  const viewportContracts = [];
  for (const viewport of [{ width: 1857, height: 920 }, { width: 1280, height: 900 }]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
    await delay(80);
    viewportContracts.push(await evalPage(`(() => {
      const footer=document.querySelector('.kpi-footer').getBoundingClientRect();
      const page=document.querySelector('.kpi-spreadsheet-page').getBoundingClientRect();
      const wrapper=document.querySelector('.kpi-activities-table-wrap');
      return { width: innerWidth, height: innerHeight, documentX: document.documentElement.scrollWidth-document.documentElement.clientWidth,
        documentY: document.documentElement.scrollHeight-document.documentElement.clientHeight, footerBottom: Math.abs(footer.bottom-innerHeight),
        footerLeft: Math.abs(footer.left-page.left), footerRight: Math.abs(footer.right-page.right), wrapperX: wrapper.scrollWidth-wrapper.clientWidth };
    })()`));
  }
  result.viewportContracts = viewportContracts;
  cdp.close();
  console.log(JSON.stringify({ realApi, result, mutationCalls, cdpExceptions }, null, 2));

  assert.deepEqual(mutationCalls, [], "display regression must not mutate API data");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(cdpExceptions, []);
  assert.equal(result.jetGridCount, 0, "KPI Activities path must not render a JET Data Grid");
  assert.ok(result.maxEditors <= 1, "KPI Activities must own at most one external editor");
  assert.equal(result.draftAfterCurrentTab, true, "reselecting the current KPI must retain the draft render");
  assert.deepEqual(result.cancelOptions, ["Save changes", "Keep editing", "Discard changes"]);
  assert.equal(result.draftAfterKeepEditing, true, "Keep editing must retain the draft");
  assert.deepEqual(result.deleteOnly, { delete: true, save: false, cancel: false });
  assert.deepEqual(result.scopedState, { selection: true, sort: "ascending" });
  assert.deepEqual(result.popupContract, { open: true, anchoredToLauncher: true, editorMatchesCell: true });
  assert.deepEqual(result.summaryContract, { aSummaryHidden: true, fSummaryHidden: true, hSummaryHidden: true, quarterDefaultHidden: true, quarterShown: { tableMoved: true, label: "⌄Quarter Summary" }, quarterRetained: true, salesDefaultHidden: true, salesRetained: true });
  assert.equal(result.guideContract.length, 7);
  for (const guide of result.guideContract) {
    assert.equal(guide.defaultHidden, true, `${guide.code} Guide defaults collapsed`);
    assert.equal(guide.label, "⌄KPI Guide", `${guide.code} Guide fixed label`);
    assert.equal(guide.controls, `kpiActivityGuide${guide.code}`);
    assert.equal(guide.content, true, `${guide.code} Guide content`);
  }
  assert.equal(result.guideTransition.staleFy26, false, "Guide transition must synchronously hide the previous fiscal year");
  assert.deepEqual(result.guideRetained, { expanded: true, currentFy: true, staleFy: false }, "Guide expansion must survive FY switching with only current-FY content");
  assert.equal(result.emptyTransition.staleEmpty, false, "Guide transition must hide a prior-FY empty result synchronously");
  assert.ok(result.emptyTransition.loading || result.emptyTransition.currentFy, "Guide transition must show loading or already-settled current-FY content");
  assert.equal(result.errorTransition.staleError, false, "Guide transition must hide a prior-FY error synchronously");
  assert.ok(result.errorTransition.loading || result.errorTransition.currentFy, "Guide transition must show loading or already-settled current-FY content");

  assert.deepEqual(result.selectAllContract, {
    indeterminate: { checked: false, indeterminate: true },
    checked: { checked: true, indeterminate: false },
    unchecked: { checked: false, indeterminate: false }
  });
  assert.deepEqual(result.selectorCellContract, { rowCellClick: true, actualInputSingleToggle: true, rowCellKeyboard: true, headerCellClick: true, headerCellKeyboard: true, headerInputSingleToggle: true });
  assert.deepEqual(result.reflectedBulkContract.zero, { hidden: true });
  assert.deepEqual(result.reflectedBulkContract.reflected, { selected: 2, reflected: 2, save: true, label: "Mark not reflected" });
  assert.equal(result.reflectedBulkContract.reverted, true);
  assert.equal(result.reflectedBulkContract.newReflected, "Reflected in internal system");
  assert.equal(result.reflectedBulkContract.newReverted, true);
  assert.deepEqual(result.longContentContract, { rows: 40, wrapperVerticalOverflow: 0, documentScroll: true, footerAfterTable: true });
  assert.ok(result.shortFooterContract.documentOverflow <= 1, "three-row content must not create a document scrollbar");
  assert.ok(result.shortFooterContract.bottom <= 1, "short-content Footer must rest on the viewport bottom");
  assert.ok(result.shortFooterContract.left <= 1 && result.shortFooterContract.right <= 1, "Footer must match the KPI page wrapper edges");
  assert.equal(result.shortFooterContract.linksCentered, "center");
  assert.deepEqual(result.viewportContracts.map(item => [item.width, item.height]), [[1857, 920], [1280, 900]]);
  for (const viewport of result.viewportContracts) {
    assert.ok(viewport.documentX <= 1, `${viewport.width} document horizontal overflow`);
    assert.ok(viewport.documentY <= 1, `${viewport.width} short-content document scrollbar`);
    assert.ok(viewport.footerBottom <= 1, `${viewport.width} Footer viewport bottom`);
    assert.ok(viewport.footerLeft <= 1 && viewport.footerRight <= 1, `${viewport.width} Footer wrapper alignment`);
  }
  assert.equal(result.deliveryExisting.length, 7);
  for (const item of result.deliveryExisting) {
    assert.equal(item.line, "3px", `${item.code} Delivery Date draft line`);
    assert.equal(item.save, true, `${item.code} Delivery Date Save action`);
    assert.equal(item.cancel, true, `${item.code} Delivery Date Cancel action`);
  }
  assert.equal(result.sameDateNoDirty, true, "selecting the saved Delivery Date must remain clean");
  assert.equal(result.newDateDraft, true, "new rows must show the selected Delivery Date immediately");
  assert.deepEqual({ enter: result.keyboardContract.enter, shiftEnter: result.keyboardContract.shiftEnter, space: result.keyboardContract.space, tab: result.keyboardContract.tab,
    shiftTab: result.keyboardContract.shiftTab, escape: result.keyboardContract.escape, workloadDraft: result.keyboardContract.workloadDraft },
    { enter: true, shiftEnter: true, space: true, tab: true, shiftTab: true, escape: true, workloadDraft: true });
  assert.ok(result.keyboardContract.maxEditors <= 1);
  assert.ok(result.keyboardContract.aria.controls?.startsWith("kpi-workload-options-"));
  assert.equal(result.keyboardContract.aria.expanded, "true");
  assert.ok(result.keyboardContract.aria.activeDescendant?.endsWith("-0"));
  assert.equal(result.keyboardContract.aria.selected[0], "true");
  assert.equal(result.keyboardContract.aria.anchor, true);
  assert.equal(result.keyboardContract.aria.editorMatchesCell, true);
  for (const draft of [result.draftBeforeSort, result.draftAfterSort, result.draftAfterViewport]) {
    assert.equal(draft.text, "A changed reflected draft value");
    assert.equal(draft.background, "rgb(179, 54, 111)");
    assert.equal(draft.height, "3px");
  }
  assert.equal(result.results.length, 84);
  for (const item of result.results) {
    assert.deepEqual(item.missing, [], `${item.schema} header titles`);
    assert.deepEqual(item.wrapFailures, [], `${item.schema} one-line headers`);
    assert.deepEqual(item.overlapFailures, [], `${item.schema} sort indicator separation`);
    assert.deepEqual(item.fixedEllipsis, [], `${item.schema} fixed values`);
    if (item.code === "F") assert.equal(item.targetQuarterTextCount, 0, `${item.schema} must not expose Target Quarter terminology`);
    if (!realApi) assert.equal(item.rowCount, fixtureCounts[item.fy][item.code], `${item.schema} fixture row count`);
    assert.ok(item.documentOverflow <= 1, `${item.schema} must not create page-level horizontal overflow`);
    assert.equal(item.wrapperOverflow, 0, `${item.schema} ordinary desktop viewport must not create a table scrollbar`);
    assert.equal(item.contentAlign, "start", `${item.schema} KPI content grid must stay top-aligned`);
    assert.ok(item.topGap <= 33, `${item.schema} must stay directly below the preceding KPI layout item`);
    if (item.rowCount === 0) assert.ok(item.tableHeight < 80, `${item.schema} empty table must not reserve a vertical spacer`);
    if (item.rowCount === 1) assert.ok(item.tableHeight < 130, `${item.schema} one-row table must not reserve a vertical spacer`);
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
