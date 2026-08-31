import assert from "node:assert/strict";
import {
  buildKpiActivitiesOverview,
  buildFyScopedKpiSummary,
  classifyDeliveryDate,
  filterKpiOverviewRows
} from "../src/data/kpiOverviewMetrics";
import { KpiActivitySummary } from "../src/data/kpiSpreadsheetApi";
import { KpiSpreadsheetRow, SpreadsheetKpiCode } from "../src/data/kpiSpreadsheet";
import { FiscalYear } from "../src/data/kpiExcelParser";
import { buildLiveFiscalYearDataset } from "../src/data/kpiLiveDashboard";
import { fiscalYearData } from "../src/data/kpiMockData";

const summaryPolicy = (fiscalYear: FiscalYear): KpiActivitySummary => ({
  fiscalYear,
  quarterCounts: Object.fromEntries(["A", "B", "C1", "C2", "D1", "F", "H"].map((code) => [code, { Q1: 99, Q2: 99, Q3: 99, Q4: 99 }])) as KpiActivitySummary["quarterCounts"],
  c1C2Monthly: Object.fromEntries(["Q1", "Q2", "Q3", "Q4"].map((quarter) => [quarter, { C1: {}, C2: {} }])) as KpiActivitySummary["c1C2Monthly"],
  d1QuarterByStage: Object.fromEntries(["Q1", "Q2", "Q3", "Q4"].map((quarter) => [quarter, {
    IDENTIFIED: { count: 99, acrK: 9999 }, VALIDATED: { count: 99, acrK: 9999 }, ONBOARDED: { count: 99, acrK: 9999 }
  }])) as KpiActivitySummary["d1QuarterByStage"],
  targets: {
    countPerQuarter: { A: 1, B: 12, F: 1, H: 1 },
    c1C2CombinedPerQuarter: 6,
    d1AcrKPerQuarter: { IDENTIFIED: 2000, VALIDATED: 1000, ONBOARDED: 500 },
    labels: { A: "1", B: "12", C1: "6", C2: "6", D1: "ACR", F: "1", H: "1" }
  }
});

let id = 0;
const row = (fiscalYear: FiscalYear, kpiCode: SpreadsheetKpiCode, deliveryDate: string, reflected = true, extra: Partial<KpiSpreadsheetRow> = {}): KpiSpreadsheetRow => ({
  id: `row-${++id}`, fiscalYear, kpiCode, deliveryDate, manageTimeReflected: reflected,
  quarter: "Q1", month: "", accountWorkload: "", title: "", srNumber: "SR", stage: "", acrK: null, targetQuarter: "", ...extra
});

assert.equal(classifyDeliveryDate("", "FY26"), "missing");
assert.equal(classifyDeliveryDate("2026-02-30", "FY26"), "invalid");
assert.equal(classifyDeliveryDate("", "FY26", "legacy-date"), "invalid", "API deliveryDateRaw distinguishes malformed legacy values from missing dates");
assert.equal(classifyDeliveryDate("2026-06-01", "FY26"), "out-of-fy");
assert.equal(classifyDeliveryDate("2025-06-01", "FY26"), "valid");
assert.equal(classifyDeliveryDate("2026-05-31", "FY26"), "valid");

const fy26Rows: KpiSpreadsheetRow[] = [
  row("FY26", "A", "2025-06-10"),
  row("FY26", "A", "2026-06-10"),
  ...Array.from({ length: 6 }, (_, index) => row("FY26", index % 2 === 0 ? "C1" : "C2", `2025-07-${String(index + 1).padStart(2, "0")}`)),
  row("FY26", "D1", "2025-08-20", true, { stage: "validated", acrK: 1000, targetQuarter: "Q1" }),
  row("FY26", "H", "2025-08-21"),
  row("FY26", "B", "2025-08-22", false),
  row("FY26", "B", "", false),
  row("FY26", "B", "2025-02-30", false),
  row("FY26", "B", "2006-05-25", false)
];
const policy26 = summaryPolicy("FY26");
const scoped26 = buildFyScopedKpiSummary(fy26Rows, "FY26", policy26);
assert.equal(scoped26.quarterCounts.A.Q1, 1, "out-of-FY reflected rows must not enter quarter counts");
assert.equal(scoped26.quarterCounts.C1.Q1 + scoped26.quarterCounts.C2.Q1, 6);
assert.equal(scoped26.d1QuarterByStage.Q1.VALIDATED.acrK, 1000);

const metrics26 = buildKpiActivitiesOverview(fy26Rows, "FY26", policy26, "2026-08-23");
assert.deepEqual(metrics26.quarterlyTargetAchievement, { achieved: 4, total: 24, rate: 16.7 });
assert.deepEqual(metrics26.reflectedCompletion, { reflected: 10, total: 14, rate: 71.4 });
assert.equal(metrics26.overduePending.count, 1, "only valid in-FY pending dates enter overdue");
assert.deepEqual(metrics26.dateIntegrity, { total: 4, missing: 1, invalid: 1, outOfFiscalYear: 2 });
assert.deepEqual(filterKpiOverviewRows(fy26Rows, "FY26", policy26, "2026-08-23", "overdue").map((item) => item.row.id), [fy26Rows[10].id]);
assert.deepEqual(filterKpiOverviewRows(fy26Rows, "FY26", policy26, "2026-08-23", "date-integrity").map((item) => item.integrity), ["out-of-fy", "missing", "invalid", "out-of-fy"]);
assert.equal(filterKpiOverviewRows(fy26Rows, "FY26", policy26, "2026-08-23", "target-achieved").some((item) => item.row.deliveryDate === "2026-06-10"), false);

const fy27Rows = [
  row("FY27", "A", "2026-06-10"),
  row("FY27", "H", "2026-09-10")
];
const metrics27 = buildKpiActivitiesOverview(fy27Rows, "FY27", summaryPolicy("FY27"), "2026-08-23");
assert.deepEqual(metrics27.quarterlyTargetAchievement, { achieved: 1, total: 24, rate: 4.2 }, "future FY27 quarters stay Not Started even when future-dated rows exist");
assert.equal(metrics27.dateIntegrity.total, 0);

const liveSummary = summaryPolicy("FY27");
liveSummary.quarterCounts.C1.Q1 = 4;
liveSummary.quarterCounts.C2.Q1 = 1;
const combinedHomeRow = buildLiveFiscalYearDataset(liveSummary, fiscalYearData.FY27).overviewRows
  .find((item) => item.code === "C1+C2")!;
assert.equal(combinedHomeRow.name, "Workshops & PoCs");
assert.deepEqual(
  { actual: combinedHomeRow.quarters[0].displayActual, target: combinedHomeRow.quarters[0].displayTarget },
  { actual: "5", target: "6" },
  "Home keeps the atomic C1=4 and C2=1 summary as one 5 / 6 combined KPI"
);

console.log("kpiOverviewMetrics tests passed");
