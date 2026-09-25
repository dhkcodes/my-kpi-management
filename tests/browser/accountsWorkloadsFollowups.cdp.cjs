const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

const cdpPort = Number(process.env.CDP_PORT || 9238);
const baseUrl = process.env.KPI_BASE || "http://127.0.0.1:8138";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (response) => {
    let body = "";
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
  }).on("error", reject);
});
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

class Cdp {
  constructor(url) {
    this.id = 0;
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
        return message.error
          ? pending.reject(new Error(message.error.message))
          : pending.resolve(message.result);
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }
}

const longUpdate = "Clipped latest update fixture ".repeat(18).trim();
const hierarchy = {
  fiscalYear: null,
  accounts: [{
    id: 41,
    versionNo: 3,
    name: "Fixture Account",
    archived: false,
    workloads: [{
      id: 51,
      versionNo: 4,
      name: "Fixture Workload",
      lastUpdated: longUpdate,
      notes: "Visible note",
      highlighted: false,
      archived: false,
      plans: [{ id: 61, workloadId: 51, sourcePlanId: 71, sourcePlanNumber: "PLAN-71", versionNo: 2 }],
      deals: [{
        id: 81,
        workloadId: 51,
        versionNo: 5,
        name: "Fixture Opportunity",
        opportunityNo: "OPP-81",
        revenueType: "New",
        status: "OPEN",
        targetFiscalYear: "FY27",
        targetQuarter: 2,
        actualCloseDate: null,
        contractStartDate: "2026-09-01",
        contractEndDate: "2027-08-31",
        arrUsd: 100,
        arrKrw: 140000,
        acrUsd: 80,
        acrKrw: 112000,
        winProbability: 50,
        latestUpdate: longUpdate,
        notes: null,
        deleted: false,
        deletedAt: null,
        sourceCommitmentId: 91
      }]
    }]
  }]
};
const fx = {
  fxRateId: 9,
  fiscalYear: "FY27",
  fromCurrency: "USD",
  toCurrency: "KRW",
  rateValue: 1400,
  sourceReference: "Layout fixture",
  versionNo: 5
};

