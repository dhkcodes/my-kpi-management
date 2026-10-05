import {
  ConsumptionPlan,
  ConsumptionSignal,
  ConsumptionAnalysisAccount,
  ConsumptionAnalysisAccountCandidate,
  ConsumptionActualTrendPoint,
  ConsumptionAmountSplit,
  ConsumptionPillar,
  ConsumptionDataCenterBreakdown,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths
} from "./consumptionData";
import { apiFetch } from "../auth/apiFetch";
import { addExactDecimals, compareExactDecimals, exactDecimalToChartCoordinate, subtractExactDecimals } from "./exactDecimal";

const apiBase = () => {
  const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: unknown; location?: { hostname?: string; port?: string } };
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim()) return runtime.__KPI_API_BASE_URL__.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") return `http://${runtime.location?.hostname}:18081/api/v1`;
  return "/api/v1";
};

type RawFact = Readonly<{ periodKey: string; actualAmount: unknown; forecastAmount: unknown; versionNo: number; actualState?: unknown; pillar?: unknown }>;
type RawPlan = Readonly<{ planId: number; stableKey: string; account: string; endUser: string; planCode: string; dataCenter: string; dataCenterBreakdown?: unknown; dpDataCenterCount?: unknown; ociDataCenterCount?: unknown; workload?: string | null; facts: RawFact[] }>;
type RawSignalPoint = Readonly<{ periodKey: string; actualAmount: number }>;
type RawSignal = Readonly<{
  signalId: number; planId: number; account: string; endUser: string; planCode: string; periodKey: string;
  type: ConsumptionSignal["type"]; grade: ConsumptionSignal["grade"]; latestActual: number; baselineMedian: number;
  changeAmount: number; changePercent: number | null; mad: number; allowance: number; previousActual: number;
  previousDirection: ConsumptionSignal["previousDirection"]; sparkline: RawSignalPoint[]; reason: string
}>;
type RawControlTotal = Readonly<{
  account: string; periodKey: string; controlAmount: number; detailAmount: number | null; matchStatus: string; pillar?: unknown; actualState?: unknown;
}>;
type RawAccountForecast = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: unknown; amount: unknown; version: number; status: string; completeness: string }>;
type RawForecastVariance = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: unknown; actualAmount: unknown; forecastAmount: unknown; varianceAmount: unknown; variancePercent: unknown; completeness: string }>;
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
export type ConsumptionForecastCompositionStatus = "CLASSIFIED" | "UNCLASSIFIED" | "UNAVAILABLE";
export type ConsumptionAccountForecast = Readonly<{
  account: string; normalizedAccount: string; periodKey: string; pillar: Exclude<ConsumptionPillar, "ALL">;
  amountChartCoordinate: number; totalAmountChartCoordinate: number; newAmountChartCoordinate: number | null; expansionAmountChartCoordinate: number | null;
  amountExact: string; totalAmountExact: string; newAmountExact: string | null; expansionAmountExact: string | null;
  baseAmountChartCoordinate: number | null; reductionAmountChartCoordinate: number | null; previousAmountChartCoordinate: number | null;
  baseAmountExact: string | null; reductionAmountExact: string | null; previousAmountExact: string | null;
  previousSource: string; reductionStatus: string; compositionStatus: ConsumptionForecastCompositionStatus;
  version: number; status: "DRAFT" | "FINAL"; completeness: string;
}>;
export type ConsumptionForecastVariance = Readonly<{ account: string; normalizedAccount: string; periodKey: string; pillar: ConsumptionPillar; actualAmountChartCoordinate: number | null; forecastAmountChartCoordinate: number | null; varianceAmountChartCoordinate: number | null; variancePercentChartCoordinate: number | null; actualAmountExact: string | null; forecastAmountExact: string | null; varianceAmountExact: string | null; variancePercentExact: string | null; completeness: string }>;
export type ConsumptionApiControlTotal = Readonly<{
  account: string; periodKey: string; controlAmount: number; detailAmount: number | null;
  controlAmountExact?: string; detailAmountExact?: string | null;
  matchStatus: "MATCH" | "MISMATCH" | "STALE_CONTROL" | "NO_DETAIL" | "MANUAL_FORECAST";
  pillar: ConsumptionPillar;
  actualState: "FINAL" | "MTD";
}>;
export type ConsumptionWorkspaceRange = Readonly<{ fromQuarter: string; toQuarter: string }>;
export type ConsumptionRecordsQuery = Readonly<{
  fromQuarter: string; toQuarter: string; search: string; sort: "ACCOUNT" | "AMOUNT";
  direction: "ASC" | "DESC"; offset: number; limit: number; pillar?: ConsumptionPillar;
}>;
export type ConsumptionRecordsTotals = Readonly<{
  actualByPeriod: Readonly<Record<string, string>>;
  appliedForecastByPeriod: Readonly<Record<string, string>>;
  outlookByPeriod: Readonly<Record<string, string>>;
  incompletePeriods: readonly string[];
  mtdByPeriod?: Readonly<Record<string, string>>;
  mtdStatusByPeriod?: Readonly<Record<string, "PROVISIONAL" | "FINAL_UPLOAD_REQUIRED">>;
  mtdAsOfByPeriod?: Readonly<Record<string, string>>;
}>;
export type ConsumptionRecordsPage = Omit<ConsumptionApiWorkspace, "signals" | "controlTotalCount"> & Readonly<{
  accountGroups: ReadonlyArray<Readonly<{ account: string; plans: ConsumptionPlan[]; totals: ConsumptionRecordsTotals }>>;
  totals: ConsumptionRecordsTotals;
  totalAccounts: number; nextOffset: number; hasMore: boolean;
}>;
export type ConsumptionAnalysisQuarter = Omit<ConsumptionAmountSplit, "status"> & Readonly<{
  status: ConsumptionAmountSplit["status"] | "NOT_OPEN";
  quarter: "Q1" | "Q2" | "Q3" | "Q4"; coveragePercent: number;
  qoqChangeAmountExact: string | null; qoqChangePercentExact: string | null;
}>;
export type ConsumptionAnalysisAlert = Readonly<{
  alertId: string; serverPlanId: number; account: string; workload: string; workloadMapped: boolean; planId: string; periodKey: string;
  type: ConsumptionSignal["type"]; grade: ConsumptionSignal["grade"];
  actualAmountExact: string; baselineMedianExact: string; changeAmountExact: string; changePercentExact: string | null; reason: string;
}>;
export type ConsumptionOrganicGrowthCategory = "NEW" | "EXPANSION" | "RETURNING_REACTIVATED" | "CONTRACTION" | "STABLE" | "UNCLASSIFIED_INCOMPLETE";
export type ConsumptionOrganicGrowthPoint = Readonly<{
  category: ConsumptionOrganicGrowthCategory;
  amountExact: string;
  amountChartCoordinate: number;
  accountCount: number | null;
}>;
export type ConsumptionOrganicGrowthProxy = Readonly<{
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  comparisonQuarter: string;
  expected: boolean;
  openingAmountExact: string;
  closingAmountExact: string;
  netGrowthAmountExact: string;
  classifiedGrowthAmountExact: string;
  reconciliationAmountExact: string;
  explanation: string;
  categories: readonly ConsumptionOrganicGrowthPoint[];
}>;
export type ConsumptionMovementBridgePoint = Readonly<{
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  totalForecastAmountExact: string | null;
  newAmountExact: string | null; expansionAmountExact: string | null; reductionAmountExact: string | null;
  netMovementAmountExact: string | null; compositionStatus: ConsumptionForecastCompositionStatus;
  classifiedAccountCount: number; unclassifiedAccountCount: number; unavailableReason: string | null;
  includedForecastPeriods: readonly string[];
  accounts: readonly ConsumptionMovementAccountDetail[];
}>;
export type ConsumptionMovementAccountDetail = Readonly<{
  account: string; totalForecastAmountExact: string; newAmountExact: string; expansionAmountExact: string; reductionAmountExact: string; netMovementAmountExact: string;
}>;
export type ConsumptionAnalysis = Readonly<{
  selectedPillar: ConsumptionPillar;
  fiscalYear: string; priorFiscalYear: string; selectedAccount: string | null;
  selectedSalesRep: string | null;
  salesRepOptions: readonly string[];
  periodCoverage: ConsumptionAnalysisPeriodCoverage;
  salesRepOverview: readonly ConsumptionSalesRepOverview[];
  portfolio: ConsumptionAmountSplit & Readonly<{
    coveragePercent: number; priorActualAmountExact: string; priorForecastAmountExact: string; priorTotalAmountExact: string;
    priorStatus: ConsumptionAmountSplit["status"]; priorCoveragePercent: number;
  }>;
  mtdSummary: Readonly<{ periodKey: string; amountExact: string; asOf: string | null }> | null;
  mtdAsOf: string | null;
  quarters: readonly ConsumptionAnalysisQuarter[];
  accountCandidates: readonly ConsumptionAnalysisAccountCandidate[];
  contextActualTrend: readonly ConsumptionActualTrendPoint[];
  alerts: readonly ConsumptionAnalysisAlert[];
  accounts: readonly ConsumptionAnalysisAccount[];
  organicConsumptionGrowthProxy: ConsumptionOrganicGrowthProxy | null;
  movementBridge: readonly ConsumptionMovementBridgePoint[];
}>;
export type ConsumptionAnalysisPeriodCoverage = Readonly<{
  actualPeriods: readonly string[]; forecastPeriods: readonly string[]; includedPeriods: readonly string[];
  priorComparisonPeriods: readonly string[]; comparisonStatus: string; comparisonUnavailableReason: string | null;
}>;
export type ConsumptionSalesRepOverview = Readonly<{
  salesRep: string; actualAmountExact: string; priorActualAmountExact: string;
  actualGrowthAmountExact: string | null; actualGrowthPercentExact: string | null;
  yoyComparisonStatus: string; yoyUnavailableReason: string | null;
  forecastAmountExact: string; fyExpectedAmountExact: string; accountCount: number;
  topThreeConcentrationPercentExact: string; attentionAccountCount: number;
}>;
export type ConsumptionAnalysisQuery = Readonly<{ fiscalYear: string; search: string; account: string; salesRep?: string; pillar?: ConsumptionPillar; includeMtd?: boolean }>;
export type ConsumptionControlForecastUpdate = Readonly<{
  account: string;
  periodKey: string;
  pillar: Exclude<ConsumptionPillar, "ALL">;
  amount: string;
  totalAmount?: string;
  newAmount?: string;
  expansionAmount?: string;
}>;
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
export type ConsumptionSalesRepChange = Readonly<{
  normalizedAccount: string;
  account: string;
  beforeSalesRep: string | null;
  afterSalesRep: string;
  changed: boolean;
}>;
export type ConsumptionImportPreview = Readonly<{
  selectedPillar: ConsumptionPillar; files: readonly ConsumptionImportFilePreview[];
  planCount: number; controlTotalCount: number; sourceRowCount: number; physicalFactCount: number;
  insertFactCount: number; skippedFactCount: number; exactReplayFileCount: number; deleteFactCount: number;
  sameValueDuplicateCount: number; existingSameValueCount: number;
  overwriteCount: number; overwrites: readonly ConsumptionImportOverwrite[];
  salesRepChanges: readonly ConsumptionSalesRepChange[];
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
  forecastAmount: string;
  totalAmount: string; newAmount: string | null; expansionAmount: string | null; baseAmount: string | null;
  reductionAmount: string | null; previousSource: string; compositionStatus: ConsumptionForecastCompositionStatus;
  rawValue: string;
  existingForecastAmount: string | null;
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
  referenceColumns: readonly string[];
  referenceNotice: string | null;
  canonicalPeriods: readonly string[];
  similarAccountResolutionCount: number;
  planUnassignedCount: number;
  changes: readonly ConsumptionForecastWideChange[];
  salesRepChanges: readonly ConsumptionSalesRepChange[];
  blockedErrors: readonly ConsumptionForecastWideBlockedError[];
  hasBlockedErrors: boolean;
}>;
export type ConsumptionForecastWideApplyResult = Readonly<{
  batchId: number;
  exactReplay: boolean;
  status: "EXACT_REPLAY" | "APPLIED" | "APPLIED_NO_CONTROL_CHANGE";
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
const isNonNegativeFiniteNumber = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;
const isNullableFiniteNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const isDecimalString = (value: unknown): value is string => typeof value === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value);
const isNullableDecimalString = (value: unknown): value is string | null => value === null || isDecimalString(value);
type ExactDecimal = Readonly<{ chartCoordinate: number; exact: string }>;
const decodeExactDecimal = (value: unknown, nonNegative = false): ExactDecimal | null => {
  if (typeof value === "string" && /^-?\d+(?:\.\d{1,4})?$/.test(value)) {
    if (nonNegative && value.startsWith("-")) return null;
    const [wholeWithSign, fraction = ""] = value.split(".");
    const unsignedWhole = wholeWithSign.replace(/^-/, "").replace(/^0+(?=\d)/, "");
    if (unsignedWhole.length > 16 || (unsignedWhole.length === 16 && unsignedWhole > "9999999999999999")) return null;
    const normalized = `${wholeWithSign.startsWith("-") ? "-" : ""}${unsignedWhole}${fraction ? `.${fraction}` : ""}`;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? { chartCoordinate: numeric, exact: normalized } : null;
  }
  if (isFiniteNumber(value) && (!nonNegative || value >= 0)) {
    // JSON numbers such as 2.47 are valid four-decimal values, but their binary
    // product can be 24700.000000000004. Validate the shortest decimal wire
    // representation instead of requiring exact floating-point multiplication.
    return decodeExactDecimal(String(value), nonNegative);
  }
  return null;
};
const decodeNullableExactDecimal = (value: unknown, nonNegative = false): ExactDecimal | null | undefined =>
  value === null || value === undefined ? null : decodeExactDecimal(value, nonNegative) ?? undefined;
