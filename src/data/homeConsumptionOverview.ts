import type { ConsumptionAnalysis, ConsumptionRecordsTotals } from "./consumptionApi";
import { sortConsumptionMonths } from "./consumptionData";
import {
  exactDecimalToChartCoordinate,
  multiplyExactDecimalByInteger,
  subtractExactDecimals,
  divideExactDecimal,
  compareExactDecimals
} from "./exactDecimal";

export type HomeConsumptionMonth = Readonly<{
  periodKey: string;
  kind: "ACTUAL" | "MTD" | "FORECAST";
  amountExact: string | null;
  amountChartCoordinate: number | null;
  forecastAmountExact: string | null;
  forecastAmountChartCoordinate: number | null;
  incomplete: boolean;
}>;

/** These numbers are chart coordinates only; exact strings remain the monetary authority. */
export type HomeConsumptionLineEdge = Readonly<{
  kind: HomeConsumptionMonth["kind"];
  fromIndex: number;
  toIndex: number;
  fromAmountChartCoordinate: number;
  toAmountChartCoordinate: number;
}>;

const graphForecastAmount = (month: HomeConsumptionMonth): number | null => month.kind === "FORECAST"
  ? month.amountChartCoordinate
  : month.forecastAmountChartCoordinate;

const homeConsumptionFiscalMonths = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"] as const;

const homeConsumptionPeriodOrder = (periodKey: string): number | null => {
  const match = /^FY(\d{2})-([A-Z]{3})$/.exec(periodKey);
  if (!match) return null;
  const monthIndex = homeConsumptionFiscalMonths.indexOf(match[2] as typeof homeConsumptionFiscalMonths[number]);
  return monthIndex < 0 ? null : Number(match[1]) * 12 + monthIndex;
};

export const buildHomeConsumptionLineEdges = (
  months: readonly HomeConsumptionMonth[]
): readonly HomeConsumptionLineEdge[] => months.slice(1).flatMap<HomeConsumptionLineEdge>((month, offset): readonly HomeConsumptionLineEdge[] => {
  const toIndex = offset + 1;
  const previous = months[offset];
  const previousOrder = homeConsumptionPeriodOrder(previous.periodKey);
  const currentOrder = homeConsumptionPeriodOrder(month.periodKey);
  const consecutive = previousOrder !== null && currentOrder !== null && currentOrder - previousOrder === 1;
  if (!consecutive) return [];
  if (previous.kind === "ACTUAL" && month.kind === "ACTUAL" && previous.amountChartCoordinate !== null && month.amountChartCoordinate !== null) {
    return [{ kind: "ACTUAL" as const, fromIndex: offset, toIndex,
      fromAmountChartCoordinate: previous.amountChartCoordinate, toAmountChartCoordinate: month.amountChartCoordinate }];
  }
  if (previous.kind === "ACTUAL" && previous.amountChartCoordinate !== null) {
    const currentForecast = graphForecastAmount(month);
    if (currentForecast !== null) {
      return [{ kind: "FORECAST" as const, fromIndex: offset, toIndex,
        fromAmountChartCoordinate: previous.amountChartCoordinate, toAmountChartCoordinate: currentForecast }];
    }
  }
  const previousForecast = graphForecastAmount(previous);
  const currentForecast = graphForecastAmount(month);
  if (previousForecast === null || currentForecast === null) return [];
  return [{ kind: "FORECAST" as const, fromIndex: offset, toIndex,
    fromAmountChartCoordinate: previousForecast, toAmountChartCoordinate: currentForecast }];
});

export type HomeConsumptionOverviewData = Readonly<{
  actualAmountExact: string | null;
  expectedAmountExact: string | null;
  actualYoYPercentExact: string | null;
  actualYoYUnavailableReason: string | null;
  attentionSignalCount: number;
  attentionAccountCount: number;
  actualPeriods: readonly string[];
  forecastPeriods: readonly string[];
  forecastStartPeriod: string | null;
  includedPeriodCount: number;
  partialPeriod: boolean;
  quarters: ConsumptionAnalysis["quarters"];
  months: readonly HomeConsumptionMonth[];
  finalUploadRequiredPeriods: readonly string[];
  mtdAsOf: string | null;
  alerts: ConsumptionAnalysis["alerts"];
}>;

