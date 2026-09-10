import {
  ConsumptionPlan,
  ConsumptionSignal,
  ConsumptionAnalysisAccount,
  ConsumptionAnalysisAccountCandidate,
  ConsumptionActualTrendPoint,
  ConsumptionAmountSplit,
  ConsumptionOtherContribution,
  ConsumptionPillar,
  ConsumptionDataCenterBreakdown,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths
} from "./consumptionData";
import { apiFetch } from "../auth/apiFetch";

const apiBase = () => {
  const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: unknown; location?: { hostname?: string; port?: string } };
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim()) return runtime.__KPI_API_BASE_URL__.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") return `http://${runtime.location?.hostname}:18081/api/v1`;
  return "/api/v1";
};

type RawFact = Readonly<{ periodKey: string; actualAmount: number | null; forecastAmount: number | null; versionNo: number; pillar?: unknown }>;
type RawPlan = Readonly<{ planId: number; stableKey: string; account: string; endUser: string; planCode: string; dataCenter: string; dataCenterBreakdown?: unknown; dpDataCenterCount?: unknown; ociOtherDataCenterCount?: unknown; workload?: string | null; facts: RawFact[] }>;
type RawSignalPoint = Readonly<{ periodKey: string; actualAmount: number }>;
type RawSignal = Readonly<{
  signalId: number; planId: number; account: string; endUser: string; planCode: string; periodKey: string;
  type: ConsumptionSignal["type"]; grade: ConsumptionSignal["grade"]; latestActual: number; baselineMedian: number;
  changeAmount: number; changePercent: number | null; mad: number; allowance: number; previousActual: number;
  previousDirection: ConsumptionSignal["previousDirection"]; sparkline: RawSignalPoint[]; reason: string
}>;
type RawControlTotal = Readonly<{
  account: string; periodKey: string; controlAmount: number; detailAmount: number | null; matchStatus: string; pillar?: unknown;
}>;
type RawAccountForecast = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: unknown; amount: number; version: number; status: string; completeness: string }>;
type RawForecastVariance = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: unknown; actualAmount: number | null; forecastAmount: number | null; varianceAmount: number | null; variancePercent: number | null; completeness: string }>;
type RawWorkspace = Readonly<{
  selectedPillar: unknown;
  etag: string;
  lastBatchId: number | null;
  plans: RawPlan[];
  controlTotals: RawControlTotal[];
  signals: RawSignal[];
  currentFiscalMonth?: string | null;
  fromQuarter?: string | null;
  toQuarter?: string | null;
  editablePeriodIds?: string[] | null;
  displayQuarterOrder?: string[] | null;
  availablePillars?: unknown;
  aggregationGrain?: unknown;
  accountForecasts?: RawAccountForecast[];
  forecastVariances?: RawForecastVariance[];
}>;

export type ConsumptionApiWorkspace = Readonly<{
  selectedPillar: ConsumptionPillar;
  etag: string;
  plans: ConsumptionPlan[];
  signals: ConsumptionSignal[];
  controlTotals: ConsumptionApiControlTotal[];
  controlTotalCount: number;
  lastBatchId: number | null;
  currentFiscalMonth: string;
  fromQuarter: string;
  toQuarter: string;
  editablePeriodIds: string[];
  displayQuarterOrder: string[];
  accountForecasts: ConsumptionAccountForecast[];
  forecastVariances: ConsumptionForecastVariance[];
}>;
export type ConsumptionAccountForecast = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: Exclude<ConsumptionPillar, "ALL">; amount: number; version: number; status: "DRAFT" | "FINAL"; completeness: string }>;
export type ConsumptionForecastVariance = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: ConsumptionPillar; actualAmount: number | null; forecastAmount: number | null; varianceAmount: number | null; variancePercent: number | null; completeness: string }>;
export type ConsumptionApiControlTotal = Readonly<{
  account: string; periodKey: string; controlAmount: number; detailAmount: number | null;
  matchStatus: "MATCH" | "MISMATCH" | "NO_DETAIL" | "MANUAL_FORECAST";
}>;
export type ConsumptionWorkspaceRange = Readonly<{ fromQuarter: string; toQuarter: string }>;
export type ConsumptionRecordsQuery = Readonly<{
  fromQuarter: string; toQuarter: string; search: string; sort: "ACCOUNT" | "AMOUNT";
  direction: "ASC" | "DESC"; offset: number; limit: number; pillar?: ConsumptionPillar;
}>;
export type ConsumptionRecordsPage = Omit<ConsumptionApiWorkspace, "signals" | "controlTotalCount"> & Readonly<{
  accountGroups: ReadonlyArray<Readonly<{ account: string; plans: ConsumptionPlan[] }>>;
  totalAccounts: number; nextOffset: number; hasMore: boolean;
}>;
export type ConsumptionAnalysisQuarter = ConsumptionAmountSplit & Readonly<{
  quarter: "Q1" | "Q2" | "Q3" | "Q4"; coveragePercent: number;
  qoqChangeAmount: number | null; qoqChangePercent: number | null;
}>;
export type ConsumptionAnalysisAlert = Readonly<{
  alertId: string; serverPlanId: number; account: string; workload: string; planId: string; periodKey: string;
  type: ConsumptionSignal["type"]; grade: ConsumptionSignal["grade"];
  actualAmount: number; baselineMedian: number; changeAmount: number; changePercent: number | null; reason: string;
}>;
export type ConsumptionOrganicGrowthCategory = "NEW" | "EXPANSION" | "RETURNING_REACTIVATED" | "CONTRACTION" | "STABLE" | "UNCLASSIFIED_INCOMPLETE";
export type ConsumptionOrganicGrowthPoint = Readonly<{
  category: ConsumptionOrganicGrowthCategory;
  amount: number;
  accountCount: number | null;
}>;
export type ConsumptionOrganicGrowthProxy = Readonly<{
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  comparisonQuarter: string;
  expected: boolean;
  openingAmount: number;
  closingAmount: number;
  netGrowthAmount: number;
  classifiedGrowthAmount: number;
  reconciliationAmount: number;
  explanation: string;
  categories: readonly ConsumptionOrganicGrowthPoint[];
}>;
export type ConsumptionAnalysis = Readonly<{
  selectedPillar: ConsumptionPillar;
  fiscalYear: string; priorFiscalYear: string; selectedAccount: string | null;
  portfolio: ConsumptionAmountSplit & Readonly<{
    coveragePercent: number; priorActualAmount: number; priorForecastAmount: number; priorTotalAmount: number;
    priorStatus: ConsumptionAmountSplit["status"]; priorCoveragePercent: number;
  }>;
  quarters: readonly ConsumptionAnalysisQuarter[];
  accountCandidates: readonly ConsumptionAnalysisAccountCandidate[];
  contextActualTrend: readonly ConsumptionActualTrendPoint[];
  otherContribution: ConsumptionOtherContribution | null;
  otherContributionUnavailableReason: string | null;
  alerts: readonly ConsumptionAnalysisAlert[];
  accounts: readonly ConsumptionAnalysisAccount[];
  organicConsumptionGrowthProxy: ConsumptionOrganicGrowthProxy | null;
}>;
export type ConsumptionAnalysisQuery = Readonly<{ fiscalYear: string; search: string; account: string; pillar?: ConsumptionPillar }>;
export type ConsumptionControlForecastUpdate = Readonly<{ account: string; periodKey: string; pillar: Exclude<ConsumptionPillar, "ALL">; amount: number }>;
export type ConsumptionImportFilePreview = Readonly<{
  fileName: string; owner: string; fromPeriod: string; toPeriod: string; detectedPillar: Exclude<ConsumptionPillar, "ALL">;
  sourceSha256: string; planCount: number; controlTotalCount: number; sourceRowCount: number;
}>;
export type ConsumptionImportConflict = Readonly<{
  key: string; files: readonly string[]; values: readonly (string | null)[];
  fileOrdinals: readonly number[]; rows: readonly number[];
  reason: "DUPLICATE_PLAN_ROW" | "CONFLICTING_UPLOAD_VALUE";
}>;
export type ConsumptionImportOverwrite = Readonly<{
  key: string; existingValue: number; newValue: number; fileName: string;
}>;
export type ConsumptionImportPreview = Readonly<{
  selectedPillar: ConsumptionPillar; files: readonly ConsumptionImportFilePreview[];
  planCount: number; controlTotalCount: number; sourceRowCount: number; physicalFactCount: number;
  insertFactCount: number; skippedFactCount: number; exactReplayFileCount: number; deleteFactCount: number;
  sameValueDuplicateCount: number; existingSameValueCount: number;
  overwriteCount: number; overwrites: readonly ConsumptionImportOverwrite[];
  conflictCount: number; conflicts: readonly ConsumptionImportConflict[]; hasConflicts: boolean;
}>;
export type ConsumptionImportResult = Readonly<{
  workspace: ConsumptionApiWorkspace;
  selectedPillar: ConsumptionPillar;
  planCount: number;
  controlTotalCount: number;
  insertedCount: number;
  updatedCount: number;
  noOpCount: number;
  conflictCount: number;
  appliedCount: number;
  sourceRowCount: number;
}>;
export type ConsumptionMultiImportResult = Readonly<{
  workspace: ConsumptionApiWorkspace;
  batchIds: readonly number[];
  duplicate: boolean;
  physicalFactCount: number;
  deduplicatedFactCount: number;
  insertedFactCount: number;
  unchangedFactCount: number;
  overwrittenFactCount: number;
  skippedFactCount: number;
  deletedFactCount: number;
}>;
export type ConsumptionCsvExport = Readonly<{ blob: Blob; fileName: string }>;
export type ConsumptionForecastWideResolution = "EXACT_PLAN" | "SIMILAR_ACCOUNT" | "PLAN_UNASSIGNED";
export type ConsumptionForecastWideChange = Readonly<{
  rowNumber: number;
  account: string;
  resolvedAccount: string;
  endUser: string | null;
  planCode: string | null;
  periodKey: string;
  forecastAmount: number;
  existingForecastAmount: number | null;
  resolution: ConsumptionForecastWideResolution;
}>;
export type ConsumptionForecastWideBlockedError = Readonly<{
  rowNumber: number;
  column: string | null;
  code: string;
  message: string;
}>;
export type ConsumptionForecastWidePreview = Readonly<{
  etag: string;
  sourceFileName: string;
  sourceSha256: string;
  sourceRowCount: number;
  forecastCellCount: number;
  blankNoOpCount: number;
  explicitZeroCount: number;
  exactReplay: boolean;
  similarAccountResolutionCount: number;
  planUnassignedCount: number;
  changes: readonly ConsumptionForecastWideChange[];
  blockedErrors: readonly ConsumptionForecastWideBlockedError[];
  hasBlockedErrors: boolean;
}>;
export type ConsumptionForecastWideApplyResult = Readonly<{
  workspace: ConsumptionApiWorkspace;
  batchId: number;
  exactReplay: boolean;
  appliedCount: number;
  noOpCount: number;
  explicitZeroCount: number;
  planUnassignedCount: number;
}>;

