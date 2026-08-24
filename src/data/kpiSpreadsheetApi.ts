import { FiscalYear } from "./kpiExcelParser";
import { KpiSpreadsheetRow, SpreadsheetKpiCode } from "./kpiSpreadsheet";

const API_BASE = "/api/v1/kpi-activities";
type KpiActivitiesRuntime = Readonly<{
  __KPI_API_BASE_URL__?: unknown;
  location?: { protocol?: string; hostname?: string; port?: string };
}>;

export function getKpiActivitiesApiBase(runtime: KpiActivitiesRuntime = globalThis as KpiActivitiesRuntime): string {
  if (typeof runtime.__KPI_API_BASE_URL__ === "string" && runtime.__KPI_API_BASE_URL__.trim()) {
    return `${runtime.__KPI_API_BASE_URL__.replace(/\/$/, "")}/api/v1/kpi-activities`;
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

export const KPI_SUMMARY_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const KPI_SUMMARY_CODES = ["A", "B", "C1", "C2", "D1", "F", "H"] as const;
export const KPI_SUMMARY_STAGES = ["IDENTIFIED", "VALIDATED", "ONBOARDED"] as const;
export type KpiSummaryQuarter = typeof KPI_SUMMARY_QUARTERS[number];
export type KpiSummaryStage = typeof KPI_SUMMARY_STAGES[number];
export type KpiActivitySummary = Readonly<{
  fiscalYear: FiscalYear;
  quarterCounts: Record<SpreadsheetKpiCode, Record<KpiSummaryQuarter, number>>;
  c1C2Monthly: Record<KpiSummaryQuarter, Record<"C1" | "C2", Record<string, number>>>;
  d1QuarterByStage: Record<KpiSummaryQuarter, Record<KpiSummaryStage, Readonly<{ count: number; acrK: number }>>>;
  targets: Readonly<{
    countPerQuarter: Record<"A" | "B" | "F" | "H", number>;
    c1C2CombinedPerQuarter: number;
    d1AcrKPerQuarter: Record<KpiSummaryStage, number>;
    labels: Record<SpreadsheetKpiCode, string>;
  }>;
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
    acrK: asNullableNumber(value.acrK),
    targetFiscalYear: (asText(value.targetFiscalYear) || (kpiCode === "D1" ? asText(value.fiscalYear) : "")) as KpiSpreadsheetRow["targetFiscalYear"],
    targetQuarter: asText(value.targetQuarter) as KpiSpreadsheetRow["targetQuarter"],
    deliveryDate: asText(value.deliveryDate), deliveryDateRaw: asText(value.deliveryDateRaw)
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


const isNonnegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isNonnegativeFinite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const invalidSummary = (): never => { throw new Error("Invalid KPI summary response"); };

export function decodeKpiSummary(payload: unknown): KpiActivitySummary {
  if (!isObject(payload) || typeof payload.fiscalYear !== "string" || !/^FY\d{2}$/.test(payload.fiscalYear)
    || !isObject(payload.quarterCounts) || !isObject(payload.c1C2Monthly)
    || !isObject(payload.d1QuarterByStage) || !isObject(payload.targets)) invalidSummary();
  const root = payload as Record<string, unknown>;
  const rootQuarterCounts = root.quarterCounts as Record<string, unknown>;
  const rootMonthly = root.c1C2Monthly as Record<string, unknown>;
  const rootD1 = root.d1QuarterByStage as Record<string, unknown>;
  const rootTargets = root.targets as Record<string, unknown>;

  const quarterCounts = {} as KpiActivitySummary["quarterCounts"];
  for (const code of KPI_SUMMARY_CODES) {
    const source = rootQuarterCounts[code];
    if (!isObject(source)) invalidSummary();
    const sourceRecord = source as Record<string, unknown>;
    quarterCounts[code] = {} as Record<KpiSummaryQuarter, number>;
    for (const quarter of KPI_SUMMARY_QUARTERS) {
      if (!isNonnegativeInteger(sourceRecord[quarter])) invalidSummary();
      quarterCounts[code][quarter] = sourceRecord[quarter] as number;
    }
  }

  const c1C2Monthly = {} as KpiActivitySummary["c1C2Monthly"];
  for (const quarter of KPI_SUMMARY_QUARTERS) {
    const byQuarter = rootMonthly[quarter];
    if (!isObject(byQuarter)) invalidSummary();
    const byQuarterRecord = byQuarter as Record<string, unknown>;
    c1C2Monthly[quarter] = {} as Record<"C1" | "C2", Record<string, number>>;
    for (const code of ["C1", "C2"] as const) {
      const byMonth = byQuarterRecord[code];
      if (!isObject(byMonth)) invalidSummary();
      const byMonthRecord = byMonth as Record<string, unknown>;
      const decoded: Record<string, number> = {};
      for (const [month, value] of Object.entries(byMonthRecord)) {
        if (!/^\d{4}-\d{2}$/.test(month) || !isNonnegativeInteger(value)) invalidSummary();
        decoded[month] = value as number;
      }
      c1C2Monthly[quarter][code] = decoded;
    }
  }

  const d1QuarterByStage = {} as KpiActivitySummary["d1QuarterByStage"];
  for (const quarter of KPI_SUMMARY_QUARTERS) {
    const byStage = rootD1[quarter];
    if (!isObject(byStage)) invalidSummary();
    const byStageRecord = byStage as Record<string, unknown>;
    d1QuarterByStage[quarter] = {} as Record<KpiSummaryStage, { count: number; acrK: number }>;
    for (const stage of KPI_SUMMARY_STAGES) {
      const metric = byStageRecord[stage];
      if (!isObject(metric)) invalidSummary();
      const metricRecord = metric as Record<string, unknown>;
      if (!isNonnegativeInteger(metricRecord.count) || !isNonnegativeFinite(metricRecord.acrK)) invalidSummary();
      d1QuarterByStage[quarter][stage] = { count: metricRecord.count as number, acrK: metricRecord.acrK as number };
    }
  }

  const countPerQuarter = rootTargets.countPerQuarter;
  const d1AcrKPerQuarter = rootTargets.d1AcrKPerQuarter;
  const labels = rootTargets.labels;
  if (!isObject(countPerQuarter) || !isObject(d1AcrKPerQuarter) || !isObject(labels)
    || !isNonnegativeInteger(rootTargets.c1C2CombinedPerQuarter)) invalidSummary();
  const countRecord = countPerQuarter as Record<string, unknown>;
  const stageTargetRecord = d1AcrKPerQuarter as Record<string, unknown>;
  const labelRecord = labels as Record<string, unknown>;
  const decodedCounts = {} as KpiActivitySummary["targets"]["countPerQuarter"];
  for (const code of ["A", "B", "F", "H"] as const) {
    if (!isNonnegativeInteger(countRecord[code])) invalidSummary();
    decodedCounts[code] = countRecord[code] as number;
  }
  const decodedStages = {} as Record<KpiSummaryStage, number>;
  for (const stage of KPI_SUMMARY_STAGES) {
    if (!isNonnegativeFinite(stageTargetRecord[stage])) invalidSummary();
    decodedStages[stage] = stageTargetRecord[stage] as number;
  }
  const decodedLabels = {} as Record<SpreadsheetKpiCode, string>;
  for (const code of KPI_SUMMARY_CODES) {
    if (typeof labelRecord[code] !== "string" || !(labelRecord[code] as string).trim()) invalidSummary();
    decodedLabels[code] = labelRecord[code] as string;
  }
  return {
    fiscalYear: root.fiscalYear as FiscalYear,
    quarterCounts, c1C2Monthly, d1QuarterByStage,
    targets: {
      countPerQuarter: decodedCounts,
      c1C2CombinedPerQuarter: rootTargets.c1C2CombinedPerQuarter as number,
      d1AcrKPerQuarter: decodedStages,
      labels: decodedLabels
    }
  };
}

async function request(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<unknown> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const response = await fetchImpl(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    headers: hasBody ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers
  });
  if (!response.ok) throw new Error(`KPI API request failed (${response.status})`);
  return response.status === 204 ? undefined : response.json();
}

function activityMonth(row: KpiSpreadsheetRow): string | null {
  if (row.kpiCode === "C1" || row.kpiCode === "C2") {
    if (row.deliveryDate) {
      return /^\d{4}-\d{2}-\d{2}$/.test(row.deliveryDate) ? row.deliveryDate.slice(0, 7) : null;
    }
    // The API requires a planning month even for unreflected drafts. Once a
    // Delivery Date exists, its month is authoritative and replaces this fallback.
  }
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
    targetFiscalYear: row.kpiCode === "D1" ? row.targetFiscalYear : null,
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

export async function listKpiSummary(fiscalYear: FiscalYear, fetchImpl: FetchLike = fetch): Promise<KpiActivitySummary> {
  return decodeKpiSummary(await request(fetchImpl, `${getKpiActivitiesApiBase()}/summary?fiscalYear=${encodeURIComponent(fiscalYear)}`));
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
