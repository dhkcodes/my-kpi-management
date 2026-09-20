import type { ConsumptionAnalysis, ConsumptionRecordsTotals } from "./consumptionApi";
import { sortConsumptionMonths } from "./consumptionData";

export type HomeConsumptionMonth = Readonly<{
  periodKey: string;
  kind: "ACTUAL" | "FORECAST";
  amount: number | null;
  incomplete: boolean;
}>;

export type HomeConsumptionOverviewData = Readonly<{
  actualAmount: number | null;
  expectedAmount: number | null;
  actualYoYPercent: number | null;
  actualYoYUnavailableReason: string | null;
  attentionSignalCount: number;
  attentionAccountCount: number;
  actualPeriods: readonly string[];
  forecastPeriods: readonly string[];
  includedPeriodCount: number;
  partialPeriod: boolean;
  quarters: ConsumptionAnalysis["quarters"];
  months: readonly HomeConsumptionMonth[];
  alerts: ConsumptionAnalysis["alerts"];
}>;

export const buildHomeConsumptionOverview = (
  analysis: ConsumptionAnalysis,
  totals: ConsumptionRecordsTotals
): HomeConsumptionOverviewData => {
  const actualSet = new Set(analysis.periodCoverage.actualPeriods);
  const forecastPeriods = analysis.periodCoverage.forecastPeriods.filter((period) => !actualSet.has(period));
  const includedPeriods = sortConsumptionMonths([...analysis.periodCoverage.actualPeriods, ...forecastPeriods]);
  const incompletePeriods = new Set(totals.incompletePeriods);
  const hasActual = analysis.periodCoverage.actualPeriods.length > 0;
  const hasExpected = includedPeriods.length > 0;
  const comparisonAvailable = analysis.periodCoverage.comparisonStatus === "AVAILABLE"
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
    includedPeriodCount: includedPeriods.length,
    partialPeriod: includedPeriods.length > 0 && includedPeriods.length < 12,
    quarters: analysis.quarters,
    months: includedPeriods.map((periodKey) => {
      const kind = actualSet.has(periodKey) ? "ACTUAL" as const : "FORECAST" as const;
      const source = kind === "ACTUAL" ? totals.actualByPeriod : totals.appliedForecastByPeriod;
      return {
        periodKey,
        kind,
        amount: Object.prototype.hasOwnProperty.call(source, periodKey) ? source[periodKey] : null,
        incomplete: incompletePeriods.has(periodKey)
      };
    }),
    alerts: analysis.alerts.slice(0, 3)
  };
};
