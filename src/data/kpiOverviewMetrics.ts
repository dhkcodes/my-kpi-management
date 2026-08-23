import { FiscalYear, Quarter } from "./kpiExcelParser";
import { getQuarterStatus, KpiSpreadsheetRow, SpreadsheetKpiCode } from "./kpiSpreadsheet";
import {
  KpiActivitySummary,
  KPI_SUMMARY_CODES,
  KPI_SUMMARY_QUARTERS,
  KPI_SUMMARY_STAGES,
  KpiSummaryQuarter,
  KpiSummaryStage
} from "./kpiSpreadsheetApi";

export type DeliveryDateIntegrity = "valid" | "missing" | "invalid" | "out-of-fy";
export type KpiOverviewFilter = "target-achieved" | "reflected" | "overdue" | "date-integrity";
export type FilteredKpiOverviewRow = Readonly<{ row: KpiSpreadsheetRow; integrity: DeliveryDateIntegrity }>;

const rate = (numerator: number, denominator: number) => denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;

export const fiscalYearRange = (fiscalYear: FiscalYear): readonly [string, string] => {
  const endYear = 2000 + Number(fiscalYear.slice(2));
  return [`${endYear - 1}-06-01`, `${endYear}-05-31`];
};

const isRealIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const classifyDeliveryDate = (deliveryDate: string, fiscalYear: FiscalYear, deliveryDateRaw = ""): DeliveryDateIntegrity => {
  const value = deliveryDate.trim();
  if (!value) return deliveryDateRaw.trim() ? "invalid" : "missing";
  if (!isRealIsoDate(value)) return "invalid";
  const [start, end] = fiscalYearRange(fiscalYear);
  return value < start || value > end ? "out-of-fy" : "valid";
};

const quarterFromValidDate = (deliveryDate: string): KpiSummaryQuarter => {
  const month = Number(deliveryDate.slice(5, 7));
  if (month >= 6 && month <= 8) return "Q1";
  if (month >= 9 && month <= 11) return "Q2";
  if (month === 12 || month <= 2) return "Q3";
  return "Q4";
};

const emptyQuarterCounts = () => Object.fromEntries(KPI_SUMMARY_CODES.map((code) => [
  code,
  Object.fromEntries(KPI_SUMMARY_QUARTERS.map((quarter) => [quarter, 0]))
])) as KpiActivitySummary["quarterCounts"];

const emptyMonthly = () => Object.fromEntries(KPI_SUMMARY_QUARTERS.map((quarter) => [quarter, { C1: {}, C2: {} }])) as KpiActivitySummary["c1C2Monthly"];

const emptyD1 = () => Object.fromEntries(KPI_SUMMARY_QUARTERS.map((quarter) => [quarter,
  Object.fromEntries(KPI_SUMMARY_STAGES.map((stage) => [stage, { count: 0, acrK: 0 }]))
])) as KpiActivitySummary["d1QuarterByStage"];

export function buildFyScopedKpiSummary(
  rows: readonly KpiSpreadsheetRow[],
  fiscalYear: FiscalYear,
  sourceSummary: KpiActivitySummary
): KpiActivitySummary {
  const quarterCounts = emptyQuarterCounts();
  const c1C2Monthly = emptyMonthly();
  const d1QuarterByStage = emptyD1();
  for (const row of rows) {
    if (row.fiscalYear !== fiscalYear || !row.manageTimeReflected || classifyDeliveryDate(row.deliveryDate, fiscalYear, row.deliveryDateRaw) !== "valid") continue;
    const quarter = quarterFromValidDate(row.deliveryDate);
    quarterCounts[row.kpiCode][quarter] += 1;
    if (row.kpiCode === "C1" || row.kpiCode === "C2") {
      const month = row.deliveryDate.slice(0, 7);
      c1C2Monthly[quarter][row.kpiCode][month] = (c1C2Monthly[quarter][row.kpiCode][month] ?? 0) + 1;
    }
    if (row.kpiCode === "D1" && row.stage) {
      const stage = row.stage.toUpperCase() as KpiSummaryStage;
      if ((KPI_SUMMARY_STAGES as readonly string[]).includes(stage)) {
        const current = d1QuarterByStage[quarter][stage];
        d1QuarterByStage[quarter][stage] = { count: current.count + 1, acrK: current.acrK + (row.acrK ?? 0) };
      }
    }
  }
  return { fiscalYear, quarterCounts, c1C2Monthly, d1QuarterByStage, targets: sourceSummary.targets };
}