export class ConsumptionApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); this.name = "ConsumptionApiError"; }
}
export class ConsumptionNetworkError extends Error {
  constructor(public readonly cause: unknown) { super("Consumption API is unreachable"); this.name = "ConsumptionNetworkError"; }
}
export class ConsumptionConflictError extends ConsumptionApiError {
  constructor(message: string, public readonly current: ConsumptionApiWorkspace) { super(409, "VERSION_CONFLICT", message); this.name = "ConsumptionConflictError"; }
}
export const canUseConsumptionFallback = (error: unknown) => {
  const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: unknown; location?: { hostname?: string } };
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim()) return false;
  if (!["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "")) return false;
  return error instanceof ConsumptionNetworkError || (error instanceof ConsumptionApiError && error.status === 404);
};

const signalTypes = new Set<ConsumptionSignal["type"]>(["ABOVE_USUAL", "BELOW_USUAL", "NEW_USAGE"]);
const previousDirections = new Set<ConsumptionSignal["previousDirection"]>(["INCREASED", "DECREASED", "UNCHANGED"]);
const signalGrades = new Set<ConsumptionSignal["grade"]>(["CRITICAL", "HIGH", "WATCH"]);
const fiscalPeriodPattern = /^FY\d{2}-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/;
const fiscalQuarterPattern = /^FY\d{2}-Q[1-4]$/;
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNullableFiniteNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const isDecimalString = (value: unknown): value is string => typeof value === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value);
const isNullableDecimalString = (value: unknown): value is string | null => value === null || isDecimalString(value);
const isCoveragePercent = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 100;
const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isPeriodKey = (value: unknown): value is string => typeof value === "string" && fiscalPeriodPattern.test(value);
const isQuarterKey = (value: unknown): value is string => typeof value === "string" && fiscalQuarterPattern.test(value);
const isFiscalYear = (value: unknown): value is string => typeof value === "string" && /^FY\d{2}$/.test(value);
const consumptionPillars = new Set<ConsumptionPillar>(["ALL", "DP", "OCI_OTHER"]);
const isConsumptionPillar = (value: unknown): value is ConsumptionPillar => consumptionPillars.has(value as ConsumptionPillar);
const sha256Pattern = /^[a-f0-9]{64}$/i;
const parseDataCenterBreakdown = (value: unknown, dpValue?: unknown, ociValue?: unknown): ConsumptionDataCenterBreakdown | undefined => {
  if ((value === undefined || value === null) && dpValue === undefined && ociValue === undefined) return undefined;
  if (value === undefined || value === null) {
    const valid = (candidate: unknown) => candidate === null || candidate === undefined || isNonNegativeInteger(candidate);
    if (!valid(dpValue) || !valid(ociValue)) throw new Error("Malformed Consumption plan response");
    return { dpCount: dpValue == null ? null : dpValue as number, ociOtherCount: ociValue == null ? null : ociValue as number,
      duplicatePossible: dpValue != null && ociValue != null };
  }
  if (typeof value !== "object") throw new Error("Malformed Consumption plan response");
  const raw = value as Record<string, unknown>;
  const valid = (candidate: unknown) => candidate === null || isNonNegativeInteger(candidate);
  if (!valid(raw.dpCount) || !valid(raw.ociOtherCount) || typeof raw.duplicatePossible !== "boolean") {
    throw new Error("Malformed Consumption plan response");
  }
  return { dpCount: raw.dpCount as number | null, ociOtherCount: raw.ociOtherCount as number | null, duplicatePossible: raw.duplicatePossible };
};
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
const fiscalMonths = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"];
const fiscalPeriodOrder = (periodKey: string) => {
  const match = /^FY(\d{2})-([A-Z]{3})$/.exec(periodKey);
  return match ? Number(match[1]) * fiscalMonths.length + fiscalMonths.indexOf(match[2]) : Number.NaN;
};
const medianOf = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round4 = (value: number) => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 10_000) / 10_000;
const expectedSignalGrade = (amount: number, percent: number | null): ConsumptionSignal["grade"] =>
  Math.abs(amount) >= 1000 || Math.abs(percent ?? 0) >= 100 ? "CRITICAL"
    : Math.abs(amount) >= 300 || Math.abs(percent ?? 0) >= 30 ? "HIGH" : "WATCH";

