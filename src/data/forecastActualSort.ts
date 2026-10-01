import type { ForecastActualRow } from "./consumptionApi";
import { compareExactDecimals } from "./exactDecimal";

const FISCAL_MONTH_INDEX: Readonly<Record<string, number>> = Object.freeze({
  JUN: 0, JUL: 1, AUG: 2, SEP: 3, OCT: 4, NOV: 5,
  DEC: 6, JAN: 7, FEB: 8, MAR: 9, APR: 10, MAY: 11
});

const fiscalPeriodOrdinal = (periodKey: string): number => {
  const match = /^FY(\d{2,4})-(JUN|JUL|AUG|SEP|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY)$/u.exec(periodKey);
  if (!match) return Number.NEGATIVE_INFINITY;
  const fiscalYear = Number(match[1]);
  return fiscalYear * 12 + FISCAL_MONTH_INDEX[match[2]];
};

export const forecastActualPeriodsLatestFirst = (fullForecastPeriods: readonly string[]): string[] =>
  Array.from(new Set(fullForecastPeriods))
    .sort((left, right) => fiscalPeriodOrdinal(right) - fiscalPeriodOrdinal(left));

export type ForecastActualSortKey =
  | "salesRep"
  | "account"
  | "forecast"
  | "actual"
  | "projected"
  | "status"
  | `actual:${string}`
  | `difference:${string}`
  | `status:${string}`
  | `month:${string}`;

export type ForecastActualSortDirection = "asc" | "desc";

const compareNullableDecimal = (
  left: string | null | undefined,
  right: string | null | undefined,
  direction: ForecastActualSortDirection
): number => {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
  if (right === null || right === undefined) return -1;
  const result = compareExactDecimals(left, right);
  return direction === "asc" ? result : -result;
};

const statusRank = (value: boolean | null): number => value === true ? 2 : value === false ? 1 : 0;

export const compareForecastActualRows = (
  left: ForecastActualRow,
  right: ForecastActualRow,
  key: ForecastActualSortKey,
  direction: ForecastActualSortDirection
): number => {
  if (key === "salesRep" || key === "account") {
    const result = left[key].localeCompare(right[key], undefined, { sensitivity: "base" });
    return direction === "asc" ? result : -result;
  }
  if (key === "forecast") {
    return compareNullableDecimal(left.fullPeriodForecastAmount, right.fullPeriodForecastAmount, direction);
  }
  if (key === "actual") {
    return compareNullableDecimal(left.confirmedActualAmount, right.confirmedActualAmount, direction);
  }
  if (key === "projected") {
    return compareNullableDecimal(left.projectedAmount, right.projectedAmount, direction);
  }
  if (key === "status") {
    const actualResult = statusRank(left.actualShortfall) - statusRank(right.actualShortfall);
    const result = actualResult || statusRank(left.attention) - statusRank(right.attention);
    return direction === "asc" ? result : -result;
  }

  if (key.startsWith("actual:") || key.startsWith("difference:") || key.startsWith("status:")) {
    const separator = key.indexOf(":");
    const column = key.slice(0, separator);
    const periodKey = key.slice(separator + 1);
    const leftMonth = left.months.find((month) => month.periodKey === periodKey);
    const rightMonth = right.months.find((month) => month.periodKey === periodKey);
    if (column === "actual") return compareNullableDecimal(leftMonth?.actualAmount, rightMonth?.actualAmount, direction);
    if (column === "difference") return compareNullableDecimal(leftMonth?.differenceAmount, rightMonth?.differenceAmount, direction);
    const rank = (month: typeof leftMonth): number => {
      if (!month || month.forecastAmount === null) return 0;
      if (month.actualState === null || month.actualAmount === null) return 1;
      const shortfall = month.actualState === "MTD" && month.monthEndProjection !== null
        ? compareExactDecimals(month.monthEndProjection, month.forecastAmount) < 0
        : month.differenceAmount !== null && compareExactDecimals(month.differenceAmount, "0") < 0;
      return shortfall ? 2 : 3;
    };
    const result = rank(leftMonth) - rank(rightMonth);
    return direction === "asc" ? result : -result;
  }

  const periodKey = key.slice("month:".length);
  const leftMonth = left.months.find((month) => month.periodKey === periodKey);
  const rightMonth = right.months.find((month) => month.periodKey === periodKey);
  return compareNullableDecimal(leftMonth?.forecastAmount, rightMonth?.forecastAmount, direction);
};
