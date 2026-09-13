export type AttainmentQuarter = "Q1" | "Q2" | "Q3" | "Q4";
export const attainmentQuarters: readonly AttainmentQuarter[] = ["Q1", "Q2", "Q3", "Q4"];

export type AttainmentAmount = number | null;

export type AttainmentQuarterRecord = Readonly<{
  quarter: AttainmentQuarter;
  budget: AttainmentAmount;
  actual: number;
  forecast: number;
  actualAttainment: number | null;
  forecastAttainment: number | null;
  dpActual: number;
  dpForecast: number;
  ociActual: number;
  ociForecast: number;
}>;

export type AttainmentSummary = Readonly<{
  budget: AttainmentAmount;
  actual: number;
  forecast: number;
  actualAttainment: number | null;
  forecastAttainment: number | null;
  dpActual: number;
  dpForecast: number;
  ociActual: number;
  ociForecast: number;
  actualVarianceToBudget: number | null;
  forecastVarianceToBudget: number | null;
}>;

export type AttainmentDashboard = Readonly<{
  fiscalYear: string;
  quarters: AttainmentQuarterRecord[];
  summary: AttainmentSummary;
}>;

export type AttainmentBudgetUpdate = Readonly<{
  q1: AttainmentAmount;
  q2: AttainmentAmount;
  q3: AttainmentAmount;
  q4: AttainmentAmount;
}>;

export const calculateAttainment = (amount: number, budget: AttainmentAmount): number | null =>
  budget === null || budget === 0 ? null : amount * 100 / budget;

export const calculateRemainingTarget = (budget: AttainmentAmount, actualToDate: number): number | null =>
  budget === null ? null : Math.max(0, budget - actualToDate);

export const calculateRequiredMonthlyAverage = (remainingTarget: number | null, remainingMonths: number): number | null =>
  remainingTarget === null || remainingMonths <= 0 ? null : remainingTarget / remainingMonths;

/** Oracle fiscal years run June through May; the current month is part of the remaining period. */
export const remainingFiscalMonths = (fiscalYear: string, currentPeriod: string): number => {
  const fiscalYearMatch = /^FY(\d{2})$/.exec(fiscalYear);
  const periodMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(currentPeriod);
  if (!fiscalYearMatch || !periodMatch) return 0;
  const fiscalEndYear = 2000 + Number(fiscalYearMatch[1]);
  const currentYear = Number(periodMatch[1]);
  const currentMonth = Number(periodMatch[2]);
  const fiscalStart = (fiscalEndYear - 1) * 12 + 6;
  const fiscalEnd = fiscalEndYear * 12 + 5;
  const current = currentYear * 12 + currentMonth;
  if (current < fiscalStart) return 12;
  if (current > fiscalEnd) return 0;
  return fiscalEnd - current + 1;
};

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

export const calculateFiscalYearSummary = (
  quarters: readonly Pick<AttainmentQuarterRecord, "quarter" | "budget" | "actual" | "forecast" | "dpActual" | "dpForecast" | "ociActual" | "ociForecast">[]
): AttainmentSummary => {
  const completeBudget = quarters.every((quarter) => quarter.budget !== null);
  const budget = completeBudget ? sum(quarters.map((quarter) => quarter.budget as number)) : null;
  const actual = sum(quarters.map((quarter) => quarter.actual));
  const forecast = sum(quarters.map((quarter) => quarter.forecast));
  return {
    budget,
    actual,
    forecast,
    actualAttainment: calculateAttainment(actual, budget),
    forecastAttainment: calculateAttainment(forecast, budget),
    dpActual: sum(quarters.map((quarter) => quarter.dpActual)),
    dpForecast: sum(quarters.map((quarter) => quarter.dpForecast)),
    ociActual: sum(quarters.map((quarter) => quarter.ociActual)),
    ociForecast: sum(quarters.map((quarter) => quarter.ociForecast)),
    actualVarianceToBudget: budget === null || budget === 0 ? null : actual - budget,
    forecastVarianceToBudget: budget === null || budget === 0 ? null : forecast - budget
  };
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export const formatBudget = (budget: AttainmentAmount): string => budget === null ? "—" : `${currency.format(budget)} K`;
export const formatAttainment = (value: number | null): string => value === null ? "—" : `${value.toFixed(1)}%`;
export const formatAttainmentAmount = (value: number): string => `${currency.format(value)} K`;