export const buildHomeConsumptionOverview = (
  analysis: ConsumptionAnalysis,
  totals: ConsumptionRecordsTotals,
  currentFiscalMonth?: string
): HomeConsumptionOverviewData => {
  const actualSet = new Set(analysis.periodCoverage.actualPeriods);
  const forecastPeriods = analysis.periodCoverage.forecastPeriods.filter((period) => !actualSet.has(period));
  const finalUploadRequiredPeriods = sortConsumptionMonths(Object.entries(totals.mtdStatusByPeriod ?? {})
    .filter(([period, status]) => status === "FINAL_UPLOAD_REQUIRED"
      && !actualSet.has(period)
      && totals.mtdByPeriod?.[period] !== undefined
      && totals.mtdByPeriod?.[period] !== null)
    .map(([period]) => period));
  const currentMtdAmount = currentFiscalMonth === undefined ? undefined : totals.mtdByPeriod?.[currentFiscalMonth];
  const hasCurrentMtd = currentFiscalMonth !== undefined
    && !actualSet.has(currentFiscalMonth)
    && currentMtdAmount !== undefined
    && currentMtdAmount !== null
    && (totals.mtdStatusByPeriod?.[currentFiscalMonth] === "PROVISIONAL"
      || totals.mtdStatusByPeriod?.[currentFiscalMonth] === "FINAL_UPLOAD_REQUIRED");
  const includedPeriods = sortConsumptionMonths([...new Set([
    ...analysis.periodCoverage.actualPeriods,
    ...forecastPeriods,
    ...(hasCurrentMtd ? [currentFiscalMonth] : [])
  ])]);
  const incompletePeriods = new Set(totals.incompletePeriods);
  const sortedActualPeriods = sortConsumptionMonths(analysis.periodCoverage.actualPeriods);
  const lastActualPeriod = sortedActualPeriods[sortedActualPeriods.length - 1];
  const lastActualOrder = lastActualPeriod === undefined ? null : homeConsumptionPeriodOrder(lastActualPeriod);
  const forecastStartPeriod = sortConsumptionMonths(includedPeriods).find((period) => {
    const order = homeConsumptionPeriodOrder(period);
    return order !== null && (lastActualOrder === null || order > lastActualOrder)
      && Object.prototype.hasOwnProperty.call(totals.appliedForecastByPeriod, period);
  }) ?? null;
  const hasActual = analysis.periodCoverage.actualPeriods.length > 0;
  const hasExpected = includedPeriods.length > 0;
  const comparisonAvailable = analysis.periodCoverage.comparisonStatus === "COMPARABLE"
    && compareExactDecimals(analysis.portfolio.priorActualAmountExact, "0") !== 0;
  const actualYoYPercentExact = comparisonAvailable
    ? divideExactDecimal(
      multiplyExactDecimalByInteger(subtractExactDecimals(analysis.portfolio.actualAmountExact, analysis.portfolio.priorActualAmountExact), 100),
      analysis.portfolio.priorActualAmountExact.startsWith("-") ? analysis.portfolio.priorActualAmountExact.slice(1) : analysis.portfolio.priorActualAmountExact,
      2)
    : null;

  return {
    actualAmountExact: hasActual ? analysis.portfolio.actualAmountExact : null,
    expectedAmountExact: hasExpected ? analysis.portfolio.totalAmountExact : null,
    actualYoYPercentExact,
    actualYoYUnavailableReason: actualYoYPercentExact === null
      ? analysis.periodCoverage.comparisonUnavailableReason ?? "Prior-period Actual is unavailable."
      : null,
    attentionSignalCount: analysis.alerts.length,
    attentionAccountCount: new Set(analysis.alerts.map((alert) => alert.account)).size,
    actualPeriods: analysis.periodCoverage.actualPeriods,
    forecastPeriods,
    forecastStartPeriod,
    includedPeriodCount: includedPeriods.length,
    partialPeriod: includedPeriods.length > 0 && includedPeriods.length < 12,
    quarters: analysis.quarters,
    months: includedPeriods.map((periodKey) => {
      const kind: HomeConsumptionMonth["kind"] = periodKey === currentFiscalMonth && hasCurrentMtd
        ? "MTD"
        : actualSet.has(periodKey) ? "ACTUAL" : "FORECAST";
      const source = kind === "ACTUAL" ? totals.actualByPeriod
        : kind === "MTD" ? totals.mtdByPeriod ?? {}
          : totals.appliedForecastByPeriod;
      const amountExact = Object.prototype.hasOwnProperty.call(source, periodKey) ? source[periodKey] : null;
      const forecastAmountExact = kind === "MTD" && Object.prototype.hasOwnProperty.call(totals.appliedForecastByPeriod, periodKey)
        ? totals.appliedForecastByPeriod[periodKey]
        : null;
      return {
        periodKey,
        kind,
        amountExact,
        amountChartCoordinate: amountExact === null ? null : exactDecimalToChartCoordinate(amountExact),
        forecastAmountExact,
        forecastAmountChartCoordinate: forecastAmountExact === null ? null : exactDecimalToChartCoordinate(forecastAmountExact),
        incomplete: kind === "MTD" || incompletePeriods.has(periodKey)
      };
    }),
    finalUploadRequiredPeriods,
    mtdAsOf: !hasCurrentMtd || currentFiscalMonth === undefined ? null : totals.mtdAsOfByPeriod?.[currentFiscalMonth] ?? null,
    alerts: analysis.alerts.slice(0, 10)
  };
};
