import { FiscalYearDataset, KpiOverviewQuarter, KpiOverviewRow, NewWorkloadQuarter, formatAmountK, quarters } from "./kpiCalculations";
import { KpiActivitySummary, KpiSummaryQuarter, KpiSummaryStage } from "./kpiSpreadsheetApi";
import { SpreadsheetKpiCode } from "./kpiSpreadsheet";
import { WorkloadStage } from "./kpiExcelParser";

const names: Record<SpreadsheetKpiCode, string> = {
  A: "Market Awareness",
  B: "Early Discovery with Customers",
  C1: "Workshops",
  C2: "POCs",
  D1: "New Workload",
  F: "Customer References",
  H: "Technical Blogs / Articles"
};
const stagePairs: ReadonlyArray<readonly [KpiSummaryStage, WorkloadStage, string]> = [
  ["IDENTIFIED", "identified", "Identified"],
  ["VALIDATED", "validated", "Validated"],
  ["ONBOARDED", "onboarded", "Onboarded"]
];

const countQuarter = (actual: number, target: number, quarter: KpiSummaryQuarter): KpiOverviewQuarter => ({
  quarter,
  status: actual >= target ? "Achieved" : "Not achieved",
  actual,
  target,
  unit: "count",
  displayActual: `${actual}`,
  displayTarget: `${target}`
});

export function buildLiveFiscalYearDataset(summary: KpiActivitySummary, base: FiscalYearDataset): FiscalYearDataset {
  const newWorkload: NewWorkloadQuarter[] = quarters.map((quarter) => {
    const metrics = stagePairs.map(([apiStage, stage, label]) => {
      const actualK = summary.d1QuarterByStage[quarter][apiStage].acrK;
      const targetK = summary.targets.d1AcrKPerQuarter[apiStage];
      return { stage, label, actualK, targetK, rate: targetK === 0 ? 0 : Math.round(actualK / targetK * 100), achieved: actualK >= targetK };
    });
    return { quarter, status: metrics.some((metric) => metric.achieved) ? "Achieved" : "Not achieved", metrics };
  });

  const countRows: KpiOverviewRow[] = (["A", "B", "F", "H"] as const).map((code) => {
    const target = summary.targets.countPerQuarter[code];
    const quarterRows = quarters.map((quarter) => countQuarter(summary.quarterCounts[code][quarter], target, quarter));
    return {
      code,
      codeBadge: code,
      name: names[code],
      unit: "count",
      quarters: quarterRows,
      fyActualDisplay: `${quarterRows.reduce((sum, item) => sum + item.actual, 0)}`,
      fyTargetDisplay: `${target * quarters.length}`
    };
  });
  const c1c2Quarters = quarters.map((quarter) => countQuarter(
    summary.quarterCounts.C1[quarter] + summary.quarterCounts.C2[quarter],
    summary.targets.c1C2CombinedPerQuarter,
    quarter
  ));
  const combined: KpiOverviewRow = {
    code: "C1+C2", codeBadge: "C1 + C2", name: "Workshops / POCs", unit: "count", quarters: c1c2Quarters,
    fyActualDisplay: `${c1c2Quarters.reduce((sum, item) => sum + item.actual, 0)}`,
    fyTargetDisplay: `${summary.targets.c1C2CombinedPerQuarter * quarters.length}`
  };
  const d1Quarters: KpiOverviewQuarter[] = newWorkload.map((item) => {
    const best = [...item.metrics].sort((left, right) => right.rate - left.rate)[0];
    return { quarter: item.quarter, status: item.status, actual: best.actualK, target: best.targetK, unit: "amount", displayActual: formatAmountK(best.actualK), displayTarget: formatAmountK(best.targetK) };
  });
  const d1: KpiOverviewRow = {
    code: "D1", codeBadge: "D1", name: names.D1, unit: "amount", quarters: d1Quarters,
    fyActualDisplay: formatAmountK(d1Quarters.reduce((sum, item) => sum + item.actual, 0)),
    fyTargetDisplay: formatAmountK(d1Quarters.reduce((sum, item) => sum + item.target, 0))
  };
  const byCode = new Map(countRows.map((row) => [row.code, row]));
  return {
    ...base,
    fiscalYear: summary.fiscalYear,
    sourceWorkbook: "KPI Activities API · Reflected Delivery Date statistics",
    overviewRows: [byCode.get("A")!, byCode.get("B")!, combined, d1, byCode.get("F")!, byCode.get("H")!],
    newWorkload
  };
}
