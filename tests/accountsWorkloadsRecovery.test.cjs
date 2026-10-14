const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const page = readFileSync('src/components/content/AccountsWorkloadsPage.tsx', 'utf8');
const css = readFileSync('src/components/content/AccountsWorkloadsPage.css', 'utf8');
const controls = page.slice(page.indexOf('<DataControlBar className="accounts-workloads-layout__controls"'), page.indexOf('<div class="accounts-workloads-grid-wrap'));
test('restore branded native Add and primary Save without new JET toolbar chroming', () => {
  assert.match(controls, /<button[\s\S]*?class="accounts-workloads-add-aw"[\s\S]*?onClick=\{addAw\}/);
  assert.match(controls, /class="accounts-workloads-button accounts-workloads-button--primary"/);
  assert.doesNotMatch(controls, /<oj-button/);
});
test('draft and selection actions use original visibility guards, not permanent disabled buttons', () => {
  assert.match(controls, /\{savableAwDraftCount > 0 && \(/);
  assert.match(controls, /\{dirty && \(/);
  assert.match(controls, /\{selectedCount > 0 && !editCell && !dirty && selectedArchivedCount > 0 && \(/);
  assert.match(controls, /\{selectedCount > 0 && !editCell && \(selectedArchivedCount === 0 \|\| !dirty\) && \(/);
  assert.match(controls, /selectedDraftCount === selectedCount[\s\S]*?"Discard Draft"/);
});
test('single control row keeps Add Save Cancel Archive count order and activity beside it', () => {
  const order = ['onClick={addAw}', 'openActionConfirmation("save")', 'openActionConfirmation("cancel")', 'onClick={deleteSelected}', 'accounts-workloads-layout__account-count', '<PageActivity'];
  const indexes = order.map(token => controls.indexOf(token));
  assert.ok(indexes.every((n, i) => n >= 0 && (i === 0 || n > indexes[i - 1])), String(indexes));
  assert.ok(controls.indexOf('<PageActivity') < controls.indexOf('</DataControlBar>'));
  assert.doesNotMatch(page.slice(page.indexOf('<ConsumptionViewportProgress busy={queryControlsDisabled}'), page.indexOf('<DataControlBar className="accounts-workloads-layout__controls"')), /<PageActivity/);
});
test('right-hand Include Archived switch and original recommendation icon remain', () => {
  const filters = page.slice(page.indexOf('filters={'), page.indexOf('</PageFilterPanel>'));
  assert.ok(filters.indexOf('accounts-workloads-layout__fx') < filters.indexOf('accounts-workloads-include-archived-switch'));
  assert.match(filters, /role="switch"/);
  assert.match(filters, /<span>Include Archived<\/span>\s*<span class="accounts-workloads-switch"/);
  assert.match(page.slice(page.indexOf('actions={'), page.indexOf('filters={')), /slot="startIcon" class="oj-ux-ico-plus"/);
});
test('expansion and star buttons center within full application-owned cells', () => {
  for (const name of ['expand', 'highlight']) {
    assert.match(page, new RegExp(`<th class="accounts-workloads-${name}-col"`));
    assert.match(page, new RegExp(`<td class="accounts-workloads-${name}-col"`));
  }
  assert.match(css, /\.accounts-workloads-expand-col > button,[\s\S]*?\.accounts-workloads-highlight-col > button \{[^}]*display: inline-flex;[^}]*width: 100%;/);
  assert.match(css, /\.accounts-workloads-highlight-col > button \{[^}]*align-items: center;/);
  assert.match(css, /float: none;/);
  assert.match(page, /<th class="accounts-workloads-highlight-col">★<\/th>/);
});
