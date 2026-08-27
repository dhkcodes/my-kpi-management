const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9224);
const baseUrl = process.env.KPI_BASE || "http://127.0.0.1:8125";
const postDelayMs = Number(process.env.POST_DELAY_MS || 20);
const failPost = process.env.POST_FAIL === "1";
const marker = process.env.KPI_LIFECYCLE_MARKER || "KPI SAVE LIFECYCLE REGRESSION";
const routePath = process.env.KPI_ROUTE || "activity-a";
const kpiCode = ({ "activity-a": "A", "activity-b": "B", "activity-c1": "C1", "activity-c2": "C2", "activity-d1": "D1", "activity-f": "F", "activity-h": "H" })[routePath];
if (!kpiCode) throw new Error(`Unsupported KPI_ROUTE: ${routePath}`);
const editField = kpiCode === "H" ? "title" : "srNumber";

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
const summaryCodes = ["A", "B", "C1", "C2", "D1", "F", "H"];
const summaryFixture = {
  fiscalYear: "FY27",
  quarterCounts: Object.fromEntries(summaryCodes.map(code => [code, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }])),
  c1C2Monthly: Object.fromEntries(["Q1", "Q2", "Q3", "Q4"].map(q => [q, { C1: {}, C2: {} }])),
  d1QuarterByStage: Object.fromEntries(["Q1", "Q2", "Q3", "Q4"].map(q => [q, { IDENTIFIED: { count: 0, acrK: 0 }, VALIDATED: { count: 0, acrK: 0 }, ONBOARDED: { count: 0, acrK: 0 } }])),
  targets: { countPerQuarter: { A: 1, B: 1, F: 1, H: 1 }, c1C2CombinedPerQuarter: 6,
    d1AcrKPerQuarter: { IDENTIFIED: 2000, VALIDATED: 1000, ONBOARDED: 500 },
    labels: Object.fromEntries(summaryCodes.map(code => [code, `${code} fixture target`])) }
};

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
  let deleteCalls = 0;
  let savedItems = [];

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
    if (url.includes("/api/v1/auth/session") && method === "GET") {
      return fulfill(200, { userKey: "kpi-lifecycle-test", displayName: "KPI Lifecycle Test", loginId: "kpi.lifecycle.test", access: "Admin", status: "ACTIVE" });
    }
    if (url.includes("/api/v1/kpi-activities/summary")) return fulfill(200, summaryFixture);
    if (url.includes("/api/v1/kpi-activities/overview")) {
      return fulfill(200, { fiscalYear: "FY27", asOf: "2026-08-19", items: [{ code: "A", rows: 1, target: "Fixture", status: "In Progress", explanation: "Fixture" }] });
    }
    if (url.includes("/api/v1/kpi-activities/workload-options")) return fulfill(200, { total: 0, hasMore: false, items: [] });
    if (url.includes("/api/v1/kpi-activities") && method === "GET") return fulfill(200, { items: savedItems });
    if (url.includes("/api/v1/kpi-activities/batch") && method === "POST") {
      postCalls += 1;
      await delay(postDelayMs);
      if (failPost) return fulfill(500, { code: "PERSISTENCE_ERROR", message: "fixture failure" });
      const submitted = JSON.parse(request.postData || "{}");
      savedItems = (submitted.items || []).map((item, index) => ({ id: 5999 + index, versionNo: 1, ...item }));
      return fulfill(200, { items: savedItems });
    }
    if (url.includes("/api/v1/kpi-activities/") && method === "DELETE") {
      deleteCalls += 1;
      const rowId = Number(new URL(url).pathname.split("/").at(-1));
      savedItems = savedItems.filter((item) => item.id !== rowId);
      return fulfill(204, null, []);
    }
    return cdp.send("Fetch.continueRequest", { requestId });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Fetch.enable", { patterns: [
    { urlPattern: "*api/v1/auth/session*", requestStage: "Request" },
    { urlPattern: "*api/v1/kpi-activities*", requestStage: "Request" }
  ] });
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

  await cdp.send("Page.navigate", { url: `${baseUrl}/${routePath}?v=kpi-save-lifecycle-${Date.now()}` });
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
      await waitFor(() => document.querySelector('.kpi-activities-table-wrap[data-kpi-table-scope="FY27:${kpiCode}"]'), "native table");
      const contextModule = await new Promise((resolve, reject) => window.require(["ojs/ojcontext"], resolve, reject));
      const Context = contextModule.default || contextModule;
      await Context.getContext(page).getBusyContext().whenReady();
      const baselineBodyState = { classes: [...document.body.classList], overflow: getComputedStyle(document.body).overflow };
      const add = await waitFor(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(button => button.textContent.trim() === "Add KPI Activity" && !button.disabled), "Add enabled");
      add.click();
      const draftCell = await waitFor(() => document.querySelector('[data-kpi-grid-row^="draft-"]'), "draft row");
      const draftKey = draftCell.dataset.kpiGridRow;
      const titleCell = await waitFor(() => document.querySelector('[data-kpi-grid-row="' + draftKey + '"][data-kpi-grid-field="${editField}"]'), "draft edit cell");
      const editorSelector = '[data-kpi-editor-field="${editField}"] textarea, [data-kpi-editor-field="${editField}"] input';
      let textarea = document.querySelector(editorSelector);
      if (!textarea) {
        titleCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true, detail: 2, view: window }));
        textarea = await waitFor(() => document.querySelector(editorSelector), "text editor");
      }
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
      const retainedTextarea = document.querySelector('[data-kpi-editor-field="${editField}"] textarea, [data-kpi-editor-field="${editField}"] input');
      const retainedTitleCell = document.querySelector('[data-kpi-grid-row="' + draftKey + '"][data-kpi-grid-field="${editField}"]');
      const wrap = document.querySelector(".kpi-activities-table-wrap");
      const table = document.querySelector(".kpi-activities-table");
      const layers = [...document.querySelectorAll(".oj-dialog-layer, .oj-component-overlay")];
      const visibleLayers = layers.filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && rect.width > 0 && rect.height > 0;
      });
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
        modalState: {
          baselineBodyState,
          layerCount: layers.length,
          visibleLayerCount: visibleLayers.length,
          bodyClasses: [...document.body.classList],
          bodyOverflow: getComputedStyle(document.body).overflow,
          activeElementInsideDialog: Boolean(document.activeElement?.closest?.("oj-dialog, .oj-dialog-layer"))
        },
        tableGeometry: { wrapWidth: wrap?.clientWidth || 0, tableWidth: table?.getBoundingClientRect().width || 0 },
        lifecycle: window.__kpiSaveLifecycle
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  const result = evaluation.result.value;
  let reloadResult = null;
  let closePathResult = null;
  let responsiveResult = null;
  if (!failPost) {
    await cdp.send("Page.reload", { ignoreCache: true });
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const check = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const wrap = document.querySelector(".kpi-activities-table-wrap");
          const table = document.querySelector(".kpi-activities-table");
          if (!wrap || !table) return null;
          return {
            wrapWidth: wrap.clientWidth,
            tableWidth: table.getBoundingClientRect().width,
            markerPersisted: document.body.textContent.includes(${JSON.stringify(marker)}),
            visibleModalLayers: [...document.querySelectorAll(".oj-dialog-layer, .oj-component-overlay")].filter(element => {
              const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && rect.width > 0 && rect.height > 0;
            }).length
          };
        })()`, returnByValue: true
      });
      if (check.result.value?.markerPersisted) { reloadResult = check.result.value; break; }
      await delay(40);
    }
    if (reloadResult) {
      const tooltipCheck = await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
          const markedText = [...document.querySelectorAll(".kpi-clipped-cell-text, .kpi-cell-description")].find(element => element.textContent.includes(${JSON.stringify(marker)}));
          if (!markedText) return { error: "marked text not found" };
          const markedCell = markedText.closest("td");
          markedCell.scrollIntoView({ block: "center", inline: "nearest" });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          markedCell.dispatchEvent(new MouseEvent("mouseenter"));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const tooltip = document.querySelector(".kpi-clipped-cell-tooltip");
          const rect = tooltip?.getBoundingClientRect();
          const clipped = markedText.scrollWidth > markedText.clientWidth || markedText.scrollHeight > markedText.clientHeight;
          const result = {
            clipped,
            shownForClipped: Boolean(tooltip),
            tooltipRect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
            viewport: { width: innerWidth, height: innerHeight },
            inViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
            pointerEvents: tooltip ? getComputedStyle(tooltip).pointerEvents : null,
            multiLine: tooltip ? getComputedStyle(tooltip).whiteSpace : null
          };
          markedCell.dispatchEvent(new MouseEvent("mouseleave"));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const shortText = [...document.querySelectorAll(".kpi-clipped-cell-text")].find(element => element.scrollWidth <= element.clientWidth && element.textContent.length < 12);
          shortText?.closest("td")?.focus();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { ...result, hiddenForUnclipped: !document.querySelector(".kpi-clipped-cell-tooltip") };
        })()`, awaitPromise: true, returnByValue: true
      });
      reloadResult.tooltip = tooltipCheck.result.value;
    }
    if (reloadResult && routePath === "activity-a") {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 857, deviceScaleFactor: 1, mobile: false });
      const narrowGeometry = await cdp.send("Runtime.evaluate", { expression: `(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const measure = () => { const wrap = document.querySelector(".kpi-activities-table-wrap"); const table = document.querySelector(".kpi-activities-table"); return { wrapWidth: wrap.getBoundingClientRect().width, tableWidth: table.getBoundingClientRect().width, horizontalOverflow: wrap.scrollWidth > wrap.clientWidth }; };
        const beforeToggle = measure();
        const toggle = document.querySelector(".kpi-summary-toggle");
        toggle?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const afterToggle = measure();
        toggle?.click();
        return { beforeToggle, afterToggle };
      })()`, awaitPromise: true, returnByValue: true });
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 857, deviceScaleFactor: 1, mobile: false });
      const wideGeometry = await cdp.send("Runtime.evaluate", { expression: `(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const wrap = document.querySelector(".kpi-activities-table-wrap"); const table = document.querySelector(".kpi-activities-table"); return { wrapWidth: wrap.getBoundingClientRect().width, tableWidth: table.getBoundingClientRect().width, horizontalOverflow: wrap.scrollWidth > wrap.clientWidth }; })()`, awaitPromise: true, returnByValue: true });
      responsiveResult = { narrow: narrowGeometry.result.value, wide: wideGeometry.result.value };

      await cdp.send("Runtime.evaluate", { expression: `(async () => {
        const wait = async (fn, label) => { const limit = performance.now() + 5000; while (performance.now() < limit) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error("timeout " + label); };
        const add = await wait(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(b => b.textContent.trim() === "Add KPI Activity" && !b.disabled), "add");
        add.click();
        const cancel = await wait(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(b => b.textContent.trim() === "Cancel" && !b.disabled), "cancel");
        cancel.click();
        await wait(() => { const d = document.querySelector("oj-dialog.kpi-cancel-dialog"); return d?.isOpen() ? d : null; }, "cancel dialog");
        return true;
      })()`, awaitPromise: true, returnByValue: true });
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });

      const xTarget = await cdp.send("Runtime.evaluate", { expression: `(async () => {
        const wait = async (fn, label) => { const limit = performance.now() + 5000; while (performance.now() < limit) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error("timeout " + label); };
        const visibleLayers = () => [...document.querySelectorAll(".oj-dialog-layer, .oj-component-overlay")].filter(n => { const s = getComputedStyle(n); return s.display !== "none" && s.visibility !== "hidden" && s.pointerEvents !== "none"; }).length;
        await wait(() => { const d = document.querySelector("oj-dialog.kpi-cancel-dialog"); return !d || !d.isOpen(); }, "escape close");
        const escapeReleased = visibleLayers() === 0;
        const cancel = await wait(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(b => b.textContent.trim() === "Cancel" && !b.disabled), "cancel button");
        cancel.click();
        const dialog = await wait(() => { const value = document.querySelector("oj-dialog.kpi-cancel-dialog"); return value?.isOpen() ? value : null; }, "cancel open for X");
        const animations = [...dialog.getAnimations({ subtree: true }), ...document.querySelectorAll('.oj-dialog-layer')].flatMap(element => element.getAnimations?.({ subtree: true }) || []);
        await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
        await new Promise(resolve => setTimeout(resolve, 500));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const control = await wait(() => [...document.querySelectorAll('.oj-dialog-layer .oj-dialog-header-close-wrapper button[aria-labelledby]')].find(element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0; }), "accessible X");
        const rect = control.getBoundingClientRect();
        control.focus();
        return { escapeReleased, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, focused: document.activeElement === control, accessibleName: document.getElementById(control.getAttribute("aria-labelledby"))?.textContent?.trim() };
      })()`, awaitPromise: true, returnByValue: true });
      if (xTarget.exceptionDetails) throw new Error(xTarget.exceptionDetails.exception?.description || xTarget.exceptionDetails.text);

      assert.equal(xTarget.result.value.accessibleName, "Close", "JET X control must expose the Close accessible name");
      assert.equal(xTarget.result.value.focused, true, "JET X control must be keyboard focusable");
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: xTarget.result.value.x, y: xTarget.result.value.y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: xTarget.result.value.x, y: xTarget.result.value.y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: xTarget.result.value.x, y: xTarget.result.value.y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });

      const closePaths = await cdp.send("Runtime.evaluate", { expression: `(async () => {
        const wait = async (fn, label) => { const limit = performance.now() + 5000; while (performance.now() < limit) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error("timeout " + label); };
        const visibleLayers = () => [...document.querySelectorAll(".oj-dialog-layer, .oj-component-overlay")].filter(n => { const s = getComputedStyle(n); return s.display !== "none" && s.visibility !== "hidden" && s.pointerEvents !== "none"; }).length;
        const openCancel = async () => { const b = await wait(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(x => x.textContent.trim() === "Cancel" && !x.disabled), "cancel button"); b.click(); return wait(() => { const d = document.querySelector("oj-dialog.kpi-cancel-dialog"); return d?.isOpen() ? d : null; }, "cancel open"); };
        await wait(() => { const d = document.querySelector("oj-dialog.kpi-cancel-dialog"); return !d || !d.isOpen(); }, "trusted X close");
        const escapeReleased = ${JSON.stringify(xTarget.result.value.escapeReleased)};
        const xReleased = visibleLayers() === 0;
        let dialog = await openCancel();
        [...dialog.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "keep editing").click();
        await wait(() => !dialog.isOpen(), "keep close");
        const keepReleased = visibleLayers() === 0;
        const otherTab = [...document.querySelectorAll(".kpi-sheet-tabs button")].find(b => !b.classList.contains("is-active") && !b.disabled);
        otherTab.click();
        const nav = await wait(() => { const d = document.querySelector("oj-dialog.kpi-navigation-dialog"); return d?.isOpen() ? d : null; }, "nav open");
        [...nav.querySelectorAll("button")].find(b => b.textContent.trim() === "Stay").click();
        await wait(() => !nav.isOpen(), "nav close");
        const navigationReleased = visibleLayers() === 0;
        dialog = await openCancel();
        const overlay = [...document.querySelectorAll(".oj-component-overlay")].find(n => getComputedStyle(n).display !== "none");
        overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
        await new Promise(r => setTimeout(r, 80));
        const outsideClickKeptModal = dialog.isOpen();
        [...dialog.querySelectorAll("button")].find(b => b.textContent.trim().toLowerCase() === "discard changes").click();
        await wait(() => !dialog.isOpen(), "discard close");
        const discardReleased = visibleLayers() === 0;
        const checkbox = await wait(() => document.querySelector('input[data-kpi-row-selector]'), "saved checkbox");
        checkbox.click();
        const deleteButton = await wait(() => [...document.querySelectorAll(".kpi-activity-toolbar button")].find(b => b.textContent.trim() === "Delete" && !b.disabled), "delete button");
        deleteButton.click();
        const deleteDialog = await wait(() => { const d = document.querySelector("oj-dialog.kpi-delete-dialog"); return d?.isOpen() ? d : null; }, "delete open");
        [...deleteDialog.querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel").click();
        await wait(() => !deleteDialog.isOpen(), "delete cancel close");
        const deleteCancelReleased = visibleLayers() === 0;
        deleteButton.click();
        const confirmDeleteDialog = await wait(() => { const d = document.querySelector("oj-dialog.kpi-delete-dialog"); return d?.isOpen() ? d : null; }, "delete reopen");
        [...confirmDeleteDialog.querySelectorAll("button")].find(b => b.textContent.trim() === "Delete").click();
        await wait(() => !confirmDeleteDialog.isOpen(), "delete confirm close");
        await wait(() => !document.querySelector('input[data-kpi-row-selector]'), "deleted row removed");
        await wait(() => { const d = document.querySelector("oj-dialog.kpi-saving-dialog"); return !d || !d.isOpen(); }, "delete saving close");
        const deleteReleased = visibleLayers() === 0;
        const wrap = document.querySelector(".kpi-activities-table-wrap").getBoundingClientRect();
        const table = document.querySelector(".kpi-activities-table").getBoundingClientRect();
        return { escapeReleased, xReleased, keepReleased, navigationReleased, outsideClickKeptModal, discardReleased, deleteCancelReleased, deleteReleased,
          deleteTableFillsContainer: table.width >= wrap.width - 2,
          activeElementInsideDialog: Boolean(document.activeElement?.closest?.("oj-dialog, .oj-dialog-layer")), finalVisibleLayers: visibleLayers() };
      })()`, awaitPromise: true, returnByValue: true });
      if (closePaths.exceptionDetails) throw new Error(closePaths.exceptionDetails.exception?.description || closePaths.exceptionDetails.text);
      closePathResult = closePaths.result.value;

    }
  }
  cdp.close();
  console.log(JSON.stringify({ routePath, kpiCode, editField, mode: failPost ? "failure" : "success", postDelayMs, postCalls, deleteCalls, result, reloadResult, responsiveResult, closePathResult, cdpExceptions }, null, 2));

  assert.equal(postCalls, 1, "Save must issue exactly one POST");
  assert.deepEqual(result.lifecycle.errors, []);
  assert.deepEqual(result.lifecycle.rejections, []);
  assert.deepEqual(cdpExceptions, []);
  assert.equal(result.dialogOpen, false);
  assert.equal(result.modalState.visibleLayerCount, 0, "no blocking JET layer may remain after save completion");
  assert.deepEqual(result.modalState.bodyClasses, result.modalState.baselineBodyState.classes, "body classes must be restored to the pre-dialog state");
  assert.equal(result.modalState.bodyOverflow, result.modalState.baselineBodyState.overflow, "body overflow must be restored to the pre-dialog state");
  assert.equal(result.modalState.activeElementInsideDialog, false, "focus must leave the closed dialog layer");
  assert.ok(result.tableGeometry.tableWidth >= result.tableGeometry.wrapWidth - 2, "table must fill its container before refresh");
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
    assert.ok(reloadResult, "the exact save-complete then refresh chain must finish");
    assert.equal(reloadResult.markerPersisted, true, "saved KPI data must survive refresh");
    assert.equal(reloadResult.visibleModalLayers, 0, "refresh must not revive a stale modal layer");
    assert.ok(reloadResult.tableWidth >= reloadResult.wrapWidth - 2, "table must fill its container after refresh");
    assert.equal(reloadResult.tooltip.clipped, true, "the fixture must exercise a genuinely clipped KPI cell");
    assert.equal(reloadResult.tooltip.shownForClipped, true, "Full Text must open for clipped KPI text after save and refresh");
    assert.equal(reloadResult.tooltip.hiddenForUnclipped, true, "Full Text must stay closed for unclipped KPI text");
    assert.equal(reloadResult.tooltip.inViewport, true, "Full Text must flip or clamp inside the viewport");
    assert.equal(reloadResult.tooltip.pointerEvents, "none", "Full Text must not block link-like cell clicks");
    if (routePath === "activity-a") {
      assert.deepEqual(closePathResult, { escapeReleased: true, xReleased: true, keepReleased: true, navigationReleased: true,
        outsideClickKeptModal: true, discardReleased: true, deleteCancelReleased: true, deleteReleased: true,
        deleteTableFillsContainer: true, activeElementInsideDialog: false, finalVisibleLayers: 0 });
      assert.equal(deleteCalls, 1, "confirmed Delete must issue exactly one DELETE");
      assert.ok(responsiveResult.narrow.beforeToggle.tableWidth >= responsiveResult.narrow.beforeToggle.wrapWidth - 2,
        "narrow layout must fill the container and overflow only inside the table wrapper");
      assert.ok(responsiveResult.narrow.afterToggle.tableWidth >= responsiveResult.narrow.afterToggle.wrapWidth - 2,
        "summary collapse/expand must preserve table width");
      assert.ok(responsiveResult.wide.tableWidth >= responsiveResult.wide.wrapWidth - 2,
        "wide resize must restore full container width");
    }
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
