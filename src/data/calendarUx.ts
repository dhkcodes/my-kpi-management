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
  startDate <= date && date <= endDate;

type CalendarSchedule = {
  startDate: string;
  endDate: string;
  recurrence: "NONE" | "WEEKLY" | "MONTHLY";
  recurrenceUntil?: string | null;
  workingDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dateToEpochDay = (value: string): number => Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY_MS);
const epochDayToDate = (value: number): string => new Date(value * DAY_MS).toISOString().slice(0, 10);
const isWorkingDate = (date: string, holidays: ReadonlySet<string>): boolean => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
};
const monthlyOccurrenceDate = (anchorDate: string, monthOffset: number): string => {
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthOffset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay))).toISOString().slice(0, 10);
};

export const eventOccursOnScheduleDate = (schedule: CalendarSchedule, date: string, holidays: ReadonlySet<string>): boolean => {
  if (date < schedule.startDate) return false;
  const baseStartDay = dateToEpochDay(schedule.startDate);
  const targetDay = dateToEpochDay(date);
  const calendarSpanDays = Math.max(0, dateToEpochDay(schedule.endDate) - baseStartDay);
  const workingDays = Math.max(1, Math.trunc(schedule.workingDays || 1));

  const occursForStart = (occurrenceStart: string): boolean => {
    const occurrenceStartDay = dateToEpochDay(occurrenceStart);
    if (workingDays === 1) return occurrenceStartDay <= targetDay && targetDay <= occurrenceStartDay + calendarSpanDays;
    if (!isWorkingDate(date, holidays)) return false;
    let counted = 0;
    for (let day = occurrenceStartDay; day <= targetDay; day += 1) {
      if (isWorkingDate(epochDayToDate(day), holidays)) counted += 1;
      if (counted > workingDays) return false;
    }
    return counted >= 1 && counted <= workingDays;
  };

  const recurrenceUntil = schedule.recurrence === "NONE" ? schedule.startDate : schedule.recurrenceUntil;
  if (!recurrenceUntil) return false;
  if (schedule.recurrence === "NONE") return occursForStart(schedule.startDate);

  if (schedule.recurrence === "WEEKLY") {
    for (let startDay = baseStartDay; startDay <= targetDay && epochDayToDate(startDay) <= recurrenceUntil; startDay += 7) {
      if (occursForStart(epochDayToDate(startDay))) return true;
    }
    return false;
  }

  for (let monthOffset = 0; monthOffset < 2400; monthOffset += 1) {
    const occurrenceStart = monthlyOccurrenceDate(schedule.startDate, monthOffset);
    if (occurrenceStart > date || occurrenceStart > recurrenceUntil) break;
    if (occursForStart(occurrenceStart)) return true;
  }
  return false;
};

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

export const MIN_CALENDAR_DURATION_MINUTES = 60;

