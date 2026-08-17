import assert from "node:assert/strict";
import {
  KPI_TABS,
  KPI_FIELD_CONTRACTS,
  buildKpiSummary,
  createEmptyKpiRow,
  fiscalQuarterFromDeliveryDate,
  formatKpiWorkloadOption,
  getSelectedKpiRowIds,
  getKpiToolbarActions,
  isKpiDraftInvalid,
  isKpiFieldChanged,
  KpiSpreadsheetRow
} from "../src/data/kpiSpreadsheet";

assert.deepEqual(KPI_TABS, ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"]);
assert.equal(KPI_TABS.includes("G" as never), false, "KPI G must never be present");

assert.deepEqual(getKpiToolbarActions(0, 0), [], "default must hide all right-side actions");
assert.deepEqual(getKpiToolbarActions(1, 0), ["save", "cancel"], "Add/draft must expose Save and Cancel only");
assert.deepEqual(getKpiToolbarActions(0, 2), ["delete"], "selection-only must expose Delete only");

for (const code of KPI_TABS.filter((tab) => tab !== "Overview")) {
  const fields = KPI_FIELD_CONTRACTS[code];
  assert.equal(fields[0]?.key, "manageTimeReflected", `${code} Manage Time must be first`);
  assert.equal(fields[fields.length - 2]?.key, code === "D1" ? "targetQuarter" : "quarter", `${code} Target Quarter must be before Delivery Date`);
  assert.equal(fields[fields.length - 1]?.key, "deliveryDate", `${code} Delivery Date must be final`);
  assert.equal(createEmptyKpiRow(code, "FY27").kpiCode, code);
}

const d1Keys = KPI_FIELD_CONTRACTS.D1.map((field) => field.key);
assert.equal(d1Keys.includes("quarter"), false, "D1 must expose one Target Quarter only");
assert.ok(d1Keys.indexOf("stage") < d1Keys.indexOf("acrK"));

assert.equal(fiscalQuarterFromDeliveryDate("2026-06-01"), "Q1");
assert.equal(fiscalQuarterFromDeliveryDate("2026-08-31"), "Q1");
assert.equal(fiscalQuarterFromDeliveryDate("2026-09-01"), "Q2");
assert.equal(fiscalQuarterFromDeliveryDate("2027-03-31"), "Q4");
assert.equal(fiscalQuarterFromDeliveryDate(""), "");
assert.equal(formatKpiWorkloadOption({ workloadId: 7, accountName: "Acme", workloadName: "ERP", opptyNo: "OP-7" }), "Acme - ERP (OP-7)");
assert.equal(formatKpiWorkloadOption({ workloadId: 8, accountName: "Acme", workloadName: "Analytics", opptyNo: null }), "Acme - Analytics");

const rows: KpiSpreadsheetRow[] = [
  { id: "c1-jun", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "C1", quarter: "Q4", month: "Aug", accountWorkload: "Synthetic Account / Analytics", title: "Workshop", srNumber: "SYN-1001", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-06-12" },
  { id: "c2-aug", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "C2", quarter: "Q3", month: "Aug", accountWorkload: "Synthetic Account / Database", title: "POC", srNumber: "SYN-1002", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-08-18" },
  { id: "d1-i", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q4", month: "", accountWorkload: "Synthetic Account / AI", title: "Solution Design", srNumber: "SYN-1003", stage: "identified", acrK: 600, targetQuarter: "Q3", deliveryDate: "2026-10-20" },
  { id: "d1-v", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q4", month: "", accountWorkload: "Synthetic Account / AI", title: "Solution Proposal", srNumber: "SYN-1004", stage: "validated", acrK: 350, targetQuarter: "Q3", deliveryDate: "2026-11-21" }
];
const summary = buildKpiSummary(rows);
assert.deepEqual(summary.monthly.C1.Q1, { Jun: 1, Jul: 0, Aug: 0, total: 1 });
assert.deepEqual(summary.monthly.C2.Q1, { Jun: 0, Jul: 0, Aug: 1, total: 1 });
assert.equal(summary.quarterly.C1.Q1, 1, "stored Quarter must not control statistics");
assert.equal(summary.quarterly.C2.Q1, 1, "Delivery Date must control statistics");
assert.equal(summary.c1c2Combined.Q1.actual, 2);
assert.equal(summary.c1c2Combined.Q1.target, 6);
assert.equal(summary.d1.Q2.identified, 600, "D1 Delivery Date must control Q1-Q4 statistics");
assert.equal(summary.d1.Q2.validated, 350);
assert.equal(summary.d1.Q3.identified, 0, "D1 Target Quarter must not control statistics");
assert.equal(isKpiFieldChanged(rows[0], { ...rows[0], title: "Changed" }, "title"), true);
assert.equal(isKpiFieldChanged(rows[0], { ...rows[0] }, "title"), false);
assert.equal(isKpiDraftInvalid({ ...rows[0], deliveryDate: "" }, rows[0]), true, "clearing an existing Delivery Date must block Save");
assert.equal(isKpiDraftInvalid({ ...rows[0], id: "legacy", deliveryDate: "" }, { ...rows[0], id: "legacy", deliveryDate: "" }), false, "an unchanged legacy missing date must remain editable");
assert.equal(isKpiDraftInvalid(createEmptyKpiRow("A", "FY27")), true, "new rows require Delivery Date");
const addAll = { isAddAll: () => true, values: () => new Set<string>(), deletedValues: () => new Set(["row-2"]) };
assert.deepEqual(getSelectedKpiRowIds(addAll, ["row-1", "row-2", "row-3"]), ["row-1", "row-3"], "JET add-all selection must honor deleted keys");
const explicit = { isAddAll: () => false, values: () => new Set(["row-2"]), deletedValues: () => new Set<string>() };
assert.deepEqual(getSelectedKpiRowIds(explicit, ["row-1", "row-2"]), ["row-2"]);

console.log("kpiSpreadsheet tests passed");
