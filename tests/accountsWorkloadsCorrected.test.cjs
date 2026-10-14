'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const pagePath = 'src/components/content/AccountsWorkloadsPage.tsx';
const source = process.env.AWP_BASELINE === '1'
  ? require('node:child_process').execFileSync('git', ['show', `HEAD:${pagePath}`], {cwd: root, encoding: 'utf8'})
  : fs.readFileSync(path.join(root, pagePath), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/components/content/AccountsWorkloadsPage.css'), 'utf8');

// Execute the actual page-local callbacks, not a reimplementation. Browser/API
// dependencies are deliberately unavailable: a write attempt fails this suite.
function initializer(text, name) {
  const ast = ts.createSourceFile('isolated.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing callback ${name}`);
  return ts.transpile(`globalThis.subject = ${found};`, {target: ts.ScriptTarget.ES2020});
}
const fiscalSource = fs.readFileSync(path.join(root, 'src/data/accountManagementOverview.ts'), 'utf8');
function harness(deal) {
  let drafts = new Map([['draft:1', {key: 'draft:1', workloadId: 1, original: null, deal}]]);
  let error = '';
  let lockAttempts = 0;
  const sandbox = {
    canWrite: true,
    dealDraftsRef: {get current() {return drafts;}},
    dealSaveLock: {isLocked: () => false, tryStart: () => {lockAttempts++; throw new Error('Save boundary reached: no API is allowed');}},
    isDraftDeletedWorkload: () => false,
    isDealDraftChanged: () => true,
    setError: value => {error = value;},
    setSaveErrors: () => {},
    nullable: value => value.trim() || null,
    updateDealDrafts: updater => {drafts = updater(drafts);},
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(initializer(fiscalSource, 'fiscalPeriodForDate'), context);
  sandbox.fiscalPeriodForDate = sandbox.subject;
  vm.runInContext(initializer(source, 'updateDealDraft'), context);
  const update = sandbox.subject;
  vm.runInContext(initializer(source, 'saveDealDrafts'), context);
  return {update, save: sandbox.subject, deal: () => drafts.get('draft:1').deal, error: () => error, lockAttempts: () => lockAttempts};
}

test('toolbar has exactly Add, Save, Cancel, Archive, account count; reload is outside', () => {
  const toolbar = source.match(/<DataControlBar\b[\s\S]*?<\/DataControlBar>/)?.[0];
  assert.ok(toolbar);
  const labels = [];
  const ast = ts.createSourceFile('toolbar.tsx', toolbar, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'oj-button') {
      labels.push(node.children.map(child => child.getText(ast)).join('').trim());
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(labels, ['Add Account &amp; Workload', 'Save', 'Cancel', 'Archive']);
  assert.ok(toolbar.indexOf('Accounts</span>') > toolbar.indexOf('>Archive</oj-button>'));
  assert.ok(!toolbar.includes('PageActivity'));
  assert.ok(source.includes('class="oj-button-sm accounts-workloads-toolbar-add"'));
});
test('recommendations matches Consumption Forecast Import public JET button/icon treatment', () => {
  const actions = source.slice(source.indexOf('actions={'), source.indexOf('filters={'));
  assert.match(actions, /class="oj-button-sm"/);
  assert.match(actions, /chroming="outlined"/);
  assert.match(actions, /slot="startIcon" class="oj-ux-ico-upload"/);
  assert.match(actions, />\s*Account Recommendations\s*<\/oj-button>/);
});
test('loading locks query inputs and reuses fixed viewport progress', () => {
  for (const id of ['accountsWorkloadsSearch', 'accountRecommendationsSearch']) {
    const input = source.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.match(input, /disabled=\{queryControlsDisabled\}/);
  }
  assert.match(source, /if \(searchComposingRef.current \|\| queryControlsDisabled\) return/);
  assert.match(source, /<ConsumptionViewportProgress busy=\{queryControlsDisabled\}/);
  assert.match(css, /consumption-page-progress-controls \{[^}]*position: fixed/s);
  assert.match(css, /--consumption-viewport-center-y/);
});
test('warning/error channels remain visible, ordinary success is not emitted', () => {
  const banner = source.slice(source.indexOf('<AppMessageBanner'), source.indexOf('{saveErrors.length'));
  assert.match(banner, /severity: "error"/);
  assert.ok(!banner.includes('severity: "success"'));
  assert.match(source, /saveErrors\.length > 0/);
});
test('expansion/star alignment and right archived switch are page scoped', () => {
  assert.match(css, /accounts-workloads-expand-col,[\s\S]*accounts-workloads-highlight-col \{[^}]*text-align: center/);
  assert.match(css, /accounts-workloads-include-archived-switch \{\s*margin-inline-start: auto/);
  const switchInput = source.match(/<input[^>]*aria-checked=\{includeDeleted\}[^>]*>/)?.[0];
  assert.match(switchInput, /role="switch"/);
  assert.match(switchInput, /disabled=\{dirty \|\| queryControlsDisabled\}/);
});
for (const [date, fiscalYear, quarter] of [
  ['2026-05-31', 'FY26', 4], ['2026-06-01', 'FY27', 1],
  ['2026-09-01', 'FY27', 2], ['2026-12-01', 'FY27', 3], ['2027-03-01', 'FY27', 4]
]) {
  test(`Close Date ${date} derives ${fiscalYear} Q${quarter}, locks target until cleared`, () => {
    const h = harness({name: 'Isolated', status: 'OPEN', actualCloseDate: null, deleted: false});
    h.update('draft:1', 'actualCloseDate', date);
    assert.equal(h.deal().targetFiscalYear, fiscalYear);
    assert.equal(h.deal().targetQuarter, quarter);
    h.update('draft:1', 'target', 'FY99 Q4');
    assert.equal(h.deal().targetFiscalYear, fiscalYear);
    assert.equal(h.deal().targetQuarter, quarter);
    h.update('draft:1', 'actualCloseDate', '');
    assert.equal(h.deal().targetFiscalYear, null);
    assert.equal(h.deal().targetQuarter, null);
    h.update('draft:1', 'target', 'FY28 Q2');
    assert.equal(h.deal().targetFiscalYear, 'FY28');
    assert.equal(h.deal().targetQuarter, 2);
    assert.match(source, /disabled=\{Boolean\(effective.actualCloseDate\)\}/);
  });
}
for (const status of ['WON', 'LOST']) {
  test(`${status} requires Close Date before any save boundary`, async () => {
    const h = harness({name: 'Isolated', status, actualCloseDate: null, deleted: false});
    assert.equal(await h.save(), false);
    assert.match(h.error(), /Close Date/);
    assert.equal(h.lockAttempts(), 0);
    h.update('draft:1', 'actualCloseDate', '2026-10-14');
    await assert.rejects(h.save(), /Save boundary reached/);
    assert.equal(h.lockAttempts(), 1);
  });
}
test('OPEN does not add a Close Date requirement', async () => {
  const h = harness({name: 'Isolated', status: 'OPEN', actualCloseDate: null, deleted: false});
  await assert.rejects(h.save(), /Save boundary reached/);
  assert.equal(h.error(), '');
});
