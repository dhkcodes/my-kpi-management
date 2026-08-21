import { FiscalYear } from "./kpiExcelParser";
import { KpiSpreadsheetRow, SpreadsheetKpiCode } from "./kpiSpreadsheet";

const API_BASE = "/api/v1/kpi-activities";
type KpiActivitiesRuntime = Readonly<{
  location?: { protocol?: string; hostname?: string; port?: string };
}>;

export function getKpiActivitiesApiBase(runtime: KpiActivitiesRuntime = globalThis as KpiActivitiesRuntime): string {
  if (
    runtime.location?.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") &&
    runtime.location?.port === "8000"
  ) {
    return `http://${runtime.location?.hostname}:18081/api/v1/kpi-activities`;
  }
  return API_BASE;
}
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type KpiOverviewStatus = "Achieved" | "In Progress" | "Not Achieved";

export type KpiOverviewItem = Readonly<{
  code: SpreadsheetKpiCode;
  rows: number;
  target: string;
  status: KpiOverviewStatus;
  explanation: string;
}>;

export type KpiOverviewResponse = Readonly<{
  fiscalYear: FiscalYear;
  asOf: string;
  items: KpiOverviewItem[];
}>;

export type KpiWorkloadOption = Readonly<{
  workloadId: number;
  accountName: string;
  workloadName: string;
  opptyNo: string | null;
}>;

export type KpiWorkloadOptionPage = Readonly<{
  items: KpiWorkloadOption[];
  total: number;
  hasMore: boolean;
}>;

const monthNumbers: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const monthLabels = Object.fromEntries(Object.entries(monthNumbers).map(([label, number]) => [number, label]));
const workloadCodes = new Set<SpreadsheetKpiCode>(["B", "C1", "C2", "D1"]);

function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object"; }
function asText(value: unknown): string { return typeof value === "string" ? value : ""; }
function asNullableNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function decodeActivity(value: unknown): KpiSpreadsheetRow {
  if (!isObject(value) || typeof value.id !== "number" || typeof value.versionNo !== "number") throw new Error("Invalid KPI activity response");
  const kpiCode = asText(value.kpiCode) as SpreadsheetKpiCode;
  if (!["A", "B", "C1", "C2", "D1", "F", "H"].includes(kpiCode)) throw new Error("Invalid KPI code in API response");
  const activityMonth = asText(value.activityMonth);
  return {
    id: String(value.id), versionNo: value.versionNo,
    manageTimeReflected: value.manageTimeReflected === true,
    fiscalYear: asText(value.fiscalYear) as FiscalYear,
    kpiCode, quarter: asText(value.quarter) as KpiSpreadsheetRow["quarter"],
    month: activityMonth ? (monthLabels[activityMonth.slice(5, 7)] ?? "") : "",
    accountWorkload: asText(value.rawWorkload),
    workloadId: asNullableNumber(value.workloadId),
    mappingStatus: asText(value.mappingStatus) as KpiSpreadsheetRow["mappingStatus"],
    title: asText(value.description), srNumber: asText(value.srNumber),
    stage: asText(value.salesStage).toLowerCase() as KpiSpreadsheetRow["stage"],
    acrK: asNullableNumber(value.acrK), targetQuarter: asText(value.targetQuarter) as KpiSpreadsheetRow["targetQuarter"],
    deliveryDate: asText(value.deliveryDate)
  };
}

export function decodeKpiRows(payload: unknown): KpiSpreadsheetRow[] {
  if (!isObject(payload) || !Array.isArray(payload.items)) throw new Error("Invalid KPI list response");
  return payload.items.map(decodeActivity);
}

export function decodeKpiOverview(payload: unknown): KpiOverviewResponse {
  if (!isObject(payload) || !Array.isArray(payload.items) || typeof payload.fiscalYear !== "string" ||
      typeof payload.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.asOf)) {
    throw new Error("Invalid KPI overview response");
  }
  const statuses = new Set<KpiOverviewStatus>(["Achieved", "In Progress", "Not Achieved"]);
  const items = payload.items.map((item): KpiOverviewItem => {
    if (!isObject(item) || typeof item.code !== "string" ||
        !["A", "B", "C1", "C2", "D1", "F", "H"].includes(item.code) ||
        typeof item.rows !== "number" || !Number.isInteger(item.rows) || item.rows < 0 ||
        typeof item.target !== "string" || typeof item.status !== "string" ||
        !statuses.has(item.status as KpiOverviewStatus) || typeof item.explanation !== "string") {
      throw new Error("Invalid KPI overview item");
    }
    return {
      code: item.code as SpreadsheetKpiCode,
      rows: item.rows,
      target: item.target,
      status: item.status as KpiOverviewStatus,
      explanation: item.explanation
    };
  });
  return { fiscalYear: payload.fiscalYear as FiscalYear, asOf: payload.asOf, items };
}

async function request(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`KPI API request failed (${response.status})`);
  return response.status === 204 ? undefined : response.json();
}

