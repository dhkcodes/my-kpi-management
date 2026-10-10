import { addExactDecimals, compareExactDecimals, divideExactDecimal, exactDecimalToChartCoordinate, multiplyExactDecimalByInteger, subtractExactDecimals } from "./exactDecimal";

export const calculateOpenForecastExposureExact = (
  forecastAmountExact: string,
  coveredTotalExact: string,
  provisionalMtdExact: string
): string => {
  const denominatorExact = subtractExactDecimals(coveredTotalExact, provisionalMtdExact);
  return compareExactDecimals(denominatorExact, "0") <= 0
    ? "0"
    : divideExactDecimal(multiplyExactDecimalByInteger(forecastAmountExact, 100), denominatorExact, 2)!;
};

export type ConsumptionMonthStatus = "ACTUAL" | "FORECAST" | "MIXED" | "INCOMPLETE";
export type ConsumptionRecordsViewState = "loading" | "error" | "empty" | "ready";
export const resolveConsumptionRecordsViewState = (
  replacementLoading: boolean,
  dataMode: "loading" | "backend" | "fallback" | "error",
  queryError: string,
  accountCount: number
): ConsumptionRecordsViewState => replacementLoading || dataMode === "loading"
  ? "loading"
  : queryError || dataMode === "error"
    ? "error"
    : accountCount === 0
      ? "empty"
      : "ready";
export type ConsumptionPillar = "ALL" | "DP" | "OCI";
export const consumptionPillarOptions: ReadonlyArray<Readonly<{ label: string; value: ConsumptionPillar }>> = [
  { label: "All", value: "ALL" },
  { label: "DP", value: "DP" },
  { label: "OCI", value: "OCI" }
];
export const isUnmappedConsumptionLabel = (value: string): boolean => value.trim().toUpperCase() === "UNMAPPED";
export type ForecastCompositionCategory = "All" | "New" | "Expansion" | "Reduction";

export type ForecastCompositionAccount = Readonly<{
  account: string;
  totalForecastAmountExact: string;
  newAmountExact: string;
  expansionAmountExact: string;
  reductionAmountExact: string;
  netMovementAmountExact: string;
}>;
export const hasVisibleCompositionAmount = (amountExact: string): boolean =>
  compareExactDecimals(amountExact, "0") !== 0;
export const filterForecastCompositionAccounts = <T extends ForecastCompositionAccount>(
  accounts: readonly T[], category: ForecastCompositionCategory
): readonly T[] => accounts.filter((account) => category === "All"
  ? compareExactDecimals(account.totalForecastAmountExact, "0") !== 0
    || [account.newAmountExact, account.expansionAmountExact, account.reductionAmountExact]
      .some((amount) => compareExactDecimals(amount, "0") !== 0)
  : category === "New" ? hasVisibleCompositionAmount(account.newAmountExact)
  : category === "Expansion" ? hasVisibleCompositionAmount(account.expansionAmountExact)
  : hasVisibleCompositionAmount(account.reductionAmountExact));
export type ConsumptionDataCenterBreakdown = Readonly<{
  dpCount: number | null;
  ociCount: number | null;
  duplicatePossible: boolean;
}>;
export type ConsumptionAmountSplit = Readonly<{
  actualAmountExact: string;
  forecastAmountExact: string;
  totalAmountExact: string;
  /** Lossy values reserved exclusively for chart coordinates. */
  actualAmountChartCoordinate: number;
  forecastAmountChartCoordinate: number;
  totalAmountChartCoordinate: number;
  status: ConsumptionMonthStatus;
}>;
export type ConsumptionActualTrendPoint = Readonly<{
  periodKey: string;
  actualAmountExact: string | null;
  /** Lossy value reserved exclusively for a chart coordinate. */
  actualAmountChartCoordinate: number | null;
  alertCalculationMonth: boolean;
}>;
export type ConsumptionAnalysisPlan = ConsumptionAmountSplit & Readonly<{
  serverPlanId: number; planId: string; endUser: string; dataCenter: string;
  dataCenterBreakdown?: ConsumptionDataCenterBreakdown;
  percentageExact: string | null;
  actualEntryStatus: "PROVIDED" | "MISSING";
  forecastEntryStatus: "PROVIDED" | "UNAVAILABLE";
  actualTrend: readonly ConsumptionActualTrendPoint[];
}>;
export type ConsumptionAnalysisWorkload = ConsumptionAmountSplit & Readonly<{
  workload: string; percentageExact: string | null; plans: readonly ConsumptionAnalysisPlan[];
}>;
export type ConsumptionAnalysisAccount = ConsumptionAmountSplit & Readonly<{
  account: string; salesRep: string; percentageExact: string | null;
  forecastOverlapAmountExact: string; coveredExpectedAmountExact: string;
  actualEntryStatus: "PROVIDED" | "MISSING";
  priorActualAmountExact: string; actualGrowthAmountExact: string | null; actualGrowthPercentExact: string | null;
  yoyComparisonStatus: string; yoyUnavailableReason: string | null;
  forecastEntryStatus: "MISSING" | "ZERO" | "ENTERED";
  attentionReasons: readonly string[];
  workloads: readonly ConsumptionAnalysisWorkload[];
}>;
export type ConsumptionAnalysisAccountCandidate = Readonly<{
  account: string;
  salesRep: string;
  workloads: readonly string[];
  planIds: readonly string[];
}>;
export type ConsumptionAccountSort = "account" | "amount";
export type ConsumptionSortDirection = "asc" | "desc";
export type ConsumptionSignalType = "ABOVE_USUAL" | "BELOW_USUAL" | "NEW_USAGE";
export type ConsumptionPreviousDirection = "INCREASED" | "DECREASED" | "UNCHANGED";
export type ConsumptionSignalGrade = "CRITICAL" | "HIGH" | "WATCH";