const amountStatuses = new Set<ConsumptionAmountSplit["status"]>(["ACTUAL", "FORECAST", "MIXED", "INCOMPLETE"]);
const controlMatchStatuses = new Set<ConsumptionApiControlTotal["matchStatus"]>(["MATCH", "MISMATCH", "NO_DETAIL", "MANUAL_FORECAST"]);
const malformedAnalysis = (): never => { throw new Error("Malformed Consumption analysis response"); };
const parseAmountSplit = (value: unknown): ConsumptionAmountSplit => {
  if (typeof value !== "object" || value === null) return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.actualAmount) || !isFiniteNumber(raw.forecastAmount)
    || !isFiniteNumber(raw.totalAmount) || !amountStatuses.has(raw.status as ConsumptionAmountSplit["status"])
    || !nearlyEqual(raw.totalAmount, raw.actualAmount + raw.forecastAmount)) return malformedAnalysis();
  return { actualAmount: raw.actualAmount, forecastAmount: raw.forecastAmount, totalAmount: raw.totalAmount,
    status: raw.status as ConsumptionAmountSplit["status"] };
};
const parseActualTrend = (value: unknown, allowedTrendYears: ReadonlySet<string>): ConsumptionActualTrendPoint[] => {
  if (!Array.isArray(value)) return malformedAnalysis();
  const actualTrend = value.map((point) => {
    if (typeof point !== "object" || point === null) return malformedAnalysis();
    const rawPoint = point as Record<string, unknown>;
    if (!isPeriodKey(rawPoint.periodKey) || !isNullableFiniteNumber(rawPoint.actualAmount)
      || typeof rawPoint.alertCalculationMonth !== "boolean") return malformedAnalysis();
    return { periodKey: rawPoint.periodKey, actualAmount: rawPoint.actualAmount,
      alertCalculationMonth: rawPoint.alertCalculationMonth };
  });
  let priorTrendOrder = Number.NEGATIVE_INFINITY;
  const seenTrendPeriods = new Set<string>();
  actualTrend.forEach((point) => {
    const order = fiscalPeriodOrder(point.periodKey);
    if (!allowedTrendYears.has(point.periodKey.slice(0, 4)) || seenTrendPeriods.has(point.periodKey) || order <= priorTrendOrder) {
      return malformedAnalysis();
    }
    seenTrendPeriods.add(point.periodKey); priorTrendOrder = order;
  });
  return actualTrend;
};
const parseAnalysisPlan = (value: unknown, allowedTrendYears: ReadonlySet<string>) => {
  const split = parseAmountSplit(value);
  const raw = value as Record<string, unknown>;
  if (!isPositiveInteger(raw.serverPlanId) || !isNonEmptyString(raw.planId) || !isNonEmptyString(raw.endUser) || !isNonEmptyString(raw.dataCenter)
    || !isFiniteNumber(raw.percentage)) return malformedAnalysis();
  return { ...split, serverPlanId: raw.serverPlanId, planId: raw.planId, endUser: raw.endUser, dataCenter: raw.dataCenter,
    dataCenterBreakdown: parseDataCenterBreakdown(raw.dataCenterBreakdown, raw.dpDataCenterCount, raw.ociOtherDataCenterCount),
    percentage: raw.percentage, actualTrend: parseActualTrend(raw.actualTrend, allowedTrendYears) };
};
const organicGrowthCategories: readonly ConsumptionOrganicGrowthCategory[] = [
  "NEW", "EXPANSION", "RETURNING_REACTIVATED", "CONTRACTION", "STABLE", "UNCLASSIFIED_INCOMPLETE"
];
const parseOrganicGrowthProxy = (value: unknown): ConsumptionOrganicGrowthProxy | null => {
  // The analysis endpoint may omit this additive DTO while an older server is rolling forward.
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  if (!["Q1", "Q2", "Q3", "Q4"].includes(String(raw.quarter)) || !isQuarterKey(raw.comparisonQuarter)
    || typeof raw.expected !== "boolean" || !isFiniteNumber(raw.openingAmount) || !isFiniteNumber(raw.closingAmount)
    || !isFiniteNumber(raw.netGrowthAmount) || !isFiniteNumber(raw.classifiedGrowthAmount)
    || !isFiniteNumber(raw.reconciliationAmount) || !isNonEmptyString(raw.explanation) || !Array.isArray(raw.categories)) {
    return malformedAnalysis();
  }
  const categories = raw.categories.map((entry) => {
    if (typeof entry !== "object" || entry === null) return malformedAnalysis();
    const point = entry as Record<string, unknown>;
    if (!organicGrowthCategories.includes(point.category as ConsumptionOrganicGrowthCategory)
      || !isFiniteNumber(point.amount) || !(point.accountCount === null || isNonNegativeInteger(point.accountCount))) return malformedAnalysis();
    return { category: point.category as ConsumptionOrganicGrowthCategory, amount: point.amount, accountCount: point.accountCount as number | null };
  });
  if (categories.length !== organicGrowthCategories.length
    || categories.some((point, index) => point.category !== organicGrowthCategories[index])
    || !nearlyEqual(raw.netGrowthAmount, raw.closingAmount - raw.openingAmount)
    || !nearlyEqual(raw.classifiedGrowthAmount, categories.reduce((sum, point) => sum + point.amount, 0))
    || !nearlyEqual(raw.reconciliationAmount, raw.netGrowthAmount - raw.classifiedGrowthAmount)) return malformedAnalysis();
  return { quarter: raw.quarter as ConsumptionOrganicGrowthProxy["quarter"], comparisonQuarter: raw.comparisonQuarter as string,
    expected: raw.expected, openingAmount: raw.openingAmount, closingAmount: raw.closingAmount,
    netGrowthAmount: raw.netGrowthAmount, classifiedGrowthAmount: raw.classifiedGrowthAmount,
    reconciliationAmount: raw.reconciliationAmount, explanation: raw.explanation, categories };
};
const parseConsumptionAnalysis = (value: unknown): ConsumptionAnalysis => {
  if (typeof value !== "object" || value === null) return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  const selectedPillarValue: unknown = raw.selectedPillar;
  if (!isConsumptionPillar(selectedPillarValue) || !isFiscalYear(raw.fiscalYear) || !isFiscalYear(raw.priorFiscalYear)
    || !(raw.selectedAccount === null || isNonEmptyString(raw.selectedAccount)) || !Array.isArray(raw.quarters)
    || (raw.accountCandidates !== undefined && !Array.isArray(raw.accountCandidates))
    || !Array.isArray(raw.contextActualTrend)
    || !(raw.otherContribution === null || (typeof raw.otherContribution === "object" && raw.otherContribution !== null))
    || !(raw.otherContributionUnavailableReason === null || isNonEmptyString(raw.otherContributionUnavailableReason))
    || (raw.otherContribution !== null && raw.otherContributionUnavailableReason !== null)
    || !Array.isArray(raw.alerts) || !Array.isArray(raw.accounts)) return malformedAnalysis();
  const allowedTrendYears = new Set([raw.priorFiscalYear, raw.fiscalYear]);
  const portfolioSplit = parseAmountSplit(raw.portfolio);
  const portfolioRaw = raw.portfolio as Record<string, unknown>;
  if (!isFiniteNumber(portfolioRaw.priorActualAmount)
    || !isFiniteNumber(portfolioRaw.priorForecastAmount)
    || !isFiniteNumber(portfolioRaw.priorTotalAmount)
    || !nearlyEqual(portfolioRaw.priorTotalAmount, portfolioRaw.priorActualAmount + portfolioRaw.priorForecastAmount)
    || !amountStatuses.has(portfolioRaw.priorStatus as ConsumptionAmountSplit["status"])
    || !isCoveragePercent(portfolioRaw.coveragePercent) || !isCoveragePercent(portfolioRaw.priorCoveragePercent)) return malformedAnalysis();
  const quarters = raw.quarters.map((value) => {
    const split = parseAmountSplit(value); const quarter = value as Record<string, unknown>;
    if (!["Q1", "Q2", "Q3", "Q4"].includes(String(quarter.quarter)) || !isCoveragePercent(quarter.coveragePercent)
      || !isNullableFiniteNumber(quarter.qoqChangeAmount)
      || !isNullableFiniteNumber(quarter.qoqChangePercent)) return malformedAnalysis();
    return { ...split, quarter: quarter.quarter as ConsumptionAnalysisQuarter["quarter"],
      coveragePercent: quarter.coveragePercent, qoqChangeAmount: quarter.qoqChangeAmount, qoqChangePercent: quarter.qoqChangePercent };
  });
  if (quarters.length !== 4 || quarters.some((quarter, index) => quarter.quarter !== `Q${index + 1}`)) return malformedAnalysis();
  const accounts: ConsumptionAnalysisAccount[] = raw.accounts.map((value) => {
    const split = parseAmountSplit(value); const account = value as Record<string, unknown>;
    if (!isNonEmptyString(account.account) || !isFiniteNumber(account.percentage) || !Array.isArray(account.workloads)) return malformedAnalysis();
    const workloads = account.workloads.map((value) => {
      const workloadSplit = parseAmountSplit(value); const workload = value as Record<string, unknown>;
      if (!isNonEmptyString(workload.workload) || !isFiniteNumber(workload.percentage) || !Array.isArray(workload.plans)) return malformedAnalysis();
      return { ...workloadSplit, workload: workload.workload, percentage: workload.percentage,
        plans: workload.plans.map((plan) => parseAnalysisPlan(plan, allowedTrendYears)) };
    });
    if (new Set(workloads.map((workload) => workload.workload)).size !== workloads.length) return malformedAnalysis();
    return { ...split, account: account.account, percentage: account.percentage, workloads };
  });
  if (new Set(accounts.map((account) => account.account)).size !== accounts.length) return malformedAnalysis();
  const rawAccountCandidates = Array.isArray(raw.accountCandidates) ? raw.accountCandidates : accounts.map((account) => ({
    account: account.account,
    workloads: account.workloads.map((workload) => workload.workload),
    planIds: [...new Set(account.workloads.flatMap((workload) => workload.plans.map((plan) => plan.planId)))]
  }));
  const accountCandidates: ConsumptionAnalysisAccountCandidate[] = rawAccountCandidates.map((value) => {
    if (typeof value !== "object" || value === null) return malformedAnalysis();
    const candidate = value as Record<string, unknown>;
    if (!isNonEmptyString(candidate.account) || !Array.isArray(candidate.workloads) || !Array.isArray(candidate.planIds)
      || candidate.workloads.some((workload) => !isNonEmptyString(workload))
      || candidate.planIds.some((planId) => !isNonEmptyString(planId))
      || new Set(candidate.workloads).size !== candidate.workloads.length
      || new Set(candidate.planIds).size !== candidate.planIds.length) return malformedAnalysis();
    return { account: candidate.account, workloads: candidate.workloads as string[], planIds: candidate.planIds as string[] };
  });
  if (new Set(accountCandidates.map((candidate) => candidate.account)).size !== accountCandidates.length) return malformedAnalysis();
  const contextActualTrend = parseActualTrend(raw.contextActualTrend, allowedTrendYears);
  const organicConsumptionGrowthProxy = parseOrganicGrowthProxy(raw.organicConsumptionGrowthProxy);
  const otherContribution: ConsumptionOtherContribution | null = raw.otherContribution === null ? null : (() => {
    const split = parseAmountSplit(raw.otherContribution);
    const other = raw.otherContribution as Record<string, unknown>;
    if (!Array.isArray(other.accountNames) || other.accountNames.length === 0 || other.accountNames.some((account) => !isNonEmptyString(account))
      || new Set(other.accountNames).size !== other.accountNames.length || !isFiniteNumber(other.percentage) || !Array.isArray(other.plans)) return malformedAnalysis();
    const accountNames = new Set(other.accountNames as string[]);
    const plans = other.plans.map((value) => {
      const plan = parseAnalysisPlan(value, allowedTrendYears);
      const rawPlan = value as Record<string, unknown>;
      if (!isNonEmptyString(rawPlan.account) || !accountNames.has(rawPlan.account) || !isNonEmptyString(rawPlan.workload)) return malformedAnalysis();
      return { ...plan, account: rawPlan.account, workload: rawPlan.workload };
    });
    if (new Set(plans.map((plan) => plan.serverPlanId)).size !== plans.length) return malformedAnalysis();
    return { ...split, accountNames: other.accountNames as string[], percentage: other.percentage, plans };
  })();
  const seenAnalysisPlanIds = new Set<number>();
  accounts.forEach((account) => account.workloads.forEach((workload) => workload.plans.forEach((plan) => {
    if (seenAnalysisPlanIds.has(plan.serverPlanId)) return malformedAnalysis();
    seenAnalysisPlanIds.add(plan.serverPlanId);
  })));
  const alerts: ConsumptionAnalysisAlert[] = raw.alerts.map((value) => {
    if (typeof value !== "object" || value === null) return malformedAnalysis();
    const alert = value as Record<string, unknown>;
    if (!isNonEmptyString(alert.alertId) || !isPositiveInteger(alert.serverPlanId) || !isNonEmptyString(alert.account) || !isNonEmptyString(alert.workload)
      || !isNonEmptyString(alert.planId) || !isPeriodKey(alert.periodKey) || !signalTypes.has(alert.type as ConsumptionSignal["type"])
      || !signalGrades.has(alert.grade as ConsumptionSignal["grade"]) || !isFiniteNumber(alert.actualAmount)
      || !isFiniteNumber(alert.baselineMedian) || !isFiniteNumber(alert.changeAmount)
      || !isNullableFiniteNumber(alert.changePercent) || !isNonEmptyString(alert.reason)) return malformedAnalysis();
    return alert as unknown as ConsumptionAnalysisAlert;
  });
  if (new Set(alerts.map((alert) => alert.alertId)).size !== alerts.length) return malformedAnalysis();
  alerts.forEach((alert) => {
    const matches = accounts.flatMap((account) => account.workloads.flatMap((workload) => workload.plans.map((plan) => ({ account: account.account, workload: workload.workload, plan })))).filter((entry) => entry.account === alert.account && entry.workload === alert.workload && entry.plan.serverPlanId === alert.serverPlanId && entry.plan.planId === alert.planId);
    if (matches.length !== 1) return malformedAnalysis();
  });
  const selectedPillar = selectedPillarValue;
  return { selectedPillar,
    fiscalYear: raw.fiscalYear as string, priorFiscalYear: raw.priorFiscalYear as string, selectedAccount: raw.selectedAccount as string | null,
    portfolio: { ...portfolioSplit, priorActualAmount: portfolioRaw.priorActualAmount,
      priorForecastAmount: portfolioRaw.priorForecastAmount, priorTotalAmount: portfolioRaw.priorTotalAmount,
      coveragePercent: portfolioRaw.coveragePercent, priorStatus: portfolioRaw.priorStatus as ConsumptionAmountSplit["status"],
      priorCoveragePercent: portfolioRaw.priorCoveragePercent }, quarters, accountCandidates, contextActualTrend, otherContribution,
    otherContributionUnavailableReason: raw.otherContributionUnavailableReason as string | null, alerts, accounts,
    organicConsumptionGrowthProxy };
};

