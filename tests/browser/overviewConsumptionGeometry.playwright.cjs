/* Isolated geometry regression: production TSX/CSS, explicitly synthetic data.
   Run: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser/overviewConsumptionGeometry.playwright.cjs
   This does not authenticate, call APIs, or mutate the application. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const old = p => execFileSync('git', ['show', `7997fca:${p}`], { cwd: root, encoding: 'utf8' });
const escape = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function h(tag, props, ...children) {
  if (typeof tag === 'function') return tag({ ...props, children });
  const attrs = Object.entries(props || {}).filter(([k, v]) => k !== 'key' && !k.startsWith('on') && v != null).map(([k, v]) => {
    if (k === 'style') v = Object.entries(v).map(([name, value]) => `${name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${value}`).join(';');
    return ` ${k === 'className' ? 'class' : k === 'colSpan' ? 'colspan' : k === 'rowSpan' ? 'rowspan' : k}="${escape(v)}"`;
  }).join('');
  const body = children.flat(Infinity).filter(v => v !== false && v != null).join('');
  return `<${tag}${attrs}>${body}</${tag}>`;
}
const quarterSeries = [1, 2, 3, 4].map((quarter, i) => ({ quarter, bars: ['ARR', 'ACR'].map((measure, j) => ({ measure, segments: ['NEW', 'EXPANSION', 'RENEWAL'].map((kind, k) => ({ kind, value: [60, 30, 10][k] * ([1, .5, .25, 0][i]) * (j ? .5 : 1) })) })) }));
const summary = { displayQuarterOrder: ['FY27-Q1', 'FY27-Q2', 'FY27-Q3', 'FY27-Q4'], rows: ['OCI', 'AI', 'Total'].map(label => ({ label, quarters: ['FINAL_ACTUAL', 'FULL_FORECAST', 'MIXED', 'NO_DATA'].map((mode, i) => ({ quarter: `FY27-Q${i + 1}`, mode, totalAmountExact: '123450', actualAmountExact: '83450', forecastAmountExact: '40000', qoqPercentExact: '5.0', qoqStatus: 'AVAILABLE' })) })) };
function render(source, expression, globals) {
  const js = ts.transpileModule(`${source}\nresult = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText;
  const context = { h, ...globals }; vm.runInNewContext(js, context); return context.result;
}
function chart(page) {
  const expression = page.split('\n').find(line => line.includes('<div class="account-overview__vertical-chart">')).trim();
  return render('', `(${expression})`, { quarterSeries, maxQuarter: 100, actualQuarter: 'ALL', fmtUsd: v => `$${v.toFixed(1)}K` });
}
const consumptionSource = read('src/components/content/ConsumptionRecordsPage.tsx');
const summarySource = consumptionSource.slice(consumptionSource.indexOf('const summaryModeLabel'), consumptionSource.indexOf('\ntype Props', consumptionSource.indexOf('const summaryModeLabel')));
const summaryHtml = render(summarySource, 'ConsumptionSummaryPanel({summary, loading: false, error: "", expanded: true, onToggle: () => {}})', { summary, formatExactKFixed: v => (Number(v) / 1000).toFixed(2) + 'K' });
async function measure(page, baseline, viewport) {
  await page.setViewportSize(viewport);
  const overview = baseline ? old('src/components/content/AccountManagementOverviewPage.tsx') : read('src/components/content/AccountManagementOverviewPage.tsx');
  const css = ['src/styles/app.css', 'src/components/content/AccountManagementOverviewPage.css', 'src/styles/consumptionSummaryComparison.css'].map(p => baseline ? old(p) : read(p)).join('\n');
  await page.setContent(`<style>${css}</style><div class="kap-page-shell account-management-overview" style="height:auto;display:block"><article class="account-overview__panel account-overview__quarter-chart" style="width:700px;max-width:100%">${chart(overview)}</article></div><div class="kap-page-shell consumption-page" style="width:900px;max-width:100%">${summaryHtml}</div>`);
  return page.evaluate(() => {
    const rect = el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height, center: b.x + b.width / 2, width: b.width }; };
    return {
      bars: [...document.querySelectorAll('.account-overview__bar-item')].map(el => ({ track: rect(el.querySelector('.account-overview__bar-track')), stack: rect(el.querySelector('.account-overview__bar-stack')), total: rect(el.querySelector('.account-overview__bar-total')), label: rect(el.querySelector('b')), segments: [...el.querySelectorAll('i')].map(rect) })),
      ticks: [...document.querySelectorAll('.account-overview__axis span')].map(rect),
      widths: [...document.querySelectorAll('.consumption-summary__metric-row .consumption-summary__amount')].map(el => ({ mode: el.dataset.summaryMode, width: rect(el).width, min: parseFloat(getComputedStyle(el).minWidth) })),
    };
  });
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const baseline = await measure(page, true, { width: 1000, height: 900 });
    const current = await measure(page, false, { width: 1000, height: 900 });
    const close = (a, b) => assert.ok(Math.abs(a - b) < .12, `${a} != ${b}`);
    function check(result) {
      const max = result.bars[0].track.height;
      result.bars.forEach((bar, i) => {
        const values = quarterSeries[Math.floor(i / 2)].bars[i % 2].segments.map(s => s.value);
        close(bar.stack.height, max * values.reduce((a, b) => a + b, 0) / 100);
        close(bar.stack.bottom, result.bars[0].stack.bottom);
        close(bar.stack.bottom, bar.track.bottom);
        bar.segments.forEach((segment, j) => {
          close(segment.height, max * values[j] / 100);
          close(segment.center, bar.stack.center);
          close(segment.width, bar.stack.width);
        });
        assert.ok(bar.label.top >= bar.track.bottom - .12, 'measure label below baseline');
        close(bar.label.center, bar.stack.center);
        assert.ok(bar.total.bottom <= bar.stack.top + .12, 'total above stack');
      });
      close(result.ticks[0].top + result.ticks[0].height / 2, result.bars[0].track.top);
      close(result.ticks[3].top + result.ticks[3].height / 2, result.bars[0].track.bottom);
      for (let i = 1; i < 3; i++) close(result.ticks[i].top + result.ticks[i].height / 2, result.bars[0].track.top + max * i / 3);
      result.widths.forEach(col => close(col.width, { FINAL_ACTUAL: 115.2, FULL_FORECAST: 115.2, MIXED: 201.6, NO_DATA: 192 }[col.mode]));
    }
    check(current);
    const narrow = await measure(page, false, { width: 390, height: 900 }); check(narrow);
    console.log(JSON.stringify({ baseline, current, narrow }, null, 2));
    await page.setViewportSize({ width: 1000, height: 900 });
    await measure(page, false, { width: 1000, height: 900 });
    if (process.env.GEOMETRY_SCREENSHOT) await page.screenshot({ path: process.env.GEOMETRY_SCREENSHOT, fullPage: true });
    console.log('Overview/Consumption isolated production geometry regression passed (desktop + narrow).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