export type ConsumptionPlan = Readonly<{
  id: string;
  customer: string;
  endUser: string;
  planId: string;
  dataCenter: string;
  dataCenterBreakdown?: ConsumptionDataCenterBreakdown;
  workload?: string;
  planType: string;
  actuals: Record<string, number>;
  mtds?: Record<string, number>;
  forecasts: Record<string, number>;
  /** Authoritative decimal values. Numeric maps above are chart-only compatibility projections. */
  actualsExact?: Record<string, string>;
  mtdsExact?: Record<string, string>;
  forecastsExact?: Record<string, string>;
  serverPlanId?: number;
  versions?: Record<string, number>;
}>;

export const formatConsumptionDataCenter = (
  plan: Pick<ConsumptionPlan, "dataCenter" | "dataCenterBreakdown">,
  pillar: ConsumptionPillar
): Readonly<{ primary: string }> => {
  const breakdown = plan.dataCenterBreakdown;
  if (pillar !== "ALL" || !breakdown) return { primary: plan.dataCenter };
  return {
    primary: String((breakdown.dpCount ?? 0) + (breakdown.ociCount ?? 0))
  };
};

export const countUniqueConsumptionPlans = (
  plans: readonly Pick<ConsumptionPlan, "id" | "planId" | "serverPlanId">[]
): number => new Set(plans.map((plan) => plan.serverPlanId !== undefined
  ? `server:${plan.serverPlanId}`
  : `plan:${plan.planId || plan.id}`)).size;

export type ConsumptionAccount = Readonly<{
  id: string;
  customer: string;
  endUser: string;
  planId: string;
  dataCenter: string;
  planType: "Aggregate";
  actuals: Record<string, number>;
  forecasts: Record<string, number>;
  /** Authoritative decimal values. Numeric maps above are chart-only compatibility projections. */
  actualsExact?: Record<string, string>;
  forecastsExact?: Record<string, string>;
  plans: ConsumptionPlan[];
}>;

export type ConsumptionSeries = ConsumptionPlan | ConsumptionAccount;

export const isConsumptionMtdDisplayPeriod = (
  showMtd: boolean,
  currentMtdPeriod: string,
  currentMtdExact: Readonly<Record<string, string>>,
  period: string
): boolean => showMtd
  && currentMtdPeriod !== ""
  && period === currentMtdPeriod
  && Object.prototype.hasOwnProperty.call(currentMtdExact, currentMtdPeriod);

export const applyConsumptionMtdDisplayOverride = <T extends ConsumptionSeries>(
  series: T,
  currentMtdPeriod: string,
  currentMtdExact: Readonly<Record<string, string>>,
  showMtd: boolean
): T => {
  if (!isConsumptionMtdDisplayPeriod(showMtd, currentMtdPeriod, currentMtdExact, currentMtdPeriod)) return series;
  return {
    ...series,
    actuals: {
      ...series.actuals,
      [currentMtdPeriod]: exactDecimalToChartCoordinate(currentMtdExact[currentMtdPeriod])
    },
    actualsExact: {
      ...series.actualsExact,
      [currentMtdPeriod]: currentMtdExact[currentMtdPeriod]
    },
    forecasts: Object.fromEntries(Object.entries(series.forecasts)
      .filter(([period]) => period !== currentMtdPeriod)),
    forecastsExact: Object.fromEntries(Object.entries(series.forecastsExact ?? {})
      .filter(([period]) => period !== currentMtdPeriod))
  } as T;
};

export type ConsumptionControlTotal = Readonly<{
  customer: string;
  values: Record<string, number>;
}>;