(async () => {
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No CDP page target");
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  const runtimeErrors = [];
  let savePosts = 0;
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text);
  });
  cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const path = new URL(request.url).pathname;
    const fulfill = (status, payload) => cdp.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: encode(payload)
    });
    if (path.endsWith("/api/v1/auth/session")) {
      return fulfill(200, { userKey: "aw-layout", displayName: "AW Layout", loginId: "aw.layout", access: "Admin", status: "ACTIVE" });
    }
    if (path.endsWith("/api/v1/accounts-workloads/hierarchy/save") && request.method === "POST") {
      savePosts += 1;
      return fulfill(200, { hierarchy, dealResults: [] });
    }
    if (path.endsWith("/api/v1/accounts-workloads/hierarchy")) return fulfill(200, hierarchy);
    if (path.endsWith("/api/v1/fx-rates")) return fulfill(200, fx);
    if (path.endsWith("/api/v1/accounts-workloads/forecast-candidates")) return fulfill(200, []);
    return cdp.send("Fetch.continueRequest", { requestId });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const runtimeConfig = await cdp.send("Runtime.evaluate", { expression: "globalThis.KAP_AUTH_CONFIG", returnByValue: true });
  if (!runtimeConfig.result.value) throw new Error("Runtime auth config unavailable");
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/*", requestStage: "Request" }] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(globalThis,"KAP_AUTH_CONFIG",{value:${JSON.stringify(runtimeConfig.result.value)},writable:false,configurable:false});`
  });
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, label, timeout = 18000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await delay(40);
    }
    throw new Error(`wait timeout: ${label}`);
  };

  await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?aw-followups=${Date.now()}` });
  await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", "AW fixture row");

  const layout = await evaluate(`(() => {
    const label = document.querySelector('.accounts-workloads-include-deleted');
    const checkbox = label.querySelector('input');
    const text = label.querySelector('span');
    const summary = document.querySelector('.accounts-workloads-table-summary');
    const count = summary.firstElementChild;
    const fx = summary.querySelector('.accounts-workloads-fx');
    const rect = (element) => { const value = element.getBoundingClientRect(); return { top: value.top, bottom: value.bottom, left: value.left, right: value.right }; };
    return { label: rect(label), checkbox: rect(checkbox), text: rect(text), summary: rect(summary), count: rect(count), fx: rect(fx), labelDisplay: getComputedStyle(label).display };
  })()`);
  assert.equal(layout.labelDisplay, "flex", "Include Deleted uses its dedicated flex label");
  assert.ok(layout.checkbox.bottom > layout.text.top && layout.text.bottom > layout.checkbox.top, "checkbox and label text share a row");
  assert.ok(layout.count.bottom > layout.fx.top && layout.fx.bottom > layout.count.top, "account count and FX control share a row");
  assert.ok(layout.fx.left > layout.count.right, "FX control is to the far right of the count");

  const tooltip = await evaluate(`(async () => {
    const fire = async (element, type) => { element.dispatchEvent(new MouseEvent(type, { bubbles: true })); await new Promise((resolve) => requestAnimationFrame(resolve)); };
    const clipped = document.querySelector('[data-aw-field="lastUpdated"] .accounts-workloads-ellipsis');
    const visible = document.querySelector('[data-aw-field="notes"] .accounts-workloads-ellipsis');
    const clippedByMetrics = clipped.scrollWidth > clipped.clientWidth;
    const visibleByMetrics = visible.scrollWidth <= visible.clientWidth;
    await fire(clipped, 'mouseenter');
    const clippedOpened = Boolean(document.querySelector('.accounts-workloads-latest-tooltip'));
    await fire(clipped, 'mouseleave');
    await fire(visible, 'mouseenter');
    const visibleOpened = Boolean(document.querySelector('.accounts-workloads-latest-tooltip'));
    await fire(visible, 'mouseleave');
    return { clippedByMetrics, visibleByMetrics, clippedOpened, visibleOpened };
  })()`);
  assert.deepEqual(tooltip, { clippedByMetrics: true, visibleByMetrics: true, clippedOpened: true, visibleOpened: false });

  const markers = await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const edit = async (cell, suffix) => {
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      await settle();
      const input = cell.querySelector('input,textarea');
      input.value += suffix;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: suffix }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await settle();
    };
    const row = document.querySelector('[data-aw-row-key="41:51"]');
    await edit(row.querySelector('[data-aw-field="workload"]'), ' changed');
    row.querySelector('.accounts-workloads-expander').click();
    await settle();
    await edit(document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]'), ' changed');
    return ['[data-aw-field="workload"]', '[data-deal-field="name"]'].map((selector) => {
      const cell = document.querySelector(selector);
      const pseudo = getComputedStyle(cell, '::after');
      const bounds = cell.getBoundingClientRect();
      return { selector, position: getComputedStyle(cell).position, bottom: pseudo.bottom, height: pseudo.height, content: pseudo.content, markerBottom: bounds.bottom - Number.parseFloat(pseudo.bottom), cellBottom: bounds.bottom };
    });
  })()`);
  for (const marker of markers) {
    assert.equal(marker.bottom, "0px");
    assert.equal(marker.height, "3px");
    assert.notEqual(marker.content, "none");
    assert.equal(marker.markerBottom, marker.cellBottom, `${marker.selector} marker aligns to the actual td bottom`);
  }
  assert.equal(markers[1].position, "sticky", "changed Opportunity identity cell preserves sticky positioning");

  const toastLayout = await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const table = document.querySelector('.accounts-workloads-grid-wrap--compact');
    const before = table.getBoundingClientRect().top;
    const save = [...document.querySelectorAll('.accounts-workloads-toolbar button')].find((button) => button.textContent.trim() === 'Save');
    save.click();
    for (let index = 0; index < 200 && !document.querySelector('.accounts-workloads-toast'); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    const toast = document.querySelector('.accounts-workloads-toast');
    const during = table.getBoundingClientRect().top;
    const style = toast && getComputedStyle(toast);
    for (let index = 0; index < 200 && document.querySelector('.accounts-workloads-toast'); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    return { before, during, after: table.getBoundingClientRect().top, position: style?.position, pointerEvents: style?.pointerEvents };
  })()`);
  assert.equal(savePosts, 1, "fixture performs one authoritative save POST");
  assert.deepEqual(toastLayout, { before: toastLayout.before, during: toastLayout.before, after: toastLayout.before, position: "fixed", pointerEvents: "none" });
  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({ layout, tooltip, markers, toastLayout, savePosts, runtimeErrors: runtimeErrors.length }, null, 2));
  cdp.socket.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
