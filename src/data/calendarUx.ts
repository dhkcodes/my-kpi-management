export type CalendarRangeDraft = Readonly<{ startDate: string; endDate: string }>;

export const normalizeEventRange = (range: CalendarRangeDraft): CalendarRangeDraft => ({
  startDate: range.startDate,
  endDate: range.endDate || range.startDate
});

export const eventLocalParts = (value: string, timezone: string): Readonly<{ date: string; time: string }> => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
};

/** Calendar-date semantics for untimed/all-day events; never uses the browser timezone. */
export const eventCalendarDate = (value: string, timezone: string): string =>
  eventLocalParts(value, timezone).date;

export const eventOccursOnDate = (startDate: string, endDate: string, date: string): boolean =>
  startDate <= date && date <= (endDate || startDate);

export const normalizeEventTimes = (draft: Readonly<{
  allDay: boolean;
  timeUnknown: boolean;
  startTime: string;
  endTime: string;
}>): Readonly<{ startTime: string; endTime: string }> => {
  if (draft.timeUnknown) return { startTime: "00:00", endTime: "00:00" };
  if (draft.allDay) return { startTime: "00:00", endTime: "23:59" };
  const startTime = draft.startTime || "00:00";
  return { startTime, endTime: draft.endTime || startTime };
};

export const formatKoreanStartTime = (value: string): string => {
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return "";
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  const minute = Number(rawMinute ?? "0");
  return minute === 0 ? `${period} ${displayHour}시` : `${period} ${displayHour}시 ${minute}분`;
};

export const getEventBadgeText = (event: Readonly<{
  accountName?: string | null;
  title: string;
  startTime?: string;
  timeUnknown: boolean;
  allDay: boolean;
}>): string => {
  const time = !event.allDay && !event.timeUnknown && event.startTime ? formatKoreanStartTime(event.startTime) : "";
  return `${event.title}${time ? ` · ${time}` : ""}`;
};

/** Stable, accessible defaults based on Redwood data-visualization hues. */
export const CALENDAR_SHARE_COLORS = [
  "#245b83", "#2f6f55", "#6f5b9a", "#9b5738", "#7a6228",
  "#226b70", "#8a4967", "#4f6699", "#637538", "#76564c"
] as const;

export type TitleSearchTrigger = Readonly<{ kind: "related" | "user"; query: string }>;

