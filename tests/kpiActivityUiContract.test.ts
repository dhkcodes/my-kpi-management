import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve("src/components/content/KpiSpreadsheetPage.tsx"), "utf8");

const toolbarStart = page.indexOf('<div class="kpi-activity-toolbar"');
const toolbarEnd = page.indexOf("<Summary rows=", toolbarStart);
const toolbar = page.slice(toolbarStart, toolbarEnd);
assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
assert.match(toolbar, /kpi-activity-toolbar__left/);
assert.match(toolbar, /kpi-activity-toolbar__right/);
assert.ok(toolbar.indexOf("Add KPI Activity") < toolbar.indexOf(">Edit<"));
assert.ok(toolbar.indexOf(">Save<") < toolbar.indexOf(">Cancel<"));
assert.match(toolbar, /toolbarActions\.includes\("save"\).*Save/s, "Save DOM must follow the Add/Edit action state");
assert.match(toolbar, /toolbarActions\.includes\("cancel"\).*Cancel/s, "Cancel DOM must follow the Add/Edit action state");
assert.match(toolbar, /toolbarActions\.includes\("delete"\).*Delete/s, "Delete DOM must follow the selection-only action state");
assert.match(toolbar, /selectedRows\.length === 0/, "Edit must support one or more selected rows");
assert.doesNotMatch(page, /<th>Rows<\/th>/, "Overview must not expose a Rows column");
assert.match(page, /<th>KPI<\/th><th>Target<\/th><th>Summary model<\/th><th>Status<\/th>/, "Overview column order must match the latest contract");
assert.match(page, /overview\?\.target/, "Overview Target must come from the KPI API response");
assert.match(page, /Promise\.allSettled\(drafts\.map/s, "Save must apply to every selected edit draft and retain failed drafts");
assert.match(page, /selectedRows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/, "Edit must create drafts for all selected rows");
assert.match(page, /listKpiOverview/, "Overview must be backed by the KPI API");

console.log("kpiActivityUiContract tests passed");
