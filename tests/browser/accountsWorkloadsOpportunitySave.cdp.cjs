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
      const body = saveBodies.at(-1);
      for (const workload of body.workloads || []) {
        if (workload.id === 51 && workload.action === "UPSERT") hierarchy.accounts[0].workloads[0].name = workload.name;
      }
      for (const savedDeal of body.deals || []) {
        if (savedDeal.id === 81 && savedDeal.action === "UPSERT") hierarchy.accounts[0].workloads[0].deals[0].name = savedDeal.name;
      }
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
  const wait = async (expression, label, timeout = 30000) => { const started = Date.now(); while (Date.now() - started < timeout) { const value = await evaluate(expression); if (value) return value; await delay(40); } const state = await evaluate(`({ href: location.href, readyState: document.readyState, body: document.body?.innerText?.slice(0, 500) })`); throw new Error(`wait timeout: ${label} ${JSON.stringify(state)}`); };

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
    const saveLauncher = [...section.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save');
    saveLauncher.focus(); saveLauncher.click(); await settle();
    const dialog = document.querySelector('oj-dialog.kpi-cancel-dialog');
    return {
      title: dialog.dialogTitle,
      buttons: [...dialog.querySelectorAll('.kpi-dialog-actions oj-button')].map((b) => b.textContent.trim()),
      undoVisible: [...section.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo'),
      initialFocusInside: dialog.contains(document.activeElement),
    };
  })()`);
  assert.deepEqual(desktop, { title: "Save Opportunity changes?", buttons: ["Save Opportunities", "Keep editing"], undoVisible: true, initialFocusInside: true });
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await wait("!document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "Escape closes save dialog");
  await wait("document.activeElement?.textContent?.trim() === 'Save'", "focus returns to Opportunity Save launcher");
  await evaluate(`(async () => { const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); const row = document.querySelector('[data-aw-row-key="41:51"]'); const section = row.nextElementSibling.querySelector('.accounts-workloads-opportunities'); const saveLauncher = [...section.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save'); saveLauncher.focus(); saveLauncher.click(); await settle(); })()`);
  await wait("document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "save dialog reopens for Keep editing");
  await evaluate(`([...document.querySelectorAll('oj-dialog.kpi-cancel-dialog oj-button')].find((button) => button.textContent.trim() === 'Keep editing')).querySelector('button').click()`);
  await wait("!document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "Keep editing closes save dialog");
  await wait("document.activeElement?.textContent?.trim() === 'Save'", "Keep editing returns focus to Opportunity Save launcher");
  await evaluate(`(async () => { const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); const row = document.querySelector('[data-aw-row-key="41:51"]'); const section = row.nextElementSibling.querySelector('.accounts-workloads-opportunities'); const saveLauncher = [...section.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save'); saveLauncher.focus(); saveLauncher.click(); await settle(); })()`);
  await wait("document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "save dialog reopens for confirmation");
  await evaluate(`(() => { const button = [...document.querySelectorAll('oj-dialog.kpi-cancel-dialog oj-button')].find((b) => b.textContent.trim() === 'Save Opportunities').querySelector('button'); button.click(); button.click(); })()`);
  await wait("!document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "save dialog closes");
  for (let attempt = 0; attempt < 100 && savePosts < 1; attempt += 1) await delay(40);
  assert.equal(savePosts, 1, "double confirmation still posts Opportunity exactly once");

  await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?reverse-delete=${Date.now()}` });
  await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", "reverse delete fixture");
  const reverseDeleteBefore = savePosts;
  const reverseDelete = await evaluate(`(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const row = document.querySelector('[data-aw-row-key="41:51"]');
    row.querySelector('.accounts-workloads-expander').click(); await settle();
    const cell = document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]');
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); await settle();
    const input = cell.querySelector('input'); input.value += ' pending-delete'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ' pending-delete' })); input.dispatchEvent(new FocusEvent('blur', { bubbles: true })); await settle();
    row.querySelector('[data-aw-field="workload"]').click(); await settle();
    [...document.querySelectorAll('.accounts-workloads-toolbar button')].find((button) => button.textContent.trim() === 'Draft Delete').click(); await settle();
    return {
      opportunityText: document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]')?.textContent,
      errorText: document.body.textContent,
      addOpportunityVisible: [...row.nextElementSibling.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Add Opportunity'),
      saveVisible: [...document.querySelectorAll('.accounts-workloads-toolbar button')].some((button) => button.textContent.trim() === 'Save'),
    };
  })()`);
  assert.ok(reverseDelete.opportunityText.includes('pending-delete'), "reverse-order Opportunity draft remains visible after parent Draft Delete");
  assert.ok(reverseDelete.errorText.includes('Opportunity 초안은 저장되지 않았습니다'), "reverse-order Draft Delete explains the blocked Opportunity draft");
  assert.equal(reverseDelete.addOpportunityVisible, false, "pending Draft Delete blocks adding Opportunity");
  assert.equal(reverseDelete.saveVisible, true, "pending Draft Delete remains an explicit unsaved change");
  await evaluate(`document.querySelector('[data-navigation-id="home"]').click()`);
  await wait("document.querySelector('oj-dialog.kpi-navigation-dialog')?.isOpen()", "reverse delete navigation dialog");
  await evaluate(`([...document.querySelectorAll('oj-dialog.kpi-navigation-dialog oj-button')].find((button) => button.textContent.trim() === 'Save & Continue')).querySelector('button').click()`);
  await wait("!document.querySelector('oj-dialog.kpi-navigation-dialog')?.isOpen()", "reverse delete blocked dialog closes");
  assert.equal(await evaluate("location.pathname"), "/accounts-workloads", "blocked reverse-order draft does not navigate as saved");
  assert.equal(savePosts, reverseDeleteBefore, "blocked reverse-order draft does not issue a save request");

  const runNavigationSaveScenario = async (scenario, editAw, editOpportunity) => {
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
      document.querySelector('[data-navigation-id="home"]').click();
    })()`);
    await wait("document.querySelector('oj-dialog.kpi-navigation-dialog')?.isOpen()", `${scenario} navigation dialog`);
    const buttons = await evaluate(`[...document.querySelectorAll('oj-dialog.kpi-navigation-dialog .kpi-dialog-actions oj-button')].map((button) => button.textContent.trim())`);
    assert.deepEqual(buttons, ["Stay", "Save & Continue", "Discard & Continue"], `${scenario} uses KPI navigation dialog actions`);
    await evaluate(`([...document.querySelectorAll('oj-dialog.kpi-navigation-dialog oj-button')].find((button) => button.textContent.trim() === 'Save & Continue')).querySelector('button').click()`);
    await wait("location.pathname === '/'", `${scenario} navigation completes after save`);
    const expectedPosts = Number(editAw) + Number(editOpportunity);
    assert.equal(savePosts, before + expectedPosts, `${scenario} saves all changed resource types before navigation`);
    await evaluate(`document.querySelector('[data-navigation-id="accounts-workloads"]').click()`);
    await wait("location.pathname === '/accounts-workloads' && document.querySelector('[data-aw-row-key=\"41:51\"]')", `${scenario} return`);
    await cdp.send("Page.navigate", { url: `${baseUrl}/accounts-workloads?refresh=${scenario}-${Date.now()}` });
    await wait("document.readyState === 'complete' && document.querySelector('[data-aw-row-key=\"41:51\"]')", `${scenario} refresh`);
    const persisted = await evaluate(`(async () => { const row = document.querySelector('[data-aw-row-key="41:51"]'); row.querySelector('.accounts-workloads-expander').click(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return { aw: row.querySelector('[data-aw-field="workload"]')?.textContent, opportunity: document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]')?.textContent }; })()`);
    if (editAw) assert.ok(persisted.aw.includes(scenario), `${scenario} AW survives return and refresh`);
    if (editOpportunity) assert.ok(persisted.opportunity.includes(scenario), `${scenario} Opportunity survives return and refresh`);
    return saveBodies.slice(before, before + expectedPosts);
  };
  const awOnly = await runNavigationSaveScenario("aw-only", true, false);
  assert.ok(awOnly[0].workloads?.length > 0 && awOnly[0].deals?.length === 0, "AW-only Save & Continue writes only AW");
  const opportunityOnly = await runNavigationSaveScenario("opportunity-only", false, true);
  assert.ok(opportunityOnly[0].deals?.length > 0 && opportunityOnly[0].workloads?.length === 0, "Opportunity-only Save & Continue writes only Opportunity");
  const both = await runNavigationSaveScenario("both", true, true);
  assert.ok(both.some((body) => body.workloads?.length > 0), "combined Save & Continue writes AW");
  assert.ok(both.some((body) => body.deals?.length > 0), "combined Save & Continue writes Opportunity");

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
  await wait("document.querySelector('oj-dialog.kpi-cancel-dialog')?.isOpen()", "failure save confirmation");
  failNextSave = true;
  await evaluate(`([...document.querySelectorAll('oj-dialog.kpi-cancel-dialog oj-button')].find((button) => button.textContent.trim().startsWith('Save'))).querySelector('button').click()`);
  await wait("document.querySelector('.app-message-region')", "save failure message");
  const failed = await evaluate(`(() => { const cell = document.querySelector('[data-deal-draft-key="deal:81"] [data-deal-field="name"]'); return { path: location.pathname, retained: (cell?.querySelector('input')?.value ?? cell?.textContent ?? '').includes('Retain On Failure'), error: Boolean(document.querySelector('.app-message-region')) }; })()`);
  assert.deepEqual(failed, { path: "/accounts-workloads", retained: true, error: true }, "save failure keeps route, draft value, and visible error");

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
  console.log(JSON.stringify({ desktop, mobile, savePosts, saveBodies, runtimeErrors: runtimeErrors.length }, null, 2));
  cdp.socket.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
