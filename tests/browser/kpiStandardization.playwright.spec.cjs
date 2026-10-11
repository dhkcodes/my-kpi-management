const { test, expect } = require('playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:8133';
const EVIDENCE = '/home/opc/engineering-git-workspace/github.com/dhkcodes/my-kpi-management/docs/kpi-standardization-evidence';
fs.mkdirSync(EVIDENCE, { recursive: true });
const routes = ['kpis-overview', 'activity-a', 'activity-b', 'activity-c1', 'activity-c2', 'activity-d1', 'activity-f', 'activity-h'];

async function waitReady(page) {
  await page.waitForSelector('.kap-page-shell.kpi-spreadsheet-page');
  await page.waitForFunction(() => !document.querySelector('.kap-page-data-progress.is-active'), null, { timeout: 15000 });
}

async function verifyCommon(page, route) {
  const shell = page.locator('.kap-page-shell.kpi-spreadsheet-page');
  await expect(shell).toBeVisible();
  await expect(shell.locator('.kpi-page-menu')).toBeVisible();
  await expect(shell.locator('.kap-page-shell__heading h1')).toBeVisible();
  await expect(shell.locator('.kap-page-shell__body')).toBeVisible();
  await expect(shell.locator('.fiscal-year-selector')).toBeVisible();
  const footer = page.locator('footer.kpi-footer');
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Oracle');
  const alignment = await shell.evaluate((element) => {
    const breadcrumb = element.querySelector('nav[aria-label="Current page path"]')?.getBoundingClientRect();
    const heading = element.querySelector('.kap-page-shell__heading')?.getBoundingClientRect();
    const body = element.querySelector('.kap-page-shell__body')?.getBoundingClientRect();
    if (!breadcrumb || !heading || !body) return null;
    return {
      breadcrumbToHeading: Math.abs(breadcrumb.left - heading.left),
      headingToBody: Math.abs(heading.left - body.left),
      bodyInsideRoot: body.left >= element.getBoundingClientRect().left && body.right <= element.getBoundingClientRect().right,
    };
  });
  expect(alignment).not.toBeNull();
  expect(alignment.breadcrumbToHeading).toBeLessThanOrEqual(12);
  expect(alignment.headingToBody).toBeLessThanOrEqual(1);
  expect(alignment.bodyInsideRoot).toBe(true);
  const tabsDoNotOverlap = await shell.locator('.kpi-sheet-tabs > button').evaluateAll((buttons) => {
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    return boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right - 1);
  });
  expect(tabsDoNotOverlap).toBe(true);
  await expect(shell.getByRole('button', { name: 'Open KPI Guide' })).toBeVisible();
  const metrics = await shell.evaluate((element) => {
    const style = getComputedStyle(element);
    const scroll = element.querySelector('.kap-page-shell__scroll');
    return { radius: style.borderRadius, overflowY: scroll ? getComputedStyle(scroll).overflowY : '' };
  });
  expect(parseFloat(metrics.radius)).toBeCloseTo(3.2, 1);
  expect(['auto', 'scroll']).toContain(metrics.overflowY);
  const shellFooterGap = await shell.evaluate((element) => {
    const footer = document.querySelector('footer.kpi-footer');
    return footer ? footer.getBoundingClientRect().top - element.getBoundingClientRect().bottom : null;
  });
  expect(shellFooterGap).not.toBeNull();
  expect(shellFooterGap).toBeGreaterThanOrEqual(0);
  expect(shellFooterGap).toBeLessThanOrEqual(25);
  if (route === 'kpis-overview') {
    await expect(shell.locator('.kpi-overview-portfolio__heading').getByRole('button', { name: /Reload|Refresh/ })).toBeVisible();
  } else {
    await expect(shell.locator('.kpi-activity-toolbar__right').getByRole('button', { name: /Reload|Refresh/ })).toBeVisible();
  }
}

const refreshSlot = (page, route) => route === 'kpis-overview'
  ? page.locator('.kpi-overview-portfolio__heading .kap-page-activity__control-slot')
  : page.locator('.kpi-activity-toolbar__right .kap-page-activity__control-slot');

async function captureNormalAndLoading(page, route, device) {
  await page.goto(`${BASE}/${route}`);
  await waitReady(page);
  await verifyCommon(page, route);
  await page.screenshot({ path: path.join(EVIDENCE, `${route}-${device}-normal.png`), fullPage: true });
  await page.evaluate(() => { window.__KPI_FIXTURE_DELAY_MS = 5000; });
  await refreshSlot(page, route).evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('.kap-page-data-progress.is-active')).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, `${route}-${device}-loading.png`), fullPage: true });
  await page.evaluate(() => { window.__KPI_FIXTURE_DELAY_MS = 0; });
  await waitReady(page);
}

test.describe('KPI desktop standardization', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('all KPI routes and loading state', async ({ page }) => {
    test.setTimeout(180000);
    for (const route of routes) await captureNormalAndLoading(page, route, 'desktop');
  });
});

test.describe('KPI mobile emulation', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  test('all KPI routes, loading state, and double tap editing', async ({ page }) => {
    test.setTimeout(180000);
    for (const route of routes) await captureNormalAndLoading(page, route, 'mobile');

    await page.goto(`${BASE}/activity-a`);
    await waitReady(page);
    const cell = page.locator('td[data-kpi-grid-field="srNumber"]').first();
    await expect(cell).toBeVisible();
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    expect(box).toBeTruthy();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-kpi-single-editor]')).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, 'activity-a-mobile-double-tap-edit.png'), fullPage: true });
    await page.keyboard.press('Escape');

    await page.goto(`${BASE}/activity-a?fixtureAccess=read`);
    await waitReady(page);
    const readOnlyCell = page.locator('td[data-kpi-grid-field="srNumber"]').first();
    await expect(readOnlyCell).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add KPI Activity' })).toBeDisabled();
    const readOnlyBox = await readOnlyCell.boundingBox();
    expect(readOnlyBox).toBeTruthy();
    await page.touchscreen.tap(readOnlyBox.x + readOnlyBox.width / 2, readOnlyBox.y + readOnlyBox.height / 2);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(readOnlyBox.x + readOnlyBox.width / 2, readOnlyBox.y + readOnlyBox.height / 2);
    await expect(page.locator('[data-kpi-single-editor]')).toHaveCount(0);
    await expect(page.getByText('Write permission is required.')).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, 'activity-a-mobile-double-tap-read-only.png'), fullPage: true });
  });
});