const isCoveragePercent = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 100;
const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isPeriodKey = (value: unknown): value is string => typeof value === "string" && fiscalPeriodPattern.test(value);
const isQuarterKey = (value: unknown): value is string => typeof value === "string" && fiscalQuarterPattern.test(value);
const isFiscalYear = (value: unknown): value is string => typeof value === "string" && /^FY\d{2}$/.test(value);
const decodeSalesRepChanges = (value: unknown, malformedMessage: string): readonly ConsumptionSalesRepChange[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(malformedMessage);
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error(malformedMessage);
    const raw = entry as Record<string, unknown>;
    if (!isNonEmptyString(raw.normalizedAccount) || !isNonEmptyString(raw.account)
      || !(raw.beforeSalesRep === null || isNonEmptyString(raw.beforeSalesRep))
      || !isNonEmptyString(raw.afterSalesRep) || typeof raw.changed !== "boolean") throw new Error(malformedMessage);
    return { normalizedAccount: raw.normalizedAccount, account: raw.account,
      beforeSalesRep: raw.beforeSalesRep, afterSalesRep: raw.afterSalesRep, changed: raw.changed };
  });
};
const consumptionPillars = new Set<ConsumptionPillar>(["ALL", "DP", "OCI"]);
const isConsumptionPillar = (value: unknown): value is ConsumptionPillar => consumptionPillars.has(value as ConsumptionPillar);
const normalizeConsumptionPillar = (value: unknown): ConsumptionPillar | null =>
  isConsumptionPillar(value) ? value : null;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const parseDataCenterBreakdown = (value: unknown, dpValue?: unknown, ociValue?: unknown): ConsumptionDataCenterBreakdown | undefined => {
  if ((value === undefined || value === null) && dpValue === undefined && ociValue === undefined) return undefined;
  if (value === undefined || value === null) {
    const valid = (candidate: unknown) => candidate === null || candidate === undefined || isNonNegativeInteger(candidate);
    if (!valid(dpValue) || !valid(ociValue)) throw new Error("Malformed Consumption plan response");
    return { dpCount: dpValue == null ? null : dpValue as number, ociCount: ociValue == null ? null : ociValue as number,
      duplicatePossible: dpValue != null && ociValue != null };
  }
  if (typeof value !== "object") throw new Error("Malformed Consumption plan response");
  const raw = value as Record<string, unknown>;
  const valid = (candidate: unknown) => candidate === null || isNonNegativeInteger(candidate);
  if (!valid(raw.dpCount) || !valid(raw.ociCount) || typeof raw.duplicatePossible !== "boolean") {
    throw new Error("Malformed Consumption plan response");
  }
  return { dpCount: raw.dpCount as number | null, ociCount: raw.ociCount as number | null, duplicatePossible: raw.duplicatePossible };
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
const quarterAmountStatuses = new Set<ConsumptionAnalysisQuarter["status"]>(["ACTUAL", "FORECAST", "MIXED", "INCOMPLETE", "NOT_OPEN"]);
const controlMatchStatuses = new Set<ConsumptionApiControlTotal["matchStatus"]>(["MATCH", "MISMATCH", "STALE_CONTROL", "NO_DETAIL", "MANUAL_FORECAST"]);
const malformedAnalysis = (): never => { throw new Error("Malformed Consumption analysis response"); };
const hasValidYoyResult = (amount: unknown, percent: unknown, status: unknown, reason: unknown): boolean => {
  if (!isNonEmptyString(status) || !isNullableFiniteNumber(amount) || !isNullableFiniteNumber(percent)
    || !(reason === null || isNonEmptyString(reason))) return false;
  return amount !== null || (percent === null && isNonEmptyString(reason));
};
const parseAmountSplit = (value: unknown, allowedStatuses: ReadonlySet<string> = amountStatuses,
  requireAdditiveTotal = true): ConsumptionAmountSplit => {
  if (typeof value !== "object" || value === null) return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  const actual = decodeExactDecimal(raw.actualAmount);
  const forecast = decodeExactDecimal(raw.forecastAmount);
  const total = decodeExactDecimal(raw.totalAmount);
  if (!actual || !forecast || !total || typeof raw.status !== "string" || !allowedStatuses.has(raw.status)
    || (requireAdditiveTotal && compareExactDecimals(total.exact, addExactDecimals(actual.exact, forecast.exact)) !== 0)) return malformedAnalysis();
  return {
    actualAmountExact: actual.exact,
    forecastAmountExact: forecast.exact,
    totalAmountExact: total.exact,
    actualAmountChartCoordinate: exactDecimalToChartCoordinate(actual.exact),
    forecastAmountChartCoordinate: exactDecimalToChartCoordinate(forecast.exact),
    totalAmountChartCoordinate: exactDecimalToChartCoordinate(total.exact),
    status: raw.status as ConsumptionAmountSplit["status"]
  };
};
const parseContributionAmountSplit = (value: unknown): ConsumptionAmountSplit => {
  const split = parseAmountSplit(value, amountStatuses, false);
  // Contribution is Actual-only. Accept the former additive wire total during a rolling
  // API/browser-cache transition, but never expose Forecast through totalAmount.
  if (compareExactDecimals(split.totalAmountExact!, split.actualAmountExact!) !== 0
    && compareExactDecimals(split.totalAmountExact!, addExactDecimals(split.actualAmountExact!, split.forecastAmountExact!)) !== 0) return malformedAnalysis();
  return { ...split, totalAmountChartCoordinate: split.actualAmountChartCoordinate,
    totalAmountExact: split.actualAmountExact };
};
const hasValidForecastOverlapTotal = (value: Record<string, unknown>, split: ConsumptionAmountSplit): boolean => {
  const actual = split.actualAmountExact!;
  const forecast = split.forecastAmountExact!;
  const total = split.totalAmountExact!;
  const decodedOverlap = decodeExactDecimal(value.forecastOverlapAmount);
  if (!decodedOverlap) return false;
  const overlap = decodedOverlap.exact;
  if (compareExactDecimals(overlap, "0") < 0) return false;
  if (compareExactDecimals(actual, "0") < 0 || compareExactDecimals(forecast, "0") < 0) {
    return compareExactDecimals(overlap, "0") === 0
      && compareExactDecimals(total, addExactDecimals(actual, forecast)) === 0;
  }
  if (compareExactDecimals(overlap, actual) > 0 || compareExactDecimals(overlap, forecast) > 0) return false;
  return compareExactDecimals(total, subtractExactDecimals(addExactDecimals(actual, forecast), overlap)) === 0;
};
const parseActualTrend = (value: unknown, allowedTrendYears: ReadonlySet<string>): ConsumptionActualTrendPoint[] => {
  if (!Array.isArray(value)) return malformedAnalysis();
  const actualTrend = value.map((point) => {
    if (typeof point !== "object" || point === null) return malformedAnalysis();
    const rawPoint = point as Record<string, unknown>;
    const actualAmount = decodeNullableExactDecimal(rawPoint.actualAmount);
    if (!isPeriodKey(rawPoint.periodKey) || actualAmount === undefined
      || typeof rawPoint.alertCalculationMonth !== "boolean") return malformedAnalysis();
    return { periodKey: rawPoint.periodKey,
      actualAmountChartCoordinate: actualAmount ? exactDecimalToChartCoordinate(actualAmount.exact) : null,
      actualAmountExact: actualAmount?.exact ?? null,
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
  const split = parseContributionAmountSplit(value);
  const raw = value as Record<string, unknown>;
  const forecastEntryStatus = (raw.forecastEntryStatus ?? "PROVIDED") as "PROVIDED" | "UNAVAILABLE";
  const actualEntryStatus = raw.actualEntryStatus as "PROVIDED" | "MISSING";
  const percentage = decodeNullableExactDecimal(raw.percentage);
  if (!isPositiveInteger(raw.serverPlanId) || !isNonEmptyString(raw.planId) || !isNonEmptyString(raw.endUser) || !isNonEmptyString(raw.dataCenter)
    || percentage === undefined || !["PROVIDED", "MISSING"].includes(String(actualEntryStatus))
    || !["PROVIDED", "UNAVAILABLE"].includes(String(forecastEntryStatus))) return malformedAnalysis();
  return { ...split, serverPlanId: raw.serverPlanId, planId: raw.planId, endUser: raw.endUser, dataCenter: raw.dataCenter,
    dataCenterBreakdown: parseDataCenterBreakdown(raw.dataCenterBreakdown, raw.dpDataCenterCount, raw.ociDataCenterCount),
    percentageExact: percentage?.exact ?? null, actualEntryStatus, forecastEntryStatus,
    actualTrend: parseActualTrend(raw.actualTrend, allowedTrendYears) };
};
const organicGrowthCategories: readonly ConsumptionOrganicGrowthCategory[] = [
  "NEW", "EXPANSION", "RETURNING_REACTIVATED", "CONTRACTION", "STABLE", "UNCLASSIFIED_INCOMPLETE"
];
const parseOrganicGrowthProxy = (value: unknown): ConsumptionOrganicGrowthProxy | null => {
  // The analysis endpoint may omit this additive DTO while an older server is rolling forward.
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  const opening = decodeExactDecimal(raw.openingAmount);
  const closing = decodeExactDecimal(raw.closingAmount);
  const netGrowth = decodeExactDecimal(raw.netGrowthAmount);
  const classifiedGrowth = decodeExactDecimal(raw.classifiedGrowthAmount);
  const reconciliation = decodeExactDecimal(raw.reconciliationAmount);
  if (!["Q1", "Q2", "Q3", "Q4"].includes(String(raw.quarter)) || !isQuarterKey(raw.comparisonQuarter)
    || typeof raw.expected !== "boolean" || !opening || !closing || !netGrowth || !classifiedGrowth || !reconciliation
    || !isNonEmptyString(raw.explanation) || !Array.isArray(raw.categories)) return malformedAnalysis();
  const categories = raw.categories.map((entry) => {
    if (typeof entry !== "object" || entry === null) return malformedAnalysis();
    const point = entry as Record<string, unknown>;
    const amount = decodeExactDecimal(point.amount);
    if (!organicGrowthCategories.includes(point.category as ConsumptionOrganicGrowthCategory)
      || !amount || !(point.accountCount === null || isNonNegativeInteger(point.accountCount))) return malformedAnalysis();
    return { category: point.category as ConsumptionOrganicGrowthCategory, amountExact: amount.exact,
      amountChartCoordinate: exactDecimalToChartCoordinate(amount.exact), accountCount: point.accountCount as number | null };
  });
  const categoryTotal = categories.reduce((sum, point) => addExactDecimals(sum, point.amountExact), "0");
  if (categories.length !== organicGrowthCategories.length
    || categories.some((point, index) => point.category !== organicGrowthCategories[index])
    || compareExactDecimals(netGrowth.exact, subtractExactDecimals(closing.exact, opening.exact)) !== 0
    || compareExactDecimals(classifiedGrowth.exact, categoryTotal) !== 0
    || compareExactDecimals(reconciliation.exact, subtractExactDecimals(netGrowth.exact, classifiedGrowth.exact)) !== 0) return malformedAnalysis();
  return { quarter: raw.quarter as ConsumptionOrganicGrowthProxy["quarter"], comparisonQuarter: raw.comparisonQuarter as string,
    expected: raw.expected, openingAmountExact: opening.exact, closingAmountExact: closing.exact,
    netGrowthAmountExact: netGrowth.exact, classifiedGrowthAmountExact: classifiedGrowth.exact,
    reconciliationAmountExact: reconciliation.exact, explanation: raw.explanation, categories };
};
const compositionStatuses = new Set<ConsumptionForecastCompositionStatus>(["CLASSIFIED", "UNCLASSIFIED", "UNAVAILABLE"]);
const parseMovementBridge = (value: unknown): ConsumptionMovementBridgePoint[] => {
  // This is additive so the UI can continue talking to a rolling, older API.
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return malformedAnalysis();
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) return malformedAnalysis();
    const point = entry as Record<string, unknown>;
    const includedForecastPeriods = point.includedForecastPeriods === undefined ? [] : point.includedForecastPeriods;
    const rawAccounts = point.accounts === undefined ? [] : point.accounts;
    const totalForecast = decodeNullableExactDecimal(point.totalForecastAmount);
    const newAmount = decodeNullableExactDecimal(point.newAmount);
    const expansion = decodeNullableExactDecimal(point.expansionAmount);
    const reduction = decodeNullableExactDecimal(point.reductionAmount);
    const netMovement = decodeNullableExactDecimal(point.netMovementAmount);
    if (!["Q1", "Q2", "Q3", "Q4"].includes(String(point.quarter))
      || [totalForecast, newAmount, expansion, reduction, netMovement].some((amount) => amount === undefined)
      || !compositionStatuses.has(point.compositionStatus as ConsumptionForecastCompositionStatus)
      || !isNonNegativeInteger(point.classifiedAccountCount) || !isNonNegativeInteger(point.unclassifiedAccountCount)
      || !(point.unavailableReason === null || isNonEmptyString(point.unavailableReason))
      || !Array.isArray(includedForecastPeriods) || !includedForecastPeriods.every(isPeriodKey)
      || !Array.isArray(rawAccounts)) return malformedAnalysis();
    const accounts = rawAccounts.map((detail) => {
      if (typeof detail !== "object" || detail === null) return malformedAnalysis();
      const row = detail as Record<string, unknown>;
      const amounts = [row.totalForecastAmount, row.newAmount, row.expansionAmount, row.reductionAmount, row.netMovementAmount]
        .map((amount) => decodeExactDecimal(amount));
      if (!isNonEmptyString(row.account) || amounts.some((amount) => !amount)) return malformedAnalysis();
      return { account: row.account, totalForecastAmountExact: amounts[0]!.exact, newAmountExact: amounts[1]!.exact,
        expansionAmountExact: amounts[2]!.exact, reductionAmountExact: amounts[3]!.exact,
        netMovementAmountExact: amounts[4]!.exact };
    });
    return {
      quarter: point.quarter as ConsumptionMovementBridgePoint["quarter"],
      totalForecastAmountExact: totalForecast?.exact ?? null,
      newAmountExact: newAmount?.exact ?? null,
      expansionAmountExact: expansion?.exact ?? null,
      reductionAmountExact: reduction?.exact ?? null,
      netMovementAmountExact: netMovement?.exact ?? null,
      compositionStatus: point.compositionStatus as ConsumptionForecastCompositionStatus,
      classifiedAccountCount: point.classifiedAccountCount as number,
      unclassifiedAccountCount: point.unclassifiedAccountCount as number,
      unavailableReason: point.unavailableReason as string | null,
      includedForecastPeriods: includedForecastPeriods as string[],
      accounts
    };
  });
};
const parseConsumptionAnalysis = (value: unknown): ConsumptionAnalysis => {
  if (typeof value !== "object" || value === null) return malformedAnalysis();
  const raw = value as Record<string, unknown>;
  const selectedPillar = normalizeConsumptionPillar(raw.selectedPillar);
  if (!selectedPillar || !isFiscalYear(raw.fiscalYear) || !isFiscalYear(raw.priorFiscalYear)
    || !(raw.selectedAccount === null || isNonEmptyString(raw.selectedAccount)) || !Array.isArray(raw.quarters)
    || !(raw.selectedSalesRep === null || isNonEmptyString(raw.selectedSalesRep))
    || !Array.isArray(raw.salesRepOptions) || !raw.salesRepOptions.every(isNonEmptyString)
    || !Array.isArray(raw.salesRepOverview) || typeof raw.periodCoverage !== "object" || raw.periodCoverage === null
    || (raw.accountCandidates !== undefined && !Array.isArray(raw.accountCandidates))
    || !Array.isArray(raw.contextActualTrend)
    || !Array.isArray(raw.alerts) || !Array.isArray(raw.accounts)) return malformedAnalysis();
  const coverageRaw = raw.periodCoverage as Record<string, unknown>;
  const periodLists = [coverageRaw.actualPeriods, coverageRaw.forecastPeriods, coverageRaw.includedPeriods, coverageRaw.priorComparisonPeriods];
  if (periodLists.some((periods) => !Array.isArray(periods) || periods.some((period) => !isPeriodKey(period)))
    || !isNonEmptyString(coverageRaw.comparisonStatus)
    || !(coverageRaw.comparisonUnavailableReason === null || isNonEmptyString(coverageRaw.comparisonUnavailableReason))) return malformedAnalysis();
  const periodCoverage: ConsumptionAnalysisPeriodCoverage = coverageRaw as unknown as ConsumptionAnalysisPeriodCoverage;
  const allowedTrendYears = new Set([raw.priorFiscalYear, raw.fiscalYear]);
  let mtdSummary: ConsumptionAnalysis["mtdSummary"] = null;
  if (raw.mtdSummary !== null && raw.mtdSummary !== undefined) {
    if (typeof raw.mtdSummary !== "object") return malformedAnalysis();
    const mtd = raw.mtdSummary as Record<string, unknown>;
    const amount = decodeExactDecimal(mtd.amount);
    if (!isPeriodKey(mtd.periodKey) || !amount
      || !(mtd.asOf === null || typeof mtd.asOf === "string")) return malformedAnalysis();
    mtdSummary = { periodKey: mtd.periodKey, amountExact: amount.exact, asOf: mtd.asOf as string | null };
  }
  if (!(raw.mtdAsOf === null || raw.mtdAsOf === undefined || typeof raw.mtdAsOf === "string")) return malformedAnalysis();
  const mtdAsOf = (raw.mtdAsOf ?? mtdSummary?.asOf ?? null) as string | null;
  // Current- and closed-period MTD can overlap a full-month Forecast. The overlap affects Outlook,
  // not the Forecast display, and therefore is independent from the current-month MTD toggle.
  let mtdQuarter: string | null = null;
  if (mtdSummary !== null) {
    try {
      mtdQuarter = getFiscalQuarter(mtdSummary.periodKey);
    } catch {
      return malformedAnalysis();
    }
    if (!mtdQuarter.startsWith(`${raw.fiscalYear}-`)) return malformedAnalysis();
  }
  const portfolioRaw = raw.portfolio as Record<string, unknown>;
  const portfolioSplit = parseAmountSplit(raw.portfolio, amountStatuses, false);
  if (!hasValidForecastOverlapTotal(portfolioRaw, portfolioSplit)) return malformedAnalysis();
  const priorActual = decodeExactDecimal(portfolioRaw.priorActualAmount);
  const priorForecast = decodeExactDecimal(portfolioRaw.priorForecastAmount);
  const priorTotal = decodeExactDecimal(portfolioRaw.priorTotalAmount);
  if (!priorActual || !priorForecast || !priorTotal
    || compareExactDecimals(priorTotal.exact, addExactDecimals(priorActual.exact, priorForecast.exact)) !== 0
    || !amountStatuses.has(portfolioRaw.priorStatus as ConsumptionAmountSplit["status"])
    || !isCoveragePercent(portfolioRaw.coveragePercent) || !isCoveragePercent(portfolioRaw.priorCoveragePercent)) return malformedAnalysis();
  const quarters = raw.quarters.map((value) => {
    const quarter = value as Record<string, unknown>;
    const split = parseAmountSplit(value, quarterAmountStatuses, false);
    if (!hasValidForecastOverlapTotal(quarter, split)) return malformedAnalysis();
    const qoqChangeAmount = decodeNullableExactDecimal(quarter.qoqChangeAmount);
    const qoqChangePercent = decodeNullableExactDecimal(quarter.qoqChangePercent);
    if (!["Q1", "Q2", "Q3", "Q4"].includes(String(quarter.quarter)) || !isCoveragePercent(quarter.coveragePercent)
      || qoqChangeAmount === undefined || qoqChangePercent === undefined
      || (quarter.status === "NOT_OPEN" && (compareExactDecimals(split.actualAmountExact, "0") !== 0
        || compareExactDecimals(split.forecastAmountExact, "0") !== 0
        || compareExactDecimals(split.totalAmountExact, "0") !== 0 || quarter.coveragePercent !== 0
        || quarter.qoqChangeAmount !== null || quarter.qoqChangePercent !== null))) return malformedAnalysis();
    return { ...split, status: quarter.status as ConsumptionAnalysisQuarter["status"], quarter: quarter.quarter as ConsumptionAnalysisQuarter["quarter"],
      coveragePercent: quarter.coveragePercent, qoqChangeAmountExact: qoqChangeAmount?.exact ?? null,
      qoqChangePercentExact: qoqChangePercent?.exact ?? null };
  });
  if (quarters.length !== 4 || quarters.some((quarter, index) => quarter.quarter !== `Q${index + 1}`)) return malformedAnalysis();
  const accounts: ConsumptionAnalysisAccount[] = raw.accounts.map((value) => {
    const split = parseContributionAmountSplit(value); const account = value as Record<string, unknown>;
    const percentage = decodeNullableExactDecimal(account.percentage);
    const priorActualAmount = decodeExactDecimal(account.priorActualAmount);
    const actualGrowthAmount = decodeNullableExactDecimal(account.actualGrowthAmount);
    const actualGrowthPercent = decodeNullableExactDecimal(account.actualGrowthPercent);
    if (!isNonEmptyString(account.account) || !isNonEmptyString(account.salesRep)
      || percentage === undefined || !["PROVIDED", "MISSING"].includes(String(account.actualEntryStatus))
      || !priorActualAmount || actualGrowthAmount === undefined || actualGrowthPercent === undefined
      || !["MISSING", "ZERO", "ENTERED"].includes(String(account.forecastEntryStatus))
      || !Array.isArray(account.attentionReasons) || !account.attentionReasons.every(isNonEmptyString)
      || !Array.isArray(account.workloads)) return malformedAnalysis();
    const workloads = account.workloads.map((value) => {
      const workloadSplit = parseContributionAmountSplit(value); const workload = value as Record<string, unknown>;
      const workloadPercentage = decodeNullableExactDecimal(workload.percentage);
      if (!isNonEmptyString(workload.workload) || workloadPercentage === undefined || !Array.isArray(workload.plans)) return malformedAnalysis();
      return { ...workloadSplit, workload: workload.workload, percentageExact: workloadPercentage?.exact ?? null,
        plans: workload.plans.map((plan) => parseAnalysisPlan(plan, allowedTrendYears)) };
    });
    if (new Set(workloads.map((workload) => workload.workload)).size !== workloads.length) return malformedAnalysis();
    return { ...split, account: account.account, salesRep: account.salesRep, percentageExact: percentage?.exact ?? null,
      actualEntryStatus: account.actualEntryStatus,
      priorActualAmountExact: priorActualAmount.exact, actualGrowthAmountExact: actualGrowthAmount?.exact ?? null,
      actualGrowthPercentExact: actualGrowthPercent?.exact ?? null, forecastEntryStatus: account.forecastEntryStatus,
      attentionReasons: account.attentionReasons, workloads } as ConsumptionAnalysisAccount;
  });
  if (new Set(accounts.map((account) => account.account)).size !== accounts.length) return malformedAnalysis();
  const rawAccountCandidates = Array.isArray(raw.accountCandidates) ? raw.accountCandidates : accounts.map((account) => ({
    account: account.account, salesRep: account.salesRep,
    workloads: account.workloads.map((workload) => workload.workload),
    planIds: [...new Set(account.workloads.flatMap((workload) => workload.plans.map((plan) => plan.planId)))]
  }));
  const accountCandidates: ConsumptionAnalysisAccountCandidate[] = rawAccountCandidates.map((value) => {
    if (typeof value !== "object" || value === null) return malformedAnalysis();
    const candidate = value as Record<string, unknown>;
    if (!isNonEmptyString(candidate.account) || !isNonEmptyString(candidate.salesRep) || !Array.isArray(candidate.workloads) || !Array.isArray(candidate.planIds)
      || candidate.workloads.some((workload) => !isNonEmptyString(workload))
      || candidate.planIds.some((planId) => !isNonEmptyString(planId))
      || new Set(candidate.workloads).size !== candidate.workloads.length
      || new Set(candidate.planIds).size !== candidate.planIds.length) return malformedAnalysis();
    return { account: candidate.account, salesRep: candidate.salesRep, workloads: candidate.workloads as string[], planIds: candidate.planIds as string[] };
  });
  if (new Set(accountCandidates.map((candidate) => candidate.account)).size !== accountCandidates.length) return malformedAnalysis();
  const contextActualTrend = parseActualTrend(raw.contextActualTrend, allowedTrendYears);
  const organicConsumptionGrowthProxy = parseOrganicGrowthProxy(raw.organicConsumptionGrowthProxy);
  const movementBridge = parseMovementBridge(raw.movementBridge);

  const seenAnalysisPlanIds = new Set<number>();
  accounts.forEach((account) => account.workloads.forEach((workload) => workload.plans.forEach((plan) => {
    if (seenAnalysisPlanIds.has(plan.serverPlanId)) return malformedAnalysis();
    seenAnalysisPlanIds.add(plan.serverPlanId);
  })));
  const alerts: ConsumptionAnalysisAlert[] = raw.alerts.map((value) => {
    if (typeof value !== "object" || value === null) return malformedAnalysis();
    const alert = value as Record<string, unknown>;
    const actualAmount = decodeExactDecimal(alert.actualAmount);
    const baselineMedian = decodeExactDecimal(alert.baselineMedian);
    const changeAmount = decodeExactDecimal(alert.changeAmount);
    const changePercent = decodeNullableExactDecimal(alert.changePercent);
    if (!isNonEmptyString(alert.alertId) || !isPositiveInteger(alert.serverPlanId) || !isNonEmptyString(alert.account) || !isNonEmptyString(alert.workload)
      || typeof alert.workloadMapped !== "boolean"
      || !isNonEmptyString(alert.planId) || !isPeriodKey(alert.periodKey) || !signalTypes.has(alert.type as ConsumptionSignal["type"])
      || !signalGrades.has(alert.grade as ConsumptionSignal["grade"]) || !actualAmount || !baselineMedian || !changeAmount
      || changePercent === undefined || !isNonEmptyString(alert.reason)) return malformedAnalysis();
    return { alertId: alert.alertId, serverPlanId: alert.serverPlanId, account: alert.account, workload: alert.workload,
      workloadMapped: alert.workloadMapped, planId: alert.planId, periodKey: alert.periodKey,
      type: alert.type, grade: alert.grade, actualAmountExact: actualAmount.exact,
      baselineMedianExact: baselineMedian.exact, changeAmountExact: changeAmount.exact,
      changePercentExact: changePercent?.exact ?? null, reason: alert.reason } as ConsumptionAnalysisAlert;
  });
  if (new Set(alerts.map((alert) => alert.alertId)).size !== alerts.length) return malformedAnalysis();
  alerts.forEach((alert) => {
    const matches = accounts.flatMap((account) => account.workloads.flatMap((workload) => workload.plans.map((plan) => ({ account: account.account, workload: workload.workload, plan })))).filter((entry) => entry.account === alert.account && entry.workload === alert.workload && entry.plan.serverPlanId === alert.serverPlanId && entry.plan.planId === alert.planId);
    if (matches.length !== 1) return malformedAnalysis();
  });
  const salesRepOverview: ConsumptionSalesRepOverview[] = raw.salesRepOverview.map((value) => {
    if (typeof value !== "object" || value === null) return malformedAnalysis();
    const row = value as Record<string, unknown>;
    const actualAmount = decodeExactDecimal(row.actualAmount);
    const priorActualAmount = decodeExactDecimal(row.priorActualAmount);
    const actualGrowthAmount = decodeNullableExactDecimal(row.actualGrowthAmount);
    const actualGrowthPercent = decodeNullableExactDecimal(row.actualGrowthPercent);
    const forecastAmount = decodeExactDecimal(row.forecastAmount);
    const fyExpectedAmount = decodeExactDecimal(row.fyExpectedAmount);
    const concentration = decodeExactDecimal(row.topThreeConcentrationPercent);
    if (!isNonEmptyString(row.salesRep) || !actualAmount || !priorActualAmount
      || actualGrowthAmount === undefined || actualGrowthPercent === undefined
      || !isNonEmptyString(row.yoyComparisonStatus)
      || !(row.yoyUnavailableReason === null || isNonEmptyString(row.yoyUnavailableReason))
      || !forecastAmount || !fyExpectedAmount
      || !isNonNegativeInteger(row.accountCount) || !concentration
      || !isNonNegativeInteger(row.attentionAccountCount)) return malformedAnalysis();
    return { salesRep: row.salesRep, actualAmountExact: actualAmount.exact, priorActualAmountExact: priorActualAmount.exact,
      actualGrowthAmountExact: actualGrowthAmount?.exact ?? null, actualGrowthPercentExact: actualGrowthPercent?.exact ?? null,
      yoyComparisonStatus: row.yoyComparisonStatus, yoyUnavailableReason: row.yoyUnavailableReason,
      forecastAmountExact: forecastAmount.exact, fyExpectedAmountExact: fyExpectedAmount.exact,
      accountCount: row.accountCount, topThreeConcentrationPercentExact: concentration.exact,
      attentionAccountCount: row.attentionAccountCount } as ConsumptionSalesRepOverview;
  });
  return { selectedPillar,
    fiscalYear: raw.fiscalYear as string, priorFiscalYear: raw.priorFiscalYear as string, selectedAccount: raw.selectedAccount as string | null,
    selectedSalesRep: raw.selectedSalesRep as string | null, salesRepOptions: raw.salesRepOptions as string[], periodCoverage, salesRepOverview,
    portfolio: { ...portfolioSplit, priorActualAmountExact: priorActual.exact,
      priorForecastAmountExact: priorForecast.exact, priorTotalAmountExact: priorTotal.exact,
      coveragePercent: portfolioRaw.coveragePercent, priorStatus: portfolioRaw.priorStatus as ConsumptionAmountSplit["status"],
      priorCoveragePercent: portfolioRaw.priorCoveragePercent }, mtdSummary, mtdAsOf, quarters, accountCandidates, contextActualTrend, alerts, accounts,
    organicConsumptionGrowthProxy, movementBridge };
};

const parseWorkspace = (value: unknown, headerEtag?: string | null, expectedPillar?: ConsumptionPillar): ConsumptionApiWorkspace => {
  if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption workspace response");
  const raw = value as RawWorkspace;
  const selectedPillar = normalizeConsumptionPillar(raw.selectedPillar);
  if (!selectedPillar || (expectedPillar !== undefined && selectedPillar !== expectedPillar)) {
    throw new Error("Malformed Consumption workspace pillar");
  }
  const availablePillars = Array.isArray(raw.availablePillars) ? raw.availablePillars.map(normalizeConsumptionPillar) : null;
  if(expectedPillar!==undefined&&(!availablePillars
    ||availablePillars.length!==3||availablePillars[0]!=="ALL"||availablePillars[1]!=="DP"||availablePillars[2]!=="OCI"
    ||raw.aggregationGrain!=="PLAN_PERIOD"))throw new Error("Malformed Consumption workspace pillar metadata");
  if (!Array.isArray(raw.plans) || !Array.isArray(raw.signals) || !Array.isArray(raw.controlTotals)) throw new Error("Malformed Consumption workspace response");
  const etag = headerEtag ?? raw.etag;
  if (!isNonEmptyString(etag) || !(raw.lastBatchId === null || isPositiveInteger(raw.lastBatchId))) throw new Error("Malformed Consumption workspace metadata");
  const decodedControlTotals = raw.controlTotals.map((control) => {
    const pillar = normalizeConsumptionPillar(control?.pillar);
    const actualState = control?.actualState;
    const pillarMatches = selectedPillar === "ALL" ? pillar === "DP" || pillar === "OCI" : pillar === selectedPillar;
    if (!isNonEmptyString(control?.account) || !isPeriodKey(control?.periodKey)
      || !isFiniteNumber(control?.controlAmount) || !isNullableFiniteNumber(control?.detailAmount)
      || !controlMatchStatuses.has(control?.matchStatus as ConsumptionApiControlTotal["matchStatus"])
      || !pillarMatches || !(actualState === "FINAL" || actualState === "MTD")) {
      throw new Error("Malformed Consumption control total response");
    }
    return { ...control, pillar, actualState,
      matchStatus: control.matchStatus as ConsumptionApiControlTotal["matchStatus"] } as ConsumptionApiControlTotal;
  });
  const seenControlKeys = new Set<string>();
  const controlTotals: ConsumptionApiControlTotal[] = decodedControlTotals.map((control) => {
    const key = `${control.account}::${control.periodKey}::${control.pillar}::${control.actualState}`;
    if (seenControlKeys.has(key)) throw new Error("Malformed Consumption control total response");
    seenControlKeys.add(key);
    return control;
  });
  const accountForecasts=(raw.accountForecasts ?? []).map((forecast):ConsumptionAccountForecast=>{
    const pillar = normalizeConsumptionPillar(forecast?.pillar);
    const amount = decodeExactDecimal(forecast?.amount, true);
    if(!forecast||!isNonEmptyString(forecast.account)||!isNonEmptyString(forecast.normalizedAccount)||!isPeriodKey(forecast.periodKey)
      ||!(pillar==="DP"||pillar==="OCI")||(selectedPillar!=="ALL"&&pillar!==selectedPillar)||!amount
      ||!isPositiveInteger(forecast.version)||!(forecast.status==="DRAFT"||forecast.status==="FINAL")||!isNonEmptyString(forecast.completeness))
      throw new Error("Malformed Consumption account forecast");
    const record = forecast as unknown as Record<string, unknown>;
    const totalAmount = record.totalAmount === undefined ? forecast.amount : record.totalAmount;
    const nullableAmount = (field: string) => {
      const value = record[field];
      if (value === undefined || value === null) return null;
      const decoded = decodeExactDecimal(value, true);
      if (!decoded) throw new Error("Malformed Consumption account forecast");
      return decoded;
    };
    const decodedTotal = decodeExactDecimal(totalAmount, true);
    if (!decodedTotal) throw new Error("Malformed Consumption account forecast");
    const newAmount = nullableAmount("newAmount");
    const expansionAmount = nullableAmount("expansionAmount");
    const baseAmount = nullableAmount("baseAmount");
    const reductionAmount = nullableAmount("reductionAmount");
    const previousAmount = nullableAmount("previousAmount");
    const compositionStatus = compositionStatuses.has(record.compositionStatus as ConsumptionForecastCompositionStatus)
      ? record.compositionStatus as ConsumptionForecastCompositionStatus : "UNAVAILABLE";
    return { ...forecast, pillar,
      status: forecast.status as ConsumptionAccountForecast["status"], amountChartCoordinate: decodedTotal.chartCoordinate, totalAmountChartCoordinate: decodedTotal.chartCoordinate,
      amountExact: decodedTotal.exact, totalAmountExact: decodedTotal.exact,
      newAmountChartCoordinate: newAmount?.chartCoordinate ?? null, expansionAmountChartCoordinate: expansionAmount?.chartCoordinate ?? null,
      newAmountExact: newAmount?.exact ?? null, expansionAmountExact: expansionAmount?.exact ?? null,
      baseAmountChartCoordinate: baseAmount?.chartCoordinate ?? null, reductionAmountChartCoordinate: reductionAmount?.chartCoordinate ?? null,
      previousAmountChartCoordinate: previousAmount?.chartCoordinate ?? null,
      baseAmountExact: baseAmount?.exact ?? null, reductionAmountExact: reductionAmount?.exact ?? null,
      previousAmountExact: previousAmount?.exact ?? null, previousSource: typeof record.previousSource === "string" ? record.previousSource : "Unavailable",
      reductionStatus: typeof record.reductionStatus === "string" ? record.reductionStatus : "UNAVAILABLE", compositionStatus };
  });
  const forecastVariances=(raw.forecastVariances ?? []).map((variance):ConsumptionForecastVariance=>{
    const pillar = normalizeConsumptionPillar(variance?.pillar);
    const actualAmount = decodeNullableExactDecimal(variance?.actualAmount);
    const forecastAmount = decodeNullableExactDecimal(variance?.forecastAmount);
    const varianceAmount = decodeNullableExactDecimal(variance?.varianceAmount);
    const variancePercent = decodeNullableExactDecimal(variance?.variancePercent);
    if(!variance||!isNonEmptyString(variance.account)||!isNonEmptyString(variance.normalizedAccount)||!isPeriodKey(variance.periodKey)
      ||!pillar||(selectedPillar!=="ALL"&&pillar!==selectedPillar)||actualAmount===undefined||forecastAmount===undefined
      ||varianceAmount===undefined||variancePercent===undefined||!isNonEmptyString(variance.completeness))
      throw new Error("Malformed Consumption forecast variance");
    return { ...variance, pillar,
      actualAmountChartCoordinate: actualAmount?.chartCoordinate ?? null, forecastAmountChartCoordinate: forecastAmount?.chartCoordinate ?? null,
      varianceAmountChartCoordinate: varianceAmount?.chartCoordinate ?? null, variancePercentChartCoordinate: variancePercent?.chartCoordinate ?? null,
      actualAmountExact: actualAmount?.exact ?? null, forecastAmountExact: forecastAmount?.exact ?? null,
      varianceAmountExact: varianceAmount?.exact ?? null, variancePercentExact: variancePercent?.exact ?? null } as ConsumptionForecastVariance;
  });
  const seenPlanIds = new Set<number>();
  const seenStableKeys = new Set<string>();
  const basePlans: ConsumptionPlan[] = raw.plans.map((plan) => {
    if (!isPositiveInteger(plan?.planId) || !isNonEmptyString(plan?.stableKey) || !isNonEmptyString(plan?.account)
      || !isNonEmptyString(plan?.endUser) || !isNonEmptyString(plan?.planCode) || !isNonEmptyString(plan?.dataCenter)
      || (plan.workload !== null && plan.workload !== undefined && !isNonEmptyString(plan.workload))
      ||(expectedPillar!==undefined&&(!Object.prototype.hasOwnProperty.call(plan,"dpDataCenterCount")
        ||!Object.prototype.hasOwnProperty.call(plan,"ociDataCenterCount")
        ||!(plan.dpDataCenterCount==null||isNonNegativeInteger(plan.dpDataCenterCount))
        ||!(plan.ociDataCenterCount==null||isNonNegativeInteger(plan.ociDataCenterCount))))
      || !Array.isArray(plan?.facts)) throw new Error("Malformed Consumption plan response");
    if (seenPlanIds.has(plan.planId) || seenStableKeys.has(plan.stableKey)) throw new Error("Malformed Consumption plan response");
    seenPlanIds.add(plan.planId); seenStableKeys.add(plan.stableKey);
    const actuals: Record<string, number> = {};
    const mtds: Record<string, number> = {};
    const forecasts: Record<string, number> = {};
    const actualsExact: Record<string, string> = {};
    const mtdsExact: Record<string, string> = {};
    const forecastsExact: Record<string, string> = {};
    const versions: Record<string, number> = {};
    const seenFacts = new Set<string>();
    plan.facts.forEach((fact) => {
      const actualState = fact?.actualState;
      const factPillar = normalizeConsumptionPillar(fact?.pillar);
      const actualAmount = decodeNullableExactDecimal(fact?.actualAmount);
      const forecastAmount = decodeNullableExactDecimal(fact?.forecastAmount);
      if (!isPeriodKey(fact?.periodKey) || actualAmount === undefined
        || forecastAmount === undefined || !isNonNegativeInteger(fact?.versionNo)
        || (actualAmount !== null && actualState !== "FINAL" && actualState !== "MTD")
        || (actualAmount === null && actualState !== null)
        || (expectedPillar !== undefined && (!factPillar || factPillar === "ALL"
          || (selectedPillar !== "ALL" && factPillar !== selectedPillar)))) throw new Error("Malformed Consumption fact response");
      const factKey = `${fact.periodKey}::${factPillar ?? "LEGACY"}::${actualAmount !== null ? actualState : "FORECAST"}`;
      if (seenFacts.has(factKey)) throw new Error("Malformed Consumption fact response");
      seenFacts.add(factKey);
      versions[fact.periodKey] = Math.max(versions[fact.periodKey] ?? 0, fact.versionNo);
      // Keep provisional MTD separate from finalized Actual all the way to the view model.
      if (actualAmount !== null && actualState === "FINAL") {
        const exact = actualAmount.exact;
        actualsExact[fact.periodKey] = addExactDecimals(actualsExact[fact.periodKey] ?? "0", exact);
        actuals[fact.periodKey] = exactDecimalToChartCoordinate(actualsExact[fact.periodKey]);
      }
      if (actualAmount !== null && actualState === "MTD") {
        const exact = actualAmount.exact;
        mtdsExact[fact.periodKey] = addExactDecimals(mtdsExact[fact.periodKey] ?? "0", exact);
        mtds[fact.periodKey] = exactDecimalToChartCoordinate(mtdsExact[fact.periodKey]);
      }
      if (forecastAmount !== null) {
        const exact = forecastAmount.exact;
        forecastsExact[fact.periodKey] = addExactDecimals(forecastsExact[fact.periodKey] ?? "0", exact);
        forecasts[fact.periodKey] = exactDecimalToChartCoordinate(forecastsExact[fact.periodKey]);
      }
    });
    const dataCenterBreakdown = parseDataCenterBreakdown(plan.dataCenterBreakdown, plan.dpDataCenterCount, plan.ociDataCenterCount);
    return { id: plan.stableKey, customer: plan.account, endUser: plan.endUser, planId: plan.planCode,
      dataCenter: plan.dataCenter, dataCenterBreakdown, workload: plan.workload ?? undefined, planType: "OCI",
      actuals, mtds, forecasts, actualsExact, mtdsExact, forecastsExact, serverPlanId: plan.planId, versions };
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

const request = async (path: string, init?: RequestInit,
  conflictPillar: ConsumptionPillar = "ALL"): Promise<{ response: Response; payload: unknown }> => {
  let response: Response;
  try { response = await apiFetch(`${apiBase()}${path}`, init); } catch (cause) { throw new ConsumptionNetworkError(cause); }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* sanitized below */ }
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null ? payload as { code?: unknown; message?: unknown; current?: unknown } : {};
    if (response.status === 409 && error.code === "VERSION_CONFLICT" && error.current) {
      throw new ConsumptionConflictError(typeof error.message === "string" ? error.message : "Consumption changed on the server", parseWorkspace(error.current, undefined, conflictPillar));
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
  return parseWorkspace(payload, response.headers.get("ETag"), selectedPillar);
};
const decodeRecordsTotals = (value: unknown): ConsumptionRecordsTotals => {
  if (value === undefined || value === null) {
    return { actualByPeriod: {}, appliedForecastByPeriod: {}, outlookByPeriod: {}, incompletePeriods: [] };
  }
  if (typeof value !== "object") throw new Error("Malformed Consumption records totals");
  const raw = value as Record<string, unknown>;
  const decodeMap = (candidate: unknown): Readonly<Record<string, string>> => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new Error("Malformed Consumption records totals");
    const entries = Object.entries(candidate as Record<string, unknown>);
    const decoded = entries.map(([period, amount]) => [period, decodeExactDecimal(amount)] as const);
    if (decoded.some(([period, amount]) => !/^FY\d{2}-[A-Z]{3}$/.test(period) || amount === null))
      throw new Error("Malformed Consumption records totals");
    return Object.fromEntries(decoded.map(([period, amount]) => [period, amount!.exact])) as Record<string, string>;
  };
  if (!Array.isArray(raw.incompletePeriods) || raw.incompletePeriods.some((period) => typeof period !== "string"))
    throw new Error("Malformed Consumption records totals");
  const decoded: ConsumptionRecordsTotals = {
    actualByPeriod: decodeMap(raw.actualByPeriod),
    appliedForecastByPeriod: decodeMap(raw.appliedForecastByPeriod),
    outlookByPeriod: decodeMap(raw.outlookByPeriod),
    incompletePeriods: raw.incompletePeriods as string[],
    ...(raw.mtdByPeriod === undefined ? {} : { mtdByPeriod: decodeMap(raw.mtdByPeriod) })
  };
  let withStatuses = decoded;
  if (raw.mtdStatusByPeriod !== undefined) {
    if (typeof raw.mtdStatusByPeriod !== "object" || raw.mtdStatusByPeriod === null || Array.isArray(raw.mtdStatusByPeriod))
      throw new Error("Malformed Consumption records totals");
    const statuses = Object.entries(raw.mtdStatusByPeriod as Record<string, unknown>);
    if (statuses.some(([period, status]) => !/^FY\d{2}-[A-Z]{3}$/.test(period)
        || (status !== "PROVISIONAL" && status !== "FINAL_UPLOAD_REQUIRED")))
      throw new Error("Malformed Consumption records totals");
    withStatuses = { ...decoded, mtdStatusByPeriod: Object.fromEntries(statuses) as Record<string, "PROVISIONAL" | "FINAL_UPLOAD_REQUIRED"> };
  }
  if (raw.mtdAsOfByPeriod === undefined) return withStatuses;
  if (typeof raw.mtdAsOfByPeriod !== "object" || raw.mtdAsOfByPeriod === null || Array.isArray(raw.mtdAsOfByPeriod))
    throw new Error("Malformed Consumption records totals");
  const asOfEntries = Object.entries(raw.mtdAsOfByPeriod as Record<string, unknown>);
  if (asOfEntries.some(([period, asOf]) => !/^FY\d{2}-[A-Z]{3}$/.test(period) || typeof asOf !== "string" || !asOf))
    throw new Error("Malformed Consumption records totals");
  return { ...withStatuses, mtdAsOfByPeriod: Object.fromEntries(asOfEntries) as Record<string, string> };
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
    const group = value as { account?: unknown; plans?: unknown; totals?: unknown };
    if (!isNonEmptyString(group.account) || !Array.isArray(group.plans)
      || group.plans.some((plan) => typeof plan !== "object" || plan === null || (plan as Record<string, unknown>).account !== group.account)) {
      throw new Error("Malformed Consumption records response");
    }
    return { account: group.account, plans: group.plans, totals: decodeRecordsTotals(group.totals) };
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
    return { account: group.account, plans, totals: group.totals };
  });
  return { selectedPillar: workspace.selectedPillar, etag: workspace.etag, lastBatchId: workspace.lastBatchId, plans: workspace.plans, controlTotals: workspace.controlTotals,
    currentFiscalMonth: workspace.currentFiscalMonth, fromQuarter: workspace.fromQuarter, toQuarter: workspace.toQuarter,
    editablePeriodIds: workspace.editablePeriodIds, displayQuarterOrder: workspace.displayQuarterOrder,
    accountForecasts: workspace.accountForecasts, forecastVariances: workspace.forecastVariances,
    accountGroups, totals: decodeRecordsTotals(raw.totals), totalAccounts: raw.totalAccounts, nextOffset: raw.nextOffset, hasMore: raw.hasMore };
};
export const fetchConsumptionAnalysis = async (query: ConsumptionAnalysisQuery): Promise<ConsumptionAnalysis> => {
  const pillar = query.pillar ?? "ALL";
  if (!isConsumptionPillar(pillar) || !isFiscalYear(query.fiscalYear) || typeof query.search !== "string" || query.search.length > 160
    || typeof query.account !== "string" || query.account.length > 160
    || typeof (query.salesRep ?? "") !== "string" || (query.salesRep ?? "").length > 160) throw new Error("Invalid Consumption analysis query");
  const parameters = new URLSearchParams({ fiscalYear: query.fiscalYear, search: query.search, account: query.account, salesRep: query.salesRep ?? "" });
  if (query.pillar !== undefined) parameters.set("pillar", pillar);
  if (query.includeMtd !== undefined) parameters.set("includeMtd", String(query.includeMtd));
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
  if (files.length < 1 || files.length > 8 || files.some((file) => {
    if (!(file instanceof File)) return true;
    const name = file.name.toLowerCase();
    return !name.endsWith(".csv") && !name.endsWith(".xlsx");
  })) {
    throw new Error("Select 1 to 8 CSV or XLSX files");
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
    || raw.deletedFactCount !== 0) throw new Error("Malformed Consumption import preview");
  const files = raw.files.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const file = value as Record<string, unknown>;
    const detectedPillar = normalizeConsumptionPillar(file.pillar);
    if (!isNonEmptyString(file.sourceFileName) || !isNonEmptyString(file.sourceOwner)
      || !isPeriodKey(file.sourcePeriodFrom) || !isPeriodKey(file.sourcePeriodTo)
      || !(detectedPillar === "DP" || detectedPillar === "OCI")
      || typeof file.sourceSha256 !== "string" || !sha256Pattern.test(file.sourceSha256)
      || !Array.isArray(file.plans) || !Array.isArray(file.controlTotals)
      || !isNonNegativeInteger(file.sourceRowCount)) throw new Error("Malformed Consumption import preview");
    return {fileName:file.sourceFileName,owner:file.sourceOwner,fromPeriod:file.sourcePeriodFrom,toPeriod:file.sourcePeriodTo,
      detectedPillar,sourceSha256:file.sourceSha256,planCount:file.plans.length,
      controlTotalCount:file.controlTotals.length,sourceRowCount:file.sourceRowCount} as ConsumptionImportFilePreview;
  });
  const expectedNames=uploaded.map(file=>file.name);
  const actualNames=files.map(file=>file.fileName);
  const sourceFilesMatch=expectedNames.length===1
    ? actualNames.length>=1&&actualNames.length<=2&&actualNames.every(name=>name===expectedNames[0])
    : expectedNames.length===actualNames.length&&expectedNames.every((name,index)=>name===actualNames[index]);
  if(!sourceFilesMatch
    || (expectedNames.length===1&&files.length>1&&new Set(files.map(file=>file.detectedPillar)).size!==files.length))
    throw new Error("Malformed Consumption import preview");
  const conflicts = raw.conflicts.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const conflict=value as Record<string,unknown>;
    const conflictPillar = normalizeConsumptionPillar(conflict.pillar);
    if (!(conflictPillar==="DP"||conflictPillar==="OCI") || !isNonEmptyString(conflict.account)
      || !isNonEmptyString(conflict.endUser) || !isNonEmptyString(conflict.planCode) || !isPeriodKey(conflict.periodKey)
      || !isNullableDecimalString(conflict.firstValue) || !isNullableDecimalString(conflict.conflictingValue)
      || !isNonEmptyString(conflict.firstFile) || !isNonEmptyString(conflict.conflictingFile)
      || !isPositiveInteger(conflict.firstFileOrdinal) || !isPositiveInteger(conflict.conflictingFileOrdinal)
      || !isPositiveInteger(conflict.firstRowNumber) || !isPositiveInteger(conflict.conflictingRowNumber)
      || !(conflict.reason==="DUPLICATE_PLAN_ROW"||conflict.reason==="CONFLICTING_UPLOAD_VALUE"))
      throw new Error("Malformed Consumption import preview");
    const firstSourceName=expectedNames[conflict.firstFileOrdinal-1];
    const conflictingSourceName=expectedNames[conflict.conflictingFileOrdinal-1];
    const hasMatchingPillarFile=files.some((file)=>file.fileName===conflict.firstFile&&file.detectedPillar===conflictPillar);
    if (!firstSourceName || !conflictingSourceName || firstSourceName!==conflict.firstFile
      || conflictingSourceName!==conflict.conflictingFile || !hasMatchingPillarFile)
      throw new Error("Malformed Consumption import preview");
    return {key:`${conflictPillar}::${conflict.account}::${conflict.endUser}::${conflict.planCode}::${conflict.periodKey}::${conflict.firstFileOrdinal}::${conflict.firstRowNumber}::${conflict.conflictingFileOrdinal}::${conflict.conflictingRowNumber}`,
      files:[conflict.firstFile,conflict.conflictingFile] as string[],values:[conflict.firstValue,conflict.conflictingValue] as (string|null)[],
      fileOrdinals:[conflict.firstFileOrdinal,conflict.conflictingFileOrdinal] as number[],
      rows:[conflict.firstRowNumber,conflict.conflictingRowNumber] as number[],reason:conflict.reason as ConsumptionImportConflict["reason"]};
  });
  const overwrites = raw.overwrites.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption import preview");
    const overwrite=value as Record<string,unknown>;
    const overwritePillar = normalizeConsumptionPillar(overwrite.pillar);
    if (!(overwritePillar==="DP"||overwritePillar==="OCI") || !isNonEmptyString(overwrite.account)
      || !isNonEmptyString(overwrite.endUser) || !isNonEmptyString(overwrite.planCode) || !isPeriodKey(overwrite.periodKey)
      || !isFiniteNumber(overwrite.existingValue) || !isFiniteNumber(overwrite.newValue)
      || !isNonEmptyString(overwrite.sourceFileName)) throw new Error("Malformed Consumption import preview");
    return {key:`${overwritePillar}::${overwrite.account}::${overwrite.endUser}::${overwrite.planCode}::${overwrite.periodKey}`,
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
  const salesRepChanges=decodeSalesRepChanges(raw.salesRepChanges,"Malformed Consumption import preview");
  return {selectedPillar:pillar,files,planCount,controlTotalCount,sourceRowCount,physicalFactCount:raw.physicalFactCount,
    insertFactCount:raw.insertedFactCount,skippedFactCount:raw.skippedFactCount,exactReplayFileCount:raw.exactReplayFileCount,
    deleteFactCount:raw.deletedFactCount,
    sameValueDuplicateCount:raw.deduplicatedFactCount,existingSameValueCount:raw.unchangedFactCount,
    overwriteCount:overwrites.length,overwrites,salesRepChanges,conflictCount:conflicts.length,conflicts,hasConflicts:conflicts.length>0};
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
      overwriteCount: 0, overwrites: [], salesRepChanges: [], conflictCount: 0, conflicts: [], hasConflicts: false };
  }
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  const { payload } = await request(`/consumption/imports/preview?pillar=${pillar}`, { method: "POST", body: multipartFiles(input) });
  return decodeImportPreview(payload, pillar, input);
};
export const exportConsumptionImportCompatibleCsv = async (
  pillar?: ConsumptionPillar,
  fromQuarter?: string,
  toQuarter?: string
): Promise<ConsumptionCsvExport> => {
  const selectedPillar = pillar ?? "ALL";
  if (!isConsumptionPillar(selectedPillar)) throw new Error("Invalid Consumption pillar");
  const query = new URLSearchParams();
  if (pillar !== undefined) query.set("pillar", selectedPillar);
  if (fromQuarter) query.set("fromQuarter", fromQuarter);
  if (toQuarter) query.set("toQuarter", toQuarter);
  let response: Response;
  try {
    response = await apiFetch(`${apiBase()}/consumption/exports/import-compatible${query.size ? `?${query}` : ""}`, { method: "GET" });
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
  const normalizedContentType = contentType.toLowerCase();
  if ((!normalizedContentType.startsWith("text/csv") && !normalizedContentType.startsWith("application/zip")) || blob.size === 0) {
    throw new Error("Malformed Consumption export response");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"\r\n]+\.(?:csv|zip))"/i.exec(disposition);
  const safeFileName = match ? match[1].split(/[\\/]/).pop() : undefined;
  return { blob, fileName: safeFileName ?? (normalizedContentType.startsWith("application/zip") ? "consumption-actuals-export.zip" : "consumption-actuals-export.csv") };
};

const xlsxAttachmentFileName = (disposition: string, fallback: string): string => {
  const encoded = /filename\*=UTF-8''([^;\r\n]+)/i.exec(disposition)?.[1];
  const quoted = /filename="([^"\r\n]+\.xlsx)"/i.exec(disposition)?.[1];
  let candidate = quoted;
  if (encoded) {
    try { candidate = decodeURIComponent(encoded); } catch { /* use the quoted filename or fallback */ }
  }
  const safeFileName = candidate?.split(/[\\/]/).pop();
  return safeFileName && safeFileName.toLowerCase().endsWith(".xlsx") ? safeFileName : fallback;
};

