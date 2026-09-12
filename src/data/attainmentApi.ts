import { apiFetch } from "../auth/apiFetch";
import {
  AttainmentBudgetUpdate,
  AttainmentDashboard,
  AttainmentQuarter,
  AttainmentQuarterRecord,
  AttainmentSummary,
  attainmentQuarters
} from "./attainmentData";

export type AttainmentFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RuntimeConfig = Readonly<{ __KPI_API_BASE_URL__?: unknown; location?: { hostname?: string; port?: string } }>;

const apiBase = (): string => {
  const runtime = globalThis as typeof globalThis & RuntimeConfig;
  const configured = runtime.__KPI_API_BASE_URL__;
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") {
    return `http://${runtime.location.hostname}:18081/api/v1`;
  }
  return "/api/v1";
};

export class AttainmentApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AttainmentApiError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value: unknown): value is number | null => value === null || finite(value);
const quarterName = (value: unknown): value is AttainmentQuarter => attainmentQuarters.includes(value as AttainmentQuarter);

const parsePillarAmounts = (value: unknown): { actual: number; forecast: number } | null => {
  if (!isObject(value) || !finite(value.actual) || !finite(value.forecast)) return null;
  return { actual: value.actual, forecast: value.forecast };
};

const parseSummary = (value: unknown): AttainmentSummary | null => {
  if (!isObject(value) || !nullableFinite(value.budget) || !finite(value.actual) || !finite(value.forecast) ||
      !nullableFinite(value.actualAttainment) || !nullableFinite(value.forecastAttainment) ||
      !nullableFinite(value.actualVarianceToBudget) || !nullableFinite(value.forecastVarianceToBudget)) return null;
  const dp = parsePillarAmounts(value.dp);
  const oci = parsePillarAmounts(value.oci);
  if (!dp || !oci) return null;
  return {
    budget: value.budget,
    actual: value.actual,
    forecast: value.forecast,
    actualAttainment: value.actualAttainment,
    forecastAttainment: value.forecastAttainment,
    dpActual: dp.actual,
    dpForecast: dp.forecast,
    ociActual: oci.actual,
    ociForecast: oci.forecast,
    actualVarianceToBudget: value.actualVarianceToBudget,
    forecastVarianceToBudget: value.forecastVarianceToBudget
  };
};

const parseQuarter = (value: unknown): AttainmentQuarterRecord | null => {
  if (!isObject(value) || !quarterName(value.quarter) || !nullableFinite(value.budget) ||
      !finite(value.actual) || !finite(value.forecast) || !nullableFinite(value.actualAttainment) ||
      !nullableFinite(value.forecastAttainment)) return null;
  const dp = parsePillarAmounts(value.dp);
  const oci = parsePillarAmounts(value.oci);
  if (!dp || !oci) return null;
  return {
    quarter: value.quarter,
    budget: value.budget,
    actual: value.actual,
    forecast: value.forecast,
    actualAttainment: value.actualAttainment,
    forecastAttainment: value.forecastAttainment,
    dpActual: dp.actual,
    dpForecast: dp.forecast,
    ociActual: oci.actual,
    ociForecast: oci.forecast
  };
};

export const parseAttainmentDashboard = (value: unknown, expectedFiscalYear?: string): AttainmentDashboard => {
  if (!isObject(value) || typeof value.fiscalYear !== "string" || !/^FY\d{2}$/.test(value.fiscalYear) ||
      (expectedFiscalYear !== undefined && value.fiscalYear !== expectedFiscalYear) ||
      !Array.isArray(value.quarters) || value.quarters.length !== attainmentQuarters.length) {
    throw new Error("Malformed Attainment API response");
  }
  const parsedQuarters = value.quarters.map(parseQuarter);
  const summary = parseSummary(value.fiscalYearSummary);
  if (parsedQuarters.some((quarter) => quarter === null) || !summary ||
      new Set(parsedQuarters.map((quarter) => quarter?.quarter)).size !== attainmentQuarters.length) {
    throw new Error("Malformed Attainment API response");
  }
  const byQuarter = new Map(parsedQuarters.map((quarter) => [quarter?.quarter, quarter]));
  return {
    fiscalYear: value.fiscalYear,
    quarters: attainmentQuarters.map((quarter) => byQuarter.get(quarter) as AttainmentQuarterRecord),
    summary
  };
};

const requestJson = async (url: string, init: RequestInit | undefined, fetchImpl: AttainmentFetch): Promise<unknown> => {
  const response = await apiFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  }, fetchImpl);
  if (!response.ok) {
    let payload: { code?: string; message?: string } = {};
    try { payload = await response.json(); } catch { /* sanitized fallback */ }
    throw new AttainmentApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? `Attainment API request failed (${response.status})`);
  }
  return response.json();
};

const assertFiscalYear = (fiscalYear: string): void => {
  if (!/^FY\d{2}$/.test(fiscalYear)) throw new Error("Invalid fiscal year");
};

const assertBudgetUpdate = (update: AttainmentBudgetUpdate): void => {
  if (Object.values(update).some((value) => value !== null && (!finite(value) || value < 0))) {
    throw new Error("Budgets must be nullable nonnegative decimals");
  }
};

export const fetchAttainment = async (fiscalYear: string, fetchImpl: AttainmentFetch = fetch): Promise<AttainmentDashboard> => {
  assertFiscalYear(fiscalYear);
  return parseAttainmentDashboard(
    await requestJson(`${apiBase()}/attainment?fiscalYear=${encodeURIComponent(fiscalYear)}`, undefined, fetchImpl),
    fiscalYear
  );
};

export const updateAttainmentBudget = async (fiscalYear: string, update: AttainmentBudgetUpdate, fetchImpl: AttainmentFetch = fetch): Promise<AttainmentDashboard> => {
  assertFiscalYear(fiscalYear);
  assertBudgetUpdate(update);
  return parseAttainmentDashboard(await requestJson(`${apiBase()}/attainment/budget?fiscalYear=${encodeURIComponent(fiscalYear)}`, {
    method: "PUT",
    body: JSON.stringify(update)
  }, fetchImpl), fiscalYear);
};