export type ParsedConsumptionCsv = Readonly<{
  plans: ConsumptionPlan[];
  controlTotals: ConsumptionControlTotal[];
  monthKeys: string[];
}>;

export type ConsumptionQuarterSummary = Readonly<{
  quarter: string;
  months: string[];
  total: number | null;
  totalExact: string | null;
  status: ConsumptionMonthStatus;
  preQGap: number | null;
  preQGapExact: string | null;
}>;

export type ConsumptionSignalPoint = Readonly<{
  periodKey: string;
  actualAmount: number;
}>;

export type ConsumptionSignal = Readonly<{
  id: string;
  serverPlanId?: number;
  customer: string;
  endUser: string;
  planId: string;
  type: ConsumptionSignalType;
  grade: ConsumptionSignalGrade;
  month: string;
  latestActual: number;
  baselineMedian: number;
  changeAmount: number;
  changePercent: number | null;
  mad: number;
  allowance: number;
  previousActual: number;
  previousDirection: ConsumptionPreviousDirection;
  sparkline: readonly ConsumptionSignalPoint[];
  reason: string;
  topContributingPlan: string;
}>;

export const getConsumptionPlanLabel = (plan: Pick<ConsumptionPlan, "customer" | "workload" | "planId">): string =>
  plan.workload
    ? `${plan.customer} - ${plan.workload} (${plan.planId})`
    : `${plan.customer} (${plan.planId})`;

export const restoreForecastEntry = (
  draft: ConsumptionPlan,
  saved: ConsumptionPlan,
  month: string
): ConsumptionPlan => {
  const forecasts = { ...draft.forecasts };
  if (Object.prototype.hasOwnProperty.call(saved.forecasts, month)) forecasts[month] = saved.forecasts[month];
  else delete forecasts[month];
  return { ...draft, forecasts };
};

const oracleFiscalMonths = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"] as const;
const quarterMonths: Record<string, readonly string[]> = {
  Q1: ["JUN", "JUL", "AUG"],
  Q2: ["SEP", "OCT", "NOV"],
  Q3: ["DEC", "JAN", "FEB"],
  Q4: ["MAR", "APR", "MAY"]
};

const parseCsvRows = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
};

const parseAmount = (value: string, rowNumber: number, month: string): Readonly<{ exact: string; chartCoordinate: number }> | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const decimalCurrency = /^\$?[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/;
  if (!decimalCurrency.test(trimmed)) throw new Error(`Consumption CSV row ${rowNumber} has invalid ${month} amount.`);
  const exact = trimmed.replace(/^\$/, "").replace(/,/g, "");
  const chartCoordinate = exactDecimalToChartCoordinate(exact);
  if (!Number.isFinite(chartCoordinate)) throw new Error(`Consumption CSV row ${rowNumber} has invalid ${month} amount.`);
  return { exact, chartCoordinate };
};

const normalizeHeader = (value: string) => value.trim();
const isMonthKey = (value: string) => /^FY\d{2}-[A-Z]{3}$/.test(value);

export const parseConsumptionCsv = (csv: string): ParsedConsumptionCsv => {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error("Consumption CSV has no data rows.");
  const headers = rows[0].map(normalizeHeader);
  const indexOf = (name: string) => headers.indexOf(name);
  for (const required of ["Customer", "End User", "Plan ID", "Data Center", "Plan Type"]) {
    if (indexOf(required) < 0) throw new Error(`Consumption CSV is missing ${required}.`);
  }
  const monthKeys = headers.filter(isMonthKey);
  if (monthKeys.length === 0) throw new Error("Consumption CSV has no FY month columns.");
  const monthIndexes = monthKeys.map((month) => [month, indexOf(month)] as const);
  const plans: ConsumptionPlan[] = [];
  const controlTotals: ConsumptionControlTotal[] = [];
  rows.slice(1).forEach((values, rowIndex) => {
    const customer = values[indexOf("Customer")]?.trim() ?? "";
    const endUser = values[indexOf("End User")]?.trim() ?? "";
    const planId = values[indexOf("Plan ID")]?.trim() ?? "";
    const dataCenter = values[indexOf("Data Center")]?.trim() ?? "";
    const planType = values[indexOf("Plan Type")]?.trim() ?? "";
    if (!customer) return;
    const actualEntries: Array<[string, number]> = [];
    const actualExactEntries: Array<[string, string]> = [];
    monthIndexes.forEach(([month, index]) => {
      const amount = parseAmount(values[index] ?? "", rowIndex + 2, month);
      if (amount !== null) {
        actualEntries.push([month, amount.chartCoordinate]);
        actualExactEntries.push([month, amount.exact]);
      }
    });
    const actuals = Object.fromEntries(actualEntries) as Record<string, number>;
    const actualsExact = Object.fromEntries(actualExactEntries) as Record<string, string>;
    if (planType.toLowerCase() === "multiple") {
      controlTotals.push({ customer, values: actuals });
      return;
    }
    if (!planId) throw new Error(`Consumption CSV row ${rowIndex + 2} has no Plan ID.`);
    plans.push({
      id: `${customer}::${planId}`,
      customer,
      endUser: endUser || customer,
      planId,
      dataCenter,
      planType: planType || "OCI",
      actuals,
      actualsExact,
      forecasts: {}
    });
  });
  return { plans, controlTotals, monthKeys };
};

