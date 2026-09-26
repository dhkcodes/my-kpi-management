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
    response.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on("error", reject);
});
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
class Cdp {
  constructor(url) { this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.socket = new WebSocket(url); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.once("open", resolve); this.socket.once("error", reject); });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw);
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id);
        return message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      }
      for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  on(method, handler) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(handler); }
}
const deal = (id, workloadId, name, deleted = false) => ({
  id, workloadId, versionNo: 5, name, opportunityNo: `OPP-${id}`, revenueType: "New", status: "OPEN",
  targetFiscalYear: "FY27", targetQuarter: 2, actualCloseDate: null, contractStartDate: "2026-09-01",
  contractEndDate: "2027-08-31", arrUsd: 100, arrKrw: 140000, acrUsd: 80, acrKrw: 112000,
  winProbability: 50, latestUpdate: "Fixture update", notes: null, deleted, deletedAt: deleted ? "2026-09-25T00:00:00Z" : null,
  sourceCommitmentId: null
});
const hierarchy = { fiscalYear: null, accounts: [{ id: 41, versionNo: 3, name: "Fixture Account", archived: false, workloads: [
  { id: 51, versionNo: 4, name: "Active Workload", lastUpdated: "Active", notes: "", highlighted: false, archived: false, plans: [], deals: [deal(81, 51, "Editable Opportunity")] },
  { id: 52, versionNo: 6, name: "Draft Deleted Workload", lastUpdated: "Archived", notes: "", highlighted: false, archived: true, plans: [], deals: [deal(82, 52, "Protected Opportunity", false)] }
] }] };
const fx = { fxRateId: 9, fiscalYear: "FY27", fromCurrency: "USD", toCurrency: "KRW", rateValue: 1400, sourceReference: "Fixture", versionNo: 5 };