/** Existing short events stay untouched until saved; a timed save is normalized to one hour or longer. */
export const ensureMinimumTimedDuration = (draft: Readonly<{
  allDay: boolean;
  timeUnknown: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}>): Readonly<{ startDate: string; startTime: string; endDate: string; endTime: string }> => {
  if (draft.allDay || draft.timeUnknown || !draft.startDate || !draft.startTime) {
    return { startDate: draft.startDate, startTime: draft.startTime, endDate: draft.endDate || draft.startDate, endTime: draft.endTime };
  }
  const start = new Date(`${draft.startDate}T${draft.startTime}:00`);
  const endDate = draft.endDate || draft.startDate;
  const end = draft.endTime ? new Date(`${endDate}T${draft.endTime}:00`) : new Date(Number.NaN);
  if (Number.isNaN(start.getTime())) return { startDate: draft.startDate, startTime: draft.startTime, endDate, endTime: draft.endTime };
  const minimumEnd = new Date(start.getTime() + MIN_CALENDAR_DURATION_MINUTES * 60_000);
  const normalized = Number.isNaN(end.getTime()) || end < minimumEnd ? minimumEnd : end;
  const date = `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, "0")}-${String(normalized.getDate()).padStart(2, "0")}`;
  const time = `${String(normalized.getHours()).padStart(2, "0")}:${String(normalized.getMinutes()).padStart(2, "0")}`;
  return { startDate: draft.startDate, startTime: draft.startTime, endDate: date, endTime: time };
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

/** Replaces only the active suffix trigger, preserving every character outside its mention range. */
export const replaceActiveTitleTrigger = (title: string, trigger: "related" | "user", label: string): string => {
  const pattern = trigger === "related" ? /(^|\s)@[^@#]*$/ : /(^|\s)#[^@#]*$/;
  return title.replace(pattern, (_match, boundary: string) => `${boundary}${trigger === "related" ? "@" : "#"}${label}`);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces/removes one exact existing account mention without touching similarly named title text. */
export const replaceExistingRelatedMention = (title: string, accountName: string, nextAccountName: string): string => {
  if (!accountName) return title;
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(accountName)}(?=\\s|$)`);
  const match = pattern.exec(title);
  if (!match) return title;
  const mentionStart = match.index + match[1].length;
  const mentionEnd = match.index + match[0].length;
  if (nextAccountName) return `${title.slice(0, mentionStart)}@${nextAccountName}${title.slice(mentionEnd)}`;
  let before = title.slice(0, mentionStart);
  let after = title.slice(mentionEnd);
  if (!before) after = after.replace(/^\s/, "");
  else if (!after) before = before.replace(/\s$/, "");
  else if (/\s$/.test(before) && /^\s/.test(after)) after = after.slice(1);
  return before + after;
};

export const prependRelatedToken = (title: string, label: string): string =>
  replaceActiveTitleTrigger(title, "related", label);

export type RelatedSelection = Readonly<{
  type: "WORKLOAD" | "OPPTY";
  id: number;
  accountId: number;
  workloadId: number;
  opportunityDealId: number | null;
  opportunityId: string | null;
  accountName: string;
  label: string;
}>;

/** Mentions are relational metadata and remain visible in the title as their parent account. */
export const applyRelatedSelection = (title: string, item: RelatedSelection, previousAccountName = "") => ({
  title: previousAccountName
    ? replaceExistingRelatedMention(title, previousAccountName, item.accountName)
    : replaceActiveTitleTrigger(title, "related", item.accountName),
  accountId: String(item.accountId),
  workloadId: String(item.workloadId),
  opportunityDealId: item.opportunityDealId == null ? "" : String(item.opportunityDealId),
  opportunityId: item.opportunityId ?? "",
  relatedItemType: item.type,
  relatedItemId: String(item.id),
  relatedItemLabel: `${item.accountName} · ${item.label}`
});

export const relatedAccountName = (accountId: number | string | null | undefined, relatedItemLabel: string | null | undefined): string =>
  accountId == null || accountId === "" ? "" : (relatedItemLabel?.split(" · ")[0]?.trim() || String(accountId));


export const appendMentionToken = (title: string, displayName: string): string =>
  replaceActiveTitleTrigger(title, "user", displayName);

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

/** Produces the live create rectangle; creation always keeps the default one-hour duration. */
export const timelineCreationRange = (anchorMinutes: number, targetMinutes?: number) => {
  const requestedStart = snapMinutes(targetMinutes ?? anchorMinutes);
  const startMinutes = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES - 60, requestedStart));
  return { startMinutes, endMinutes: startMinutes + 60 };
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

/** Resize uses the same grid and never permits a timed event shorter than one hour. */
export const resizeTimelineRange = (startMinutes: number, pointerMinutes: number) => ({
  startMinutes,
  endMinutes: Math.max(startMinutes + MIN_CALENDAR_DURATION_MINUTES, snapMinutes(pointerMinutes))
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