/** Only a currently active @ (relation) or # (sharing user) suffix opens search. */
export const extractTitleSearchTrigger = (title: string): TitleSearchTrigger | null => {
  const match = title.match(/(?:^|\s)([@#])([^@#]*)$/);
  if (!match) return null;
  return { kind: match[1] === "@" ? "related" : "user", query: match[2].trimStart() };
};

const stripActiveTrigger = (title: string, trigger: "related" | "user") =>
  title.replace(trigger === "related" ? /(?:^|\s)@[^@#]*$/ : /(?:^|\s)#[^@#]*$/, "").trim();

export const prependRelatedToken = (title: string, _label: string): string =>
  stripActiveTrigger(title, "related");

export type RelatedSelection = Readonly<{
  type: "ACCOUNT" | "WORKLOAD" | "OPPTY";
  id: number;
  accountId: number;
  accountName: string;
  label: string;
}>;

/** Mentions are relational metadata: selection removes the active query and keeps the title pure. */
export const applyRelatedSelection = (title: string, item: RelatedSelection) => ({
  title: stripActiveTrigger(title, "related"),
  accountId: String(item.accountId),
  relatedItemType: item.type,
  relatedItemId: String(item.id),
  relatedItemLabel: item.type === "ACCOUNT" || item.label === item.accountName
    ? item.accountName
    : `${item.accountName} · ${item.label}`
});

export const relatedAccountName = (accountId: number | string | null | undefined, relatedItemLabel: string | null | undefined): string =>
  accountId == null || accountId === "" ? "" : (relatedItemLabel?.split(" · ")[0]?.trim() || String(accountId));


export const appendMentionToken = (title: string, _displayName: string): string =>
  stripActiveTrigger(title, "user");

/** Small pure predicate used by debounced searches to reject stale responses. */
export const requestIsLatest = (responseRequestId: number, latestRequestId: number): boolean =>
  responseRequestId === latestRequestId;

export const TIMELINE_START_MINUTES = 9 * 60;
export const TIMELINE_END_MINUTES = 18 * 60;
export const TIMELINE_SNAP_MINUTES = 10;
export const LONG_PRESS_CREATE_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 9;

/** A pending create press must remain both long enough and within the movement tolerance. */
export const longPressCanActivate = (startedAt: number, now: number, movementPx: number): boolean =>
  now - startedAt >= LONG_PRESS_CREATE_DELAY_MS && movementPx < LONG_PRESS_MOVE_TOLERANCE_PX;

/** Euclidean movement avoids making diagonal finger jitter easier to activate. */
export const longPressMovementCancels = (originX: number, originY: number, clientX: number, clientY: number): boolean =>
  Math.hypot(clientX - originX, clientY - originY) >= LONG_PRESS_MOVE_TOLERANCE_PX;

export const timeToMinutes = (time: string): number => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

export const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const snapMinutes = (minutes: number): number =>
  Math.round(minutes / TIMELINE_SNAP_MINUTES) * TIMELINE_SNAP_MINUTES;

/** Produces the live create rectangle; an untouched hold defaults to one hour. */
export const timelineCreationRange = (anchorMinutes: number, targetMinutes?: number) => {
  const anchor = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES - TIMELINE_SNAP_MINUTES, snapMinutes(anchorMinutes)));
  if (targetMinutes === undefined) {
    const endMinutes = Math.min(TIMELINE_END_MINUTES, anchor + 60);
    return { startMinutes: endMinutes - 60, endMinutes };
  }
  const target = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES, snapMinutes(targetMinutes)));
  if (target < anchor) return { startMinutes: target, endMinutes: anchor };
  return {
    startMinutes: anchor,
    endMinutes: Math.max(anchor + TIMELINE_SNAP_MINUTES, target)
  };
};

/** Maps mouse, pen, and touch client coordinates onto one exact ten-minute slot. */
export const snapTimelinePointer = (
  clientY: number,
  top: number,
  height: number,
  startMinutes = TIMELINE_START_MINUTES,
  endMinutes = TIMELINE_END_MINUTES,
  includeEnd = false
): number => {
  if (height <= 0) return startMinutes;
  const raw = startMinutes + ((clientY - top) / height) * (endMinutes - startMinutes);
  return Math.max(startMinutes, Math.min(includeEnd ? endMinutes : endMinutes - TIMELINE_SNAP_MINUTES, snapMinutes(raw)));
};

/** Resize uses the same grid and intentionally permits compact 20/30/40 minute events. */
export const resizeTimelineRange = (startMinutes: number, pointerMinutes: number) => ({
  startMinutes,
  endMinutes: Math.max(startMinutes + 20, snapMinutes(pointerMinutes))
});

export type TimelineInterval<T extends string | number = string | number> = Readonly<{
  id: T;
  startMinutes: number;
  endMinutes: number;
}>;

export type LaidOutTimelineInterval<T extends string | number = string | number> = TimelineInterval<T> & Readonly<{
  column: number;
  columnCount: number;
}>;

/** Assigns each true overlap group to stable, side-by-side columns. */
export const layoutTimelineEvents = <T extends string | number>(items: readonly TimelineInterval<T>[]): LaidOutTimelineInterval<T>[] => {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const result: LaidOutTimelineInterval<T>[] = [];
  let group: typeof sorted = [];
  let groupEnd = -1;
  const flush = () => {
    if (!group.length) return;
    const columnEnds: number[] = [];
    const assigned = group.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.startMinutes);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = item.endMinutes;
      return { ...item, column };
    });
    result.push(...assigned.map((item) => ({ ...item, columnCount: columnEnds.length })));
    group = [];
  };
  for (const item of sorted) {
    if (group.length && item.startMinutes >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinutes);
    if (group.length === 1) groupEnd = item.endMinutes;
  }
  flush();
  return result;
};