export const aggregateConsumptionAccounts = (plans: readonly ConsumptionPlan[]): ConsumptionAccount[] => {
  const grouped = new Map<string, ConsumptionPlan[]>();
  plans.forEach((plan) => grouped.set(plan.customer, [...(grouped.get(plan.customer) ?? []), plan]));
  return [...grouped.entries()].map(([customer, accountPlans]) => {
    const actuals: Record<string, number> = {};
    const forecasts: Record<string, number> = {};
    const actualsExact: Record<string, string> = {};
    const forecastsExact: Record<string, string> = {};
    const aggregateCompleteMonths = (
      field: "actuals" | "forecasts",
      exactField: "actualsExact" | "forecastsExact",
      target: Record<string, number>,
      exactTarget: Record<string, string>
    ) => {
      const months = new Set(accountPlans.flatMap((plan) => Object.keys(plan[field])));
      months.forEach((month) => {
        if (!accountPlans.every((plan) => Object.prototype.hasOwnProperty.call(plan[field], month))) return;
        exactTarget[month] = accountPlans.reduce((sum, plan) =>
          addExactDecimals(sum, plan[exactField]?.[month] ?? String(plan[field][month])), "0");
        target[month] = exactDecimalToChartCoordinate(exactTarget[month]);
      });
    };
    aggregateCompleteMonths("actuals", "actualsExact", actuals, actualsExact);
    aggregateCompleteMonths("forecasts", "forecastsExact", forecasts, forecastsExact);
    return {
      id: `account::${customer}`,
      customer,
      endUser: "",
      planId: "",
      dataCenter: "",
      planType: "Aggregate",
      actuals,
      forecasts,
      actualsExact,
      forecastsExact,
      plans: accountPlans
    };
  });
};

export const aggregateConsumptionActualTotals = (plans: readonly ConsumptionPlan[]): ConsumptionAccount => {
  const actuals: Record<string, number> = {};
  const actualsExact: Record<string, string> = {};
  plans.forEach((plan) => Object.entries(plan.actuals).forEach(([month, amount]) => {
    actualsExact[month] = addExactDecimals(actualsExact[month] ?? "0", plan.actualsExact?.[month] ?? String(amount));
    actuals[month] = exactDecimalToChartCoordinate(actualsExact[month]);
  }));
  return { id: "account::all", customer: "All accounts", endUser: "", planId: "", dataCenter: "",
    planType: "Aggregate", actuals, forecasts: {}, actualsExact, forecastsExact: {}, plans: [...plans] };
};

const fiscalMonthOrder = (key: string): number => {
  const match = /^FY(\d{2})-([A-Z]{3})$/.exec(key);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const fiscalYear = Number(match[1]);
  const monthIndex = oracleFiscalMonths.indexOf(match[2] as typeof oracleFiscalMonths[number]);
  return fiscalYear * 12 + Math.max(0, monthIndex);
};

export const sortConsumptionMonths = (months: readonly string[]) =>
  [...months].sort((left, right) => fiscalMonthOrder(left) - fiscalMonthOrder(right));

export const sortConsumptionMonthsNewestFirst = (months: readonly string[]) =>
  [...months].sort((left, right) => fiscalMonthOrder(right) - fiscalMonthOrder(left));

export const initialConsumptionRecordsBatchSize = (viewportHeight: number): number =>
  Math.min(100, Math.max(10, Math.ceil((Math.max(0, viewportHeight) - 360) / 44)));

export const shouldRestartConsumptionRecordsPage = (
  append: boolean,
  currentEtag: string,
  nextEtag: string
): boolean => append && currentEtag.length > 0 && currentEtag !== nextEtag;

export const shouldRefreshConsumptionAnalysisContext = (
  currentAccount: string,
  nextAccount: string,
  debouncedCandidateSearch: string
): boolean => currentAccount.trim() !== nextAccount.trim() || debouncedCandidateSearch.trim() !== "";