const parseWorkspace = (value: unknown, headerEtag?: string | null, expectedPillar?: ConsumptionPillar): ConsumptionApiWorkspace => {
  if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption workspace response");
  const raw = value as RawWorkspace;
  const selectedPillarValue: unknown = raw.selectedPillar;
  if (!isConsumptionPillar(selectedPillarValue) || (expectedPillar !== undefined && selectedPillarValue !== expectedPillar)) {
    throw new Error("Malformed Consumption workspace pillar");
  }
  const selectedPillar = selectedPillarValue;
  if(expectedPillar!==undefined&&(!Array.isArray(raw.availablePillars)
    ||raw.availablePillars.length!==3||raw.availablePillars[0]!=="ALL"||raw.availablePillars[1]!=="DP"||raw.availablePillars[2]!=="OCI_OTHER"
    ||raw.aggregationGrain!=="PLAN_PERIOD"))throw new Error("Malformed Consumption workspace pillar metadata");
  if (!Array.isArray(raw.plans) || !Array.isArray(raw.signals) || !Array.isArray(raw.controlTotals)) throw new Error("Malformed Consumption workspace response");
  const etag = headerEtag ?? raw.etag;
  if (!isNonEmptyString(etag) || !(raw.lastBatchId === null || isPositiveInteger(raw.lastBatchId))) throw new Error("Malformed Consumption workspace metadata");
  if (raw.controlTotals.some((control) => !isNonEmptyString(control?.account) || !isPeriodKey(control?.periodKey)
    || !isFiniteNumber(control?.controlAmount) || !isNullableFiniteNumber(control?.detailAmount)
    || !controlMatchStatuses.has(control?.matchStatus as ConsumptionApiControlTotal["matchStatus"])
    ||(expectedPillar!==undefined&&control?.pillar!==selectedPillar))) throw new Error("Malformed Consumption control total response");
  const seenControlKeys = new Set<string>();
  const controlTotals: ConsumptionApiControlTotal[] = raw.controlTotals.map((control) => {
    const key = `${control.account}::${control.periodKey}`;
    if (seenControlKeys.has(key)) throw new Error("Malformed Consumption control total response");
    seenControlKeys.add(key);
    return { ...control, matchStatus: control.matchStatus as ConsumptionApiControlTotal["matchStatus"] };
  });
  const accountForecasts=(raw.accountForecasts ?? []).map((forecast):ConsumptionAccountForecast=>{
    if(!forecast||!isNonEmptyString(forecast.account)||!isNonEmptyString(forecast.normalizedAccount)||!isPeriodKey(forecast.periodKey)
      ||!(forecast.pillar==="DP"||forecast.pillar==="OCI_OTHER")||!isFiniteNumber(forecast.amount)||forecast.amount<0
      ||!isPositiveInteger(forecast.version)||!(forecast.status==="DRAFT"||forecast.status==="FINAL")||!isNonEmptyString(forecast.completeness))
      throw new Error("Malformed Consumption account forecast");
    return forecast as ConsumptionAccountForecast;
  });
  const forecastVariances=(raw.forecastVariances ?? []).map((variance):ConsumptionForecastVariance=>{
    if(!variance||!isNonEmptyString(variance.account)||!isNonEmptyString(variance.normalizedAccount)||!isPeriodKey(variance.periodKey)
      ||!isConsumptionPillar(variance.pillar)||!isNullableFiniteNumber(variance.actualAmount)||!isNullableFiniteNumber(variance.forecastAmount)
      ||!isNullableFiniteNumber(variance.varianceAmount)||!isNullableFiniteNumber(variance.variancePercent)||!isNonEmptyString(variance.completeness))
      throw new Error("Malformed Consumption forecast variance");
    return variance as ConsumptionForecastVariance;
  });
  const seenPlanIds = new Set<number>();
  const seenStableKeys = new Set<string>();
  const basePlans: ConsumptionPlan[] = raw.plans.map((plan) => {
    if (!isPositiveInteger(plan?.planId) || !isNonEmptyString(plan?.stableKey) || !isNonEmptyString(plan?.account)
      || !isNonEmptyString(plan?.endUser) || !isNonEmptyString(plan?.planCode) || !isNonEmptyString(plan?.dataCenter)
      || (plan.workload !== null && plan.workload !== undefined && !isNonEmptyString(plan.workload))
      ||(expectedPillar!==undefined&&(!Object.prototype.hasOwnProperty.call(plan,"dpDataCenterCount")
        ||!Object.prototype.hasOwnProperty.call(plan,"ociOtherDataCenterCount")
        ||!(plan.dpDataCenterCount==null||isNonNegativeInteger(plan.dpDataCenterCount))
        ||!(plan.ociOtherDataCenterCount==null||isNonNegativeInteger(plan.ociOtherDataCenterCount))))
      || !Array.isArray(plan?.facts)) throw new Error("Malformed Consumption plan response");
    if (seenPlanIds.has(plan.planId) || seenStableKeys.has(plan.stableKey)) throw new Error("Malformed Consumption plan response");
    seenPlanIds.add(plan.planId); seenStableKeys.add(plan.stableKey);
    const actuals: Record<string, number> = {};
    const forecasts: Record<string, number> = {};
    const versions: Record<string, number> = {};
    plan.facts.forEach((fact) => {
      if (!isPeriodKey(fact?.periodKey) || !isNullableFiniteNumber(fact?.actualAmount)
        || !isNullableFiniteNumber(fact?.forecastAmount) || !isNonNegativeInteger(fact?.versionNo)
        ||(expectedPillar!==undefined&&(fact.actualAmount!==null?fact.pillar!==selectedPillar:fact.pillar!=null))) throw new Error("Malformed Consumption fact response");
      if (Object.prototype.hasOwnProperty.call(versions, fact.periodKey)) throw new Error("Malformed Consumption fact response");
      versions[fact.periodKey] = fact.versionNo;
      // Actual is the visible effective value, but the finalized forecast is retained for audit and exact replay.
      if (fact.actualAmount !== null) actuals[fact.periodKey] = fact.actualAmount;
      if (fact.forecastAmount !== null) forecasts[fact.periodKey] = fact.forecastAmount;
    });
    const dataCenterBreakdown = parseDataCenterBreakdown(plan.dataCenterBreakdown, plan.dpDataCenterCount, plan.ociOtherDataCenterCount);
    return { id: plan.stableKey, customer: plan.account, endUser: plan.endUser, planId: plan.planCode,
      dataCenter: plan.dataCenter, dataCenterBreakdown, workload: plan.workload ?? undefined, planType: "OCI", actuals, forecasts, serverPlanId: plan.planId, versions };
  });
  const metadataMissing = !raw.currentFiscalMonth && !raw.fromQuarter && !raw.toQuarter
    && (!raw.editablePeriodIds || raw.editablePeriodIds.length === 0)
    && (!raw.displayQuarterOrder || raw.displayQuarterOrder.length === 0);
  let currentFiscalMonth = raw.currentFiscalMonth;
  let fromQuarter = raw.fromQuarter;
  let toQuarter = raw.toQuarter;
  let editablePeriodIds = raw.editablePeriodIds;
  let displayQuarterOrder = raw.displayQuarterOrder;
  if (metadataMissing) {
    const latestActual = getLatestActualMonth(basePlans);
    if (!latestActual) throw new Error("Malformed Consumption workspace metadata");
    const actualMonths = [...new Set(basePlans.flatMap((plan) => Object.keys(plan.actuals)))].sort();
    const actualQuarters = [...new Set(actualMonths.map(getFiscalQuarter))];
    currentFiscalMonth = latestActual;
    fromQuarter = actualQuarters[0] ?? getFiscalQuarter(latestActual);
    toQuarter = getFiscalQuarter(latestActual);
    editablePeriodIds = getNextQuarterMonths(latestActual);
    const forecastQuarters = [...new Set(editablePeriodIds.map(getFiscalQuarter))].reverse();
    displayQuarterOrder = [...forecastQuarters,
      ...actualQuarters.reverse().filter((quarter) => !forecastQuarters.includes(quarter))];
  }
  if (!isPeriodKey(currentFiscalMonth) || !isQuarterKey(fromQuarter) || !isQuarterKey(toQuarter)
    || !Array.isArray(editablePeriodIds) || editablePeriodIds.some((period) => !isPeriodKey(period))
    || !Array.isArray(displayQuarterOrder) || displayQuarterOrder.some((quarter) => !isQuarterKey(quarter))
    || new Set(editablePeriodIds).size !== editablePeriodIds.length
    || new Set(displayQuarterOrder).size !== displayQuarterOrder.length) throw new Error("Malformed Consumption workspace metadata");
  const plans = basePlans;
  const byServerId = new Map(plans.map((plan) => [plan.serverPlanId, plan]));
  const signals: ConsumptionSignal[] = raw.signals.map((signal) => {
    if (!isPositiveInteger(signal?.signalId) || !isPositiveInteger(signal?.planId) || signal.signalId !== signal.planId
      || !isNonEmptyString(signal?.account) || !isNonEmptyString(signal?.endUser) || !isNonEmptyString(signal?.planCode)
      || !isPeriodKey(signal?.periodKey) || !signalTypes.has(signal?.type) || !signalGrades.has(signal?.grade)
      || !isFiniteNumber(signal?.latestActual) || signal.latestActual < 0
      || !isFiniteNumber(signal?.baselineMedian) || signal.baselineMedian < 0
      || !isFiniteNumber(signal?.changeAmount) || !isNullableFiniteNumber(signal?.changePercent)
      || !isFiniteNumber(signal?.mad) || signal.mad < 0 || !isFiniteNumber(signal?.allowance) || signal.allowance < 0
      || !isFiniteNumber(signal?.previousActual) || signal.previousActual < 0
      || !previousDirections.has(signal?.previousDirection) || !Array.isArray(signal?.sparkline)
      || signal.sparkline.length !== 4 || !isNonEmptyString(signal?.reason) || !byServerId.has(signal.planId)) {
      throw new Error("Malformed Consumption signal response");
    }
    const sparklineValid = signal.sparkline.every((point, index) => isPeriodKey(point?.periodKey)
      && isFiniteNumber(point?.actualAmount) && point.actualAmount >= 0
      && (index === 0 || fiscalPeriodOrder(point.periodKey) === fiscalPeriodOrder(signal.sparkline[index - 1].periodKey) + 1));
    const baselineValues = signal.sparkline.slice(0, 3).map((point) => point.actualAmount);
    const computedMedian = medianOf(baselineValues);
    const computedMad = medianOf(baselineValues.map((value) => Math.abs(value - computedMedian)));
    const expectedChange = signal.latestActual - computedMedian;
    const expectedAllowance = Math.max(50, Math.abs(computedMedian) * 0.05, computedMad * 3);
    const expectedPercent = computedMedian === 0 ? null : round4(expectedChange / Math.abs(computedMedian) * 100);
    const expectedType: ConsumptionSignal["type"] = computedMedian === 0 && signal.latestActual > 0
      ? "NEW_USAGE" : expectedChange > 0 ? "ABOVE_USUAL" : "BELOW_USUAL";
    const expectedDirection: ConsumptionSignal["previousDirection"] = signal.latestActual > signal.previousActual
      ? "INCREASED" : signal.latestActual < signal.previousActual ? "DECREASED" : "UNCHANGED";
    const plan = byServerId.get(signal.planId);
    if (!sparklineValid || signal.sparkline[3].periodKey !== signal.periodKey
      || !nearlyEqual(signal.sparkline[3].actualAmount, signal.latestActual)
      || !nearlyEqual(signal.sparkline[2].actualAmount, signal.previousActual)
      || !nearlyEqual(signal.baselineMedian, computedMedian) || !nearlyEqual(signal.mad, computedMad)
      || !nearlyEqual(signal.changeAmount, expectedChange) || !nearlyEqual(signal.allowance, expectedAllowance)
      || Math.abs(signal.changeAmount) <= signal.allowance || signal.type !== expectedType
      || signal.previousDirection !== expectedDirection || signal.grade !== expectedSignalGrade(signal.changeAmount, signal.changePercent)
      || (expectedPercent === null ? signal.changePercent !== null : signal.changePercent === null || !nearlyEqual(signal.changePercent, expectedPercent))
      || plan?.customer !== signal.account || plan?.endUser !== signal.endUser || plan?.planId !== signal.planCode) {
      throw new Error("Malformed Consumption signal response");
    }
    return {
      id: `server-signal-${signal.signalId}`, serverPlanId: signal.planId,
      customer: signal.account, endUser: signal.endUser, planId: signal.planCode,
      type: signal.type, grade: signal.grade, month: signal.periodKey, latestActual: signal.latestActual,
      baselineMedian: signal.baselineMedian, changeAmount: signal.changeAmount, changePercent: signal.changePercent,
      mad: signal.mad, allowance: signal.allowance, previousActual: signal.previousActual,
      previousDirection: signal.previousDirection, sparkline: signal.sparkline.map((point) => ({ ...point })),
      reason: signal.reason, topContributingPlan: plan.planId
    };
  });
  return {
    selectedPillar,
    etag,
    plans,
    signals,
    controlTotals,
    controlTotalCount: new Set(raw.controlTotals.map((control) => control.account)).size,
    lastBatchId: raw.lastBatchId,
    currentFiscalMonth,
    fromQuarter,
    toQuarter,
    editablePeriodIds: [...editablePeriodIds],
    displayQuarterOrder: [...displayQuarterOrder],
    accountForecasts,
    forecastVariances
  };
};

