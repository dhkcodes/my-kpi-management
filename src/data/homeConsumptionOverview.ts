import type { ConsumptionAnalysis, ConsumptionRecordsTotals } from "./consumptionApi";
import { sortConsumptionMonths } from "./consumptionData";

export type HomeConsumptionMonth = Readonly<{
  periodKey: string;
  kind: "ACTUAL" | "MTD" | "FORECAST";
  amount: number | null;
  forecastAmount: number | null;
  incomplete: boolean;
}>;

export type HomeConsumptionLineEdge = Readonly<{
  kind: HomeConsumptionMonth["kind"];
  fromIndex: number;
  toIndex: number;
  fromAmount: number;
  toAmount: number;
}>;

const graphForecastAmount = (month: HomeConsumptionMonth): number | null => month.kind === "FORECAST"
  ? month.amount
  : month.forecastAmount;

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
  if (previous.kind === "ACTUAL" && month.kind === "ACTUAL" && previous.amount !== null && month.amount !== null) {
    return [{ kind: "ACTUAL" as const, fromIndex: offset, toIndex, fromAmount: previous.amount, toAmount: month.amount }];
  }
  const previousForecast = graphForecastAmount(previous);
  const currentForecast = graphForecastAmount(month);
  if (previousForecast === null || currentForecast === null) return [];
  return [{ kind: "FORECAST" as const, fromIndex: offset, toIndex, fromAmount: previousForecast, toAmount: currentForecast }];
});

export type HomeConsumptionOverviewData = Readonly<{
  actualAmount: number | null;
  expectedAmount: number | null;
  actualYoYPercent: number | null;
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
    .filter(([, status]) => status === "FINAL_UPLOAD_REQUIRED")
    .map(([period]) => period));
  const finalUploadRequiredSet = new Set(finalUploadRequiredPeriods);
  const hasCurrentMtd = currentFiscalMonth !== undefined
    && totals.mtdStatusByPeriod?.[currentFiscalMonth] === "PROVISIONAL"
    && Object.prototype.hasOwnProperty.call(totals.mtdByPeriod ?? {}, currentFiscalMonth);
  const includedPeriods = sortConsumptionMonths([...new Set([
    ...analysis.periodCoverage.actualPeriods,
    ...forecastPeriods,
    ...(hasCurrentMtd ? [currentFiscalMonth] : [])
  ])]).filter((period) => !finalUploadRequiredSet.has(period));
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
    && analysis.portfolio.priorActualAmount !== 0;
  const actualYoYPercent = comparisonAvailable
    ? ((analysis.portfolio.actualAmount - analysis.portfolio.priorActualAmount) / Math.abs(analysis.portfolio.priorActualAmount)) * 100
    : null;

  return {
    actualAmount: hasActual ? analysis.portfolio.actualAmount : null,
    expectedAmount: hasExpected ? analysis.portfolio.totalAmount : null,
    actualYoYPercent,
    actualYoYUnavailableReason: actualYoYPercent === null
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
      return {
        periodKey,
        kind,
        amount: Object.prototype.hasOwnProperty.call(source, periodKey) ? source[periodKey] : null,
        forecastAmount: kind === "MTD" && Object.prototype.hasOwnProperty.call(totals.appliedForecastByPeriod, periodKey)
          ? totals.appliedForecastByPeriod[periodKey]
          : null,
        incomplete: kind === "MTD" || incompletePeriods.has(periodKey)
      };
    }),
    finalUploadRequiredPeriods,
    alerts: analysis.alerts.slice(0, 10)
  };
};