const previousFiscalMonth = (month: string): string | null => {
  const match = /^FY(\d{2})-([A-Z]{3})$/.exec(month);
  if (!match) return null;
  const monthIndex = oracleFiscalMonths.indexOf(match[2] as typeof oracleFiscalMonths[number]);
  if (monthIndex < 0) return null;
  const previousIndex = (monthIndex + oracleFiscalMonths.length - 1) % oracleFiscalMonths.length;
  const previousFiscalYear = Number(match[1]) - (monthIndex === 0 ? 1 : 0);
  return `FY${String(previousFiscalYear).padStart(2, "0")}-${oracleFiscalMonths[previousIndex]}`;
};

/** Return the alert month and its previous five contiguous ACTUAL-only monthly slots. */
export const getAlertActualTrend = <T extends Readonly<{ periodKey: string }>>(
  points: readonly T[],
  alertPeriodKey: string
): readonly T[] => {
  const byPeriod = new Map(points.map((point) => [point.periodKey, point]));
  const periods = [alertPeriodKey];
  for (let index = 1; index < 6; index += 1) {
    const previous = previousFiscalMonth(periods[0]);
    if (!previous) return [];
    periods.unshift(previous);
  }
  return periods.every((period) => byPeriod.has(period))
    ? periods.map((period) => byPeriod.get(period) as T)
    : [];
};

export type ConsumptionControlResolution = Readonly<{
  amount: number | null;
  amountExact: string | null;
  detailState: "MISSING" | "ZERO" | "VALUE";
  editable: boolean;
  source: "MANUAL" | "DETAIL";
}>;

type ConsumptionDisplaySeries = Readonly<{
  actuals: Readonly<Record<string, number>>;
  forecasts: Readonly<Record<string, number>>;
  actualsExact?: Readonly<Record<string, string>>;
  forecastsExact?: Readonly<Record<string, string>>;
}>;

type ConsumptionAccountForecastResolution = Readonly<{
  period: string;
  editable: boolean;
  amount: number | null;
  amountExact: string | null;
}>;

/**
 * Apply Account Forecast controls only to editable Forecast periods.
 * Closed-period Actuals are authoritative, including explicit zero; a missing
 * Actual remains missing and is never manufactured from a Forecast control.
 */
export const applyConsumptionAccountForecastResolutions = <T extends ConsumptionDisplaySeries>(
  series: T,
  resolutions: readonly ConsumptionAccountForecastResolution[]
): T => {
  const forecasts = { ...series.forecasts };
  const forecastsExact = { ...(series.forecastsExact ?? {}) };
  resolutions.forEach(({ period, editable, amount, amountExact }) => {
    if (!editable || amount === null || amountExact === null) {
      delete forecasts[period];
      delete forecastsExact[period];
      return;
    }
    forecasts[period] = amount;
    forecastsExact[period] = amountExact;
  });
  return {
    ...series,
    actuals: { ...series.actuals },
    actualsExact: series.actualsExact ? { ...series.actualsExact } : undefined,
    forecasts,
    forecastsExact
  };
};

/** Resolve a Multiple row without conflating an absent child fact with an explicit zero. */
export const resolveConsumptionControlTotal = (
  plans: readonly ConsumptionPlan[],
  month: string,
  manualAmount: number | undefined,
  manualAmountExact?: string
): ConsumptionControlResolution => {
  const childValues = plans.flatMap((plan) => {
    if (Object.prototype.hasOwnProperty.call(plan.actuals, month)) return [{
      amount: plan.actuals[month], exact: plan.actualsExact?.[month] ?? String(plan.actuals[month])
    }];
    if (Object.prototype.hasOwnProperty.call(plan.forecasts, month)) return [{
      amount: plan.forecasts[month], exact: plan.forecastsExact?.[month] ?? String(plan.forecasts[month])
    }];
    return [];
  });
  const hasNonZeroDetail = childValues.some((value) => compareExactDecimals(value.exact, "0") !== 0);
  if (hasNonZeroDetail) {
    const amountExact = childValues.reduce((sum, value) => addExactDecimals(sum, value.exact), "0");
    return { amount: exactDecimalToChartCoordinate(amountExact), amountExact, detailState: "VALUE", editable: false, source: "DETAIL" };
  }
  if (childValues.length > 0 && manualAmount === undefined) {
    return { amount: 0, amountExact: "0", detailState: "ZERO", editable: true, source: "DETAIL" };
  }
  return {
    amount: manualAmount ?? null,
    amountExact: manualAmountExact ?? (manualAmount === undefined ? null : String(manualAmount)),
    detailState: childValues.length === 0 ? "MISSING" : "ZERO",
    editable: true,
    source: "MANUAL"
  };
};

