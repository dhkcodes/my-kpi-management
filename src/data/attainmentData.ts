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
