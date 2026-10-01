import type { ForecastActualMonth, ForecastActualRow } from "./consumptionApi";
import {
  addExactDecimals,
  compareExactDecimals,
  divideExactDecimal,
  multiplyExactDecimalByInteger,
  subtractExactDecimals
} from "./exactDecimal";
import { forecastActualPeriodsLatestFirst } from "./forecastActualSort";

export type ForecastActualProblemFilter = "FINAL_SHORTFALL" | "MTD_SHORTFALL";
export type ForecastActualAssessmentKind = "NORMAL" | "FINAL_SHORTFALL" | "MTD_SHORTFALL" | "UNCONFIRMED" | "UNAVAILABLE";

export type ForecastActualMonthAssessment = Readonly<{
  kind: ForecastActualAssessmentKind;
  label: "On track" | "Final shortfall" | "Projected on track" | "Projected shortfall" | "Unconfirmed" | "Not comparable";
  differenceAmount: string | null;
  differenceLabel: "Difference" | "Not comparable";
  projectedAmount: string | null;
  projectedDifferenceAmount: string | null;
  tooltip: string;
}>;

export type ForecastActualTotals = Readonly<{
  totalAmount: string | null;
  confirmedAmount: string | null;
  mtdAmount: string | null;
  includesMtd: boolean;
  hasActual: boolean;
}>;

const compareToZero = (value: string): number => compareExactDecimals(value, "0");
const unavailable = (tooltip: string, differenceAmount: string | null = null): ForecastActualMonthAssessment => ({
  kind: "UNAVAILABLE",
  label: "Not comparable",
  differenceAmount,
  differenceLabel: differenceAmount === null ? "Not comparable" : "Difference",
  projectedAmount: null,
  projectedDifferenceAmount: null,
  tooltip
});

const fiscalPeriodCalendarDate = (periodKey: string): Readonly<{ year: number; month: number }> | null => {
  const match = /^FY(\d{2}|\d{4})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/u.exec(periodKey);
  if (!match) return null;
  const monthByCode: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
  };
  const fiscalEndYear = match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1]);
  const month = monthByCode[match[2]];
  return { year: month >= 6 ? fiscalEndYear - 1 : fiscalEndYear, month };
};

const effectiveMtdDate = (
  periodKey: string,
  actualAsOf: string | null
): Readonly<{ iso: string; elapsedDays: number; daysInMonth: number; remainingDays: number }> | null => {
  if (!actualAsOf) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(actualAsOf);
  const period = fiscalPeriodCalendarDate(periodKey);
  if (!match || !period) return null;
  const statedYear = Number(match[1]);
  const statedMonth = Number(match[2]);
  const statedDay = Number(match[3]);
  const statedDate = new Date(Date.UTC(statedYear, statedMonth - 1, statedDay));
  if (statedDate.getUTCFullYear() !== statedYear || statedDate.getUTCMonth() + 1 !== statedMonth || statedDate.getUTCDate() !== statedDay) return null;
  const source = new Date(actualAsOf);
  if (Number.isNaN(source.getTime())) return null;
  source.setUTCDate(source.getUTCDate() - 3);
  if (source.getUTCFullYear() !== period.year || source.getUTCMonth() + 1 !== period.month) return null;
  const elapsedDays = source.getUTCDate();
  const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  return {
    iso: `${source.getUTCFullYear()}-${String(source.getUTCMonth() + 1).padStart(2, "0")}-${String(elapsedDays).padStart(2, "0")}`,
    elapsedDays,
    daysInMonth,
    remainingDays: daysInMonth - elapsedDays
  };
};