export const getLatestActualMonth = (plans: readonly ConsumptionPlan[]): string | null => {
  const populatedMonths = new Set(plans.flatMap((plan) => Object.keys(plan.actuals)));
  const orderedMonths = sortConsumptionMonths([...populatedMonths]);
  return orderedMonths[orderedMonths.length - 1] ?? null;
};

export const getFiscalQuarter = (monthKey: string): string => {
  const match = /^(FY\d{2})-([A-Z]{3})$/.exec(monthKey);
  if (!match) throw new Error(`Invalid fiscal month: ${monthKey}`);
  const quarter = Object.entries(quarterMonths).find(([, months]) => months.includes(match[2]))?.[0];
  if (!quarter) throw new Error(`Unsupported fiscal month: ${monthKey}`);
  return `${match[1]}-${quarter}`;
};

export const getNextQuarterMonths = (latestActualMonth: string): string[] => {
  const match = /^FY(\d{2})-([A-Z]{3})$/.exec(latestActualMonth);
  if (!match) throw new Error(`Invalid fiscal month: ${latestActualMonth}`);
  const monthIndex = oracleFiscalMonths.findIndex((month) => month === match[2]);
  if (monthIndex < 0) throw new Error(`Unsupported fiscal month: ${latestActualMonth}`);
  const fiscalYear = Number(match[1]);
  return [1, 2, 3].map((offset) => {
    const absoluteIndex = monthIndex + offset;
    const nextMonth = oracleFiscalMonths[absoluteIndex % oracleFiscalMonths.length];
    const nextFiscalYear = fiscalYear + Math.floor(absoluteIndex / oracleFiscalMonths.length);
    return `FY${String(nextFiscalYear).padStart(2, "0")}-${nextMonth}`;
  });
};

export const getQuarterMonths = (quarter: string): string[] => {
  const match = /^(FY\d{2})-(Q[1-4])$/.exec(quarter);
  if (!match) throw new Error(`Invalid fiscal quarter: ${quarter}`);
  return quarterMonths[match[2]].map((month) => `${match[1]}-${month}`);
};

const fiscalQuarterOrder = (quarter: string): number => {
  const match = /^FY(\d{2})-Q([1-4])$/.exec(quarter);
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : Number.MAX_SAFE_INTEGER;
};

export const expandConsumptionQuarterOptions = (quarters: readonly string[]): string[] => {
  const fiscalYears = [...new Set(quarters.flatMap((quarter) => {
    const match = /^(FY\d{2})-Q[1-4]$/.exec(quarter);
    return match ? [match[1]] : [];
  }))];
  return fiscalYears.flatMap((fiscalYear) => [1, 2, 3, 4].map((quarter) => `${fiscalYear}-Q${quarter}`))
    .sort((left, right) => fiscalQuarterOrder(left) - fiscalQuarterOrder(right));
};

export const isConsumptionQuarterRangeValid = (fromQuarter: string, toQuarter: string): boolean =>
  fiscalQuarterOrder(fromQuarter) !== Number.MAX_SAFE_INTEGER
  && fiscalQuarterOrder(toQuarter) !== Number.MAX_SAFE_INTEGER
  && fiscalQuarterOrder(fromQuarter) <= fiscalQuarterOrder(toQuarter);

export const isConsumptionPeriodInQuarterRange = (periodKey: string, fromQuarter: string, toQuarter: string): boolean => {
  const period = fiscalQuarterOrder(getFiscalQuarter(periodKey));
  const from = fiscalQuarterOrder(fromQuarter);
  const to = fiscalQuarterOrder(toQuarter);
  return from !== Number.MAX_SAFE_INTEGER && to !== Number.MAX_SAFE_INTEGER && from <= period && period <= to;
};

export const filterVisibleConsumptionPlans = (
  plans: readonly ConsumptionPlan[],
  fromQuarter: string,
  toQuarter: string
): ConsumptionPlan[] => {
  const from = fiscalQuarterOrder(fromQuarter);
  const to = fiscalQuarterOrder(toQuarter);
  if (from === Number.MAX_SAFE_INTEGER || to === Number.MAX_SAFE_INTEGER || from > to) return [];
  const inRange = (periodKey: string) => isConsumptionPeriodInQuarterRange(periodKey, fromQuarter, toQuarter);
  return plans.filter((plan) => Object.entries(plan.actuals).some(([periodKey, amount]) => inRange(periodKey) && amount !== 0)
    || Object.keys(plan.forecasts).some(inRange));
};

const effectiveValue = (series: ConsumptionSeries, month: string): { value: number | null; status: "ACTUAL" | "FORECAST" | "MISSING" } => {
  if (Object.prototype.hasOwnProperty.call(series.actuals, month)) return { value: series.actuals[month], status: "ACTUAL" };
  if (Object.prototype.hasOwnProperty.call(series.forecasts, month)) return { value: series.forecasts[month], status: "FORECAST" };
  return { value: null, status: "MISSING" };
};

