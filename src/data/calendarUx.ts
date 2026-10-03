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
  const prefix = event.accountName ? `[${event.accountName}] ` : "";
  const time = !event.allDay && !event.timeUnknown && event.startTime ? formatKoreanStartTime(event.startTime) : "";
  return `${prefix}${event.title}${time ? ` · ${time}` : ""}`;
};
