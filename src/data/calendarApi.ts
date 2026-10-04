import { apiFetch, apiFetchQuiet } from "../auth/apiFetch";
import { listKpiWorkloadOptions } from "./kpiSpreadsheetApi";
import { formatKpiWorkloadOption } from "./kpiSpreadsheet";

export type CalendarVisibility = "PRIVATE" | "BUSY_ONLY" | "DETAILS";
export type CalendarSharePermission = "VIEW" | "EDIT";
export type CalendarEventShare = Readonly<{
  userKey: string;
  displayName?: string;
  permission: CalendarSharePermission;
  visibility: CalendarVisibility;
}>;
export type CalendarEvent = Readonly<{
  id: number;
  ownerUserKey?: string;
  ownerDisplayName?: string | null;
  ownerBadgeColor?: string | null;
  versionNo: number;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  hasEndTime: boolean;
  timeUnknown: boolean;
  forcePrivate: boolean;
  vacation: boolean;
  recurrence: "NONE" | "WEEKLY" | "MONTHLY";
  recurrenceUntil: string | null;
  workingDays: number;
  status: "SCHEDULED" | "CANCELLED";
  timezone: string;
  accountId?: number | null;
  workloadId?: number | null;
  opportunityDealId?: number | null;
  opportunityId?: string | null;
  relatedItemType?: CalendarRelatedItemType | null;
  relatedItemId?: number | null;
  relatedItemLabel?: string | null;
  location?: string | null;
  description?: string | null;
  visibility: CalendarVisibility;
  effectiveVisibility: CalendarVisibility;
  shares: readonly CalendarEventShare[];
  canEdit: boolean;
}>;
export type CalendarShare = Readonly<{
  userKey: string;
  direction: "INCOMING" | "OUTGOING";
  status: "PENDING" | "ACCEPTED";
  ownerBadgeColor: string | null;
}>;
export type CalendarColorScope = "OWN" | "PRIVATE" | "CANCELLED";
export type CalendarDisplayPreferences = Readonly<{
  ownColor: string;
  privateColor: string;
  cancelledColor: string;
}>;
export type SharingUser = Readonly<{ userKey: string; displayName: string }>;
export type CalendarAccountOption = Readonly<{ accountId: number; account: string }>;
export type CalendarRelatedItemType = "ACCOUNT" | "WORKLOAD" | "OPPTY";
export type CalendarRelatedItemOption = Readonly<{
  type: "WORKLOAD" | "OPPTY";
  id: number;
  accountId: number;
  workloadId: number;
  opportunityDealId: number | null;
  opportunityId: string | null;
  accountName: string;
  workloadName: string;
  opptyName: string | null;
  label: string;
}>;
export type CalendarRelatedItemPage = Readonly<{
  items: CalendarRelatedItemOption[];
  total: number;
  hasMore: boolean;
}>;
export type CalendarEventInput = Readonly<{
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timeUnknown: boolean;
  forcePrivate: boolean;
  vacation: boolean;
  recurrence: "NONE" | "WEEKLY" | "MONTHLY";
  recurrenceUntil: string | null;
  workingDays: number;
  timezone: string;
  accountId?: number | null;
  workloadId?: number | null;
  opportunityDealId?: number | null;
  opportunityId?: string | null;
  relatedItemType?: CalendarRelatedItemType | null;
  relatedItemId?: number | null;
  relatedItemLabel?: string | null;
  location?: string | null;
  description?: string | null;
  visibility: CalendarVisibility;
  shares: readonly CalendarEventShare[];
}>;
export type KoreanHoliday = Readonly<{
  date: string;
  name: string;
  type?: "PUBLIC_HOLIDAY" | "SUBSTITUTE_HOLIDAY" | "TEMPORARY_HOLIDAY";
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type EventDto = {
  id: number; ownerUserKey?: string; ownerDisplayName?: string | null; ownerBadgeColor?: string | null; accountId?: number | null;
  workloadId?: number | null; opportunityDealId?: number | null; opportunityId?: string | null;
  relatedItemType?: CalendarRelatedItemType | null; relatedItemId?: number | null; relatedItemLabel?: string | null;
  title: string; description?: string | null; location?: string | null;
  startsAt: string; endsAt: string; allDay: boolean; hasEndTime?: boolean; timeUnknown?: boolean; forcePrivate?: boolean;
  vacation?: boolean; recurrence?: "NONE" | "WEEKLY" | "MONTHLY"; recurrenceUntil?: string | null; workingDays?: number;
  status?: "SCHEDULED" | "CANCELLED"; timezone: string; visibility: CalendarVisibility;
  versionNo: number; effectiveAccess?: CalendarSharePermission; effectiveVisibility?: CalendarVisibility;
};
type ShareDto = { userKey: string; displayName?: string | null; access: CalendarSharePermission; visibility: CalendarVisibility };
type CalendarShareDto = {
  userKey: string;
  direction: CalendarShare["direction"];
  status: CalendarShare["status"];
  ownerBadgeColor?: string | null;
};

const request = async <T>(path: string, init?: RequestInit, fetchImpl: FetchLike = apiFetch): Promise<T> => {
  const response = await fetchImpl(`/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error((await response.text()).trim() || `Request failed (${response.status}).`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
};
const unwrap = <T>(value: T[] | { items: T[] }): T[] => Array.isArray(value) ? value : value.items;
const mapShare = (share: ShareDto): CalendarEventShare => ({ userKey: share.userKey, ...(share.displayName ? { displayName: share.displayName } : {}), permission: share.access, visibility: share.visibility });
const mapEvent = (event: EventDto, shares: readonly CalendarEventShare[] = []): CalendarEvent => ({
  id: event.id,
  ownerUserKey: event.ownerUserKey ?? "",
  ownerDisplayName: event.ownerDisplayName ?? null,
  ownerBadgeColor: event.ownerBadgeColor ?? null,
  versionNo: event.versionNo,
  title: event.title,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  allDay: event.allDay,
  hasEndTime: event.hasEndTime ?? true,
  timeUnknown: event.timeUnknown ?? false,
  forcePrivate: event.forcePrivate ?? false,
  vacation: event.vacation ?? false,
  recurrence: event.recurrence ?? "NONE",
  recurrenceUntil: event.recurrenceUntil ?? null,
  workingDays: event.workingDays ?? 1,
  status: event.status ?? "SCHEDULED",
  timezone: event.timezone,
  accountId: event.accountId ?? null,
  workloadId: event.workloadId ?? null,
  opportunityDealId: event.opportunityDealId ?? null,
  opportunityId: event.opportunityId ?? null,
  relatedItemType: event.relatedItemType ?? null,
  relatedItemId: event.relatedItemId ?? null,
  relatedItemLabel: event.relatedItemLabel ?? null,
  location: event.location ?? null,
  description: event.description ?? null,
  visibility: event.visibility,
  effectiveVisibility: event.effectiveVisibility ?? event.visibility,
  shares,
  canEdit: event.effectiveAccess === "EDIT"
});

const toOffsetDateTime = (value: string, timezone: string): string => {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  const requested = new Date(`${value.slice(0, 16)}:00Z`).getTime();
  for (let gapMinutes = 0; gapMinutes <= 180; gapMinutes += 1) {
    const localMillis = requested + gapMinutes * 60000;
    const local = new Date(localMillis).toISOString().slice(0, 16);
    for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
      const candidate = new Date(localMillis - offsetMinutes * 60000);
      const parts = formatter.formatToParts(candidate);
      const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
      if (`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}` !== local) continue;
      const sign = offsetMinutes < 0 ? "-" : "+";
      const absolute = Math.abs(offsetMinutes);
      const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
      return `${local}:00${offset}`;
    }
  }
  throw new RangeError(`Could not resolve ${value} in ${timezone}`);
};
const eventBody = (input: CalendarEventInput, versionNo?: number) => ({
  accountId: input.accountId ?? null,
  workloadId: input.workloadId ?? null,
  opportunityDealId: input.opportunityDealId ?? null,
  opportunityId: input.opportunityId ?? null,
  relatedItemType: input.relatedItemType ?? null,
  relatedItemId: input.relatedItemId ?? null,
  relatedItemLabel: input.relatedItemLabel ?? null,
  title: input.title,
  description: input.description ?? null,
  location: input.location ?? null,
  startsAt: toOffsetDateTime(input.startsAt, input.timezone),
  endsAt: input.endsAt ? toOffsetDateTime(input.endsAt, input.timezone) : null,
  allDay: input.allDay,
  timeUnknown: input.timeUnknown,
  forcePrivate: input.forcePrivate,
  vacation: input.vacation,
  recurrence: input.recurrence,
  recurrenceUntil: input.recurrenceUntil,
  workingDays: input.workingDays,
  timezone: input.timezone,
  visibility: input.visibility,
  ...(versionNo === undefined ? {} : { versionNo })
});
const normalizedShares = (shares: readonly CalendarEventShare[]): CalendarEventShare[] => {
  const byUser = new Map<string, CalendarEventShare>();
  for (const share of shares) {
    const userKey = share.userKey.trim();
    if (userKey) byUser.set(userKey, { ...share, userKey, permission: "VIEW" });
  }
  return [...byUser.values()];
};
const putShare = (id: number, share: CalendarEventShare, fetchImpl: FetchLike) =>
  request<ShareDto>(`/calendar/events/${id}/shares/${encodeURIComponent(share.userKey)}`, {
    method: "PUT", body: JSON.stringify({ userKey: share.userKey, access: "VIEW", visibility: share.visibility })
  }, fetchImpl);
const deleteShare = async (id: number, userKey: string, fetchImpl: FetchLike): Promise<void> => {
  const response = await fetchImpl(`/api/v1/calendar/events/${id}/shares/${encodeURIComponent(userKey)}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }
  });
  if (!response.ok && response.status !== 404) throw new Error((await response.text()).trim() || `Request failed (${response.status}).`);
};
const syncShares = async (id: number, previous: readonly CalendarEventShare[], desired: readonly CalendarEventShare[], fetchImpl: FetchLike) => {
  const next = normalizedShares(desired);
  const nextUsers = new Set(next.map((share) => share.userKey));
  await Promise.all([
    ...previous.filter((share) => !nextUsers.has(share.userKey)).map((share) =>
      deleteShare(id, share.userKey, fetchImpl)),
    ...next.map((share) => putShare(id, share, fetchImpl))
  ]);
  return next;
};

