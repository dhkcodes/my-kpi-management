import {
  ConsumptionPlan,
  ConsumptionSignal,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths,
  seedForecastMonths
} from "./consumptionData";
import { apiFetch } from "../auth/apiFetch";

const apiBase = () => {
  const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: unknown; location?: { hostname?: string; port?: string } };
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim()) return runtime.__KPI_API_BASE_URL__.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") return `http://${runtime.location?.hostname}:18081/api/v1`;
  return "/api/v1";
};

type RawFact = Readonly<{ periodKey: string; actualAmount: number | null; forecastAmount: number | null; versionNo: number }>;
type RawPlan = Readonly<{ planId: number; stableKey: string; account: string; endUser: string; planCode: string; dataCenter: string; workload?: string | null; facts: RawFact[] }>;
type RawSignal = Readonly<{ signalId: number; planId: number; account: string; endUser: string; planCode: string; periodKey: string; type: ConsumptionSignal["type"]; grade: ConsumptionSignal["grade"]; changeAmount: number; changePercent: number | null; reason: string }>;
type RawControlTotal = Readonly<{ account: string; periodKey: string }>;
type RawWorkspace = Readonly<{
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
}>;

export type ConsumptionApiWorkspace = Readonly<{
  etag: string;
  plans: ConsumptionPlan[];
  signals: ConsumptionSignal[];
  controlTotalCount: number;
  lastBatchId: number | null;
  currentFiscalMonth: string;
  fromQuarter: string;
  toQuarter: string;
  editablePeriodIds: string[];
  displayQuarterOrder: string[];
}>;
export type ConsumptionWorkspaceRange = Readonly<{ fromQuarter: string; toQuarter: string }>;
export type ConsumptionForecastUpdate = Readonly<{ planId: number; periodKey: string; amount: number; versionNo: number }>;
export type ConsumptionImportPreview = Readonly<{ planCount: number; controlTotalCount: number; sourceRowCount: number; sourceSha256: string }>;
export type ConsumptionImportResult = Readonly<{
  workspace: ConsumptionApiWorkspace;
  planCount: number;
  controlTotalCount: number;
  insertedCount: number;
  updatedCount: number;
  appliedCount: number;
  sourceRowCount: number;
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

const signalTypes = new Set<ConsumptionSignal["type"]>(["SPIKE", "DROP", "TREND UP", "TREND DOWN", "NEW", "STOPPED"]);
const signalGrades = new Set<ConsumptionSignal["grade"]>(["CRITICAL", "HIGH", "WATCH"]);
const fiscalPeriodPattern = /^FY\d{2}-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/;
const fiscalQuarterPattern = /^FY\d{2}-Q[1-4]$/;
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNullableFiniteNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isPeriodKey = (value: unknown): value is string => typeof value === "string" && fiscalPeriodPattern.test(value);
const isQuarterKey = (value: unknown): value is string => typeof value === "string" && fiscalQuarterPattern.test(value);

const parseWorkspace = (value: unknown, headerEtag?: string | null): ConsumptionApiWorkspace => {
  if (typeof value !== "object" || value === null) throw new Error("Malformed Consumption workspace response");
  const raw = value as RawWorkspace;
  if (!Array.isArray(raw.plans) || !Array.isArray(raw.signals) || !Array.isArray(raw.controlTotals)) throw new Error("Malformed Consumption workspace response");
  const etag = headerEtag ?? raw.etag;
  if (!isNonEmptyString(etag) || !(raw.lastBatchId === null || isPositiveInteger(raw.lastBatchId))) throw new Error("Malformed Consumption workspace metadata");
  if (raw.controlTotals.some((control) => !isNonEmptyString(control?.account) || !isPeriodKey(control?.periodKey))) throw new Error("Malformed Consumption control total response");
  const basePlans: ConsumptionPlan[] = raw.plans.map((plan) => {
    if (!isPositiveInteger(plan?.planId) || !isNonEmptyString(plan?.stableKey) || !isNonEmptyString(plan?.account)
      || !isNonEmptyString(plan?.endUser) || !isNonEmptyString(plan?.planCode) || !isNonEmptyString(plan?.dataCenter)
      || (plan.workload !== null && plan.workload !== undefined && !isNonEmptyString(plan.workload))
      || !Array.isArray(plan?.facts)) throw new Error("Malformed Consumption plan response");
    const actuals: Record<string, number> = {};
    const forecasts: Record<string, number> = {};
    const versions: Record<string, number> = {};
    plan.facts.forEach((fact) => {
      if (!isPeriodKey(fact?.periodKey) || !isNullableFiniteNumber(fact?.actualAmount)
        || !isNullableFiniteNumber(fact?.forecastAmount) || !isNonNegativeInteger(fact?.versionNo)
        || (fact.actualAmount !== null && fact.forecastAmount !== null)) throw new Error("Malformed Consumption fact response");
      versions[fact.periodKey] = fact.versionNo;
      if (fact.actualAmount !== null) actuals[fact.periodKey] = fact.actualAmount;
      else if (fact.forecastAmount !== null) forecasts[fact.periodKey] = fact.forecastAmount;
    });
    return { id: plan.stableKey, customer: plan.account, endUser: plan.endUser, planId: plan.planCode,
      dataCenter: plan.dataCenter, workload: plan.workload ?? undefined, planType: "OCI", actuals, forecasts, serverPlanId: plan.planId, versions };
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
  const plans = seedForecastMonths(basePlans, editablePeriodIds).map((plan) => ({
    ...plan,
    versions: Object.fromEntries(Object.keys(plan.forecasts).map((month) => [month, plan.versions?.[month] ?? 0]).concat(Object.entries(plan.versions ?? {})))
  }));
  const byServerId = new Map(plans.map((plan) => [plan.serverPlanId, plan]));
  const signals: ConsumptionSignal[] = raw.signals.map((signal) => {
    if (!isPositiveInteger(signal?.signalId) || !isPositiveInteger(signal?.planId) || !isNonEmptyString(signal?.account)
      || !isNonEmptyString(signal?.endUser) || !isNonEmptyString(signal?.planCode) || !isPeriodKey(signal?.periodKey)
      || !signalTypes.has(signal?.type) || !signalGrades.has(signal?.grade) || !isFiniteNumber(signal?.changeAmount)
      || !isNullableFiniteNumber(signal?.changePercent) || !isNonEmptyString(signal?.reason)) throw new Error("Malformed Consumption signal response");
    return {
      id: `server-signal-${signal.signalId}`, customer: signal.account, endUser: signal.endUser, planId: signal.planCode,
      type: signal.type, grade: signal.grade, month: signal.periodKey, changeAmount: signal.changeAmount,
      changePercent: signal.changePercent, reason: signal.reason, topContributingPlan: byServerId.get(signal.planId)?.planId ?? signal.planCode
    };
  });
  return {
    etag,
    plans,
    signals,
    controlTotalCount: new Set(raw.controlTotals.map((control) => control.account)).size,
    lastBatchId: raw.lastBatchId,
    currentFiscalMonth,
    fromQuarter,
    toQuarter,
    editablePeriodIds: [...editablePeriodIds],
    displayQuarterOrder: [...displayQuarterOrder]
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
      throw new ConsumptionConflictError(typeof error.message === "string" ? error.message : "Consumption changed on the server", parseWorkspace(error.current));
    }
    throw new ConsumptionApiError(response.status, typeof error.code === "string" ? error.code : "HTTP_ERROR",
      typeof error.message === "string" ? error.message : `Consumption API request failed (${response.status})`);
  }
  return { response, payload };
};

export const fetchConsumptionWorkspace = async (range?: ConsumptionWorkspaceRange): Promise<ConsumptionApiWorkspace> => {
  const query = range ? `?${new URLSearchParams({ fromQuarter: range.fromQuarter, toQuarter: range.toQuarter })}` : "";
  const { response, payload } = await request(`/consumption/workspace${query}`);
  return parseWorkspace(payload, response.headers.get("ETag"));
};
export const previewConsumptionImport = async (csv: string): Promise<ConsumptionImportPreview> => {
  const { payload } = await request("/consumption/imports/preview", { method: "POST", headers: { "Content-Type": "text/csv; charset=UTF-8" }, body: csv });
  const raw = payload as { plans?: unknown[]; controlTotals?: unknown[]; sourceRowCount?: number; sourceSha256?: string };
  if (!Array.isArray(raw.plans) || !Array.isArray(raw.controlTotals) || typeof raw.sourceRowCount !== "number" || typeof raw.sourceSha256 !== "string") throw new Error("Malformed Consumption import preview");
  return { planCount: raw.plans.length, controlTotalCount: raw.controlTotals.length, sourceRowCount: raw.sourceRowCount, sourceSha256: raw.sourceSha256 };
};
export const applyConsumptionImport = async (csv: string): Promise<ConsumptionImportResult> => {
  const { response, payload } = await request("/consumption/imports/apply", { method: "POST", headers: { "Content-Type": "text/csv; charset=UTF-8" }, body: csv });
  const result = payload as { workspace?: unknown; planCount?: unknown; controlTotalCount?: unknown; insertedCount?: unknown; updatedCount?: unknown; appliedCount?: unknown };
  const workspace = parseWorkspace(result.workspace, response.headers.get("ETag"));
  if (!isNonNegativeInteger(result.planCount) || !isNonNegativeInteger(result.controlTotalCount)
    || !isNonNegativeInteger(result.insertedCount) || !isNonNegativeInteger(result.updatedCount)
    || !isNonNegativeInteger(result.appliedCount) || result.appliedCount !== result.insertedCount + result.updatedCount)
    throw new Error("Malformed Consumption import result");
  return { workspace, planCount: result.planCount, controlTotalCount: result.controlTotalCount,
    insertedCount: result.insertedCount, updatedCount: result.updatedCount, appliedCount: result.appliedCount,
    sourceRowCount: result.planCount + result.controlTotalCount };
};
export const saveConsumptionForecasts = async (etag: string, updates: ConsumptionForecastUpdate[]): Promise<ConsumptionApiWorkspace> => {
  const { response, payload } = await request("/consumption/forecasts", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": etag }, body: JSON.stringify({ updates }) });
  return parseWorkspace(payload, response.headers.get("ETag"));
};
