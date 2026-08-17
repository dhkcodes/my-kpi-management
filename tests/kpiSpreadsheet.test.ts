import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KPI_TABS,
  KPI_FIELD_CONTRACTS,
  buildKpiSummary,
  createEmptyKpiRow,
  isKpiWriteContextCurrent,
  KpiSpreadsheetRow
} from "../src/data/kpiSpreadsheet";

assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityA", 3), true);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY26", "kpiActivityA", 3), false);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityB", 3), false);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityA", 4), false);

const pageSource = readFileSync("src/components/content/KpiSpreadsheetPage.tsx", "utf8");
assert.match(pageSource, /const \[saving, setSaving\] = useState\(false\)/, "KPI writes must have a submission lock");
assert.match(pageSource, /if \(!draft \|\| writeInFlightRef\.current\) return;/, "repeated submissions must be ignored synchronously");
assert.match(pageSource, /draftContext\.fiscalYear !== fiscalYear \|\| draftContext\.routeId !== routeId/, "stale drafts must be rejected before a request starts");
assert.match(pageSource, /draft\.fiscalYear !== fiscalYear/, "a stale fiscal-year row must not be saved");
assert.match(pageSource, /setRows\(\[\]\); setApiMessage\("Loading KPI activities/, "stale fiscal-year rows must be hidden during reload");
assert.match(pageSource, /draft\.kpiCode !== routedTab/, "a stale route tab must not save another KPI code");
assert.match(pageSource, /row\.fiscalYear !== fiscalYear[\s\S]{0,120}row\.kpiCode !== routedTab/, "a stale route tab must not delete another context's row");
assert.match(pageSource, /disabled=\{saving/, "write controls must be disabled while a mutation is active");
assert.match(pageSource, /onWriteStateChange\(true\)/, "the app shell must be told when a KPI write starts");
const appSource = readFileSync("src/components/app.tsx", "utf8");
assert.match(appSource, /kpiWriteActiveRef\.current\) \{\s*return false;/, "route changes must be blocked while a KPI write is active");
assert.match(appSource, /module === "kpiPage" && kpiWriteActiveRef\.current[\s\S]{0,100}return;/, "fiscal-year changes must be blocked while a KPI write is active");

assert.deepEqual(KPI_TABS, ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"]);
assert.equal(KPI_TABS.includes("G" as never), false, "KPI G must never be present");

for (const code of KPI_TABS.filter((tab) => tab !== "Overview")) {
  const fields = KPI_FIELD_CONTRACTS[code];
  assert.equal(fields[0]?.key, "manageTimeReflected", `${code} Manage Time must be first`);
  assert.equal(fields[fields.length - 1]?.key, "deliveryDate", `${code} Delivery Date must be final`);
  assert.equal(createEmptyKpiRow(code, "FY27").kpiCode, code);
}

const d1Keys = KPI_FIELD_CONTRACTS.D1.map((field) => field.key);
assert.ok(d1Keys.indexOf("targetQuarter") < d1Keys.indexOf("deliveryDate"));
assert.ok(d1Keys.indexOf("stage") < d1Keys.indexOf("acrK"));

const rows: KpiSpreadsheetRow[] = [
  { id: "c1-jun", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "C1", quarter: "Q1", month: "Jun", accountWorkload: "Synthetic Account / Analytics", title: "Workshop", srNumber: "SYN-1001", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-06-12" },
  { id: "c2-aug", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "C2", quarter: "Q1", month: "Aug", accountWorkload: "Synthetic Account / Database", title: "POC", srNumber: "SYN-1002", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-08-18" },
  { id: "d1-i", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q2", month: "", accountWorkload: "Synthetic Account / AI", title: "Pipeline", srNumber: "SYN-1003", stage: "identified", acrK: 600, targetQuarter: "Q2", deliveryDate: "2026-10-20" },
  { id: "d1-v", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q2", month: "", accountWorkload: "Synthetic Account / AI", title: "Validation", srNumber: "SYN-1004", stage: "validated", acrK: 350, targetQuarter: "Q2", deliveryDate: "2026-11-21" }
];
const summary = buildKpiSummary(rows);
assert.deepEqual(summary.monthly.C1.Q1, { Jun: 1, Jul: 0, Aug: 0, total: 1 });
assert.deepEqual(summary.monthly.C2.Q1, { Jun: 0, Jul: 0, Aug: 1, total: 1 });
assert.equal(summary.quarterly.C1.Q1, 1);
assert.equal(summary.quarterly.C2.Q1, 1);
assert.equal(summary.d1.Q2.identified, 600);
assert.equal(summary.d1.Q2.validated, 350);
assert.equal(summary.d1.Q2.onboarded, 0);

console.log("kpiSpreadsheet tests passed");