const portfolioUnits: readonly SpreadsheetKpiCode[] = ["A", "B", "C1", "D1", "F", "H"];

const isUnitAchieved = (
  summary: KpiActivitySummary,
  code: SpreadsheetKpiCode,
  quarter: KpiSummaryQuarter,
  fiscalYear: FiscalYear,
  asOf: string
) => {
  let actual = 0;
  let target = 1;
  if (code === "D1") {
    const byStage = summary.d1QuarterByStage[quarter];
    actual = KPI_SUMMARY_STAGES.some((stage) => byStage[stage].acrK >= summary.targets.d1AcrKPerQuarter[stage]) ? 1 : 0;
  } else if (code === "C1") {
    actual = summary.quarterCounts.C1[quarter] + summary.quarterCounts.C2[quarter];
    target = summary.targets.c1C2CombinedPerQuarter;
  } else {
    actual = summary.quarterCounts[code][quarter];
    target = summary.targets.countPerQuarter[code as keyof typeof summary.targets.countPerQuarter];
  }
  return getQuarterStatus(fiscalYear, quarter as Quarter, actual, target, asOf) === "Achieved";
};

const achievedUnitKeys = (summary: KpiActivitySummary, fiscalYear: FiscalYear, asOf: string) => new Set(
  portfolioUnits.flatMap((code) => KPI_SUMMARY_QUARTERS
    .filter((quarter) => isUnitAchieved(summary, code, quarter, fiscalYear, asOf))
    .map((quarter) => `${code}:${quarter}`))
);

export function buildKpiActivitiesOverview(
  rows: readonly KpiSpreadsheetRow[],
  fiscalYear: FiscalYear,
  sourceSummary: KpiActivitySummary,
  asOf: string
) {
  const activeRows = rows.filter((row) => row.fiscalYear === fiscalYear);
  const strictSummary = buildFyScopedKpiSummary(activeRows, fiscalYear, sourceSummary);
  const achieved = achievedUnitKeys(strictSummary, fiscalYear, asOf).size;
  const reflected = activeRows.filter((row) => row.manageTimeReflected).length;
  const overdue = activeRows.filter((row) => !row.manageTimeReflected
    && classifyDeliveryDate(row.deliveryDate, fiscalYear, row.deliveryDateRaw) === "valid"
    && row.deliveryDate < asOf).length;
  const integrity = activeRows.map((row) => classifyDeliveryDate(row.deliveryDate, fiscalYear, row.deliveryDateRaw));
  const missing = integrity.filter((value) => value === "missing").length;
  const invalid = integrity.filter((value) => value === "invalid").length;
  const outOfFiscalYear = integrity.filter((value) => value === "out-of-fy").length;
  return {
    strictSummary,
    quarterlyTargetAchievement: { achieved, total: portfolioUnits.length * KPI_SUMMARY_QUARTERS.length, rate: rate(achieved, portfolioUnits.length * KPI_SUMMARY_QUARTERS.length) },
    reflectedCompletion: { reflected, total: activeRows.length, rate: rate(reflected, activeRows.length) },
    overduePending: { count: overdue },
    dateIntegrity: { total: missing + invalid + outOfFiscalYear, missing, invalid, outOfFiscalYear }
  } as const;
}

export function filterKpiOverviewRows(
  rows: readonly KpiSpreadsheetRow[],
  fiscalYear: FiscalYear,
  sourceSummary: KpiActivitySummary,
  asOf: string,
  filter: KpiOverviewFilter
): FilteredKpiOverviewRow[] {
  const activeRows = rows.filter((row) => row.fiscalYear === fiscalYear);
  const strictSummary = buildFyScopedKpiSummary(activeRows, fiscalYear, sourceSummary);
  const achieved = achievedUnitKeys(strictSummary, fiscalYear, asOf);
  return activeRows.flatMap((row) => {
    const integrity = classifyDeliveryDate(row.deliveryDate, fiscalYear, row.deliveryDateRaw);
    if (filter === "reflected") return row.manageTimeReflected ? [{ row, integrity }] : [];
    if (filter === "overdue") return !row.manageTimeReflected && integrity === "valid" && row.deliveryDate < asOf ? [{ row, integrity }] : [];
    if (filter === "date-integrity") return integrity !== "valid" ? [{ row, integrity }] : [];
    if (!row.manageTimeReflected || integrity !== "valid") return [];
    const quarter = quarterFromValidDate(row.deliveryDate);
    const unit = row.kpiCode === "C2" ? "C1" : row.kpiCode;
    return achieved.has(`${unit}:${quarter}`) ? [{ row, integrity }] : [];
  });
}