const effectiveExactValue = (series: ConsumptionSeries, month: string): string | null => {
  if (Object.prototype.hasOwnProperty.call(series.actuals, month)) return series.actualsExact?.[month] ?? String(series.actuals[month]);
  if (Object.prototype.hasOwnProperty.call(series.forecasts, month)) return series.forecastsExact?.[month] ?? String(series.forecasts[month]);
  return null;
};

export const buildQuarterSummary = (
  series: ConsumptionSeries,
  quarter: string,
  previous: ConsumptionQuarterSummary | null
): ConsumptionQuarterSummary => {
  const months = getQuarterMonths(quarter);
  const values = months.map((month) => effectiveValue(series, month));
  const available = values.filter((item) => item.value !== null);
  const status: ConsumptionMonthStatus = available.length !== 3
    ? "INCOMPLETE"
    : available.every((item) => item.status === "ACTUAL")
      ? "ACTUAL"
      : available.every((item) => item.status === "FORECAST")
        ? "FORECAST"
        : "MIXED";
  const total = values.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const totalExact = months.reduce((sum, month) => addExactDecimals(sum, effectiveExactValue(series, month) ?? "0"), "0");
  const preQGap = previous?.total !== null && previous?.total !== undefined ? total - previous.total : null;
  const preQGapExact = previous?.totalExact !== null && previous?.totalExact !== undefined
    ? subtractExactDecimals(totalExact, previous.totalExact) : null;
  return { quarter, months, total, totalExact, status, preQGap, preQGapExact };
};

export const buildDisplayQuarterSummaries = (
  series: ConsumptionSeries,
  displayQuarterOrder: readonly string[]
): ConsumptionQuarterSummary[] => {
  const displayed = [...new Set(displayQuarterOrder)];
  const suppliedQuarters = [...new Set([...Object.keys(series.actuals), ...Object.keys(series.forecasts)].map(getFiscalQuarter))];
  const chronological = [...new Set([...displayed, ...suppliedQuarters])]
    .sort((left, right) => fiscalQuarterOrder(left) - fiscalQuarterOrder(right));
  let previous: ConsumptionQuarterSummary | null = null;
  const summaries = new Map<string, ConsumptionQuarterSummary>();
  chronological.forEach((quarter) => {
    const summary = buildQuarterSummary(series, quarter, previous);
    summaries.set(quarter, summary);
    previous = summary;
  });
  return displayed.map((quarter) => summaries.get(quarter) as ConsumptionQuarterSummary);
};

export const seedForecastMonths = (plans: readonly ConsumptionPlan[], forecastMonths: readonly string[]): ConsumptionPlan[] =>
  plans.map((plan) => {
    const actualMonths = sortConsumptionMonths(Object.keys(plan.actuals));
    const latestActualMonth = actualMonths[actualMonths.length - 1];
    const latestActualExact = latestActualMonth
      ? plan.actualsExact?.[latestActualMonth] ?? String(plan.actuals[latestActualMonth])
      : "0";
    const latestActualChartCoordinate = exactDecimalToChartCoordinate(latestActualExact);
    const seededMonths = forecastMonths.filter((month) => !Object.prototype.hasOwnProperty.call(plan.forecasts, month)
      && !Object.prototype.hasOwnProperty.call(plan.actuals, month));
    return {
      ...plan,
      actuals: { ...plan.actuals },
      forecasts: {
        ...plan.forecasts,
        ...Object.fromEntries(seededMonths.map((month) => [month, latestActualChartCoordinate]))
      },
      forecastsExact: {
        ...plan.forecastsExact,
        ...Object.fromEntries(seededMonths.map((month) => [month, latestActualExact]))
      }
    };
  });

const signalGrade = (amount: number, percent: number | null): ConsumptionSignalGrade => {
  const absolutePercent = Math.abs(percent ?? 0);
  if (Math.abs(amount) >= 1000 || absolutePercent >= 100) return "CRITICAL";
  if (Math.abs(amount) >= 300 || absolutePercent >= 30) return "HIGH";
  return "WATCH";
};

const medianOf = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const previousDirectionFor = (latest: number, previous: number): ConsumptionPreviousDirection =>
  latest > previous ? "INCREASED" : latest < previous ? "DECREASED" : "UNCHANGED";

