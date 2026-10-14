'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/content/AccountsWorkloadsPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/components/content/AccountsWorkloadsPage.css'), 'utf8');
const commonCss = fs.readFileSync(path.join(root, 'src/styles/app.css'), 'utf8');

function rule(selector) {
  const block = css.split(selector + ' {').at(-1).split('}')[0];
  assert.ok(css.includes(selector + ' {'), `Missing page-scoped rule: ${selector}`);
  return block;
}

// Source contracts: no server, saved data, API writes, or component internals.
test('the existing focusable page root owns both scroll axes; table wrappers grow with content', () => {
  const scroll = rule('.accounts-workloads-layout .kap-page-shell__scroll');
  assert.match(scroll, /overflow:\s*auto/);
  for (const selector of [
    '.accounts-workloads-layout .accounts-workloads-grid-wrap.accounts-workloads-grid-wrap--compact',
    '.accounts-workloads-layout .accounts-workloads-oppty-scroll',
  ]) {
    const block = rule(selector);
    assert.match(block, /overflow:\s*visible/);
    assert.match(block, /(?:^|\s)height:\s*auto/);
    assert.match(block, /max-height:\s*none/);
  }
  assert.match(source, /rows\.map\(\(\{ account, workload, key \}\)/);
  assert.match(css, /min-width:\s*1280px/);
  assert.match(commonCss, /min-width:\s*1900px/);
  assert.match(commonCss, /position:\s*sticky/);
  assert.match(source, /closest<HTMLElement>\(\s*"\.kap-page-shell__scroll"/);
  assert.doesNotMatch(css, /\.oj-table-(?:scroller|body)|::part\(/);
});
test('semantic field selectors align headers and values without coupling to column positions', () => {
  assert.match(source, /<th class=\{`is-\$\{field\}`\} data-aw-field=\{field\}>/);
  for (const field of ['salesRep', 'plan']) {
    assert.match(rule(`.accounts-workloads-layout .accounts-workloads-aw-grid [data-aw-field="${field}"]`), /text-align:\s*center/);
  }
  for (const field of ['arrUsd', 'acrUsd']) {
    assert.match(rule(`.accounts-workloads-layout .accounts-workloads-aw-grid [data-aw-field="${field}"]`), /text-align:\s*right/);
  }
});

test('Include Archived shares the left search group, retaining switch semantics and query locking', () => {
  const left = source.slice(source.indexOf('<div class="accounts-workloads-layout__search-group">'), source.indexOf('<div class="accounts-workloads-table-summary accounts-workloads-layout__fx">'));
  assert.match(left, /id="accountsWorkloadsSearch"/);
  assert.match(left, /Include Archived/);
  assert.match(left, /role="switch"/);
  assert.match(left, /aria-checked=\{includeDeleted\}/);
  assert.match(left, /disabled=\{dirty \|\| queryControlsDisabled\}/);
  assert.equal((source.match(/Include Archived/g) || []).length, 1);
  assert.ok(left.indexOf('</form>') < left.indexOf('role="switch"'), 'switch is outside the submit form');
});
