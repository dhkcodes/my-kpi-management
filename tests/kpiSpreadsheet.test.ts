import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KPI_TABS,
  KPI_FIELD_CONTRACTS,
  applyManagedToSelection,
  buildKpiSummary,
  createEmptyKpiRow,
  fiscalQuarterFromDeliveryDate,
  formatKpiWorkloadOption,
  getSelectedKpiRowIds,
  getKpiToolbarActions,
  getReflectedSelectionAction,
  getQuarterStatus,
  getRowsForQuarter,
  isD1QuarterAchieved,
  isKpiDraftInvalid,
  isKpiFieldChanged,
  isKpiRowChanged,
  isKpiWriteContextCurrent,
  KpiSpreadsheetRow
} from "../src/data/kpiSpreadsheet";

assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityA", 3), true);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY26", "kpiActivityA", 3), false);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityB", 3), false);
assert.equal(isKpiWriteContextCurrent({ fiscalYear: "FY27", routeId: "kpiActivityA", generation: 3 }, "FY27", "kpiActivityA", 4), false);

const pageSource = readFileSync("src/components/content/KpiSpreadsheetPage.tsx", "utf8");
assert.match(pageSource, /const \[saving, setSaving\] = useState\(false\)/, "KPI writes must have a submission lock");
assert.match(pageSource, /if \(saving \|\| saveDisabled\) return false;/, "repeated submissions must be ignored synchronously");
assert.match(pageSource, /const saveSession = sessionVersion\.current[\s\S]*const saveSessionKey = sessionKeyRef\.current/, "writes must capture the active route and fiscal-year session");
assert.match(pageSource, /sessionVersion\.current !== saveSession \|\| sessionKeyRef\.current !== saveSessionKey/, "stale save responses must be rejected");
assert.match(pageSource, /sessionVersion\.current !== deleteSession \|\| sessionKeyRef\.current !== deleteSessionKey/, "stale delete responses must be rejected");
assert.match(pageSource, /setRows\(\[\]\); setOverviewItems\(\[\]\); setActivitySummary\(null\); setApiMessage\("Loading KPI activities/, "stale fiscal-year rows must be hidden during reload");
assert.match(pageSource, /disabled=\{saving/, "write controls must be disabled while a mutation is active");
assert.match(pageSource, /onWriteStateChange\(true\)/, "the app shell must be told when a KPI write starts");
assert.match(pageSource, /onWriteStateChange\(false\)/, "the app shell must be told when a KPI write settles");
const appSource = readFileSync("src/components/app.tsx", "utf8");
assert.match(appSource, /kpiWriteActiveRef\.current\) \{\s*return false;/, "route changes must be blocked while a KPI write is active");
assert.match(appSource, /module === "kpiPage" && kpiWriteActiveRef\.current[\s\S]{0,100}return;/, "fiscal-year changes must be blocked while a KPI write is active");

assert.deepEqual(KPI_TABS, ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"]);
assert.equal(KPI_TABS.includes("G" as never), false, "KPI G must never be present");

assert.deepEqual(getKpiToolbarActions(0, 0), [], "default must hide all right-side actions");
assert.deepEqual(getKpiToolbarActions(1, 0), ["save", "cancel"], "Add/draft must expose Save and Cancel only");
assert.deepEqual(getKpiToolbarActions(0, 2), ["delete"], "selection-only must expose Delete only");

for (const code of KPI_TABS.filter((tab) => tab !== "Overview")) {
  const fields = KPI_FIELD_CONTRACTS[code];
  assert.equal(fields[0]?.key, "manageTimeReflected", `${code} Manage Time must be first`);
  if (code === "D1") {
    assert.equal(fields[fields.length - 2]?.key, "targetQuarter", "D1 Target must be before Delivery Date");
    assert.equal(fields[fields.length - 2]?.label, "Target", "D1 must expose one combined Target SelectBox");
  }
  assert.equal(fields[fields.length - 1]?.key, "deliveryDate", `${code} Delivery Date must be final`);
  assert.equal(createEmptyKpiRow(code, "FY27").kpiCode, code);
}

const d1Keys = KPI_FIELD_CONTRACTS.D1.map((field) => field.key);
assert.equal(d1Keys.includes("quarter"), false, "D1 must expose one Target Quarter only");
assert.ok(d1Keys.indexOf("stage") < d1Keys.indexOf("acrK"));
assert.equal(KPI_FIELD_CONTRACTS.C1.some((item) => item.key === "month"), false, "C1 Month column must be removed");
assert.equal(KPI_FIELD_CONTRACTS.C2.some((item) => item.key === "month"), false, "C2 Month column must be removed");
for (const code of ["B", "C1", "C2"] as const) {
  assert.equal(KPI_FIELD_CONTRACTS[code].some((item) => item.key === "quarter" || item.key === "targetQuarter"), false, `${code} Target Quarter is UI-hidden`);
}
assert.equal(KPI_FIELD_CONTRACTS.A.find((item) => item.key === "manageTimeReflected")?.label, "Reflected", "the status column describes final internal-system reflection");
assert.equal(KPI_FIELD_CONTRACTS.A.some((item) => item.key === "quarter"), false, "A Target Quarter is UI-hidden");
assert.equal(KPI_FIELD_CONTRACTS.H.some((item) => item.key === "srNumber"), false, "H SR Number is UI-hidden");
assert.equal(KPI_FIELD_CONTRACTS.H.some((item) => item.key === "quarter" || item.key === "targetQuarter"), false, "H Target Quarter is UI-hidden");
assert.equal(KPI_FIELD_CONTRACTS.F.some((item) => item.key === "quarter" || item.key === "targetQuarter"), false, "F Target Quarter is UI-hidden");
assert.equal(KPI_FIELD_CONTRACTS.H.find((item) => item.key === "title")?.type, "textarea", "H Content must reuse the truncated long-text behavior");

assert.equal(fiscalQuarterFromDeliveryDate("2026-06-01"), "Q1");
assert.equal(fiscalQuarterFromDeliveryDate("2026-08-31"), "Q1");
assert.equal(fiscalQuarterFromDeliveryDate("2026-09-01"), "Q2");
assert.equal(fiscalQuarterFromDeliveryDate("2027-03-31"), "Q4");
assert.equal(fiscalQuarterFromDeliveryDate(""), "");
assert.equal(formatKpiWorkloadOption({ workloadId: 7, accountName: "Acme", workloadName: "ERP", opptyNo: "OP-7" }), "Acme - ERP (OP-7)");
assert.equal(formatKpiWorkloadOption({ workloadId: 8, accountName: "Acme", workloadName: "Analytics", opptyNo: null }), "Acme - Analytics");

const rows: KpiSpreadsheetRow[] = [
  { id: "c1-jun", manageTimeReflected: true, fiscalYear: "FY27", kpiCode: "C1", quarter: "Q4", month: "Aug", accountWorkload: "Synthetic Account / Analytics", title: "Workshop", srNumber: "SYN-1001", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-06-12" },
  { id: "c2-aug", manageTimeReflected: true, fiscalYear: "FY27", kpiCode: "C2", quarter: "Q3", month: "Aug", accountWorkload: "Synthetic Account / Database", title: "POC", srNumber: "SYN-1002", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-08-18" },
  { id: "c2-pending", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "C2", quarter: "Q1", month: "Jun", accountWorkload: "Synthetic Account / Pending", title: "Pending POC", srNumber: "SYN-PENDING", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-06-20" },
  { id: "d1-i", manageTimeReflected: true, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q4", month: "", accountWorkload: "Synthetic Account / AI", title: "Solution Design", srNumber: "SYN-1003", stage: "identified", acrK: 600, targetFiscalYear: "FY27", targetQuarter: "Q3", deliveryDate: "2026-10-20" },
  { id: "d1-v", manageTimeReflected: true, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q4", month: "", accountWorkload: "Synthetic Account / AI", title: "Solution Proposal", srNumber: "SYN-1004", stage: "validated", acrK: 350, targetFiscalYear: "FY27", targetQuarter: "Q3", deliveryDate: "2026-11-21" },
  { id: "d1-pending", manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "D1", quarter: "Q2", month: "", accountWorkload: "Synthetic Account / AI", title: "Solution Design", srNumber: "SYN-1005", stage: "identified", acrK: 5000, targetFiscalYear: "FY27", targetQuarter: "Q2", deliveryDate: "2026-10-22" }
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
assert.equal(summary.quarterly.C2.Q1, 1, "Pending rows must be excluded from KPI counts");
assert.equal(summary.d1.Q2.identified, 600, "Pending D1 ACR must be excluded from totals");
assert.deepEqual(getRowsForQuarter(rows, "Q1").map((row) => row.id), ["c1-jun", "c2-aug", "c2-pending"], "quarter filter uses Delivery Date and keeps pending rows visible");
assert.equal(getRowsForQuarter([createEmptyKpiRow("A", "FY27"), ...rows], "Q1")[0].id.startsWith("draft-"), true, "new rows stay visible above a selected Quarter filter");
assert.equal(getQuarterStatus("FY27", "Q1", 1, 1, "2026-08-17"), "Achieved");
assert.equal(getQuarterStatus("FY27", "Q1", 0, 1, "2026-08-17"), "In Progress");
assert.equal(getQuarterStatus("FY27", "Q1", 0, 1, "2026-09-01"), "Not Achieved");
assert.equal(getQuarterStatus("FY27", "Q2", 0, 1, "2026-08-17"), "Not Started");
assert.equal(isD1QuarterAchieved({ identified: 2000, validated: 0, onboarded: 0 }), true, "D1 Identified target alone must achieve the quarter");
assert.equal(isD1QuarterAchieved({ identified: 0, validated: 1000, onboarded: 0 }), true, "D1 Validated target alone must achieve the quarter");
assert.equal(isD1QuarterAchieved({ identified: 0, validated: 0, onboarded: 500 }), true, "D1 Onboarded target alone must achieve the quarter");
assert.equal(isD1QuarterAchieved({ identified: 1999, validated: 999, onboarded: 499 }), false, "D1 below all targets must not achieve the quarter");
assert.equal(isKpiFieldChanged(rows[0], { ...rows[0], title: "Changed" }, "title"), true);
assert.equal(isKpiFieldChanged(rows[0], { ...rows[0] }, "title"), false);
assert.equal(isKpiRowChanged(rows[0], { ...rows[0] }, KPI_FIELD_CONTRACTS.C1), false, "opening and closing an unchanged editor must not create a dirty draft");
assert.equal(isKpiRowChanged(rows[0], { ...rows[0], title: "Changed" }, KPI_FIELD_CONTRACTS.C1), true, "a real field change must remain dirty after the editor closes");
assert.equal(isKpiRowChanged(rows[0], { ...rows[0], workloadId: 999, accountWorkload: rows[0].accountWorkload }, KPI_FIELD_CONTRACTS.C1), true,
  "a stable workload identity change remains dirty even when the formatted label is identical");
assert.equal(isKpiDraftInvalid({ ...rows[0], deliveryDate: "" }, rows[0]), true, "clearing an existing Delivery Date must block Save");
assert.equal(isKpiDraftInvalid({ ...rows[0], id: "legacy", deliveryDate: "" }, { ...rows[0], id: "legacy", deliveryDate: "" }), true, "a Reflected row without Delivery Date must be invalid");
assert.equal(isKpiDraftInvalid(createEmptyKpiRow("A", "FY27")), false, "a new Pending row must be saveable with Manage Time only");
assert.equal(isKpiDraftInvalid({ ...createEmptyKpiRow("B", "FY27"), manageTimeReflected: true }), true, "Reflected new rows still require evidence fields");
assert.equal(isKpiDraftInvalid({ ...rows[0], manageTimeReflected: true, srNumber: "" }, rows[0]), true, "Reflected requires SR Number");
assert.equal(isKpiDraftInvalid({ ...rows[0], manageTimeReflected: true, deliveryDate: "" }, rows[0]), true, "Reflected requires Delivery Date");
assert.equal(isKpiDraftInvalid({ ...rows[0], id: "h-new", kpiCode: "H", manageTimeReflected: true, srNumber: "", deliveryDate: "2026-06-10" }), false, "Reflected H does not require the hidden SR Number field");
assert.equal(isKpiDraftInvalid({ ...rows[0], id: "h-new", kpiCode: "H", manageTimeReflected: true, srNumber: "", deliveryDate: "" }), true, "Reflected H still requires Delivery Date");
const addAll = { isAddAll: () => true, values: () => new Set<string>(), deletedValues: () => new Set(["row-2"]) };
assert.deepEqual(getSelectedKpiRowIds(addAll, ["row-1", "row-2", "row-3"]), ["row-1", "row-3"], "JET add-all selection must honor deleted keys");
const explicit = { isAddAll: () => false, values: () => new Set(["row-2"]), deletedValues: () => new Set<string>() };
assert.deepEqual(getSelectedKpiRowIds(explicit, ["row-1", "row-2"]), ["row-2"]);

const existingManaged = { ...rows[0], id: "existing-managed", manageTimeReflected: false };
const newManaged = { ...createEmptyKpiRow("A", "FY27"), id: "draft-a-managed" };
assert.deepEqual(applyManagedToSelection([existingManaged], [], [], true), [], "zero selection is a no-op");
assert.deepEqual(
  applyManagedToSelection([existingManaged], [], [existingManaged.id], true).map((row) => [row.id, row.manageTimeReflected]),
  [[existingManaged.id, true]],
  "one existing row becomes a draft"
);
const bulkManaged = applyManagedToSelection([existingManaged], [newManaged], [existingManaged.id, newManaged.id], true);
assert.deepEqual(bulkManaged.map((row) => [row.id, row.manageTimeReflected]), [[newManaged.id, true], [existingManaged.id, true]],
  "existing and new rows are updated together while preserving draft order");
assert.deepEqual(applyManagedToSelection([existingManaged], [{ ...existingManaged, manageTimeReflected: true }], [existingManaged.id], false), [],
  "reverting an existing row to its saved state removes the draft");
assert.equal(getReflectedSelectionAction([]), null, "zero selection hides the reflected action");
assert.deepEqual(getReflectedSelectionAction([{ ...existingManaged, manageTimeReflected: true }]), { managed: false, label: "Mark not reflected" });
assert.deepEqual(getReflectedSelectionAction([{ ...existingManaged, manageTimeReflected: false }]), { managed: true, label: "Mark reflected" });
assert.deepEqual(getReflectedSelectionAction([{ ...existingManaged, manageTimeReflected: true }, { ...newManaged, manageTimeReflected: false }]), { managed: true, label: "Mark reflected" },
  "mixed selection converges to Reflected");

console.log("kpiSpreadsheet tests passed");