function activityMonth(row: KpiSpreadsheetRow): string | null {
  if (!row.month || !(row.month in monthNumbers)) return null;
  const startYear = 2000 + Number(row.fiscalYear.slice(2)) - 1;
  const month = Number(monthNumbers[row.month]);
  const year = month <= 5 ? startYear + 1 : startYear;
  return `${year}-${monthNumbers[row.month]}`;
}

function payloadFor(row: KpiSpreadsheetRow) {
  const usesWorkload = workloadCodes.has(row.kpiCode);
  const verified = usesWorkload && row.workloadId != null;
  return {
    manageTimeReflected: row.manageTimeReflected, fiscalYear: row.fiscalYear, kpiCode: row.kpiCode,
    deliveryDate: row.deliveryDate || null, deliveryDateRaw: null,
    quarter: row.kpiCode === "D1" ? (row.targetQuarter || row.quarter) : row.quarter,
    activityMonth: activityMonth(row), rawWorkload: usesWorkload ? row.accountWorkload : null,
    workloadId: verified ? row.workloadId : null,
    mappingStatus: usesWorkload ? (verified ? "VERIFIED" : row.mappingStatus ?? "UNMATCHED") : "NOT_REQUIRED",
    salesStage: row.kpiCode === "D1" ? row.stage.toUpperCase() : null,
    acrK: row.kpiCode === "D1" ? row.acrK : null,
    targetQuarter: row.kpiCode === "D1" ? row.targetQuarter : null,
    srNumber: row.srNumber || null, description: row.title || null
  };
}

export async function listKpiRows(fiscalYear: FiscalYear, fetchImpl: FetchLike = fetch): Promise<KpiSpreadsheetRow[]> {
  return decodeKpiRows(await request(fetchImpl, `${getKpiActivitiesApiBase()}?fiscalYear=${encodeURIComponent(fiscalYear)}`));
}

export async function listKpiOverview(fiscalYear: FiscalYear, fetchImpl: FetchLike = fetch): Promise<KpiOverviewResponse> {
  return decodeKpiOverview(await request(fetchImpl, `${getKpiActivitiesApiBase()}/overview?fiscalYear=${encodeURIComponent(fiscalYear)}`));
}

export async function listKpiWorkloadOptions(
  fiscalYear: FiscalYear,
  search: string,
  offset: number,
  fetchImpl: FetchLike = fetch
): Promise<KpiWorkloadOptionPage> {
  const url = `${getKpiActivitiesApiBase()}/workload-options?fiscalYear=${encodeURIComponent(fiscalYear)}&search=${encodeURIComponent(search)}&offset=${offset}&size=10`;
  const value = await request(fetchImpl, url);
  if (!isObject(value) || !Array.isArray(value.items) || typeof value.total !== "number" || typeof value.hasMore !== "boolean") {
    throw new Error("Invalid KPI workload options response");
  }
  const items = value.items.map((item): KpiWorkloadOption => {
    if (!isObject(item) || typeof item.workloadId !== "number" || typeof item.accountName !== "string" || typeof item.workloadName !== "string") {
      throw new Error("Invalid KPI workload option");
    }
    return { workloadId: item.workloadId, accountName: item.accountName, workloadName: item.workloadName, opptyNo: asText(item.opptyNo) || null };
  });
  return { items, total: value.total, hasMore: value.hasMore };
}

export async function saveKpiRow(row: KpiSpreadsheetRow, fetchImpl: FetchLike = fetch): Promise<KpiSpreadsheetRow> {
  const isDraft = row.id.startsWith("draft-");
  const apiBase = getKpiActivitiesApiBase();
  const url = isDraft ? apiBase : `${apiBase}/${encodeURIComponent(row.id)}`;
  const body = isDraft ? payloadFor(row) : { versionNo: row.versionNo, ...payloadFor(row) };
  return decodeActivity(await request(fetchImpl, url, { method: isDraft ? "POST" : "PATCH", body: JSON.stringify(body) }));
}

export async function saveKpiRowsAtomic(rows: readonly KpiSpreadsheetRow[], fetchImpl: FetchLike = fetch): Promise<KpiSpreadsheetRow[]> {
  const items = rows.map((row) => row.id.startsWith("draft-")
    ? payloadFor(row)
    : { id: Number(row.id), versionNo: row.versionNo, ...payloadFor(row) });
  return decodeKpiRows(await request(fetchImpl, `${getKpiActivitiesApiBase()}/batch`, {
    method: "POST",
    body: JSON.stringify({ items })
  }));
}

export async function deleteKpiRow(row: KpiSpreadsheetRow, fetchImpl: FetchLike = fetch): Promise<void> {
  if (row.id.startsWith("draft-")) return;
  await request(fetchImpl, `${getKpiActivitiesApiBase()}/${encodeURIComponent(row.id)}?versionNo=${encodeURIComponent(String(row.versionNo ?? 0))}`, { method: "DELETE" });
}