const request = async (path: string, init?: RequestInit): Promise<{ response: Response; payload: unknown }> => {
  let response: Response;
  try { response = await apiFetch(`${apiBase()}${path}`, init); } catch (cause) { throw new ConsumptionNetworkError(cause); }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* sanitized below */ }
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null ? payload as { code?: unknown; message?: unknown; current?: unknown } : {};
    if (response.status === 409 && error.code === "VERSION_CONFLICT" && error.current) {
      throw new ConsumptionConflictError(typeof error.message === "string" ? error.message : "Consumption changed on the server", parseWorkspace(error.current, undefined, "ALL"));
    }
    throw new ConsumptionApiError(response.status, typeof error.code === "string" ? error.code : "HTTP_ERROR",
      typeof error.message === "string" ? error.message : `Consumption API request failed (${response.status})`);
  }
  return { response, payload };
};

export const fetchConsumptionWorkspace = async (range?: ConsumptionWorkspaceRange, pillar?: ConsumptionPillar): Promise<ConsumptionApiWorkspace> => {
  const selectedPillar = pillar ?? "ALL";
  if (!isConsumptionPillar(selectedPillar)) throw new Error("Invalid Consumption pillar");
  const parameters = new URLSearchParams();
  if (range) { parameters.set("fromQuarter", range.fromQuarter); parameters.set("toQuarter", range.toQuarter); }
  if (pillar !== undefined) parameters.set("pillar", pillar);
  const query = parameters.size > 0 ? `?${parameters}` : "";
  const { response, payload } = await request(`/consumption/workspace${query}`);
  return parseWorkspace(payload, response.headers.get("ETag"), pillar === undefined ? undefined : selectedPillar);
};
export const fetchConsumptionRecords = async (query: ConsumptionRecordsQuery): Promise<ConsumptionRecordsPage> => {
  const pillar = query.pillar ?? "ALL";
  if (!isConsumptionPillar(pillar) || !((query.fromQuarter === "" || fiscalQuarterPattern.test(query.fromQuarter))
      && (query.toQuarter === "" || fiscalQuarterPattern.test(query.toQuarter)))
    || !["ACCOUNT", "AMOUNT"].includes(query.sort) || !["ASC", "DESC"].includes(query.direction)
    || !isNonNegativeInteger(query.offset) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    throw new Error("Invalid Consumption records query");
  }
  const parameters = new URLSearchParams({
    fromQuarter: query.fromQuarter, toQuarter: query.toQuarter, search: query.search,
    sort: query.sort, direction: query.direction, offset: String(query.offset), limit: String(query.limit)
  });
  if (query.pillar !== undefined) parameters.set("pillar", pillar);
  const { response, payload } = await request(`/consumption/records?${parameters}`);
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Consumption records response");
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.accountGroups) || raw.accountGroups.length > query.limit || !isNonNegativeInteger(raw.totalAccounts)
    || !isNonNegativeInteger(raw.nextOffset) || raw.nextOffset > raw.totalAccounts || typeof raw.hasMore !== "boolean") {
    throw new Error("Malformed Consumption records response");
  }
  const expectedNextOffset = Math.min(query.offset + raw.accountGroups.length, raw.totalAccounts);
  if (raw.nextOffset !== expectedNextOffset || (raw.hasMore ? raw.nextOffset <= query.offset || raw.nextOffset >= raw.totalAccounts : raw.nextOffset !== raw.totalAccounts)) {
    throw new Error("Malformed Consumption records response");
  }
  const rawGroups = raw.accountGroups.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption records response");
    const group = value as { account?: unknown; plans?: unknown };
    if (!isNonEmptyString(group.account) || !Array.isArray(group.plans)
      || group.plans.some((plan) => typeof plan !== "object" || plan === null || (plan as Record<string, unknown>).account !== group.account)) {
      throw new Error("Malformed Consumption records response");
    }
    return { account: group.account, plans: group.plans };
  });
  if (new Set(rawGroups.map((group) => group.account)).size !== rawGroups.length) throw new Error("Malformed Consumption records response");
  if (!Array.isArray(raw.controlTotals)) throw new Error("Malformed Consumption records response");
  const workspace = parseWorkspace({ ...raw, plans: rawGroups.flatMap((group) => group.plans), signals: [] }, response.headers.get("ETag"), query.pillar === undefined ? undefined : pillar);
  if (rawGroups.some((group) => group.plans.length === 0 && !workspace.accountForecasts.some((forecast) => forecast.account === group.account))) {
    throw new Error("Malformed Consumption forecast-only records group");
  }
  let planOffset = 0;
  const accountGroups = rawGroups.map((group) => {
    const plans = workspace.plans.slice(planOffset, planOffset + group.plans.length);
    planOffset += group.plans.length;
    return { account: group.account, plans };
  });
  return { selectedPillar: workspace.selectedPillar, etag: workspace.etag, lastBatchId: workspace.lastBatchId, plans: workspace.plans, controlTotals: workspace.controlTotals,
    currentFiscalMonth: workspace.currentFiscalMonth, fromQuarter: workspace.fromQuarter, toQuarter: workspace.toQuarter,
    editablePeriodIds: workspace.editablePeriodIds, displayQuarterOrder: workspace.displayQuarterOrder,
    accountForecasts: workspace.accountForecasts, forecastVariances: workspace.forecastVariances,
    accountGroups, totalAccounts: raw.totalAccounts, nextOffset: raw.nextOffset, hasMore: raw.hasMore };
};
export const fetchConsumptionAnalysis = async (query: ConsumptionAnalysisQuery): Promise<ConsumptionAnalysis> => {
  const pillar = query.pillar ?? "ALL";
  if (!isConsumptionPillar(pillar) || !isFiscalYear(query.fiscalYear) || typeof query.search !== "string" || query.search.length > 160
    || typeof query.account !== "string" || query.account.length > 160) throw new Error("Invalid Consumption analysis query");
  const parameters = new URLSearchParams({ fiscalYear: query.fiscalYear, search: query.search, account: query.account });
  if (query.pillar !== undefined) parameters.set("pillar", pillar);
  const { payload } = await request(`/consumption/analysis?${parameters}`);
  const decoded = parseConsumptionAnalysis(payload);
  const expectedPriorFiscalYear = `FY${String((Number(query.fiscalYear.slice(2)) + 99) % 100).padStart(2, "0")}`;
  if (decoded.selectedPillar !== pillar || decoded.fiscalYear !== query.fiscalYear || decoded.priorFiscalYear !== expectedPriorFiscalYear) return malformedAnalysis();
  const expectedAccount = query.account.trim() || null;
  if (decoded.selectedAccount !== expectedAccount) return malformedAnalysis();
  if (query.account && (decoded.accounts.some((account) => account.account !== query.account)
    || decoded.alerts.some((alert) => alert.account !== query.account))) return malformedAnalysis();
  return decoded;
};
const multipartFiles = (files: readonly File[]) => {
  if (files.length < 1 || files.length > 8 || files.some((file) => !(file instanceof File) || !file.name.toLowerCase().endsWith(".csv"))) {
    throw new Error("Select 1 to 8 CSV files");
  }
  const body = new FormData();
  files.forEach((file) => body.append("files", file, file.name));
  return body;
};

