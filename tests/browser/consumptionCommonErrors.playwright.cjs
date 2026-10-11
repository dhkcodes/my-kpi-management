const assert = require("node:assert/strict");
const fs = require("node:fs");

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "/home/opc/tmp/kap-playwright/node_modules/playwright",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error("Playwright is unavailable. Set PLAYWRIGHT_MODULE or install playwright locally.");
}

const { chromium } = loadPlaywright();
const BASE = process.env.KAP_BASE_URL || "https://hermes-one-server.tail57dd1d.ts.net:10000";
const CREDENTIAL_FILE = process.env.KAP_CREDENTIAL_FILE || "/home/opc/.secure/kaf-test-account/KAF Test Account.rtf";
const RESULT_FILE = process.env.KAP_CONSUMPTION_BROWSER_RESULT || "/tmp/kap-consumption-common-errors-result.json";
const ROUTES = [
  { name: "analysis", path: "/consumption/analysis", endpoint: "/api/v1/consumption/analysis", content: ".consumption-insights-kpis" },
  { name: "fva", path: "/consumption/forecast-vs-actual", endpoint: "/api/v1/consumption/forecast-vs-actual", content: ".forecast-actual-results" },
  { name: "records", path: "/consumption/records", endpoint: "/api/v1/consumption/records", content: ".consumption-table-panel" },
];

function credentials() {
  let rtf = fs.readFileSync(CREDENTIAL_FILE, "latin1");
  rtf = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\pard?\b/g, "\n").replace(/\\[a-zA-Z]+-?\d* ?|[{}]/g, "");
  const user = rtf.match(/^\s*(?:id|user(?:name)?)\s*[:=]\s*(\S+)\s*$/im);
  const password = rtf.match(/^\s*(?:pw|password)\s*[:=]\s*(\S+)\s*$/im);
  if (!user || !password) throw new Error("Approved UAT credential fields are unavailable");
  return { login: user[1].replace(/\\$/, ""), password: password[1].replace(/\\$/, "") };
}

async function login(page) {
  const value = credentials();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#kapLoginUserId.oj-complete").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#kapLoginUserId input").fill(value.login);
  await page.locator("#kapLoginUserId input").press("Tab");
  await page.locator("#kapLoginPassword input").fill(value.password);
  await page.locator("#kapLoginPassword input").press("Tab");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.locator("#kapLoginUserId").waitFor({ state: "detached", timeout: 30_000 });
}

function injectedFailure(route) {
  return route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "Injected read-only verification failure" }),
  });
}

async function messageCounts(page) {
  return page.evaluate(() => ({
    inline: document.querySelectorAll(".app-message-region.is-inline").length,
    floating: document.querySelectorAll(".app-message-region:not(.is-inline)").length,
  }));
}

async function waitForContent(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 60_000 });
  await page.locator(".kap-page-data-progress").waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
}

async function verifyErrorContract(page, routeConfig) {
  const handler = (route) => route.request().resourceType() !== "document" && route.request().url().includes(routeConfig.endpoint)
    ? injectedFailure(route)
    : route.continue();

  await page.route("**/*", handler);
  await page.goto(`${BASE}${routeConfig.path}`, { waitUntil: "domcontentloaded" });
  await page.locator(".app-message-region.is-inline").waitFor({ state: "visible", timeout: 30_000 });
  const initial = await messageCounts(page);
  const retry = page.locator(".app-message-region.is-inline oj-button");
  assert.deepEqual(initial, { inline: 1, floating: 0 }, `${routeConfig.name}: initial failure placement`);
  assert.equal(await retry.count(), 1, `${routeConfig.name}: one Retry action`);
  assert.equal(await retry.isEnabled(), true, `${routeConfig.name}: Retry is enabled`);

  const initialErrorText = page.locator(".app-message-region.is-inline").getByText(/운영 데이터를 표시할 수 없습니다|불러올 수 없습니다/).first();
  await page.unroute("**/*", handler);
  const successfulRetry = page.waitForResponse((response) =>
    response.url().includes(routeConfig.endpoint) && response.status() < 500, { timeout: 30_000 });
  await retry.click();
  await successfulRetry;
  await initialErrorText.waitFor({ state: "detached", timeout: 30_000 });
  await waitForContent(page, routeConfig.content);
  assert.equal(await initialErrorText.count(), 0, `${routeConfig.name}: Retry clears initial load error`);

  const before = await page.evaluate((selector) => ({
    timestamp: (document.querySelector(".kap-page-activity")?.textContent || "").trim(),
    content: Boolean(document.querySelector(selector)),
  }), routeConfig.content);
  assert.equal(before.content, true, `${routeConfig.name}: content exists before refresh failure`);

  await page.route("**/*", handler);
  await page.locator(".kap-data-control-bar .kap-page-activity__refresh").click();
  await page.locator(".app-message-region:not(.is-inline)").waitFor({ state: "visible", timeout: 30_000 });
  const refresh = await page.evaluate((selector) => ({
    inline: document.querySelectorAll(".app-message-region.is-inline").length,
    floating: document.querySelectorAll(".app-message-region:not(.is-inline)").length,
    timestamp: (document.querySelector(".kap-page-activity")?.textContent || "").trim(),
    content: Boolean(document.querySelector(selector)),
  }), routeConfig.content);
  await page.unroute("**/*", handler);

  assert.equal(refresh.inline, 0, `${routeConfig.name}: refresh failure has no inline error`);
  assert.equal(refresh.floating, 1, `${routeConfig.name}: refresh failure has one floating error`);
  assert.equal(refresh.content, true, `${routeConfig.name}: refresh failure preserves content`);
  assert.equal(refresh.timestamp, before.timestamp, `${routeConfig.name}: refresh failure preserves completion time`);
  return { initial, retryCleared: true, refresh, completionTimePreserved: true };
}

async function verifyMobileLayout(page, routeConfig) {
  await page.goto(`${BASE}${routeConfig.path}`, { waitUntil: "domcontentloaded" });
  await page.locator(".kap-data-control-bar").waitFor({ state: "visible", timeout: 60_000 });
  await waitForContent(page, routeConfig.content);
  const layout = await page.evaluate(() => {
    const bar = document.querySelector(".kap-data-control-bar");
    const rect = bar.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      barFits: bar.scrollWidth <= bar.clientWidth,
      barInsideViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      reloadHeight: document.querySelector(".kap-data-control-bar oj-button")?.getBoundingClientRect().height || 0,
    };
  });
  assert.equal(layout.documentFits, true, `${routeConfig.name}: mobile document does not overflow`);
  assert.equal(layout.barFits, true, `${routeConfig.name}: mobile Data Control Bar does not overflow`);
  assert.equal(layout.barInsideViewport, true, `${routeConfig.name}: mobile Data Control Bar remains in viewport`);
  assert.equal(Math.round(layout.reloadHeight), 44, `${routeConfig.name}: mobile Reload remains 44px`);
  return layout;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const result = { checkedAt: new Date().toISOString(), base: BASE, desktop: {}, mobile: {} };
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
    const desktopPage = await desktop.newPage();
    await login(desktopPage);
    for (const routeConfig of ROUTES) result.desktop[routeConfig.name] = await verifyErrorContract(desktopPage, routeConfig);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
    const mobilePage = await mobile.newPage();
    await login(mobilePage);
    for (const routeConfig of ROUTES) result.mobile[routeConfig.name] = await verifyMobileLayout(mobilePage, routeConfig);
    await mobile.close();
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.error = String(error.stack || error);
    throw error;
  } finally {
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    await browser.close();
  }
  console.log(`PASS consumption common browser regression: ${RESULT_FILE}`);
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
