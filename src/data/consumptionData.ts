export type ConsumptionMonthStatus = "ACTUAL" | "FORECAST" | "MIXED" | "INCOMPLETE";
export type ConsumptionSignalType = "ABOVE_USUAL" | "BELOW_USUAL" | "NEW_USAGE";
export type ConsumptionPreviousDirection = "INCREASED" | "DECREASED" | "UNCHANGED";
export type ConsumptionSignalGrade = "CRITICAL" | "HIGH" | "WATCH";

export type ConsumptionPlan = Readonly<{
  id: string;
  customer: string;
  endUser: string;
  planId: string;
  dataCenter: string;
  workload?: string;
  planType: string;
  actuals: Record<string, number>;
  forecasts: Record<string, number>;
  serverPlanId?: number;
  versions?: Record<string, number>;
}>;

export type ConsumptionAccount = Readonly<{
  id: string;
  customer: string;
  endUser: string;
  planId: string;
  dataCenter: string;
  planType: "Aggregate";
  actuals: Record<string, number>;
  forecasts: Record<string, number>;
  plans: ConsumptionPlan[];
}>;

export type ConsumptionSeries = ConsumptionPlan | ConsumptionAccount;

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
  status: ConsumptionMonthStatus;
  preQGap: number | null;
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

const parseAmount = (value: string, rowNumber: number, month: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const decimalCurrency = /^\$?[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/;
  if (!decimalCurrency.test(trimmed)) throw new Error(`Consumption CSV row ${rowNumber} has invalid ${month} amount.`);
  const amount = Number(trimmed.replace(/^\$/, "").replace(/,/g, ""));
  if (!Number.isFinite(amount)) throw new Error(`Consumption CSV row ${rowNumber} has invalid ${month} amount.`);
  return amount;
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
    monthIndexes.forEach(([month, index]) => {
      const amount = parseAmount(values[index] ?? "", rowIndex + 2, month);
      if (amount !== null) actualEntries.push([month, amount]);
    });
    const actuals = Object.fromEntries(actualEntries) as Record<string, number>;
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
    const aggregateCompleteMonths = (field: "actuals" | "forecasts", target: Record<string, number>) => {
      const months = new Set(accountPlans.flatMap((plan) => Object.keys(plan[field])));
      months.forEach((month) => {
        if (!accountPlans.every((plan) => Object.prototype.hasOwnProperty.call(plan[field], month))) return;
        target[month] = accountPlans.reduce((sum, plan) => sum + plan[field][month], 0);
      });
    };
    aggregateCompleteMonths("actuals", actuals);
    aggregateCompleteMonths("forecasts", forecasts);
    return {
      id: `account::${customer}`,
      customer,
      endUser: "",
      planId: "",
      dataCenter: "",
      planType: "Aggregate",
      actuals,
      forecasts,
      plans: accountPlans
    };
  });
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

export const isConsumptionQuarterRangeValid = (fromQuarter: string, toQuarter: string): boolean =>
  fiscalQuarterOrder(fromQuarter) !== Number.MAX_SAFE_INTEGER
  && fiscalQuarterOrder(toQuarter) !== Number.MAX_SAFE_INTEGER
  && fiscalQuarterOrder(fromQuarter) <= fiscalQuarterOrder(toQuarter);

const effectiveValue = (series: ConsumptionSeries, month: string): { value: number | null; status: "ACTUAL" | "FORECAST" | "MISSING" } => {
  if (Object.prototype.hasOwnProperty.call(series.actuals, month)) return { value: series.actuals[month], status: "ACTUAL" };
  if (Object.prototype.hasOwnProperty.call(series.forecasts, month)) return { value: series.forecasts[month], status: "FORECAST" };
  return { value: null, status: "MISSING" };
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
  const total = available.length === 0 ? null : available.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const preQGap = total !== null && previous?.total !== null && previous?.total !== undefined ? total - previous.total : null;
  return { quarter, months, total, status, preQGap };
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
    const latestActual = actualMonths.length > 0 ? plan.actuals[actualMonths[actualMonths.length - 1]] : 0;
    return {
      ...plan,
      actuals: { ...plan.actuals },
      forecasts: {
        ...plan.forecasts,
        ...Object.fromEntries(forecastMonths
          .filter((month) => !Object.prototype.hasOwnProperty.call(plan.forecasts, month)
            && !Object.prototype.hasOwnProperty.call(plan.actuals, month))
          .map((month) => [month, latestActual]))
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