export const exportConsumptionActualXlsx = async (): Promise<ConsumptionCsvExport> => {
  let response: Response;
  try {
    response = await apiFetch(`${apiBase()}/consumption/exports/actual-xlsx`, { method: "GET" });
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
  if (!contentType.toLowerCase().startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") || blob.size === 0)
    throw new Error("Malformed Consumption Actual XLSX export response");
  return {
    blob,
    fileName: xlsxAttachmentFileName(response.headers.get("Content-Disposition") ?? "", "OCI Consumption Actual.xlsx")
  };
};

export const exportConsumptionForecastCsv = async (pillar: ConsumptionPillar): Promise<ConsumptionCsvExport> => {
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  let response: Response;
  try {
    response = await apiFetch(`${apiBase()}/consumption/exports/forecast?pillar=${pillar}`, { method: "GET" });
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
  if (!contentType.toLowerCase().startsWith("text/csv") || blob.size === 0) throw new Error("Malformed Consumption Forecast CSV export response");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+\.csv)"/i.exec(disposition);
  return { blob, fileName: match?.[1] ?? "OCI Consumption Forecast.csv" };
};

export const exportConsumptionForecastXlsx = async (pillar: ConsumptionPillar): Promise<ConsumptionCsvExport> => {
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  let response: Response;
  try {
    response = await apiFetch(`${apiBase()}/consumption/exports/forecast-xlsx?pillar=${pillar}`, { method: "GET" });
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
  if (!contentType.toLowerCase().startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") || blob.size === 0)
    throw new Error("Malformed Consumption Forecast XLSX export response");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+\.xlsx)"/i.exec(disposition);
  return { blob, fileName: match?.[1] ?? "OCI Consumption Forecast.xlsx" };
};
export function applyConsumptionImport(input: string, pillar?: ConsumptionPillar): Promise<ConsumptionImportResult>;
export function applyConsumptionImport(input: readonly File[], pillar?: ConsumptionPillar, validatedPreview?: ConsumptionImportPreview): Promise<ConsumptionMultiImportResult>;
export async function applyConsumptionImport(input: string | readonly File[], pillar: ConsumptionPillar = "ALL", validatedPreview?: ConsumptionImportPreview): Promise<ConsumptionImportResult | ConsumptionMultiImportResult> {
  if (!isConsumptionPillar(pillar)) throw new Error("Invalid Consumption pillar");
  const expectedBatchCount = typeof input === "string" ? 1 : validatedPreview ? (() => {
    const expectedNames = input.map((file) => file.name);
    const actualNames = validatedPreview.files.map((file) => file.fileName);
    const sourceFilesMatch = expectedNames.length === 1
      ? actualNames.length >= 1 && actualNames.length <= 2 && actualNames.every((name) => name === expectedNames[0])
      : expectedNames.length === actualNames.length && expectedNames.every((name, index) => name === actualNames[index]);
    const distinctPillars = new Set(validatedPreview.files.map((file) => file.detectedPillar));
    if (!sourceFilesMatch || validatedPreview.files.length < 1
      || (expectedNames.length === 1 && validatedPreview.files.length > 1 && distinctPillars.size !== validatedPreview.files.length)) {
      throw new Error("Malformed Consumption import preview");
    }
    return validatedPreview.files.length;
  })() : input.length;
  const init: RequestInit = typeof input === "string"
    ? { method: "POST", headers: { "Content-Type": "text/csv; charset=UTF-8" }, body: input }
    : { method: "POST", body: multipartFiles(input) };
  const path = typeof input === "string" ? "/consumption/imports/apply" : `/consumption/imports/apply?pillar=${pillar}`;
  const { response, payload } = await request(path, init);
  if (typeof input !== "string") {
    if (typeof payload !== "object" || payload === null) throw new Error("Malformed Consumption multi-file import result");
    const raw=payload as Record<string,unknown>;
    const workspace=parseWorkspace(raw.workspace,response.headers.get("ETag"),"ALL");
    if (!Array.isArray(raw.batchIds) || raw.batchIds.length !== expectedBatchCount || raw.batchIds.some((id)=>!isPositiveInteger(id))
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
  const isForecastPeriodKey = (value: unknown): value is string => isPeriodKey(value)
    || (typeof value === "string" && /^FY\d{2}-M(?:0[1-9]|1[0-2])$/.test(value));
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Forecast Wide preview");
  const raw = payload as Record<string, unknown>;
  if (!isNonEmptyString(raw.etag) || !Array.isArray(raw.sources) || !Array.isArray(raw.lines)
    || !isNonNegativeInteger(raw.populatedCellCount) || !Array.isArray(raw.canonicalPeriods)
    || raw.canonicalPeriods.some((period) => !isForecastPeriodKey(period))
    || !(raw.referenceColumns === undefined || (Array.isArray(raw.referenceColumns) && raw.referenceColumns.every((value) => typeof value === "string")))
    || !(raw.referenceNotice === undefined || raw.referenceNotice === null || typeof raw.referenceNotice === "string")) throw new Error("Malformed Forecast Wide preview");
  const source = raw.sources.length === 1 && typeof raw.sources[0] === "object" && raw.sources[0] !== null
    ? raw.sources[0] as Record<string, unknown> : null;
  if (!source || source.fileName !== uploadedFileName || typeof source.sha256 !== "string" || !sha256Pattern.test(source.sha256)) throw new Error("Malformed Forecast Wide preview");
  const changes = raw.lines.map((value): ConsumptionForecastWideChange => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Forecast Wide preview");
    const line = value as Record<string, unknown>;
    if (!isPositiveInteger(line.sourceRow) || !isNonEmptyString(line.accountName) || !isNonEmptyString(line.normalizedAccount)
      || !isForecastPeriodKey(line.periodKey)) throw new Error("Malformed Forecast Wide preview");
    const totalAmount = line.totalAmount === undefined ? line.amount : line.totalAmount;
    const nullableAmount = (field: string) => {
      const value = line[field];
      if (value === undefined || value === null) return null;
      const decoded = decodeExactDecimal(value, true);
      if (!decoded) throw new Error("Malformed Forecast Wide preview");
      return decoded.exact;
    };
    const totalAmountExact = decodeExactDecimal(totalAmount, true)?.exact;
    if (totalAmountExact === undefined) throw new Error("Malformed Forecast Wide preview");
    const compositionStatus = compositionStatuses.has(line.compositionStatus as ConsumptionForecastCompositionStatus)
      ? line.compositionStatus as ConsumptionForecastCompositionStatus : "UNAVAILABLE";
    const newAmount = nullableAmount("newAmount");
    const expansionAmount = nullableAmount("expansionAmount");
    return { rowNumber: line.sourceRow, account: line.accountName, resolvedAccount: line.accountName,
      endUser: null, planCode: null, periodKey: line.periodKey, forecastAmount: totalAmountExact,
      totalAmount: totalAmountExact, newAmount, expansionAmount, baseAmount: nullableAmount("baseAmount"),
      reductionAmount: nullableAmount("reductionAmount"),
      previousSource: typeof line.previousSource === "string" ? line.previousSource
        : typeof line.reductionBasis === "string" ? line.reductionBasis : "Unavailable",
      compositionStatus, rawValue: typeof line.rawValue === "string" ? line.rawValue
        : [totalAmountExact, newAmount, expansionAmount].map((amount) => amount ?? "").join("|"),
      existingForecastAmount: null, resolution: "PLAN_UNASSIGNED" };
  });
  const explicitZeroCount = changes.filter((change) => compareExactDecimals(change.forecastAmount, "0") === 0).length;
  const sourceRowCount = new Set(changes.map((change) => change.rowNumber)).size;
  const salesRepChanges = decodeSalesRepChanges(raw.salesRepChanges, "Malformed Forecast Wide preview");
  const rawBlockedErrors = raw.blockedErrors ?? raw.errors ?? [];
  if (!Array.isArray(rawBlockedErrors)) throw new Error("Malformed Forecast Wide preview");
  const blockedErrors = rawBlockedErrors.map((value): ConsumptionForecastWideBlockedError => {
    if (typeof value !== "object" || value === null) throw new Error("Malformed Forecast Wide preview");
    const error = value as Record<string, unknown>;
    const rowNumber = error.rowNumber ?? error.sourceRow;
    if (!isPositiveInteger(rowNumber)
      || !(error.column === null || error.column === undefined || isNonEmptyString(error.column))
      || !isNonEmptyString(error.code) || !isNonEmptyString(error.message)) throw new Error("Malformed Forecast Wide preview");
    return { rowNumber, column: (error.column as string | null | undefined) ?? null,
      code: error.code, message: error.message };
  });
  return { etag: raw.etag, sourceFileName: source.fileName as string, sourceSha256: source.sha256 as string,
    sourceRowCount, forecastCellCount: raw.populatedCellCount as number,
    blankNoOpCount: typeof raw.blankNoOpCount === "number" ? raw.blankNoOpCount : 0, explicitZeroCount,
    exactReplay: false, referenceColumns: (raw.referenceColumns as string[] | undefined) ?? [], referenceNotice: (raw.referenceNotice as string | null | undefined) ?? null,
    canonicalPeriods: raw.canonicalPeriods as string[],
    similarAccountResolutionCount: 0, planUnassignedCount: sourceRowCount,
    changes, salesRepChanges, blockedErrors, hasBlockedErrors: blockedErrors.length > 0 };
};
export const previewConsumptionForecastWide = async (file: File): Promise<ConsumptionForecastWidePreview> => {
  const { payload } = await request("/consumption/forecast-imports/preview", { method: "POST", body: forecastWideBody(file) });
  return decodeForecastWidePreview(payload, file.name);
};
export const applyConsumptionForecastWide = async (file: File, etag: string): Promise<ConsumptionForecastWideApplyResult> => {
  const { payload } = await request("/consumption/forecast-imports/apply", { method: "POST", headers: { "If-Match": etag }, body: forecastWideBody(file) });
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Forecast Wide apply result");
  const raw = payload as Record<string, unknown>;
  const statuses = new Set(["EXACT_REPLAY", "APPLIED", "APPLIED_NO_CONTROL_CHANGE"]);
  if (!isPositiveInteger(raw.batchId) || typeof raw.replay !== "boolean" || !isNonNegativeInteger(raw.appliedCount)
    || !statuses.has(raw.status as string)
    || raw.replay !== (raw.status === "EXACT_REPLAY")
    || (raw.status === "APPLIED" && raw.appliedCount === 0)
    || (raw.status !== "APPLIED" && raw.appliedCount !== 0)) throw new Error("Malformed Forecast Wide apply result");
  return { batchId: raw.batchId, exactReplay: raw.replay,
    status: raw.status as ConsumptionForecastWideApplyResult["status"], appliedCount: raw.appliedCount,
    noOpCount: 0, explicitZeroCount: 0, planUnassignedCount: 0 };
};
export const saveConsumptionForecasts = async (etag: string,
  controlUpdates: ConsumptionControlForecastUpdate[], selectedPillar: ConsumptionPillar): Promise<ConsumptionApiWorkspace> => {
  const { response, payload } = await request("/consumption/forecasts", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": etag }, body: JSON.stringify({ updates: [], controlUpdates }) }, selectedPillar);
  return parseWorkspace(payload, response.headers.get("ETag"), selectedPillar);
};

export type ForecastActualMode = "FINAL" | "MTD";
export type ForecastActualSummary = Readonly<{
  confirmedActualAmount: string | null;
  confirmedForecastAmount: string;
  confirmedDifferenceAmount: string | null;
  confirmedDifferencePercent: string | null;
  fullPeriodForecastAmount: string;
  projectedAmount: string | null;
  attentionAccountCount: number;
  accountCount: number;
}>;
export type ForecastActualMonth = Readonly<{
  periodKey: string;
  forecastAmount: string | null;
  actualAmount: string | null;
  actualState: ForecastActualMode | null;
  actualAsOf: string | null;
  differenceAmount: string | null;
  differencePercent: string | null;
  monthEndProjection: string | null;
}>;
export type ForecastActualRow = Readonly<{
  salesRep: string;
  account: string;
  confirmedActualAmount: string | null;
  confirmedForecastAmount: string;
  differenceAmount: string | null;
  differencePercent: string | null;
  fullPeriodForecastAmount: string;
  projectedAmount: string | null;
  actualShortfall: boolean | null;
  attention: boolean | null;
  months: readonly ForecastActualMonth[];
}>;
export type ForecastActualComparison = Readonly<{
  fiscalYear: string;
  quarter: string;
  selectedPillar: ConsumptionPillar;
  selectedSalesRep: string;
  selectedAccount: string;
  salesRepOptions: string[];
  accountOptions: string[];
  actualMode: ForecastActualMode;
  comparisonPeriods: string[];
  partialActualPeriods: string[];
  fullForecastPeriods: string[];
  projectionFormula: string;
  summary: ForecastActualSummary;
  fiscalYearSummary: ForecastActualSummary;
  rows: ForecastActualRow[];
}>;

const forecastActualAmount = (value: unknown, nonNegative = true): string => {
  const decoded = decodeExactDecimal(value, nonNegative);
  if (!decoded) throw new Error("Malformed Forecast vs Actual response");
  return decoded.exact;
};
const nullableForecastActualAmount = (value: unknown, nonNegative = true): string | null => value === null || value === undefined
  ? null : forecastActualAmount(value, nonNegative);
const forecastActualCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Malformed Forecast vs Actual response");
  return value;
};
const FORECAST_FISCAL_YEAR_PATTERN = /^FY\d{2,4}$/;
const FORECAST_QUARTER_PATTERN = /^(?:ALL|Q[1-4])$/;
const FORECAST_PERIOD_PATTERN = /^FY\d{2,4}-(?:JUN|JUL|AUG|SEP|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY)$/;
const FORECAST_OFFSET_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const isForecastPeriod = (value: unknown): value is string => typeof value === "string" && FORECAST_PERIOD_PATTERN.test(value);
const isForecastActualAsOf = (value: string): boolean => FORECAST_OFFSET_DATE_TIME_PATTERN.test(value)
  && Number.isFinite(Date.parse(value));
const decodeForecastSummary = (value: Record<string, unknown>): ForecastActualSummary => ({
  confirmedActualAmount: nullableForecastActualAmount(value.confirmedActualAmount),
  confirmedForecastAmount: forecastActualAmount(value.confirmedForecastAmount),
  confirmedDifferenceAmount: nullableForecastActualAmount(value.confirmedDifferenceAmount, false),
  confirmedDifferencePercent: nullableForecastActualAmount(value.confirmedDifferencePercent, false),
  fullPeriodForecastAmount: forecastActualAmount(value.fullPeriodForecastAmount),
  projectedAmount: nullableForecastActualAmount(value.projectedAmount),
  attentionAccountCount: forecastActualCount(value.attentionAccountCount),
  accountCount: forecastActualCount(value.accountCount)
});

export const fetchForecastActualComparison = async (filters: Readonly<{
  fiscalYear: string;
  quarter: string;
  pillar: ConsumptionPillar;
  actualMode: ForecastActualMode;
  salesRep?: string;
  account?: string;
}>, signal?: AbortSignal): Promise<ForecastActualComparison> => {
  const query = new URLSearchParams({ fiscalYear: filters.fiscalYear, quarter: filters.quarter,
    pillar: filters.pillar, actualMode: filters.actualMode });
  if (filters.salesRep) query.set("salesRep", filters.salesRep);
  if (filters.account) query.set("account", filters.account);
  const { payload } = await request(`/consumption/forecast-vs-actual?${query}`, { signal });
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Forecast vs Actual response");
  const raw = payload as Record<string, unknown>;
  const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");
  const partialActualPeriods = raw.partialActualPeriods ?? [];
  const isActualMode = (value: unknown): value is ForecastActualMode => value === "FINAL" || value === "MTD";
  const isPillar = (value: unknown): value is ConsumptionPillar => value === "ALL" || value === "DP" || value === "OCI";
  if (!Array.isArray(raw.rows) || !stringArray(raw.salesRepOptions) || !stringArray(raw.accountOptions)
    || !stringArray(raw.comparisonPeriods) || !stringArray(partialActualPeriods) || !stringArray(raw.fullForecastPeriods)
    || typeof raw.fiscalYear !== "string" || !FORECAST_FISCAL_YEAR_PATTERN.test(raw.fiscalYear)
    || typeof raw.quarter !== "string" || !FORECAST_QUARTER_PATTERN.test(raw.quarter) || !isPillar(raw.selectedPillar)
    || !raw.comparisonPeriods.every(isForecastPeriod) || !partialActualPeriods.every(isForecastPeriod)
    || !raw.fullForecastPeriods.every(isForecastPeriod)
    || !isActualMode(raw.actualMode)
    || (raw.selectedSalesRep !== null && raw.selectedSalesRep !== undefined && typeof raw.selectedSalesRep !== "string")
    || (raw.selectedAccount !== null && raw.selectedAccount !== undefined && typeof raw.selectedAccount !== "string")
    || (raw.projectionFormula !== null && raw.projectionFormula !== undefined && typeof raw.projectionFormula !== "string")
    || typeof raw.summary !== "object" || raw.summary === null
    || typeof raw.fiscalYearSummary !== "object" || raw.fiscalYearSummary === null) throw new Error("Malformed Forecast vs Actual response");
  return {
    fiscalYear: raw.fiscalYear as string, quarter: raw.quarter as string, selectedPillar: raw.selectedPillar,
    selectedSalesRep: (raw.selectedSalesRep ?? "") as string, selectedAccount: (raw.selectedAccount ?? "") as string,
    salesRepOptions: raw.salesRepOptions, accountOptions: raw.accountOptions,
    actualMode: raw.actualMode, comparisonPeriods: raw.comparisonPeriods, partialActualPeriods,
    fullForecastPeriods: raw.fullForecastPeriods, projectionFormula: raw.projectionFormula ?? "",
    summary: decodeForecastSummary(raw.summary as Record<string, unknown>),
    fiscalYearSummary: decodeForecastSummary(raw.fiscalYearSummary as Record<string, unknown>),
    rows: raw.rows.map((value) => {
      if (typeof value !== "object" || value === null) throw new Error("Malformed Forecast vs Actual response");
      const row = value as Record<string, unknown>;
      if (!Array.isArray(row.months) || typeof row.account !== "string"
        || (row.salesRep !== null && row.salesRep !== undefined && typeof row.salesRep !== "string")) throw new Error("Malformed Forecast vs Actual response");
      if ((row.actualShortfall !== null && row.actualShortfall !== undefined && typeof row.actualShortfall !== "boolean")
        || (row.attention !== null && row.attention !== undefined && typeof row.attention !== "boolean")) throw new Error("Malformed Forecast vs Actual response");
      return { salesRep: (row.salesRep ?? "") as string, account: row.account,
        confirmedActualAmount: nullableForecastActualAmount(row.confirmedActualAmount),
        confirmedForecastAmount: forecastActualAmount(row.confirmedForecastAmount),
        differenceAmount: nullableForecastActualAmount(row.differenceAmount, false), differencePercent: nullableForecastActualAmount(row.differencePercent, false),
        fullPeriodForecastAmount: forecastActualAmount(row.fullPeriodForecastAmount), projectedAmount: nullableForecastActualAmount(row.projectedAmount),
        actualShortfall: (row.actualShortfall ?? null) as boolean | null,
        attention: (row.attention ?? null) as boolean | null,
        months: row.months.map((monthValue) => {
          if (typeof monthValue !== "object" || monthValue === null) throw new Error("Malformed Forecast vs Actual response");
          const month = monthValue as Record<string, unknown>;
          if (typeof month.periodKey !== "string" || !isForecastPeriod(month.periodKey)
            || (month.actualState !== null && month.actualState !== undefined && !isActualMode(month.actualState))
            || (month.actualAsOf !== null && month.actualAsOf !== undefined
              && (typeof month.actualAsOf !== "string" || !isForecastActualAsOf(month.actualAsOf)))) throw new Error("Malformed Forecast vs Actual response");
          return { periodKey: month.periodKey, forecastAmount: nullableForecastActualAmount(month.forecastAmount),
            actualAmount: nullableForecastActualAmount(month.actualAmount), actualState: (month.actualState ?? null) as ForecastActualMode | null,
            actualAsOf: (month.actualAsOf ?? null) as string | null,
            differenceAmount: nullableForecastActualAmount(month.differenceAmount, false), differencePercent: nullableForecastActualAmount(month.differencePercent, false),
            monthEndProjection: nullableForecastActualAmount(month.monthEndProjection) };
        }) };
    })
  };
};
