import { assertValidUtf8Content, hasValidUtf8Content } from "./utf8TextPolicy";

export const WEEKLY_ACTIVITIES_API_BASE = "/api/v1";

export type WeeklyActivityRecord = Readonly<{
  activityId: number;
  weekOfDate: string;
  thisWeekHtml: string;
  thisWeekText: string;
  nextWeekHtml: string;
  nextWeekText: string;
  versionNo: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}>;

export type WeeklyActivitiesQuery = Readonly<{
  fromDate: string;
  toDate: string;
  search?: string;
  page?: number;
  size?: number;
}>;

export type WeeklyActivitiesPage = Readonly<{
  items: WeeklyActivityRecord[];
  totalElements: number;
  page: number;
  size: number;
}>;

export type CreateWeeklyActivityRequest = Readonly<{
  weekOfDate: string;
  thisWeekHtml: string;
  nextWeekHtml: string;
}>;

export type UpdateWeeklyActivityRequest = CreateWeeklyActivityRequest & Readonly<{
  versionNo: number;
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type WeeklyActivitiesRuntime = Readonly<{
  __KPI_API_BASE_URL__?: unknown;
  location?: { hostname?: string; port?: string };
}>;

export class WeeklyActivitiesApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "WeeklyActivitiesApiError";
  }
}

const apiBase = () => {
  const runtime = globalThis as typeof globalThis & WeeklyActivitiesRuntime;
  const configured = runtime.__KPI_API_BASE_URL__;
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/$/, "");
  if (["localhost", "127.0.0.1"].includes(runtime.location?.hostname ?? "") && runtime.location?.port === "8000") {
    return `http://${runtime.location?.hostname}:18080/api/v1`;
  }
  return WEEKLY_ACTIVITIES_API_BASE;
};

const requestJson = async <T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
    });
  } catch {
    throw new WeeklyActivitiesApiError(0, "NETWORK_ERROR", "Weekly Activities API is unreachable.");
  }
  if (!response.ok) {
    let payload: { code?: string; message?: string } = {};
    try { payload = await response.json(); } catch { /* sanitized fallback */ }
    const hasResponseCode = typeof payload.code === "string" && hasValidUtf8Content(payload.code);
    const responseCode = hasResponseCode ? payload.code! : "HTTP_ERROR";
    const responseMessage = response.status === 404 && !hasResponseCode
      ? "Weekly Activities API route is unavailable (404). Deploy or restart the Backend that contains /api/v1/weekly-activities."
      : typeof payload.message === "string" && hasValidUtf8Content(payload.message)
        ? payload.message
        : `Weekly Activities request failed (${response.status}).`;
    throw new WeeklyActivitiesApiError(
      response.status,
      responseCode,
      responseMessage
    );
  }
  return response.json() as Promise<T>;
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isString = (value: unknown): value is string => typeof value === "string";
const isValidUtf8String = (value: unknown): value is string => isString(value) && hasValidUtf8Content(value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseRecord = (value: unknown): WeeklyActivityRecord | null => {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    !isPositiveInteger(row.activityId) || !isValidUtf8String(row.weekOfDate) || !ISO_DATE.test(row.weekOfDate) ||
    !isValidUtf8String(row.thisWeekHtml) || !isValidUtf8String(row.thisWeekText) ||
    !isValidUtf8String(row.nextWeekHtml) || !isValidUtf8String(row.nextWeekText) ||
    !isPositiveInteger(row.versionNo) ||
    !isValidUtf8String(row.createdAt) || !isValidUtf8String(row.createdBy) ||
    !isValidUtf8String(row.updatedAt) || !isValidUtf8String(row.updatedBy)
  ) return null;
  return row as WeeklyActivityRecord;
};

export const fetchWeeklyActivities = async (
  query: WeeklyActivitiesQuery,
  fetchImpl: FetchLike = fetch
): Promise<WeeklyActivitiesPage> => {
  assertValidUtf8Content([query.fromDate, query.toDate, query.search ?? ""]);
  const params = new URLSearchParams({
    fromDate: query.fromDate,
    toDate: query.toDate,
    search: query.search ?? "",
    page: String(query.page ?? 0),
    size: String(query.size ?? 50)
  });
  const payload = await requestJson<unknown>(fetchImpl, `${apiBase()}/weekly-activities?${params.toString()}`);
  if (typeof payload !== "object" || payload === null) throw new Error("Malformed Weekly Activities page response.");
  const candidate = payload as Record<string, unknown>;
  const parsed = Array.isArray(candidate.items) ? candidate.items.map(parseRecord) : [];
  if (
    !Array.isArray(candidate.items) || parsed.some((item) => item === null) ||
    !isNonNegativeInteger(candidate.totalElements) || !isNonNegativeInteger(candidate.page) ||
    !isPositiveInteger(candidate.size)
  ) throw new Error("Malformed Weekly Activities page response.");
  return {
    items: parsed as WeeklyActivityRecord[],
    totalElements: candidate.totalElements,
    page: candidate.page,
    size: candidate.size
  };
};

export const createWeeklyActivity = async (
  request: CreateWeeklyActivityRequest,
  fetchImpl: FetchLike = fetch
): Promise<WeeklyActivityRecord> => {
  assertValidUtf8Content([request.weekOfDate, request.thisWeekHtml, request.nextWeekHtml]);
  const payload = await requestJson<unknown>(fetchImpl, `${apiBase()}/weekly-activities`, {
    method: "POST",
    body: JSON.stringify(request)
  });
  const record = parseRecord(payload);
  if (!record) throw new Error("Malformed Weekly Activities mutation response.");
  return record;
};

export const updateWeeklyActivity = async (
  activityId: number,
  request: UpdateWeeklyActivityRequest,
  fetchImpl: FetchLike = fetch
): Promise<WeeklyActivityRecord> => {
  assertValidUtf8Content([request.weekOfDate, request.thisWeekHtml, request.nextWeekHtml]);
  const payload = await requestJson<unknown>(fetchImpl, `${apiBase()}/weekly-activities/${activityId}`, {
    method: "PUT",
    body: JSON.stringify(request)
  });
  const record = parseRecord(payload);
  if (!record) throw new Error("Malformed Weekly Activities mutation response.");
  return record;
};

const isoDate = (year: number, monthIndex: number, day: number) =>
  `${year.toString().padStart(4, "0")}-${(monthIndex + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

export const getDefaultWeeklyActivityRange = (now = new Date()): Readonly<{ fromDate: string; toDate: string }> => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const previousMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const fromMonthIndex = month === 0 ? 11 : month - 1;
  const fromYear = month === 0 ? year - 1 : year;
  return {
    fromDate: isoDate(fromYear, fromMonthIndex, Math.min(day, previousMonthLastDay)),
    toDate: isoDate(year, month, day)
  };
};
