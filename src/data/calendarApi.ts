import { apiFetch } from "../auth/apiFetch";

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
  ownerBadgeColor?: string | null;
  versionNo: number;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  hasEndTime: boolean;
  timeUnknown: boolean;
  forcePrivate: boolean;
  status: "SCHEDULED" | "CANCELLED";
  timezone: string;
  accountId?: number | null;
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
export type SharingUser = Readonly<{ userKey: string; displayName: string }>;
export type CalendarAccountOption = Readonly<{ accountId: number; account: string }>;
export type CalendarRelatedItemType = "ACCOUNT" | "WORKLOAD" | "OPPTY";
export type CalendarRelatedItemOption = Readonly<{
  type: CalendarRelatedItemType;
  id: number;
  accountId: number;
  accountName: string;
  workloadName?: string | null;
  opptyName?: string | null;
  label: string;
}>;
export type CalendarEventInput = Readonly<{
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timeUnknown: boolean;
  forcePrivate: boolean;
  timezone: string;
  accountId?: number | null;
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
  id: number; ownerUserKey?: string; ownerBadgeColor?: string | null; accountId?: number | null;
  relatedItemType?: CalendarRelatedItemType | null; relatedItemId?: number | null; relatedItemLabel?: string | null;
  title: string; description?: string | null; location?: string | null;
  startsAt: string; endsAt: string; allDay: boolean; hasEndTime?: boolean; timeUnknown?: boolean; forcePrivate?: boolean;
  status?: "SCHEDULED" | "CANCELLED"; timezone: string; visibility: CalendarVisibility;
  versionNo: number; effectiveAccess?: CalendarSharePermission; effectiveVisibility?: CalendarVisibility;
};
type ShareDto = { userKey: string; access: CalendarSharePermission; visibility: CalendarVisibility };
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
const mapShare = (share: ShareDto): CalendarEventShare => ({ userKey: share.userKey, permission: share.access, visibility: share.visibility });
const mapEvent = (event: EventDto, shares: readonly CalendarEventShare[] = []): CalendarEvent => ({
  id: event.id,
  ownerUserKey: event.ownerUserKey ?? "",
  ownerBadgeColor: event.ownerBadgeColor ?? null,
  versionNo: event.versionNo,
  title: event.title,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  allDay: event.allDay,
  hasEndTime: event.hasEndTime ?? true,
  timeUnknown: event.timeUnknown ?? false,
  forcePrivate: event.forcePrivate ?? false,
  status: event.status ?? "SCHEDULED",
  timezone: event.timezone,
  accountId: event.accountId ?? null,
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

const offsetFor = (localDateTime: string, timezone: string): string => {
  try {
    const instant = new Date(`${localDateTime.slice(0, 16)}:00Z`);
    const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
    if (name === "GMT" || name === "UTC") return "+00:00";
    const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match) return `${match[1]}${match[2]}:${match[3]}`;
  } catch { /* The backend will report an invalid IANA timezone. */ }
  const offset = -new Date(localDateTime).getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
};
const toOffsetDateTime = (value: string, timezone: string): string => {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value;
  return `${value.slice(0, 16)}:00${offsetFor(value, timezone)}`;
};
const eventBody = (input: CalendarEventInput, versionNo?: number) => ({
  accountId: input.accountId ?? null,
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
export async function acceptCalendarShare(requesterUserKey: string, color: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarShare> {
  const item = await request<CalendarShareDto>(`/calendar/shares/requests/${encodeURIComponent(requesterUserKey)}/accept`, { method: "PUT", body: JSON.stringify({ color }) }, fetchImpl);
  return { userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? color };
}
export async function changeCalendarShareColor(requesterUserKey: string, color: string, fetchImpl: FetchLike = apiFetch): Promise<CalendarShare> {
  const item = await request<CalendarShareDto>(`/calendar/shares/${encodeURIComponent(requesterUserKey)}/color`, { method: "PATCH", body: JSON.stringify({ color }) }, fetchImpl);
  return { userKey: item.userKey, direction: item.direction, status: item.status, ownerBadgeColor: item.ownerBadgeColor ?? color };
}
export async function deleteCalendarShare(share: CalendarShare, fetchImpl: FetchLike = apiFetch): Promise<void> {
  const pendingOutgoing = share.direction === "OUTGOING" && share.status === "PENDING";
  const path = pendingOutgoing ? `/calendar/shares/requests/${encodeURIComponent(share.userKey)}` : `/calendar/shares/${encodeURIComponent(share.userKey)}`;
  await request<void>(path, { method: "DELETE" }, fetchImpl);
}
export async function listSharingUsers(query = "", fetchImpl: FetchLike = apiFetch): Promise<SharingUser[]> {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return unwrap(await request<SharingUser[] | { items: SharingUser[] }>(`/collaboration/directory/users${suffix}`, undefined, fetchImpl));
}
export async function listCalendarAccounts(fiscalYear: string, query = "", fetchImpl: FetchLike = apiFetch): Promise<CalendarAccountOption[]> {
  const params = new URLSearchParams({ fiscalYear, search: query.trim() });
  return unwrap(await request<CalendarAccountOption[] | { items: CalendarAccountOption[] }>(
    `/collaboration/directory/accounts?${params.toString()}`, undefined, fetchImpl));
}
export async function listCalendarRelatedItems(fiscalYear: string, query = "", fetchImpl: FetchLike = apiFetch): Promise<CalendarRelatedItemOption[]> {
  const params = new URLSearchParams({ fiscalYear, search: query.trim() });
  return unwrap(await request<CalendarRelatedItemOption[] | { items: CalendarRelatedItemOption[] }>(
    `/collaboration/directory/related-items?${params.toString()}`, undefined, fetchImpl));
}
export async function listKoreanHolidays(year: number, fetchImpl: FetchLike = apiFetch): Promise<KoreanHoliday[]> {
  const value = await request<KoreanHoliday[] | { items?: KoreanHoliday[]; holidays?: KoreanHoliday[] }>(
    `/calendar/holidays?year=${year}`, undefined, fetchImpl);
  if (Array.isArray(value)) return value;
  return value.holidays ?? value.items ?? [];
}