const decodeImportPreview = (payload: unknown, pillar: ConsumptionPillar, uploaded: readonly File[]): ConsumptionImportPreview => {
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Consumption import preview");
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.files) || !Array.isArray(raw.conflicts) || !Array.isArray(raw.overwrites)
    || !isNonNegativeInteger(raw.physicalFactCount) || !isNonNegativeInteger(raw.deduplicatedFactCount)
    || !isNonNegativeInteger(raw.insertedFactCount) || !isNonNegativeInteger(raw.unchangedFactCount)
    || !isNonNegativeInteger(raw.skippedFactCount)
    || !isNonNegativeInteger(raw.exactReplayFileCount) || raw.exactReplayFileCount > raw.files.length
    || raw.deletedFactCount !== 0
    || raw.files.length !== uploaded.length) throw new Error("Malformed Consumption import preview");
  const files = raw.files.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const file = value as Record<string, unknown>;
    if (!isNonEmptyString(file.sourceFileName) || !isNonEmptyString(file.sourceOwner)
      || !isPeriodKey(file.sourcePeriodFrom) || !isPeriodKey(file.sourcePeriodTo)
      || !(file.pillar === "DP" || file.pillar === "OCI_OTHER")
      || typeof file.sourceSha256 !== "string" || !sha256Pattern.test(file.sourceSha256)
      || !Array.isArray(file.plans) || !Array.isArray(file.controlTotals)
      || !isNonNegativeInteger(file.sourceRowCount)) throw new Error("Malformed Consumption import preview");
    return {fileName:file.sourceFileName,owner:file.sourceOwner,fromPeriod:file.sourcePeriodFrom,toPeriod:file.sourcePeriodTo,
      detectedPillar:file.pillar,sourceSha256:file.sourceSha256,planCount:file.plans.length,
      controlTotalCount:file.controlTotals.length,sourceRowCount:file.sourceRowCount} as ConsumptionImportFilePreview;
  });
  const expectedNames=uploaded.map(file=>file.name);
  const actualNames=files.map(file=>file.fileName);
  if(expectedNames.length!==actualNames.length||expectedNames.some((name,index)=>name!==actualNames[index]))
    throw new Error("Malformed Consumption import preview");
  const conflicts = raw.conflicts.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const conflict=value as Record<string,unknown>;
    if (!(conflict.pillar==="DP"||conflict.pillar==="OCI_OTHER") || !isNonEmptyString(conflict.account)
      || !isNonEmptyString(conflict.endUser) || !isNonEmptyString(conflict.planCode) || !isPeriodKey(conflict.periodKey)
      || !isNullableDecimalString(conflict.firstValue) || !isNullableDecimalString(conflict.conflictingValue)
      || !isNonEmptyString(conflict.firstFile) || !isNonEmptyString(conflict.conflictingFile)
      || !isPositiveInteger(conflict.firstFileOrdinal) || !isPositiveInteger(conflict.conflictingFileOrdinal)
      || !isPositiveInteger(conflict.firstRowNumber) || !isPositiveInteger(conflict.conflictingRowNumber)
      || !(conflict.reason==="DUPLICATE_PLAN_ROW"||conflict.reason==="CONFLICTING_UPLOAD_VALUE"))
      throw new Error("Malformed Consumption import preview");
    const firstSource=files[conflict.firstFileOrdinal-1];
    const conflictingSource=files[conflict.conflictingFileOrdinal-1];
    if (!firstSource || !conflictingSource || firstSource.fileName!==conflict.firstFile
      || conflictingSource.fileName!==conflict.conflictingFile || firstSource.detectedPillar!==conflict.pillar
      || conflictingSource.detectedPillar!==conflict.pillar) throw new Error("Malformed Consumption import preview");
    return {key:`${conflict.pillar}::${conflict.account}::${conflict.endUser}::${conflict.planCode}::${conflict.periodKey}::${conflict.firstFileOrdinal}::${conflict.firstRowNumber}::${conflict.conflictingFileOrdinal}::${conflict.conflictingRowNumber}`,
      files:[conflict.firstFile,conflict.conflictingFile] as string[],values:[conflict.firstValue,conflict.conflictingValue] as (string|null)[],
      fileOrdinals:[conflict.firstFileOrdinal,conflict.conflictingFileOrdinal] as number[],
      rows:[conflict.firstRowNumber,conflict.conflictingRowNumber] as number[],reason:conflict.reason as ConsumptionImportConflict["reason"]};
  });
  const overwrites = raw.overwrites.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const overwrite=value as Record<string,unknown>;
    if (!(overwrite.pillar==="DP"||overwrite.pillar==="OCI_OTHER") || !isNonEmptyString(overwrite.account)
      || !isNonEmptyString(overwrite.endUser) || !isNonEmptyString(overwrite.planCode) || !isPeriodKey(overwrite.periodKey)
      || !isFiniteNumber(overwrite.existingValue) || !isFiniteNumber(overwrite.newValue)
      || !isNonEmptyString(overwrite.sourceFileName)) throw new Error("Malformed Consumption import preview");
    return {key:`${overwrite.pillar}::${overwrite.account}::${overwrite.endUser}::${overwrite.planCode}::${overwrite.periodKey}`,
      existingValue:overwrite.existingValue,newValue:overwrite.newValue,fileName:overwrite.sourceFileName} as ConsumptionImportOverwrite;
  });
  const overwriteKeys=new Set(overwrites.map((overwrite)=>overwrite.key));
  const uploadedNames=new Set(files.map((file)=>file.fileName));
  if(overwriteKeys.size!==overwrites.length||overwrites.some((overwrite)=>!uploadedNames.has(overwrite.fileName))
    || raw.insertedFactCount+raw.unchangedFactCount+raw.skippedFactCount+overwrites.length!==raw.physicalFactCount)
    throw new Error("Malformed Consumption import preview");
  const planCount=files.reduce((sum,file)=>sum+file.planCount,0);
  const controlTotalCount=files.reduce((sum,file)=>sum+file.controlTotalCount,0);
  const sourceRowCount=files.reduce((sum,file)=>sum+file.sourceRowCount,0);
  return {selectedPillar:pillar,files,planCount,controlTotalCount,sourceRowCount,physicalFactCount:raw.physicalFactCount,
    insertFactCount:raw.insertedFactCount,skippedFactCount:raw.skippedFactCount,exactReplayFileCount:raw.exactReplayFileCount,
    deleteFactCount:raw.deletedFactCount,
    sameValueDuplicateCount:raw.deduplicatedFactCount,existingSameValueCount:raw.unchangedFactCount,
    overwriteCount:overwrites.length,overwrites,conflictCount:conflicts.length,conflicts,hasConflicts:conflicts.length>0};
};

