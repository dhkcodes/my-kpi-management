import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  computeKpiColumnLayout,
  createKpiActivityEditState,
  nextKpiSort,
  sortKpiActivityRows,
  transitionKpiActivityEdit
} from "../src/data/kpiActivityGridModel";
import { KPI_FIELD_CONTRACTS, KpiSpreadsheetRow } from "../src/data/kpiSpreadsheet";

const row = (id: string, title: string, reflected = false): KpiSpreadsheetRow => ({
  id,
  manageTimeReflected: reflected,
  fiscalYear: "FY27",
  kpiCode: "A",
  quarter: "Q1",
  month: "",
  accountWorkload: "",
  workloadId: null,
  mappingStatus: "NOT_REQUIRED",
  title,
  srNumber: id,
  stage: "",
  acrK: null,
  targetQuarter: "",
  deliveryDate: ""
});

let state = createKpiActivityEditState();
assert.equal(state.phase, "view");
state = transitionKpiActivityEdit(state, { type: "begin", cell: { rowId: "r1", field: "title" }, value: "Saved" });
assert.equal(state.phase, "editing");
assert.equal(state.generation, 1);
state = transitionKpiActivityEdit(state, { type: "input", value: "Draft", hasOtherDrafts: false });
assert.equal(state.phase, "dirty");
assert.equal(state.value, "Draft");
state = transitionKpiActivityEdit(state, { type: "input", value: "Saved", hasOtherDrafts: false });
assert.equal(state.phase, "editing", "returning to the original value must not remain dirty");
state = transitionKpiActivityEdit(state, { type: "input", value: "Draft", hasOtherDrafts: false });
state = transitionKpiActivityEdit(state, { type: "finish", hasDrafts: true });
assert.equal(state.phase, "dirty");
assert.equal(state.cell, null);
state = transitionKpiActivityEdit(state, { type: "save" });
assert.equal(state.phase, "saving");
const blocked = transitionKpiActivityEdit(state, { type: "begin", cell: { rowId: "r2", field: "srNumber" }, value: "2" });
assert.deepEqual(blocked, state, "saving must block another edit session");
state = transitionKpiActivityEdit(state, { type: "reset" });
state = transitionKpiActivityEdit(state, { type: "cancel" });
assert.equal(state.phase, "cancelling");
state = transitionKpiActivityEdit(state, { type: "reset" });
assert.equal(state.phase, "view");

const source = [row("2", "Beta", true), row("draft-a-1", "Zulu"), row("1", "Alpha")];
const ascending = sortKpiActivityRows(source, { field: "title", direction: "asc" });
assert.deepEqual(ascending.map((item) => item.id), ["draft-a-1", "1", "2"], "new draft rows stay first while saved rows sort stably");
assert.deepEqual(source.map((item) => item.id), ["2", "draft-a-1", "1"], "sorting must not mutate the source collection");
assert.deepEqual(nextKpiSort(null, "title"), { field: "title", direction: "asc" });
assert.deepEqual(nextKpiSort({ field: "title", direction: "asc" }, "title"), { field: "title", direction: "desc" });

for (const [code, fields] of Object.entries(KPI_FIELD_CONTRACTS)) {
  const narrow = computeKpiColumnLayout(fields, 860);
  const wide = computeKpiColumnLayout(fields, 1280);
  assert.equal(narrow.selectorWidth, 52, `${code} selector width`);
  assert.equal(Object.keys(narrow.widths).length, fields.length, `${code} every data field has a width`);
  assert.ok(wide.totalWidth >= narrow.totalWidth, `${code} layout grows with available width`);
  for (const field of fields) assert.ok((narrow.widths[field.key] ?? 0) >= 88, `${code}.${field.key} remains usable`);
}

const page = fs.readFileSync(path.resolve("src/components/content/KpiSpreadsheetPage.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("src/styles/app.css"), "utf8");

assert.match(page, /editMode="none"/, "KPI Activities must not delegate editor lifetime to cached JET cellEdit renderers");
assert.doesNotMatch(page, /onojBeforeEdit|onojBeforeEditEnd|_ojBridge|resizeColWidth|editEndingRef|pendingProgrammaticEditRef/,
  "retired cached-editor and private resize lifecycle must be removed");
assert.match(page, /data-kpi-single-editor/, "one page-owned editor overlay must be the only editable DOM surface");
assert.match(page, /KpiActivityEditState|transitionKpiActivityEdit/, "the explicit edit state contract must drive the page");
assert.match(page, /id={`kpi-workload-launcher-\$\{state\.generation\}`}/,
  "each workload edit generation must own one concrete launcher");
assert.match(page, /getBoundingClientRect\(\)[\s\S]*width <= 0[\s\S]*popup\.open/,
  "workload results may open only after the real launcher has non-zero geometry");
assert.match(page, /oj-progress-circle[\s\S]*Saving KPI activities/, "Save must expose a modal progress dialog");
assert.match(page, /Save changes[\s\S]*Discard changes[\s\S]*Keep editing/,
  "Cancel confirmation must provide save, discard, and keep-editing choices");
assert.match(page, /kpi-grid-sort-button/, "sortable headers must use the public column header template");
assert.match(styles, /\.kpi-grid-cell\.is-unsaved-cell::after[\s\S]*bottom:\s*0[\s\S]*height:\s*2px/,
  "dirty cells must use the Accounts & Workloads-style bottom draft line");
assert.match(styles, /\.kpi-grid-sort-button[\s\S]*color:\s*#8b3a2f/,
  "public header-template controls must own the Redwood title color");
assert.match(styles, /\.kpi-cell-editor-overlay--textarea[\s\S]*min-height:\s*8rem[\s\S]*padding:\s*\.75rem[\s\S]*overflow:\s*auto/,
  "textarea overlay must provide visible multiline value, padding, and internal scroll");

console.log("kpiActivityEditArchitecture tests passed");