const reasonFor = (type: ConsumptionSignalType, amount: number, percent: number | null, previousDirection: ConsumptionPreviousDirection) => {
  const prior = previousDirection === "INCREASED" ? "increased" : previousDirection === "DECREASED" ? "decreased" : "was unchanged";
  if (type === "NEW_USAGE") return `New consumption exceeded the usual zero baseline and ${prior} versus the previous month.`;
  return `Plan consumption was ${type === "ABOVE_USUAL" ? "above" : "below"} its prior three-month median by ${Math.abs(amount).toLocaleString("en-US")} (${Math.abs(percent ?? 0).toFixed(1)}%) and ${prior} versus the previous month.`;
};

const detectPlanSignal = (plan: ConsumptionPlan, months: readonly string[]): ConsumptionSignal | null => {
  if (months.length !== 4 || months.some((month) => !Object.prototype.hasOwnProperty.call(plan.actuals, month))) return null;
  const actuals = months.map((month) => plan.actuals[month]);
  if (actuals.some((amount) => !Number.isFinite(amount))) return null;
  const baseline = actuals.slice(0, 3);
  const baselineMedian = medianOf(baseline);
  const mad = medianOf(baseline.map((amount) => Math.abs(amount - baselineMedian)));
  const allowance = Math.max(50, Math.abs(baselineMedian) * 0.05, mad * 3);
  const latestActual = actuals[3];
  const previousActual = actuals[2];
  const changeAmount = latestActual - baselineMedian;
  if (Math.abs(changeAmount) <= allowance) return null;
  const changePercent = baselineMedian === 0 ? null : changeAmount / Math.abs(baselineMedian) * 100;
  const type: ConsumptionSignalType = baselineMedian === 0 && latestActual > 0
    ? "NEW_USAGE" : changeAmount > 0 ? "ABOVE_USUAL" : "BELOW_USUAL";
  const previousDirection = previousDirectionFor(latestActual, previousActual);
  const lastMonth = months[3];
  return {
    id: `${plan.id}::${lastMonth}::${type}`,
    serverPlanId: plan.serverPlanId,
    customer: plan.customer,
    endUser: plan.endUser,
    planId: plan.planId,
    type,
    grade: signalGrade(changeAmount, changePercent),
    month: lastMonth,
    latestActual,
    baselineMedian,
    changeAmount,
    changePercent,
    mad,
    allowance,
    previousActual,
    previousDirection,
    sparkline: months.map((periodKey, index) => ({ periodKey, actualAmount: actuals[index] })),
    reason: reasonFor(type, changeAmount, changePercent, previousDirection),
    topContributingPlan: plan.planId
  };
};

const gradeOrder: Record<ConsumptionSignalGrade, number> = { CRITICAL: 0, HIGH: 1, WATCH: 2 };
const completedFiscalMonth = (asOf: Date, monthsBack: number) => {
  const businessCalendar = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit"
  }).formatToParts(asOf).map((part) => [part.type, part.value]));
  const month = new Date(Date.UTC(Number(businessCalendar.year), Number(businessCalendar.month) - 1 - monthsBack, 1));
  const fiscalYear = month.getUTCMonth() >= 5 ? month.getUTCFullYear() + 1 : month.getUTCFullYear();
  const monthName = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][month.getUTCMonth()];
  return `FY${String(fiscalYear % 100).padStart(2, "0")}-${monthName}`;
};

export const detectConsumptionSignals = (plans: readonly ConsumptionPlan[], asOf = new Date()): ConsumptionSignal[] => {
  const months = [4, 3, 2, 1].map((monthsBack) => completedFiscalMonth(asOf, monthsBack));
  return plans.map((plan) => detectPlanSignal(plan, months))
    .filter((signal): signal is ConsumptionSignal => signal !== null)
    .sort((left, right) => gradeOrder[left.grade] - gradeOrder[right.grade] || Math.abs(right.changeAmount) - Math.abs(left.changeAmount));
};

/** Local workspace view transform. The loaded workspace remains authoritative; a server adapter can replace this boundary later. */
export const sortAndFilterConsumptionAccounts = (
  accounts: readonly ConsumptionAnalysisAccount[], search: string,
  sort: ConsumptionAccountSort, direction: ConsumptionSortDirection
): ConsumptionAnalysisAccount[] => {
  const query = search.trim().toLocaleLowerCase();
  const filtered = query ? accounts.filter((account) => account.account.toLocaleLowerCase().includes(query)) : [...accounts];
  const factor = direction === "asc" ? 1 : -1;
  const exactTotal = (account: ConsumptionAnalysisAccount) => account.totalAmountExact;
  return filtered.sort((left, right) => factor * (sort === "amount"
    ? compareExactDecimals(exactTotal(left), exactTotal(right)) || left.account.localeCompare(right.account)
    : left.account.localeCompare(right.account)));
};

export const nextConsumptionBatchSize = (total: number, current: number, batchSize = 10): number =>
  Math.min(Math.max(0, total), Math.max(batchSize, current + batchSize));
