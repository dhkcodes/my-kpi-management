import { FiscalYear } from "./kpiMockData";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RuntimeConfig = Readonly<{
  __KPI_API_BASE_URL__?: unknown;
  location?: { hostname?: string; port?: string };
}>;

const apiBase = () => {
  const runtime = globalThis as typeof globalThis & RuntimeConfig;
  const configured = runtime.__KPI_API_BASE_URL__;
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") {
    return `http://${runtime.location?.hostname}:18081/api/v1`;
  }
  return "/api/v1";
};

export class KpiConfigurationApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "KpiConfigurationApiError";
  }
}

const requestJson = async (fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetchImpl(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    let payload: { code?: string; message?: string } = {};
    try { payload = await response.json(); } catch { /* use sanitized fallback */ }
    throw new KpiConfigurationApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? `Configuration API request failed (${response.status})`);
  }
  return response.json();
};

export type KpiGuideRecord = Readonly<{
  kpiGuideId: number;
  fiscalYear: FiscalYear;
  kpiCode: string;
  srType: string;
  businessSrType: string;
  combinedSrType: string | null;
  targetPerQuarter: string;
  activity: string;
  taskType: string;
  measuring: string;
  details: string;
  notes: string;
  versionNo: number;
}>;

export type FxRateRecord = Readonly<{
  fxRateId: number;
  fiscalYear: FiscalYear;
  fromCurrency: "USD";
  toCurrency: "KRW";
  rateValue: number;
  sourceReference: string | null;
  versionNo: number;
}>;

const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const fiscalYear = (value: unknown): value is FiscalYear => text(value) && /^FY\d{2}$/.test(value);
const guideCodes = new Set(["A", "B", "C1", "C2", "D1", "F", "H"]);

const parseGuide = (value: unknown): KpiGuideRecord | null => {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    !positiveInteger(item.kpiGuideId) || !fiscalYear(item.fiscalYear) || !text(item.kpiCode) || !guideCodes.has(item.kpiCode) ||
    !text(item.srType) || !text(item.businessSrType) || !nullableText(item.combinedSrType) ||
    !text(item.targetPerQuarter) || !text(item.activity) || !text(item.taskType) || !text(item.measuring) ||
    !text(item.details) || !text(item.notes) || !positiveInteger(item.versionNo)
  ) return null;
  return item as KpiGuideRecord;
};

const parseFx = (value: unknown): FxRateRecord | null => {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    !positiveInteger(item.fxRateId) || !fiscalYear(item.fiscalYear) || item.fromCurrency !== "USD" || item.toCurrency !== "KRW" ||
    typeof item.rateValue !== "number" || !Number.isFinite(item.rateValue) || item.rateValue <= 0 ||
    !nullableText(item.sourceReference) || !positiveInteger(item.versionNo)
  ) return null;
  return item as FxRateRecord;
};

export const fetchKpiGuides = async (year: FiscalYear, fetchImpl: FetchLike = fetch): Promise<KpiGuideRecord[]> => {
  const payload = await requestJson(fetchImpl, `${apiBase()}/kpi-guides?fiscalYear=${encodeURIComponent(year)}`);
  const items = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null
      ? (payload as { items?: unknown }).items
      : undefined;
  const parsed = Array.isArray(items) ? items.map(parseGuide) : [];
  if (!Array.isArray(items) || parsed.some((item) => item === null)) throw new Error("Malformed KPI Guide API response");
  return parsed as KpiGuideRecord[];
};

export const updateKpiGuide = async (guide: KpiGuideRecord, fetchImpl: FetchLike = fetch): Promise<KpiGuideRecord> => {
  const { kpiGuideId: _id, kpiCode, ...body } = guide;
  const payload = await requestJson(fetchImpl, `${apiBase()}/kpi-guides/${encodeURIComponent(kpiCode)}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
  const parsed = parseGuide(payload);
  if (!parsed) throw new Error("Malformed KPI Guide API response");
  return parsed;
};

export const fetchFxRate = async (year: FiscalYear, fetchImpl: FetchLike = fetch): Promise<FxRateRecord> => {
  const payload = await requestJson(fetchImpl, `${apiBase()}/fx-rates?fiscalYear=${encodeURIComponent(year)}&fromCurrency=USD&toCurrency=KRW`);
  const parsed = parseFx(payload);
  if (!parsed) throw new Error("Malformed FX Rate API response");
  return parsed;
};

export const updateFxRate = async (fx: FxRateRecord, fetchImpl: FetchLike = fetch): Promise<FxRateRecord> => {
  const payload = await requestJson(fetchImpl, `${apiBase()}/fx-rates/${fx.fxRateId}`, {
    method: "PUT",
    body: JSON.stringify({ versionNo: fx.versionNo, rateValue: fx.rateValue })
  });
  const parsed = parseFx(payload);
  if (!parsed) throw new Error("Malformed FX Rate API response");
  return parsed;
};
