/* Offline geometry regression using real JET 20.1.3 oj-button + Redwood.
 * No build/server/account/API required. The audited toolbar intrinsic heights
 * are replayed; this is component geometry evidence, not a deployed-page audit.
 * Run: NODE_PATH=/home/opc/tmp/kap-playwright/node_modules node tests/browser/consumptionReloadGeometry.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = process.cwd();
const pageCss = fs.readFileSync(path.join(root, 'src/components/content/ConsumptionReloadSpacing.css'), 'utf8');
const auditPath = process.env.RELOAD_AUDIT_REPORT || '/home/opc/engineering-evidence/kap-account-standard/reload-audit/report.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
for (const page of ['ConsumptionAnalysisPage', 'ConsumptionRecordsPage', 'ForecastActualPage']) {
  const source = fs.readFileSync(path.join(root, `src/components/content/${page}.tsx`), 'utf8');
  assert.match(source, /<link rel="stylesheet" href="components\/content\/ConsumptionReloadSpacing.css" \/>/);
  assert.match(source, /compactTimestampButton/);
}
assert.doesNotMatch(pageCss, /\.oj-button-(?:button|label|text)|!important|ResizeObserver/);
const paths = {
  ojs:'libs/oj/20.1.3/min', ojL10n:'libs/oj/20.1.3/ojL10n', ojtranslations:'libs/oj/20.1.3/resources',
  knockout:'libs/knockout/knockout-3.5.1', jquery:'libs/jquery/jquery-3.7.1.min',
  css:'libs/require-css/css.min', 'css-builder':'libs/require-css/css-builder', normalize:'libs/require-css/normalize',
  'jqueryui-amd':'libs/jquery/jqueryui-amd-1.14.1.min', text:'libs/require/text',
  hammerjs:'libs/hammer/hammer-2.0.8.min', signals:'libs/js-signals/signals.min',
  ojdnd:'libs/dnd-polyfill/dnd-polyfill-1.0.2.min',
  '@oracle/oraclejet-preact':'libs/oraclejet-preact/amd', preact:'libs/preact/dist/preact.umd',
  'preact/hooks':'libs/preact/hooks/dist/hooks.umd', 'preact/compat':'libs/preact/compat/dist/compat.umd',
  'preact/jsx-runtime':'libs/preact/jsx-runtime/dist/jsxRuntime.umd'
};
function fixture(record, height) {
  const records = record.page === 'Consumption Records';
  const forecast = record.page === 'Forecast vs Actual';
  const scope = records ? 'consumption-page' : `consumption-insights-page${forecast ? ' forecast-actual-page' : ''}`;
  const toolbar = `kap-data-control-bar consumption-records-toolbar${records ? '' : ' consumption-analysis-toolbar'}${forecast ? ' forecast-actual-data-toolbar' : ''}`;
  const activity = `<div class="consumption-records-toolbar-activity"><div class="kap-page-activity is-compact-timestamp" role="status" aria-live="polite"><span class="kap-page-activity__control-slot"><oj-button class="kap-page-activity__refresh oj-button-sm" chroming="outlined" aria-label="Reload"><span slot="startIcon" class="kap-page-activity__start-icon">↻</span><span class="kap-page-activity__separator">|</span><time class="kap-page-activity__completed-at">12:34:56</time></oj-button></span></div></div>`;
  // Replays left-content/min-row height from the production audit. Full page CSS,
  // actual wrappers and JET component govern the button, not a native-button mock.
  const controls = `<div class="${toolbar}" style="min-height:${height}px"><div class="consumption-records-toolbar__left" style="min-height:${height}px"><span>Show MTD</span><span>123 Accounts · 456 Plans</span></div>${activity}</div>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles/redwood/20.1.3/web/redwood.min.css"><link rel="stylesheet" href="styles/app.css"><style>body{margin:0}.kap-page-shell{height:auto!important}.kap-page-filter{height:100px}.kap-page-shell__body{flex:none}.result{height:100px}.consumption-records-toolbar__left{min-width:0}</style></head><body data-oj-binding-provider="none"><div class="kap-page-shell ${scope}"><div class="kap-page-shell__inner">${records ? '' : '<div class="kap-page-shell__masthead"><div class="kap-page-filter"></div></div>'}<div class="kap-page-shell__body">${records ? '<div class="kap-page-filter"></div>' : ''}${records ? `<section class="kpi-panel consumption-table-panel"><div class="consumption-section-heading consumption-table-heading">${controls}</div><div class="consumption-summary result"></div></section>` : `${controls}<section class="result"></section>`}</div></div></div><script src="libs/require/require.js"></script><script>require.config({baseUrl:'/',paths:${JSON.stringify(paths)}});require(['ojs/ojcontext','ojs/ojbutton'],function(Context){Context.getPageContext().getBusyContext().whenReady().then(function(){window.ready=true;});});</script></body></html>`;
}
(async () => {
  const browser = await chromium.launch({headless:true});
  const result = [];
  try {
    for (const record of audit.pages) {
      for (const height of [record.toolbar.rect.height, 96.5]) {
        const viewport = record.device === 'desktop' ? {width:1440,height:1000} : {width:393,height:852};
        const page = await browser.newPage({viewport});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
        page.on('requestfailed', request => console.error('Asset failed:', new URL(request.url()).pathname));
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:fixture(record,height)});
          let file = path.join(root,'web',decodeURIComponent(url.pathname));
          if (url.pathname.startsWith('/libs/oj/20.1.3/')) file = path.join(root,'node_modules/@oracle/oraclejet/dist/js/libs/oj',url.pathname.slice('/libs/oj/20.1.3/'.length));
          if (url.pathname.startsWith('/styles/redwood/20.1.3/web/')) file = path.join(root,'node_modules/@oracle/oraclejet/dist/css/redwood',url.pathname.slice('/styles/redwood/20.1.3/web/'.length).replace('redwood.min.css','oj-redwood-min.css'));
          if (url.pathname.startsWith('/libs/jquery/jqueryui-')) file = path.join(root,'node_modules/@oracle/oraclejet/dist/js',url.pathname);
          if (url.pathname === '/libs/jquery/jquery-3.7.1.min.js') file = path.join(root,'node_modules/jquery/dist/jquery.min.js');
          if (url.pathname === '/libs/hammer/hammer-2.0.8.min.js') file = path.join(root,'node_modules/hammerjs/hammer.min.js');
          if (url.pathname.startsWith('/libs/require-css/')) file = path.join(root,'node_modules/@oracle/oraclejet/dist/js',url.pathname);
          if (url.pathname === '/styles/app.css') file = path.join(root,'src/styles/app.css');
          if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.abort();
          return route.fulfill({path:file});
        });
        await page.goto('http://reload-fixture.test/');
        await page.waitForFunction(() => window.ready);
        await page.locator('oj-button button').waitFor();
        await page.addStyleTag({content:pageCss});
        for (const disabled of [false,true]) {
          await page.evaluate(disabled => {document.querySelector('oj-button').disabled=disabled;}, disabled);
          const geometry = await page.evaluate(() => {
            const r = el => el.getBoundingClientRect();
            const button = r(document.querySelector('oj-button button'));
            const filter = r(document.querySelector('.kap-page-filter'));
            const lower = r(document.querySelector('.result'));
            const toolbar = r(document.querySelector('.consumption-records-toolbar'));
            return {upper:button.top-filter.bottom,lower:lower.top-button.bottom,buttonHeight:button.height,toolbarHeight:toolbar.height};
          });
          assert.ok(Math.abs(geometry.upper-6)<=0.02, `${record.page}/${record.device}/${height} upper: ${JSON.stringify(geometry)}`);
          assert.ok(Math.abs(geometry.lower-6)<=0.02, `${record.page}/${record.device}/${height} lower: ${JSON.stringify(geometry)}`);
          assert.equal(geometry.buttonHeight,geometry.toolbarHeight);
          result.push({page:record.page,device:record.device,height,disabled,...geometry});
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
    console.log(JSON.stringify({passed:result.length,jet:'20.1.3',results:result},null,2));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