export const previewConsumptionImport = async (input: string | readonly File[], pillar: ConsumptionPillar = "ALL"): Promise<ConsumptionImportPreview> => {
  if (typeof input === "string") {
    const { payload } = await request("/consumption/imports/preview", { method: "POST", headers: { "Content-Type": "text/csv; charset=UTF-8" }, body: input });
    const raw = payload as { plans?: unknown[]; controlTotals?: unknown[]; sourceRowCount?: number; sourceSha256?: string };
    if (!Array.isArray(raw.plans) || !Array.isArray(raw.controlTotals) || !isNonNegativeInteger(raw.sourceRowCount) || typeof raw.sourceSha256 !== "string") throw new Error("Malformed Consumption import preview");
    return { selectedPillar: pillar, files: [], planCount: raw.plans.length, controlTotalCount: raw.controlTotals.length,
      sourceRowCount: raw.sourceRowCount, physicalFactCount: raw.plans.length, insertFactCount: raw.plans.length,
      skippedFactCount: 0, exactReplayFileCount: 0, deleteFactCount: 0,
      sameValueDuplicateCount: 0, existingSameValueCount: 0,
      overwriteCount: 0, overwrites: [], conflictCount: 0, conflicts: [], hasConflicts: false };
  }
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  const { payload } = await request(`/consumption/imports/preview?pillar=${pillar}`, { method: "POST", body: multipartFiles(input) });
  return decodeImportPreview(payload, pillar, input);
};
export const exportConsumptionImportCompatibleCsv = async (pillar?: ConsumptionPillar): Promise<ConsumptionCsvExport> => {
  const selectedPillar = pillar ?? "ALL";
  if (!isConsumptionPillar(selectedPillar)) throw new Error("Invalid Consumption pillar");
  let response: Response;
  try {
    response = await apiFetch(`${apiBase()}/consumption/exports/import-compatible${pillar === undefined ? "" : `?pillar=${pillar}`}`, { method: "GET" });
  } catch (cause) {
    throw new ConsumptionNetworkError(cause);
  }
  if (!response.ok) {
    let error: { code?: unknown; message?: unknown } = {};
    try { error = await response.clone().json() as typeof error; } catch { /* sanitized below */ }
    throw new ConsumptionApiError(response.status, typeof error.code === "string" ? error.code : "HTTP_ERROR",
      typeof error.message === "string" ? error.message : `Consumption API request failed (${response.status})`);
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  const blob = await response.blob();
  if (!contentType.toLowerCase().startsWith("text/csv") || blob.size === 0) throw new Error("Malformed Consumption CSV export response");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([A-Za-z0-9._-]+\.csv)"/i.exec(disposition);
  return { blob, fileName: match?.[1] ?? "consumption-actuals-export.csv" };
};
export function applyConsumptionImport(input: string, pillar?: ConsumptionPillar): Promise<ConsumptionImportResult>;
export function applyConsumptionImport(input: readonly File[], pillar?: ConsumptionPillar): Promise<ConsumptionMultiImportResult>;
export async function applyConsumptionImport(input: string | readonly File[], pillar: ConsumptionPillar = "ALL"): Promise<ConsumptionImportResult | ConsumptionMultiImportResult> {
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  const init: RequestInit = typeof input === "string"
    ? { method: "POST", headers: { "Content-Type": "text/csv; charset=UTF-8" }, body: input }
    : { method: "POST", body: multipartFiles(input) };
  const path = typeof input === "string" ? "/consumption/imports/apply" : `/consumption/imports/apply?pillar=${pillar}`;
  const { response, payload } = await request(path, init);
  if (typeof input !== "string") {
    if (typeof payload !== "object" || payload === null) throw new Error("Malformed Consumption multi-file import result");
    const raw=payload as Record<string,unknown>;
    const workspace=parseWorkspace(raw.workspace,response.headers.get("ETag"),"ALL");
    if (!Array.isArray(raw.batchIds) || raw.batchIds.length !== input.length || raw.batchIds.some((id)=>!isPositiveInteger(id))
      || typeof raw.duplicate !== "boolean" || !isNonNegativeInteger(raw.physicalFactCount)
      || !isNonNegativeInteger(raw.deduplicatedFactCount) || !isNonNegativeInteger(raw.insertedFactCount)
      || !isNonNegativeInteger(raw.unchangedFactCount) || !isNonNegativeInteger(raw.overwrittenFactCount)
      || !isNonNegativeInteger(raw.skippedFactCount)
      || raw.deletedFactCount !== 0) throw new Error("Malformed Consumption multi-file import result");
    if(raw.insertedFactCount+raw.unchangedFactCount+raw.overwrittenFactCount+raw.skippedFactCount!==raw.physicalFactCount)
      throw new Error("Malformed Consumption multi-file import result");
    return {workspace,batchIds:raw.batchIds as number[],duplicate:raw.duplicate,
      physicalFactCount:raw.physicalFactCount,deduplicatedFactCount:raw.deduplicatedFactCount,
      insertedFactCount:raw.insertedFactCount,unchangedFactCount:raw.unchangedFactCount,
      overwrittenFactCount:raw.overwrittenFactCount,skippedFactCount:raw.skippedFactCount,deletedFactCount:raw.deletedFactCount};
  }
  const result = payload as { workspace?: unknown; planCount?: unknown; controlTotalCount?: unknown; insertedCount?: unknown; updatedCount?: unknown; appliedCount?: unknown; selectedPillar?: unknown; noOpCount?: unknown; conflictCount?: unknown };
  const workspace = parseWorkspace(result.workspace, response.headers.get("ETag"), pillar);
  if (!isNonNegativeInteger(result.planCount) || !isNonNegativeInteger(result.controlTotalCount)
    || !isNonNegativeInteger(result.insertedCount) || !isNonNegativeInteger(result.updatedCount)
    || !isNonNegativeInteger(result.appliedCount) || result.appliedCount !== result.insertedCount + result.updatedCount)
    throw new Error("Malformed Consumption import result");
  const selectedPillar = result.selectedPillar ?? workspace.selectedPillar;
  const noOpCount = result.noOpCount ?? 0;
  const conflictCount = result.conflictCount ?? 0;
  if (!isConsumptionPillar(selectedPillar) || selectedPillar !== pillar || !isNonNegativeInteger(noOpCount) || !isNonNegativeInteger(conflictCount)) throw new Error("Malformed Consumption import result");
  return { workspace, selectedPillar, planCount:result.planCount, controlTotalCount:result.controlTotalCount,
    insertedCount:result.insertedCount, updatedCount:result.updatedCount, appliedCount:result.appliedCount,
    noOpCount, conflictCount, sourceRowCount:result.planCount+result.controlTotalCount };
}
const forecastWideBody = (file: File) => {
  const body = new FormData();
  body.append("files", file, file.name);
  return body;
};
const decodeForecastWidePreview = (payload: unknown, uploadedFileName: string): ConsumptionForecastWidePreview => {
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Forecast Wide preview");
  const raw = payload as Record<string, unknown>;
  if (!isNonEmptyString(raw.etag) || !Array.isArray(raw.sources) || !Array.isArray(raw.lines)
    || !isNonNegativeInteger(raw.populatedCellCount) || !Array.isArray(raw.canonicalPeriods)) throw new Error("Malformed Forecast Wide preview");
  const source = raw.sources.length === 1 && typeof raw.sources[0] === "object" && raw.sources[0] !== null
    ? raw.sources[0] as Record<string, unknown> : null;
  if (!source || source.fileName !== uploadedFileName || typeof source.sha256 !== "string" || !sha256Pattern.test(source.sha256)) throw new Error("Malformed Forecast Wide preview");
  const changes = raw.lines.map((value): ConsumptionForecastWideChange => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Forecast Wide preview");
    const line = value as Record<string, unknown>;
    if (!isPositiveInteger(line.sourceRow) || !isNonEmptyString(line.accountName) || !isNonEmptyString(line.normalizedAccount)
      || !(isPeriodKey(line.periodKey) || (typeof line.periodKey === "string" && /^FY\d{2}-M(?:0[1-9]|1[0-2])$/.test(line.periodKey))) || !isFiniteNumber(line.amount)) throw new Error("Malformed Forecast Wide preview");
    return { rowNumber: line.sourceRow, account: line.accountName, resolvedAccount: line.accountName,
      endUser: null, planCode: null, periodKey: line.periodKey, forecastAmount: line.amount,
      existingForecastAmount: null, resolution: "PLAN_UNASSIGNED" };
  });
  const explicitZeroCount = changes.filter((change) => change.forecastAmount === 0).length;
  const sourceRowCount = new Set(changes.map((change) => change.rowNumber)).size;
  return { etag: raw.etag, sourceFileName: source.fileName as string, sourceSha256: source.sha256 as string,
    sourceRowCount, forecastCellCount: raw.populatedCellCount as number, blankNoOpCount: 0, explicitZeroCount,
    exactReplay: false, similarAccountResolutionCount: 0, planUnassignedCount: sourceRowCount,
    changes, blockedErrors: [], hasBlockedErrors: false };
};
export const previewConsumptionForecastWide = async (file: File): Promise<ConsumptionForecastWidePreview> => {
  const { payload } = await request("/consumption/forecast-imports/preview", { method: "POST", body: forecastWideBody(file) });
  return decodeForecastWidePreview(payload, file.name);
};
export const applyConsumptionForecastWide = async (file: File, etag: string): Promise<ConsumptionForecastWideApplyResult> => {
  const { payload } = await request("/consumption/forecast-imports/apply", { method: "POST", headers: { "If-Match": etag }, body: forecastWideBody(file) });
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Forecast Wide apply result");
  const raw = payload as Record<string, unknown>;
  if (!isPositiveInteger(raw.batchId) || typeof raw.replay !== "boolean" || !isNonNegativeInteger(raw.appliedCount)) throw new Error("Malformed Forecast Wide apply result");
  const workspace = await fetchConsumptionWorkspace();
  return { workspace, batchId: raw.batchId, exactReplay: raw.replay, appliedCount: raw.appliedCount,
    noOpCount: 0, explicitZeroCount: 0, planUnassignedCount: 0 };
};
export const saveConsumptionForecasts = async (etag: string,
  controlUpdates: ConsumptionControlForecastUpdate[]): Promise<ConsumptionApiWorkspace> => {
  const { response, payload } = await request("/consumption/forecasts", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": etag }, body: JSON.stringify({ updates: [], controlUpdates }) });
  return parseWorkspace(payload, response.headers.get("ETag"), "ALL");
};