export const assessForecastActualMonth = (month: ForecastActualMonth): ForecastActualMonthAssessment => {
  if (month.forecastAmount === null) return unavailable("No Forecast is available for comparison.");

  if (month.actualState === "FINAL") {
    if (month.actualAmount === null) {
      return {
        kind: "UNCONFIRMED", label: "Unconfirmed", differenceAmount: null, differenceLabel: "Not comparable",
        projectedAmount: null, projectedDifferenceAmount: null,
        tooltip: "Final Actual is not available yet. Future months are not marked as shortfalls."
      };
    }
    const differenceAmount = subtractExactDecimals(month.actualAmount, month.forecastAmount);
    const shortfall = compareToZero(differenceAmount) < 0;
    return {
      kind: shortfall ? "FINAL_SHORTFALL" : "NORMAL",
      label: shortfall ? "Final shortfall" : "On track",
      differenceAmount,
      differenceLabel: "Difference",
      projectedAmount: null,
      projectedDifferenceAmount: null,
      tooltip: `Final Actual minus Forecast = ${differenceAmount}`
    };
  }

  if (month.actualState === "MTD") {
    if (month.actualAmount === null) return unavailable("MTD is unavailable, so Difference and month-end projection cannot be calculated.");
    const currentDifferenceAmount = subtractExactDecimals(month.actualAmount, month.forecastAmount);
    const effectiveDate = effectiveMtdDate(month.periodKey, month.actualAsOf);
    if (!effectiveDate) {
      return unavailable(
        "Difference is available, but month-end projection needs a valid as-of date minus three days.",
        currentDifferenceAmount
      );
    }
    const projectedNumerator = multiplyExactDecimalByInteger(month.actualAmount, effectiveDate.daysInMonth);
    const projectedRaw = divideExactDecimal(projectedNumerator, String(effectiveDate.elapsedDays), 6);
    if (projectedRaw === null) return unavailable("Month-end projection cannot be calculated with zero elapsed days.", currentDifferenceAmount);
    const projectedAmount = addExactDecimals(projectedRaw, "0");
    // Classify before division so a recurring decimal rounded for display cannot
    // flip the result at the Forecast threshold.
    const forecastAtElapsedDays = multiplyExactDecimalByInteger(month.forecastAmount, effectiveDate.elapsedDays);
    const projectedDifferenceNumerator = subtractExactDecimals(projectedNumerator, forecastAtElapsedDays);
    const projectedDifferenceRaw = divideExactDecimal(projectedDifferenceNumerator, String(effectiveDate.elapsedDays), 6);
    if (projectedDifferenceRaw === null) return unavailable("Projected Difference cannot be calculated with zero elapsed days.", currentDifferenceAmount);
    const projectedDifferenceAmount = addExactDecimals(projectedDifferenceRaw, "0");
    const shortfall = compareToZero(projectedDifferenceNumerator) < 0;
    return {
      kind: shortfall ? "MTD_SHORTFALL" : "NORMAL",
      label: shortfall ? "Projected shortfall" : "Projected on track",
      differenceAmount: currentDifferenceAmount,
      differenceLabel: "Difference",
      projectedAmount,
      projectedDifferenceAmount,
      tooltip: `Projected from cumulative MTD through ${effectiveDate.iso}; month-end ${projectedAmount}, projected Difference ${projectedDifferenceAmount}.`
    };
  }

  return {
    kind: "UNCONFIRMED", label: "Unconfirmed", differenceAmount: null, differenceLabel: "Not comparable",
    projectedAmount: null, projectedDifferenceAmount: null,
    tooltip: "Actual is not confirmed yet. Future months are not marked as shortfalls."
  };
};

const rowMatchesProblem = (
  row: ForecastActualRow,
  filter: ForecastActualProblemFilter,
  periodKeys?: ReadonlySet<string>
): boolean => row.months.some((month) =>
  (!periodKeys || periodKeys.has(month.periodKey)) && assessForecastActualMonth(month).kind === filter);

export const countForecastActualProblemAccounts = (
  rows: readonly ForecastActualRow[],
  periods?: readonly string[]
) => {
  const periodKeys = periods ? new Set(periods) : undefined;
  const finalShortfallAccounts = new Set<string>();
  const mtdShortfallAccounts = new Set<string>();
  rows.forEach((row) => {
    if (rowMatchesProblem(row, "FINAL_SHORTFALL", periodKeys)) finalShortfallAccounts.add(row.account);
    if (rowMatchesProblem(row, "MTD_SHORTFALL", periodKeys)) mtdShortfallAccounts.add(row.account);
  });
  return { finalShortfall: finalShortfallAccounts.size, mtdShortfall: mtdShortfallAccounts.size } as const;
};

export const filterForecastActualProblemRows = (
  rows: readonly ForecastActualRow[],
  filter: ForecastActualProblemFilter | null,
  periods?: readonly string[]
): ForecastActualRow[] => {
  if (!filter) return [...rows];
  const periodKeys = periods ? new Set(periods) : undefined;
  return rows.filter((row) => rowMatchesProblem(row, filter, periodKeys));
};

export const countDistinctForecastActualAccounts = (rows: readonly ForecastActualRow[]): number =>
  new Set(rows.map((row) => row.account)).size;

export const visibleForecastActualPeriods = (
  fullPeriods: readonly string[],
  rows: readonly ForecastActualRow[]
): string[] => {
  const periodsWithValues = new Set<string>();
  rows.forEach((row) => row.months.forEach((item) => {
    if (item.forecastAmount !== null || item.actualAmount !== null) periodsWithValues.add(item.periodKey);
  }));
  return forecastActualPeriodsLatestFirst([...new Set([...fullPeriods, ...periodsWithValues])])
    .filter((period) => periodsWithValues.has(period));
};

const addNullable = (current: string | null, value: string): string => current === null ? value : addExactDecimals(current, value);

export const summarizeForecastActualActuals = (
  rows: readonly ForecastActualRow[],
  periods: readonly string[]
): ForecastActualTotals => {
  const periodKeys = new Set(periods);
  let confirmedAmount: string | null = null;
  let mtdAmount: string | null = null;
  rows.forEach((row) => row.months.forEach((item) => {
    if (!periodKeys.has(item.periodKey) || item.actualAmount === null) return;
    if (item.actualState === "FINAL") confirmedAmount = addNullable(confirmedAmount, item.actualAmount);
    if (item.actualState === "MTD") mtdAmount = addNullable(mtdAmount, item.actualAmount);
  }));
  const totalAmount = confirmedAmount === null ? mtdAmount
    : mtdAmount === null ? confirmedAmount
      : addExactDecimals(confirmedAmount, mtdAmount);
  return {
    totalAmount,
    confirmedAmount,
    mtdAmount,
    includesMtd: mtdAmount !== null,
    hasActual: totalAmount !== null
  };
};