(async () => {
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No CDP page target");
  const cdp = new Cdp(page.webSocketDebuggerUrl); await cdp.open();
  let savePosts = 0; let failNextSave = false; const saveBodies = []; const runtimeErrors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const path = new URL(request.url).pathname;
    const fulfill = (status, payload) => cdp.send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: encode(payload) });
    if (path.endsWith("/api/v1/auth/session")) return fulfill(200, { userKey: "aw-save", displayName: "AW Save", loginId: "aw.save", access: "Admin", status: "ACTIVE" });
    if (path.endsWith("/api/v1/accounts-workloads/hierarchy/save") && request.method === "POST") {
      savePosts += 1;
      saveBodies.push(JSON.parse(request.postData || "{}"));
      if (failNextSave) { failNextSave = false; return fulfill(500, { message: "Deliberate save failure" }); }
      return fulfill(200, { hierarchy, dealResults: [] });
    }
    if (path.endsWith("/api/v1/accounts-workloads/hierarchy")) return fulfill(200, hierarchy);
    if (path.endsWith("/api/v1/fx-rates")) return fulfill(200, fx);
    if (path.endsWith("/api/v1/accounts-workloads/forecast-candidates")) return fulfill(200, []);
    return cdp.send("Fetch.continueRequest", { requestId });
  });
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  const config = await cdp.send("Runtime.evaluate", { expression: "globalThis.KAP_AUTH_CONFIG", returnByValue: true });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/*", requestStage: "Request" }] });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(globalThis,"KAP_AUTH_CONFIG",{value:${JSON.stringify(config.result.value)},writable:false,configurable:false});` });
  const evaluate = async (expression) => { const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const wait = async (expression, label, timeout = 18000) => { const started = Date.now(); while (Date.now() - started < timeout) { const value = await evaluate(expression); if (value) return value; await delay(40); } throw new Error(`wait timeout: ${label}`); };

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?opportunity-save=${Date.now()}` });
  await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", "desktop fixture");
  const desktop = await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const row = document.querySelector('[data-aw-row-key="41:51"]'); row.querySelector('.accounts-workloads-expander').click(); await settle();
    const cell = document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]');
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); await settle();
    const input = cell.querySelector('input'); input.value += ' changed'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ' changed' })); input.dispatchEvent(new FocusEvent('blur', { bubbles: true })); await settle();
    const section = row.nextElementSibling.querySelector('.accounts-workloads-opportunities');
    [...section.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click(); await settle();
    const dialog = document.querySelector('.accounts-workloads-confirmation');
    const result = { title: dialog.querySelector('h2').textContent.trim(), buttons: [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()), undoVisible: [...section.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo') };
    [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save Opportunities').click();
    return result;
  })()`);
  assert.deepEqual(desktop, { title: "Save Opportunity changes?", buttons: ["Keep editing", "Save Opportunities"], undoVisible: true });
  await wait("!document.querySelector('.accounts-workloads-confirmation')", "save dialog closes");
  assert.equal(savePosts, 1, "confirmed Opportunity save posts exactly once");

  const runToolbarSaveScenario = async (scenario, editAw, editOpportunity) => {
    await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?scenario=${scenario}-${Date.now()}` });
    await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", `${scenario} fixture`);
    const before = savePosts;
    await evaluate(`(async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const edit = async (cell, suffix) => {
        cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); await settle();
        const input = cell.querySelector('input,textarea'); input.value += suffix;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: suffix }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true })); await settle();
      };
      const row = document.querySelector('[data-aw-row-key="41:51"]');
      if (${editAw}) await edit(row.querySelector('[data-aw-field="workload"]'), ' ${scenario}');
      if (${editOpportunity}) {
        row.querySelector('.accounts-workloads-expander').click(); await settle();
        await edit(document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]'), ' ${scenario}');
      }
      [...document.querySelectorAll('.accounts-workloads-toolbar button')].find((button) => button.textContent.trim() === 'Save').click();
      await settle();
      const confirmation = document.querySelector('.accounts-workloads-confirmation');
      const confirmSave = confirmation && [...confirmation.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Save'));
      if (confirmSave) confirmSave.click();
    })()`);
    const expectedPosts = Number(editAw) + Number(editOpportunity);
    const started = Date.now();
    while (savePosts < before + expectedPosts && Date.now() - started < 18000) await delay(40);
    assert.equal(savePosts, before + expectedPosts, `${scenario} emits the expected save requests`);
    return saveBodies.slice(before, before + expectedPosts);
  };
  const awOnly = await runToolbarSaveScenario("aw-only", true, false);
  assert.equal(awOnly.length, 1);
  assert.ok(awOnly[0].workloads?.length > 0 && awOnly[0].deals?.length === 0, "AW-only save writes only AW");
  const both = await runToolbarSaveScenario("both", true, true);
  assert.equal(both.length, 2);
  assert.ok(both.some((body) => body.workloads?.length > 0), "combined save writes AW");
  assert.ok(both.some((body) => body.deals?.length > 0), "combined save writes Opportunity");

  await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?failure=${Date.now()}` });
  await wait("location.search.includes('failure=') && document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", "failure fixture");
  await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const row = document.querySelector('[data-aw-row-key="41:51"]'); row.querySelector('.accounts-workloads-expander').click(); await settle();
    const cell = document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]');
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); await settle();
    const input = cell.querySelector('input'); input.value = 'Retain On Failure'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Retain On Failure' })); await settle();
    [...document.querySelectorAll('.accounts-workloads-opportunities button')].find((button) => button.textContent.trim() === 'Save').click(); await settle();
  })()`);
  await wait("document.querySelector('.accounts-workloads-confirmation')", "failure save confirmation");
  failNextSave = true;
  await evaluate(`([...document.querySelectorAll('.accounts-workloads-confirmation button')].find((button) => button.textContent.trim().startsWith('Save'))).click()`);
  await wait("document.querySelector('.app-message-region')", "save failure message");
  const failed = await evaluate(`({ path: location.pathname, value: document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"] input')?.value, error: Boolean(document.querySelector('.app-message-region')) })`);
  assert.deepEqual(failed, { path: "/accounts-workloads", value: "Retain On Failure", error: true }, "save failure keeps route, input, and visible error");

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?draft-deleted=${Date.now()}` });
  await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:52\"]')", "mobile fixture");
  const mobile = await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const includeDeleted = document.querySelector('.accounts-workloads-include-deleted input');
    if (includeDeleted && !includeDeleted.checked) { includeDeleted.click(); await settle(); }
    const row = document.querySelector('[data-aw-row-key="41:52"]'); row.querySelector('.accounts-workloads-expander').click(); await settle();
    const section = row.nextElementSibling.querySelector('.accounts-workloads-opportunities');
    const cell = section.querySelector('[data-deal-draft-key="deal:82"] [data-deal-field="name"]');
    if (cell) { cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); await settle(); }
    return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, addVisible: [...section.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Add Opportunity'), dealVisible: Boolean(cell), editorOpened: Boolean(cell?.querySelector('input,textarea')) };
  })()`);
  assert.equal(mobile.addVisible, false, "Draft Deleted workload hides Add Opportunity");
  assert.equal(mobile.dealVisible, true, "Include Deleted exposes the archived Opportunity for guard verification");
  assert.equal(mobile.editorOpened, false, "Draft Deleted opportunity cannot enter edit mode");
  assert.ok(mobile.scrollWidth <= mobile.width, "mobile page has no viewport-level horizontal overflow");
  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({ desktop, mobile, savePosts, runtimeErrors: runtimeErrors.length }, null, 2));
  cdp.socket.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