export async function listCalendarEvents(fiscalYear: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent[]> {
  const dtos = unwrap(await request<EventDto[] | { items: EventDto[] }>(`/calendar/events?fy=${encodeURIComponent(fiscalYear)}`, undefined, fetchImpl));
  return Promise.all(dtos.map(async (dto) => {
    try {
      const shares = unwrap(await request<ShareDto[] | { items: ShareDto[] }>(`/calendar/events/${dto.id}/shares`, undefined, fetchImpl));
      return mapEvent(dto, shares.map(mapShare));
    } catch {
      // Share lists are owner-only; shared events remain usable without exposing their ACL.
      return mapEvent(dto);
    }
  }));
}
export async function createCalendarEvent(input: CalendarEventInput, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return syncCalendarEventShares(await createCalendarEventEntity(input, fetchImpl), input.shares, fetchImpl);
}
export async function updateCalendarEvent(event: CalendarEvent, input: CalendarEventInput, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return syncCalendarEventShares(await updateCalendarEventEntity(event, input, fetchImpl), input.shares, fetchImpl, event.shares);
}
export async function createCalendarEventEntity(input: CalendarEventInput, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return mapEvent(await request<EventDto>("/calendar/events", { method: "POST", body: JSON.stringify(eventBody(input)) }, fetchImpl));
}
export async function updateCalendarEventEntity(event: CalendarEvent, input: CalendarEventInput, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return mapEvent(await request<EventDto>(`/calendar/events/${event.id}`, { method: "PUT", body: JSON.stringify(eventBody(input, event.versionNo)) }, fetchImpl), event.shares);
}
export async function syncCalendarEventShares(event: CalendarEvent, desired: readonly CalendarEventShare[], fetchImpl: FetchLike = apiFetch,
  previous: readonly CalendarEventShare[] = event.shares): Promise<CalendarEvent> {
  return { ...event, shares: await syncShares(event.id, previous, desired, fetchImpl) };
}
export async function cancelCalendarEvent(event: CalendarEvent, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return mapEvent(await request<EventDto>(`/calendar/events/${event.id}/cancel?versionNo=${event.versionNo}`, { method: "POST" }, fetchImpl), event.shares);
}
export async function reopenCalendarEvent(event: CalendarEvent, fetchImpl: FetchLike = apiFetch): Promise<CalendarEvent> {
  return mapEvent(await request<EventDto>(`/calendar/events/${event.id}/reopen?versionNo=${event.versionNo}`, { method: "POST" }, fetchImpl), event.shares);
}
export async function deleteCalendarEvent(event: CalendarEvent, fetchImpl: FetchLike = apiFetch): Promise<void> {
  await request<void>(`/calendar/events/${event.id}?versionNo=${event.versionNo}`, { method: "DELETE" }, fetchImpl);
}
export async function listCalendarShares(fetchImpl: FetchLike = apiFetch): Promise<CalendarShare[]> {
  const items = unwrap(await request<CalendarShareDto[] | { items: CalendarShareDto[] }>("/calendar/shares", undefined, fetchImpl));
  return items.map((item) => ({ userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? null }));
}
export async function requestCalendarShare(ownerUserKey: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarShare> {
  const item = await request<CalendarShareDto>(`/calendar/shares/requests/${encodeURIComponent(ownerUserKey)}`, { method: "POST" }, fetchImpl);
  return { userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? null };
}
export async function acceptCalendarShare(requesterUserKey: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarShare> {
  const item = await request<CalendarShareDto>(`/calendar/shares/requests/${encodeURIComponent(requesterUserKey)}/accept`, { method: "PUT" }, fetchImpl);
  return { userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? "#245b83" };
}
export async function changeCalendarShareColor(ownerUserKey: string, color: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarShare> {
  const item = await request<CalendarShareDto>(`/calendar/shares/${encodeURIComponent(ownerUserKey)}/color`, { method: "PATCH", body: JSON.stringify({ color }) }, fetchImpl);
  return { userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? color };
}
export async function getCalendarDisplayPreferences(fetchImpl: FetchLike = apiFetch): Promise<CalendarDisplayPreferences> {
  return request<CalendarDisplayPreferences>("/calendar/shares/preferences", undefined, fetchImpl);
}
export async function changeCalendarDisplayPreference(scope: CalendarColorScope, color: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarDisplayPreferences> {
  return request<CalendarDisplayPreferences>(`/calendar/shares/preferences/${scope}`, {
    method: "PATCH", body: JSON.stringify({ color })
  }, fetchImpl);
}
export async function deleteCalendarShare(share: CalendarShare, fetchImpl: FetchLike = apiFetch): Promise<void> {
  const pendingOutgoing = share.direction === "OUTGOING" && share.status === "PENDING";
  const path = pendingOutgoing ? `/calendar/shares/requests/${encodeURIComponent(share.userKey)}` : `/calendar/shares/${encodeURIComponent(share.userKey)}`;
  await request<void>(path, { method: "DELETE" }, fetchImpl);
}
export async function listSharingUsers(query = "", fetchImpl: FetchLike = apiFetchQuiet): Promise<SharingUser[]> {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return unwrap(await request<SharingUser[] | { items: SharingUser[] }>(`/collaboration/directory/users${suffix}`, undefined, fetchImpl));
}
export async function listCalendarAccounts(fiscalYear: string, query = "", fetchImpl: FetchLike = apiFetchQuiet): Promise<CalendarAccountOption[]> {
  const params = new URLSearchParams({ fiscalYear, search: query.trim() });
  return unwrap(await request<CalendarAccountOption[] | { items: CalendarAccountOption[] }>(
    `/collaboration/directory/accounts?${params.toString()}`, undefined, fetchImpl));
}
export async function listCalendarRelatedItems(
  fiscalYear: string,
  query = "",
  offset = 0,
  fetchImpl: FetchLike = apiFetchQuiet
): Promise<CalendarRelatedItemPage> {
  const page = await listKpiWorkloadOptions(fiscalYear as Parameters<typeof listKpiWorkloadOptions>[0], query, offset, fetchImpl);
  return {
    items: page.items.map((item) => ({
      type: item.dealId == null ? "WORKLOAD" as const : "OPPTY" as const,
      id: item.dealId ?? item.workloadId,
      accountId: item.accountId,
      workloadId: item.workloadId,
      opportunityDealId: item.dealId,
      opportunityId: item.opptyNo,
      accountName: item.accountName,
      workloadName: item.workloadName,
      opptyName: item.opptyName,
      label: formatKpiWorkloadOption(item)
    })),
    total: page.total,
    hasMore: page.hasMore
  };
}
export async function listKoreanHolidays(year: number, fetchImpl: FetchLike = apiFetch): Promise<KoreanHoliday[]> {
  const value = await request<KoreanHoliday[] | { items?: KoreanHoliday[]; holidays?: KoreanHoliday[] }>(
    `/calendar/holidays?year=${year}`, undefined, fetchImpl);
  if (Array.isArray(value)) return value;
  return value.holidays ?? value.items ?? [];
}
