import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "oj-c/dialog";
import "oj-c/popup";
import { beginAppBusy } from "../../app/appBusy";
import { apiFetchQuiet } from "../../auth/apiFetch";
import { CalendarColorScope, CalendarDisplayPreferences, CalendarEvent, CalendarEventInput, CalendarRelatedItemOption, CalendarRelatedItemType, CalendarShare, SharingUser, acceptCalendarShare, cancelCalendarEvent, changeCalendarDisplayPreference, changeCalendarShareColor, createCalendarEventEntity, deleteCalendarEvent, deleteCalendarShare, getCalendarDisplayPreferences, listCalendarEvents, listCalendarRelatedItems, listCalendarShares, listKoreanHolidays, listSharingUsers, reopenCalendarEvent, requestCalendarShare, syncCalendarEventShares, updateCalendarEvent, updateCalendarEventEntity } from "../../data/calendarApi";
import { getFiscalYearForDate, getMonthCells } from "../../data/calendarDateUtils";
import { CALENDAR_SHARE_COLORS, LONG_PRESS_CREATE_DELAY_MS, MIN_CALENDAR_DURATION_MINUTES, TIMELINE_END_MINUTES, TIMELINE_SNAP_MINUTES, TIMELINE_START_MINUTES, appendMentionToken, ensureMinimumTimedDuration, eventCalendarDate, eventLocalParts, eventOccursOnScheduleDate, extractTitleSearchTrigger, failedCalendarFlagValue, layoutTimelineEvents, longPressMovementCancels, minutesToTime, normalizeEventRange, normalizeEventTimes, relatedAccountName, replaceActiveTitleTrigger, replaceExistingRelatedMention, requestIsLatest, resizeTimelineRange, snapTimelinePointer, timelineCreationRange, timeToMinutes } from "../../data/calendarUx";

import { fetchWeeklyActivities, WeeklyActivityRecord } from "../../data/weeklyActivitiesApi";
import { sanitizeWeeklyActivityHtml } from "./weeklyActivityEditorSession";

const EventTitle = ({ text, onEdit, onTouchTap }: { text: string; onEdit?: () => void; onTouchTap?: (event: PointerEvent) => boolean }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const update = () => setOverflowing(Boolean(ref.current && ref.current.scrollWidth > ref.current.clientWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [text]);
  return <span class={`calendar-event__title-wrap${expanded ? " is-expanded" : ""}`}>
    <span ref={ref} class="calendar-event__text" tabIndex={0} aria-label={text}
      onDblClick={(event) => { event.stopPropagation(); onEdit?.(); }}
      onKeyDown={(event) => { if (event.key === "F2") { event.preventDefault(); onEdit?.(); } }}
      onFocus={() => setExpanded(true)} onBlur={() => setExpanded(false)}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        if (onTouchTap?.(event)) return;
        setExpanded((value) => !value);
      }}>{text}</span>
    {overflowing && <span class="calendar-event__full-title" role="tooltip">{text}</span>}
  </span>;
};

const CalendarCardSummary = ({ primary, secondary }: { primary: string; secondary: string }) => {
  const primaryRef = useRef<HTMLSpanElement>(null);
  const secondaryRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const update = () => setTruncated(Boolean(
      (primaryRef.current && primaryRef.current.scrollWidth > primaryRef.current.clientWidth)
      || (secondaryRef.current && secondaryRef.current.scrollWidth > secondaryRef.current.clientWidth)
    ));
    update();
    const observer = new ResizeObserver(update);
    if (primaryRef.current) observer.observe(primaryRef.current);
    if (secondaryRef.current) observer.observe(secondaryRef.current);
    return () => observer.disconnect();
  }, [primary, secondary]);
  const tooltip = truncated ? `${primary}\n${secondary}` : undefined;
  return <span class="calendar-card-summary" title={tooltip} aria-label={`${primary}. ${secondary}`}>
    <span ref={primaryRef} class="calendar-card-summary__line">{primary}</span>
    <span ref={secondaryRef} class="calendar-card-summary__line calendar-card-summary__relations">{secondary}</span>
  </span>;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthTitle = (date: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(date);

type Draft = {
  title: string; startDate: string; endDate: string; startTime: string; endTime: string;
  timeUnknown: boolean; allDay: boolean; accountId: string; workloadId: string; opportunityDealId: string; opportunityId: string; relatedItemType: "" | CalendarRelatedItemType;
  relatedItemId: string; relatedItemLabel: string; location: string; description: string;
  forcePrivate: boolean; vacation: boolean; recurrence: "NONE" | "WEEKLY" | "MONTHLY"; recurrenceUntil: string; workingDays: number; timezone: string;
};
type CreateLaneKind = "TIMED" | "ALL_DAY" | "UNKNOWN";
type CreationPreview = {
  kind: CreateLaneKind;
  startMinutes: number;
  endMinutes: number;
  clientX: number;
  clientY: number;
  pointerType: string;
};
type PendingCreatePress = {
  pointerId: number;
  startedAt: number;
  originX: number;
  originY: number;
  anchorMinutes: number;
  pointerType: string;
  timeline: HTMLDivElement;
  timer: number;
  removeListeners: () => void;
};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
const blankDraft = (date: string): Draft => ({
  title: "", startDate: date, endDate: date, startTime: "", endTime: "", timeUnknown: true,
  allDay: false, accountId: "", workloadId: "", opportunityDealId: "", opportunityId: "", relatedItemType: "", relatedItemId: "", relatedItemLabel: "",
  location: "", description: "", forcePrivate: false, vacation: false, recurrence: "NONE", recurrenceUntil: "", workingDays: 1, timezone: browserTimezone()
});
const draftFromEvent = (event: CalendarEvent): Draft => {
  const start = eventLocalParts(event.startsAt, event.timezone);
  const end = eventLocalParts(event.endsAt, event.timezone);
  const calendarOnly = event.timeUnknown || event.allDay;
  return {
    title: event.title,
    startDate: calendarOnly ? eventCalendarDate(event.startsAt, event.timezone) : start.date,
    endDate: calendarOnly ? eventCalendarDate(event.endsAt, event.timezone) : end.date,
    startTime: calendarOnly ? "" : start.time,
    endTime: calendarOnly || !event.hasEndTime ? "" : end.time,
    timeUnknown: event.timeUnknown,
    allDay: event.allDay, accountId: event.accountId == null ? "" : String(event.accountId),
    workloadId: event.workloadId == null ? "" : String(event.workloadId),
    opportunityDealId: event.opportunityDealId == null ? "" : String(event.opportunityDealId),
    opportunityId: event.opportunityId ?? "",
    relatedItemType: event.relatedItemType ?? "",
    relatedItemId: event.relatedItemId == null ? "" : String(event.relatedItemId),
    relatedItemLabel: event.relatedItemLabel ?? "",
    location: event.location ?? "", description: event.description ?? "", forcePrivate: event.forcePrivate,
    vacation: event.vacation, recurrence: event.recurrence, recurrenceUntil: event.recurrenceUntil ?? "", workingDays: event.workingDays,
    timezone: event.timezone
  };
};
const toInput = (draft: Draft, shares: CalendarEvent["shares"]): CalendarEventInput => {
  const dates = normalizeEventRange(draft);
  const { startTime, endTime } = normalizeEventTimes(draft);
  const minimumRange = ensureMinimumTimedDuration({ ...draft, ...dates, startTime, endTime });
  return {
    title: draft.title.trim(), startsAt: `${minimumRange.startDate}T${minimumRange.startTime}`,
    endsAt: `${minimumRange.endDate}T${minimumRange.endTime}`,
    allDay: draft.allDay, timeUnknown: draft.timeUnknown, forcePrivate: draft.forcePrivate,
    vacation: draft.vacation, recurrence: draft.recurrence,
    recurrenceUntil: draft.recurrence === "NONE" ? null : draft.recurrenceUntil,
    workingDays: draft.workingDays,
    timezone: draft.timezone,
    accountId: draft.accountId ? Number(draft.accountId) : null,
    workloadId: draft.workloadId ? Number(draft.workloadId) : null,
    opportunityDealId: draft.opportunityDealId ? Number(draft.opportunityDealId) : null,
    opportunityId: draft.opportunityId || null,
    relatedItemType: draft.relatedItemType || null, relatedItemId: draft.relatedItemId ? Number(draft.relatedItemId) : null,
    relatedItemLabel: draft.relatedItemLabel || null, location: draft.location.trim() || null,
    description: draft.description.trim() || null, visibility: draft.forcePrivate ? "PRIVATE" : "DETAILS",
    shares
  };
};
const applyRelatedSelection = (title: string, item: CalendarRelatedItemOption, _previousAccountName = ""): Partial<Draft> => {
  const nextTitle = extractTitleSearchTrigger(title)?.kind === "related"
    ? title.replace(/(^|\s)@[^@#]*$/, (_match, boundary: string) => boundary).trimEnd()
    : title;
  return {
    title: nextTitle,
    accountId: String(item.accountId),
    workloadId: String(item.workloadId),
    opportunityDealId: item.opportunityDealId == null ? "" : String(item.opportunityDealId),
    opportunityId: item.opportunityId ?? "",
    relatedItemType: item.type,
    relatedItemId: String(item.id),
    relatedItemLabel: `${item.accountName} · ${item.label}`
  };
};

type Props = Readonly<{
  fiscalYear?: string;
  canWrite: boolean;
  breadcrumb?: ComponentChildren;
}>;
export function CalendarPage({ fiscalYear, canWrite, breadcrumb }: Props) {
  const [cursor, setCursor] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Draft | null>(null);
  const [eventShares, setEventShares] = useState<CalendarEvent["shares"]>([]);
  const [eventShareQuery, setEventShareQuery] = useState("");
  const [eventShareSearchOpen, setEventShareSearchOpen] = useState(false);
  const [titleRelatedOptions, setTitleRelatedOptions] = useState<CalendarRelatedItemOption[]>([]);
  const [titleRelatedOffset, setTitleRelatedOffset] = useState(0);
  const [titleRelatedHasMore, setTitleRelatedHasMore] = useState(false);
  const [titleSearchLoading, setTitleSearchLoading] = useState(false);
  const [titleSearchError, setTitleSearchError] = useState("");
  const [accountNames, setAccountNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharingOpen, setSharingOpen] = useState(false);
  const [calendarShares, setCalendarShares] = useState<CalendarShare[]>([]);
  const [displayPreferences, setDisplayPreferences] = useState<CalendarDisplayPreferences>({ ownColor: "#245B83", privateColor: "#704895", cancelledColor: "#6F6F6F" });
  const [colorTarget, setColorTarget] = useState<CalendarColorScope | `SHARED:${string}` | null>(null);
  const [draftColor, setDraftColor] = useState("");
  const [sharingUsers, setSharingUsers] = useState<SharingUser[]>([]);
  const [titleUserOptions, setTitleUserOptions] = useState<SharingUser[]>([]);
  const [shareUserQuery, setShareUserQuery] = useState("");
  const [shareSearchOpen, setShareSearchOpen] = useState(false);
  const [shareUserKey, setShareUserKey] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [dayOpen, setDayOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  const [creationPreview, setCreationPreview] = useState<CreationPreview | null>(null);
  const [undatedCreateKind, setUndatedCreateKind] = useState<CreateLaneKind>("UNKNOWN");
  const [weeklyActivities, setWeeklyActivities] = useState<WeeklyActivityRecord[]>([]);
  const [viewingActivity, setViewingActivity] = useState<WeeklyActivityRecord | null>(null);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [pendingEditorAction, setPendingEditorAction] = useState<"cancel" | "delete" | null>(null);
  const [titleSearchOpen, setTitleSearchOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [mentionEditing, setMentionEditing] = useState<{ event: CalendarEvent; kind: "related" | "user" } | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");

  const [mentionRelatedOptions, setMentionRelatedOptions] = useState<CalendarRelatedItemOption[]>([]);
  const [mentionRelatedOffset, setMentionRelatedOffset] = useState(0);
  const [mentionRelatedHasMore, setMentionRelatedHasMore] = useState(false);
  const [mentionUserOptions, setMentionUserOptions] = useState<SharingUser[]>([]);
  const [mentionSearchLoading, setMentionSearchLoading] = useState(false);
  const [mentionSearchError, setMentionSearchError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [timelinePreview, setTimelinePreview] = useState<{ eventId: number; startMinutes: number; endMinutes: number } | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const latestTitleSearchRef = useRef(0);
  const latestShareSearchRef = useRef(0);
  const latestMentionSearchRef = useRef(0);
  const eventMutationSeqRef = useRef(new Map<string, number>());
  const eventMutationQueueRef = useRef(new Map<number, Promise<void>>());
  const eventServerStateRef = useRef(new Map<number, CalendarEvent>());
  const replaceEvent = (saved: CalendarEvent) => {
    eventServerStateRef.current.set(saved.id, saved);
    setEvents((current) => current.map((event) => event.id === saved.id ? saved : event));
  };
  const eventMutationKey = (eventId: number, field: "forcePrivate" | "vacation") => `${eventId}:${field}`;
  const nextEventMutationSeq = (eventId: number, field: "forcePrivate" | "vacation") => {
    const key = eventMutationKey(eventId, field);
    const next = (eventMutationSeqRef.current.get(key) ?? 0) + 1;
    eventMutationSeqRef.current.set(key, next);
    return next;
  };
  const isLatestEventMutation = (eventId: number, field: "forcePrivate" | "vacation", sequence: number) => eventMutationSeqRef.current.get(eventMutationKey(eventId, field)) === sequence;
  const titleLoadMoreInFlightRef = useRef(false);
  const mentionLoadMoreInFlightRef = useRef(false);
  const initialCalendarLoadRef = useRef(true);
  const editorBaselineRef = useRef<{ draft: Draft; shares: CalendarEvent["shares"] } | null>(null);
  const lastTouchTapRef = useRef<{ date: string; at: number } | null>(null);
  const lastTouchOpenAtRef = useRef(0);
  const lastEventTitleTouchRef = useRef<{ eventId: number; at: number } | null>(null);
  const today = todayIso();

  const eventShareSearchRef = useRef<HTMLElement>(null);
  const shareSearchRef = useRef<HTMLLabelElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pendingCreateRef = useRef<PendingCreatePress | null>(null);
  const creationPreviewRef = useRef<CreationPreview | null>(null);
  const existingGesturePointerIdRef = useRef<number | null>(null);
  const suppressExistingClickUntilRef = useRef(0);
  const undatedCreateKindRef = useRef<CreateLaneKind>("UNKNOWN");
  const cells = useMemo(() => getMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const accountById = accountNames;
  const matchingSharingUsers = useMemo(() => sharingUsers.filter((user) => !calendarShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(shareUserQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, calendarShares, shareUserQuery]);
  const matchingEventUsers = useMemo(() => sharingUsers.filter((user) => !eventShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(eventShareQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, eventShares, eventShareQuery]);
  const matchingTitleUsers = useMemo(() => titleUserOptions.filter((user) => !eventShares.some((share) => share.userKey === user.userKey)).slice(0, 10), [titleUserOptions, eventShares]);
  const draftAccountName = draft?.accountId ? (accountById.get(Number(draft.accountId)) ?? relatedAccountName(Number(draft.accountId), draft.relatedItemLabel)) : "";
  const holidayDates = useMemo(() => new Set(holidays.keys()), [holidays]);
  const eventOccursOnDisplayedDate = (event: CalendarEvent, date: string): boolean => {
    const startDate = event.timeUnknown || event.allDay
      ? eventCalendarDate(event.startsAt, event.timezone)
      : eventLocalParts(event.startsAt, event.timezone).date;
    const endDate = event.timeUnknown || event.allDay
      ? eventCalendarDate(event.endsAt, event.timezone)
      : eventLocalParts(event.endsAt, event.timezone).date;
    return eventOccursOnScheduleDate({ startDate, endDate, recurrence: event.recurrence, recurrenceUntil: event.recurrenceUntil, workingDays: event.workingDays }, date, holidayDates);
  };

  useEffect(() => {
    let active = true;
    const isInitialLoad = initialCalendarLoadRef.current;
    const finishBusy = isInitialLoad ? beginAppBusy() : () => undefined;
    if (isInitialLoad) setCalendarLoading(true);
    const fiscalYear = getFiscalYearForDate(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
    const fromDate = cells[0]?.date ?? `${cursor.getFullYear()}-01-01`;
    const toDate = cells[cells.length - 1]?.date ?? `${cursor.getFullYear()}-12-31`;
    Promise.all([
      listCalendarEvents(fiscalYear, apiFetchQuiet),
      Promise.all(Array.from(new Set(cells.map((cell) => Number(cell.date.slice(0, 4))))).map((year) => listKoreanHolidays(year, apiFetchQuiet))).then((years) => years.flat()),
      listCalendarShares(apiFetchQuiet),
      getCalendarDisplayPreferences(apiFetchQuiet),
      fetchWeeklyActivities({ fromDate, toDate, size: 100 }).catch(() => ({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })),
      listSharingUsers().catch(() => [])
    ]).then(([items, days, shares, preferences, activities, users]) => {
      if (!active) return;
      eventServerStateRef.current = new Map(items.map((event) => [event.id, event]));
      setEvents(items);
      setHolidays(new Map(days.map((day) => [day.date, day.name])));
      setCalendarShares(shares);
      setDisplayPreferences(preferences);
      setWeeklyActivities(activities.items);
      setSharingUsers(users);
      setError("");
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Calendar could not be loaded."))
      .finally(() => {
        finishBusy();
        if (active && isInitialLoad) {
          setCalendarLoading(false);
          initialCalendarLoadRef.current = false;
        }
      });
    return () => { active = false; };
  }, [cursor.getFullYear(), cursor.getMonth()]);

  useEffect(() => {
    const trigger = draft ? extractTitleSearchTrigger(draft.title) : null;
    if (!trigger) {
      latestTitleSearchRef.current += 1;
      setTitleSearchOpen(false);
      setTitleSearchLoading(false);
      setTitleSearchError("");
      return;
    }
    setTitleSearchOpen(true);
    setTitleSearchLoading(true);
    setTitleSearchError("");
    setHighlightedSearchIndex(-1);
    const requestId = ++latestTitleSearchRef.current;
    if (trigger.kind === "related") {
      const lookupFiscalYear = getFiscalYearForDate(draft!.startDate);
      setTitleRelatedOptions([]);
      setTitleRelatedOffset(0);
      setTitleRelatedHasMore(false);
      const timer = window.setTimeout(() => {
        void listCalendarRelatedItems(lookupFiscalYear, trigger.query, 0).then((page) => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setTitleRelatedOptions(page.items);
          setTitleRelatedOffset(10);
          setTitleRelatedHasMore(page.hasMore);
          setTitleSearchLoading(false);
          setAccountNames((current) => { const next = new Map(current); page.items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
        }).catch(() => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setTitleRelatedOptions([]);
          setTitleSearchLoading(false);
          setTitleSearchError("Could not load search results. Please try again.");
        });
      }, 250);
      return () => window.clearTimeout(timer);
    } else {
      setTitleUserOptions([]);
      const timer = window.setTimeout(() => {
        void listSharingUsers(trigger.query).then((users) => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setTitleUserOptions(users);
          setTitleSearchLoading(false);
        }).catch(() => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setTitleUserOptions([]);
          setTitleSearchLoading(false);
          setTitleSearchError("Could not load search results. Please try again.");
        });
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [draft?.title, draft?.startDate, fiscalYear]);

  useEffect(() => {
    if (!mentionEditing) {
      latestMentionSearchRef.current += 1;
      setMentionSearchLoading(false);
      setMentionSearchError("");
      return;
    }
    setMentionSearchLoading(true);
    setMentionSearchError("");
    const requestId = ++latestMentionSearchRef.current;
    if (mentionEditing.kind === "related") {
      setMentionRelatedOptions([]);
      setMentionRelatedOffset(0);
      setMentionRelatedHasMore(false);
      const date = eventCalendarDate(mentionEditing.event.startsAt, mentionEditing.event.timezone);
      const timer = window.setTimeout(() => {
        void listCalendarRelatedItems(getFiscalYearForDate(date), mentionQuery, 0).then((page) => {
          if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
          setMentionRelatedOptions(page.items);
          setMentionRelatedOffset(10);
          setMentionRelatedHasMore(page.hasMore);
          setMentionSearchLoading(false);
          setAccountNames((current) => { const next = new Map(current); page.items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
        }).catch(() => {
          if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
          setMentionRelatedOptions([]);
          setMentionSearchLoading(false);
          setMentionSearchError("Could not load search results. Please try again.");
        });
      }, 250);
      return () => window.clearTimeout(timer);
    } else {
      setMentionUserOptions([]);
      const timer = window.setTimeout(() => {
        void listSharingUsers(mentionQuery).then((users) => {
          if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
          setMentionUserOptions(users);
          setMentionSearchLoading(false);
        }).catch(() => {
          if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
          setMentionUserOptions([]);
          setMentionSearchLoading(false);
          setMentionSearchError("Could not load search results. Please try again.");
        });
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [mentionEditing?.event.id, mentionEditing?.kind, mentionQuery, fiscalYear]);

  useEffect(() => {
    const closeSearches = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!eventShareSearchRef.current?.contains(target)) setEventShareSearchOpen(false);
      if (!shareSearchRef.current?.contains(target)) setShareSearchOpen(false);
      if (!(event.target as HTMLElement).closest(".calendar-inline-mention")) setMentionEditing(null);
      if (!(event.target as HTMLElement).closest(".calendar-block-editor")) setTitleSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeSearches);
    return () => document.removeEventListener("pointerdown", closeSearches);
  }, []);

  useEffect(() => {
    if (!editorMenuOpen) return;
    const handleOutsideSettings = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("#calendar-editor-options-launcher, [aria-label='Recurrence']")) return;
      closeSettings();
    };
    document.addEventListener("pointerdown", handleOutsideSettings, true);
    return () => document.removeEventListener("pointerdown", handleOutsideSettings, true);
  }, [editorMenuOpen]);

  useEffect(() => {
    const query = (eventShareSearchOpen ? eventShareQuery : shareUserQuery).trim();
    if ((!shareSearchOpen && !eventShareSearchOpen) || query.length < 2) return;
    const requestId = ++latestShareSearchRef.current;
    void listSharingUsers(query).then((users) => {
      if (requestIsLatest(requestId, latestShareSearchRef.current)) setSharingUsers(users);
    }).catch(() => undefined);
  }, [shareSearchOpen, shareUserQuery, eventShareSearchOpen, eventShareQuery]);

  const hasUnsavedChanges = () => {
    if (!draft) return false;
    const baseline = editorBaselineRef.current;
    if (!baseline) return true;
    return JSON.stringify(toInput(draft, eventShares)) !== JSON.stringify(toInput(baseline.draft, baseline.shares));
  };
  const openCreate = (date: string, startTime?: string) => {
    if (!canWrite) { setError("Read-only access. Write permission is required."); return; }
    if (hasUnsavedChanges()) { setCloseConfirmOpen(true); return; }
    const next = blankDraft(date);
    if (startTime) { next.timeUnknown = false; next.startTime = startTime; next.endTime = minutesToTime(timeToMinutes(startTime) + 60); }
    editorBaselineRef.current = { draft: { ...next }, shares: [] };
    setTitleEditing(true); setSelectedDate(date); setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(next); setError("");
  };
  const updateCreationPreview = (next: CreationPreview | null) => {
    creationPreviewRef.current = next;
    setCreationPreview(next);
  };
  const clearCreateGesture = () => {
    const pending = pendingCreateRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      pending.removeListeners();
      if (pending.timeline.hasPointerCapture?.(pending.pointerId)) pending.timeline.releasePointerCapture(pending.pointerId);
    }
    pendingCreateRef.current = null;
    document.documentElement.classList.remove("calendar-long-press-active");
    updateCreationPreview(null);
  };
  const openPreviewDraft = (preview: CreationPreview) => {
    if (hasUnsavedChanges()) { setCloseConfirmOpen(true); return; }
    const next = blankDraft(selectedDate);
    if (preview.kind === "TIMED") {
      next.timeUnknown = false;
      next.startTime = minutesToTime(preview.startMinutes);
      next.endTime = minutesToTime(preview.endMinutes);
    } else if (preview.kind === "ALL_DAY") {
      next.timeUnknown = false;
      next.allDay = true;
    }
    editorBaselineRef.current = { draft: { ...next }, shares: [] };
    setTitleEditing(true); setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(next); setError("");
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };
  const beginTimelineCreate = (pointer: PointerEvent) => {
    if (!canWrite || pointer.button !== 0 || pendingCreateRef.current) return;
    const target = pointer.target as HTMLElement;
    if (target.closest(".calendar-timeline-event, .calendar-timeline-editor, .calendar-inline-editor, .calendar-resize-handle, button, input, select, textarea, a")) return;
    const timeline = pointer.currentTarget as HTMLDivElement;
    const rect = timeline.getBoundingClientRect();
    const anchorMinutes = snapTimelinePointer(pointer.clientY, rect.top, rect.height, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
    const pointerId = pointer.pointerId;
    const move = (next: PointerEvent) => {
      const pending = pendingCreateRef.current;
      if (!pending || next.pointerId !== pointerId) return;
      const activePreview = creationPreviewRef.current;
      if (!activePreview) {
        if (longPressMovementCancels(pending.originX, pending.originY, next.clientX, next.clientY)) clearCreateGesture();
        return;
      }
      next.preventDefault();
      const pointedElement = document.elementFromPoint(next.clientX, next.clientY) as HTMLElement | null;
      const overUndatedLane = Boolean(pointedElement?.closest(".calendar-day-undated"));
      if (overUndatedLane) {
        updateCreationPreview({ ...activePreview, kind: undatedCreateKindRef.current, clientX: next.clientX, clientY: next.clientY });
        return;
      }
      const timelineRect = pending.timeline.getBoundingClientRect();
      const targetMinutes = snapTimelinePointer(next.clientY, timelineRect.top, timelineRect.height, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES, true);
      updateCreationPreview({ ...activePreview, kind: "TIMED", ...timelineCreationRange(pending.anchorMinutes, targetMinutes), clientX: next.clientX, clientY: next.clientY });
    };
    const release = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const completed = creationPreviewRef.current;
      if (completed) next.preventDefault();
      clearCreateGesture();
      if (completed) openPreviewDraft(completed);
    };
    const cancel = (next: PointerEvent) => { if (next.pointerId === pointerId) clearCreateGesture(); };
    const preventActivatedTouchScroll = (next: TouchEvent) => {
      if (creationPreviewRef.current) next.preventDefault();
    };
    const removeListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", preventActivatedTouchScroll);
    };
    const pending: PendingCreatePress = {
      pointerId, startedAt: performance.now(), originX: pointer.clientX, originY: pointer.clientY,
      anchorMinutes, pointerType: pointer.pointerType, timeline, timer: 0, removeListeners
    };
    pending.timer = window.setTimeout(() => {
      if (pendingCreateRef.current !== pending) return;
      try { timeline.setPointerCapture(pointerId); } catch { /* A native scroll may already have cancelled capture. */ }
      document.documentElement.classList.add("calendar-long-press-active");
      setHoverMinutes(null);
      updateCreationPreview({ kind: "TIMED", ...timelineCreationRange(anchorMinutes), clientX: pending.originX, clientY: pending.originY, pointerType: pending.pointerType });
    }, LONG_PRESS_CREATE_DELAY_MS);
    pendingCreateRef.current = pending;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", preventActivatedTouchScroll, { passive: false });
  };
  const handleTimelineDoubleClick = (mouse: MouseEvent) => {
    if (!canWrite) return;
    const target = mouse.target as HTMLElement;
    if (target.closest(".calendar-timeline-event, .calendar-timeline-editor, .calendar-inline-editor, .calendar-resize-handle, button, input, select, textarea, a")) return;
    const timeline = mouse.currentTarget as HTMLDivElement;
    const rect = timeline.getBoundingClientRect();
    const anchorMinutes = snapTimelinePointer(mouse.clientY, rect.top, rect.height, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
    mouse.preventDefault();
    openPreviewDraft({ kind: "TIMED", ...timelineCreationRange(anchorMinutes), clientX: mouse.clientX, clientY: mouse.clientY, pointerType: "mouse" });
  };
  const openEdit = (event: CalendarEvent) => { const eventDraft = draftFromEvent(event); editorBaselineRef.current = { draft: eventDraft, shares: event.shares }; setTitleEditing(false); setEditorMenuOpen(false); setSettingsDraft(null); setSelectedEventId(event.id); setSelectedDate(eventCalendarDate(event.startsAt, event.timezone)); setDayOpen(true); setEditing(event); setEventShares(event.shares); setEventShareQuery(""); setDraft(eventDraft); setError(""); };
  const selectEvent = (event: CalendarEvent) => {
    setSelectedEventId(event.id);
    setSelectedDate(eventCalendarDate(event.startsAt, event.timezone));
    setError("");
  };
  const openEventSettings = (event: CalendarEvent) => {
    if (draft && editing?.id !== event.id && hasUnsavedChanges()) { setCloseConfirmOpen(true); return; }
    const nextDraft = draftFromEvent(event);
    openEdit(event);
    setSettingsDraft(nextDraft);
    setEditorMenuOpen(true);
  };
  const beginTitleEdit = (event: CalendarEvent) => {
    if (draft && editing?.id !== event.id && hasUnsavedChanges()) { setCloseConfirmOpen(true); return; }
    openEdit(event); setTitleEditing(true); requestAnimationFrame(() => titleInputRef.current?.focus());
  };
  const handleEventTitleTouchTap = (event: CalendarEvent, pointer: PointerEvent) => {
    const now = Date.now();
    const previous = lastEventTitleTouchRef.current;
    if (previous?.eventId === event.id && now - previous.at < 400) {
      pointer.preventDefault();
      pointer.stopPropagation();
      lastEventTitleTouchRef.current = null;
      beginTitleEdit(event);
      return true;
    }
    lastEventTitleTouchRef.current = { eventId: event.id, at: now };
    return false;
  };

  const closeSettings = () => { setEditorMenuOpen(false); setSettingsDraft(null); };
  const toggleSettings = () => {
    if (editorMenuOpen) { closeSettings(); return; }
    if (!draft) return;
    setSettingsDraft({ ...draft });
    setEditorMenuOpen(true);
  };
  const closeEditor = () => { editorBaselineRef.current = null; setTitleEditing(false); closeSettings(); setDraft(null); setEditing(null); setError(""); };
  const requestDayClose = () => {
    if (hasUnsavedChanges()) { setCloseConfirmOpen(true); return; }
    setDayOpen(false);
    closeEditor();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingCreateRef.current || creationPreviewRef.current) { event.preventDefault(); clearCreateGesture(); return; }
      if (draft) { event.preventDefault(); requestDayClose(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [draft, editing, eventShares]);

  useEffect(() => {
    if (!dayOpen) return;
    const onBackdropClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!String(target.className).includes('ModalStyles_backdropScrimStyle')) return;
      requestDayClose();
    };
    document.addEventListener('click', onBackdropClick, true);
    return () => document.removeEventListener('click', onBackdropClick, true);
  }, [dayOpen, draft, editing, eventShares]);
  useEffect(() => () => {
    const pending = pendingCreateRef.current;
    if (pending) { window.clearTimeout(pending.timer); pending.removeListeners(); }
    document.documentElement.classList.remove("calendar-long-press-active");
  }, []);
  const shift = (months: number) => setCursor((value) => new Date(value.getFullYear(), value.getMonth() + months, 1));
  const shiftYear = (years: number) => setCursor((value) => new Date(value.getFullYear() + years, value.getMonth(), 1));
  const openDayTimeline = (date: string) => { setSelectedDate(date); setDayOpen(true); };
  const handleDayTouchTap = (date: string, pointer: PointerEvent) => {
    if (pointer.pointerType !== "touch") return;
    const now = performance.now();
    const previous = lastTouchTapRef.current;
    setSelectedDate(date);
    if (previous?.date === date && now - previous.at <= 420) {
      lastTouchTapRef.current = null;
      lastTouchOpenAtRef.current = now;
      setDayOpen(true);
      pointer.preventDefault();
      return;
    }
    lastTouchTapRef.current = { date, at: now };
  };
  const save = async () => {
    if (!draft?.startDate || !draft.title.trim()) { setError("Title and start date are required."); return false; }
    setSaving(true);
    try {
      const input = toInput(draft, eventShares);
      if (input.endsAt && input.endsAt < input.startsAt) { setError("End date and time cannot be earlier than the start."); return false; }
      const previousShares = editing?.shares ?? [];
      const persisted = editing
        ? await updateCalendarEventEntity(editing, input)
        : await createCalendarEventEntity(input);
      setEditing(persisted);
      setEvents((current) => [...current.filter((event) => event.id !== persisted.id), persisted]);
      const saved = await syncCalendarEventShares(persisted, eventShares, undefined, previousShares);
      setEvents((current) => [...current.filter((event) => event.id !== saved.id), saved]);
      setSelectedEventId(saved.id);
      setSelectedDate(eventCalendarDate(saved.startsAt, saved.timezone));
      closeEditor();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the event."); return false; }
    finally { setSaving(false); }
  };
  const applySettings = async () => {
    if (!draft || !settingsDraft || (editing && !editing.canEdit)) return;
    const nextDraft = {
      ...draft,
      recurrence: settingsDraft.recurrence,
      recurrenceUntil: settingsDraft.recurrenceUntil,
      workingDays: settingsDraft.workingDays
    };
    if (!editing) {
      setDraft(nextDraft);
      closeSettings();
      return;
    }
    setSaving(true);
    try {
      const previousShares = editing.shares ?? [];
      const persisted = await updateCalendarEventEntity(editing, toInput(nextDraft, eventShares));
      setEvents((current) => current.map((event) => event.id === persisted.id ? persisted : event));
      const persistedDraft = draftFromEvent(persisted);
      setEditing(persisted);
      setDraft(persistedDraft);
      editorBaselineRef.current = { draft: { ...persistedDraft }, shares: [...previousShares] };

      const saved = await syncCalendarEventShares(persisted, eventShares, undefined, previousShares);
      setEvents((current) => current.map((event) => event.id === saved.id ? saved : event));
      const savedDraft = draftFromEvent(saved);
      setEditing(saved);
      setDraft(savedDraft);
      editorBaselineRef.current = { draft: { ...savedDraft }, shares: [...saved.shares] };
      closeSettings();
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply recurrence."); }
    finally { setSaving(false); }
  };
  const toggleCancelled = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = editing.status === "CANCELLED" ? await reopenCalendarEvent(editing) : await cancelCalendarEvent(editing);
      setEvents((current) => current.map((event) => event.id === saved.id ? saved : event));
      closeEditor();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the event status."); }
    finally { setSaving(false); }
  };
  const removeEvent = async () => {
    if (!editing?.canEdit) return;
    setSaving(true);
    try {
      await deleteCalendarEvent(editing);
      setEvents((current) => current.filter((event) => event.id !== editing.id));
      closeEditor();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the event."); }
    finally { setSaving(false); }
  };
  const toggleEventCancelled = async (event: CalendarEvent) => {
    if (!event.canEdit) return;
    setSaving(true);
    try {
      const saved = event.status === "CANCELLED" ? await reopenCalendarEvent(event) : await cancelCalendarEvent(event);
      setEvents((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelectedEventId(saved.id);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the event status."); }
    finally { setSaving(false); }
  };
  const removeSelectedEvent = async (event: CalendarEvent) => {
    if (!event.canEdit) return;
    setSaving(true);
    try {
      await deleteCalendarEvent(event);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setSelectedEventId(null);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the event."); }
    finally { setSaving(false); }
  };
  const toggleEventFlag = async (event: CalendarEvent, flag: "forcePrivate" | "vacation") => {
    if (!event.canEdit) return null;
    const previousValue = event[flag];
    const nextValue = !previousValue;
    const sequence = nextEventMutationSeq(event.id, flag);
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, [flag]: nextValue } : item));
    const previousRequest = eventMutationQueueRef.current.get(event.id) ?? Promise.resolve();
    const request = previousRequest.catch(() => undefined).then(async () => {
      const latest = eventServerStateRef.current.get(event.id) ?? event;
      const saved = await updateCalendarEventEntity(latest, toInput({ ...draftFromEvent(latest), [flag]: nextValue }, latest.shares));
      eventServerStateRef.current.set(event.id, saved);
      return saved;
    });
    const barrier = request.then(() => undefined, () => undefined);
    eventMutationQueueRef.current.set(event.id, barrier);
    try {
      const saved = await request;
      if (isLatestEventMutation(event.id, flag, sequence)) {
        replaceEvent(saved);
        if (editing?.id === event.id) {
          setEditing(saved);
          setDraft((current) => current ? { ...current, [flag]: saved[flag] } : current);
          if (editorBaselineRef.current) editorBaselineRef.current = { ...editorBaselineRef.current, draft: { ...editorBaselineRef.current.draft, [flag]: saved[flag] } };
        }
        setError("");
        return saved;
      }
      return null;
    } catch (reason) {
      if (isLatestEventMutation(event.id, flag, sequence)) {
        const confirmedValue = eventServerStateRef.current.get(event.id)?.[flag];
        const rollbackValue = failedCalendarFlagValue(confirmedValue, previousValue);
        setEvents((current) => current.map((item) => item.id === event.id ? { ...item, [flag]: rollbackValue } : item));
        if (editing?.id === event.id) {
          setEditing((current) => current ? { ...current, [flag]: rollbackValue } : current);
          setDraft((current) => current ? { ...current, [flag]: rollbackValue } : current);
        }
        const label = flag === "forcePrivate" ? "Private" : "Time Off";
        setError(reason instanceof Error ? `${reason.message} ${label} change reverted.` : `Could not update ${label}. Change reverted.`);
      }
      return null;
    } finally {
      if (eventMutationQueueRef.current.get(event.id) === barrier) eventMutationQueueRef.current.delete(event.id);
    }
  };
  const toggleDraftFlag = (flag: "forcePrivate" | "vacation") => {
    if (!draft) return;
    const nextValue = !draft[flag];
    setDraft({ ...draft, [flag]: nextValue });
    if (editing) void toggleEventFlag(editing, flag);
  };
  const selectedCalendarActions = (event: CalendarEvent) => selectedEventId === event.id && event.canEdit ? <div class="calendar-event-actions" onPointerDown={(pointer) => pointer.stopPropagation()} onClick={(click) => click.stopPropagation()} onKeyDown={(key) => key.stopPropagation()}>
    <button type="button" class={`calendar-icon-action${event.forcePrivate ? " is-active" : ""}`} aria-pressed={event.forcePrivate} title={`Private: ${event.forcePrivate ? "On" : "Off"}`} aria-label={`Private: ${event.forcePrivate ? "On" : "Off"}`} onClick={() => void toggleEventFlag(event, "forcePrivate")}>🔒</button>
    <button type="button" class={`calendar-icon-action${event.vacation ? " is-active" : ""}`} aria-pressed={event.vacation} title={`Time Off: ${event.vacation ? "On" : "Off"}`} aria-label={`Time Off: ${event.vacation ? "On" : "Off"}`} onClick={() => void toggleEventFlag(event, "vacation")}>🏖</button>
    <button type="button" class="calendar-icon-action" title={event.status === "CANCELLED" ? "Reopen Event" : "Cancel Event"} aria-label={event.status === "CANCELLED" ? "Reopen Event" : "Cancel Event"} onClick={() => void toggleEventCancelled(event)}>⊘</button>
    <button type="button" class="calendar-icon-action" title="Delete" aria-label="Delete" onClick={() => void removeSelectedEvent(event)}>⌫</button>
  </div> : null;
  const selectedTimelineActions = (event: CalendarEvent) => selectedEventId === event.id && event.canEdit ? <div class="calendar-event-actions" onPointerDown={(pointer) => pointer.stopPropagation()} onClick={(click) => click.stopPropagation()} onKeyDown={(key) => key.stopPropagation()}>
    <button type="button" class="calendar-icon-action" title="Recurrence" aria-label="Recurrence" onClick={() => openEventSettings(event)}>↻</button>
    <button type="button" class={`calendar-icon-action${event.forcePrivate ? " is-active" : ""}`} aria-pressed={event.forcePrivate} title={`Private: ${event.forcePrivate ? "On" : "Off"}`} aria-label={`Private: ${event.forcePrivate ? "On" : "Off"}`} onClick={() => void toggleEventFlag(event, "forcePrivate")}>🔒</button>
    <button type="button" class={`calendar-icon-action${event.vacation ? " is-active" : ""}`} aria-pressed={event.vacation} title={`Time Off: ${event.vacation ? "On" : "Off"}`} aria-label={`Time Off: ${event.vacation ? "On" : "Off"}`} onClick={() => void toggleEventFlag(event, "vacation")}>🏖</button>
    <button type="button" class="calendar-icon-action" title={event.status === "CANCELLED" ? "Reopen Event" : "Cancel Event"} aria-label={event.status === "CANCELLED" ? "Reopen Event" : "Cancel Event"} onClick={() => void toggleEventCancelled(event)}>⊘</button>
    <button type="button" class="calendar-icon-action" title="Delete" aria-label="Delete" onClick={() => void removeSelectedEvent(event)}>⌫</button>
  </div> : null;
  const openSharing = async () => {
    setSaving(true);
    try {
      const [shares, users] = await Promise.all([listCalendarShares(), listSharingUsers()]);
      setCalendarShares(shares); setSharingUsers(users); setSharingOpen(true); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load sharing settings."); }
    finally { setSaving(false); }
  };
  const addCalendarShare = async () => {
    if (!shareUserKey) { setError("Select a user to share with."); return; }
    setSaving(true);
    try {
      const saved = await requestCalendarShare(shareUserKey);
      setCalendarShares((current) => [...current.filter((item) => item.userKey !== saved.userKey), saved]);
      setShareUserKey(""); setShareUserQuery(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the sharing request."); }
    finally { setSaving(false); }
  };
  const acceptShare = async (share: CalendarShare) => {
    setSaving(true);
    try { const saved = await acceptCalendarShare(share.userKey); setCalendarShares((current) => current.map((item) => item.userKey === saved.userKey ? saved : item)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept the sharing request."); }
    finally { setSaving(false); }
  };
  const updateShareColor = async (share: CalendarShare, color: string) => {
    setSaving(true);
    try { const saved = await changeCalendarShareColor(share.userKey, color); setCalendarShares((current) => current.map((item) => item.userKey === saved.userKey ? saved : item)); setColorTarget(null); setDraftColor(""); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the shared calendar color."); }
    finally { setSaving(false); }
  };
  const updateDisplayColor = async (scope: CalendarColorScope, color: string) => {
    setSaving(true);
    try { setDisplayPreferences(await changeCalendarDisplayPreference(scope, color)); setColorTarget(null); setDraftColor(""); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the display color."); }
    finally { setSaving(false); }
  };
  const persistedColor = (target: CalendarColorScope | `SHARED:${string}`) => target.startsWith("SHARED:")
    ? calendarShares.find((share) => share.userKey === target.slice(7))?.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0]
    : target === "OWN" ? displayPreferences.ownColor : target === "PRIVATE" ? displayPreferences.privateColor : displayPreferences.cancelledColor;
  const openColorPicker = (target: CalendarColorScope | `SHARED:${string}`) => {
    if (colorTarget === target) { setColorTarget(null); setDraftColor(""); return; }
    setDraftColor(persistedColor(target));
    setColorTarget(target);
  };
  const applyDraftColor = async () => {
    if (!colorTarget || !draftColor) return;
    if (colorTarget.startsWith("SHARED:")) {
      const share = calendarShares.find((item) => item.userKey === colorTarget.slice(7));
      if (share) await updateShareColor(share, draftColor);
    } else await updateDisplayColor(colorTarget as CalendarColorScope, draftColor);
  };
  const removeCalendarShare = async (share: CalendarShare) => {
    setSaving(true);
    try { await deleteCalendarShare(share); setCalendarShares((current) => current.filter((item) => item.userKey !== share.userKey)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel the sharing request or connection."); }
    finally { setSaving(false); }
  };

  const loadMoreTitleRelations = () => {
    const trigger = draft ? extractTitleSearchTrigger(draft.title) : null;
    if (!draft || trigger?.kind !== "related" || titleSearchLoading || titleLoadMoreInFlightRef.current || !titleRelatedHasMore) return;
    const requestId = latestTitleSearchRef.current;
    titleLoadMoreInFlightRef.current = true;
    setTitleSearchLoading(true);
    void listCalendarRelatedItems(getFiscalYearForDate(draft.startDate), trigger.query, titleRelatedOffset).then((page) => {
      if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
      setTitleRelatedOptions((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.type === item.type && existing.id === item.id))]);
      setTitleRelatedOffset((current) => current + 10);
      setTitleRelatedHasMore(page.hasMore);
      setAccountNames((current) => { const next = new Map(current); page.items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
    }).catch(() => {
      if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
      setTitleSearchError("Could not load search results. Please try again.");
    }).finally(() => {
      titleLoadMoreInFlightRef.current = false;
      if (requestIsLatest(requestId, latestTitleSearchRef.current)) setTitleSearchLoading(false);
    });
  };
  const handleTitleSearchScroll = (event: Event) => {
    const target = event.currentTarget as HTMLDivElement;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 48) loadMoreTitleRelations();
  };

  const loadMoreMentionRelations = () => {
    if (!mentionEditing || mentionEditing.kind !== "related" || mentionSearchLoading || mentionLoadMoreInFlightRef.current || !mentionRelatedHasMore) return;
    const requestId = latestMentionSearchRef.current;
    const date = eventCalendarDate(mentionEditing.event.startsAt, mentionEditing.event.timezone);
    mentionLoadMoreInFlightRef.current = true;
    setMentionSearchLoading(true);
    void listCalendarRelatedItems(getFiscalYearForDate(date), mentionQuery, mentionRelatedOffset).then((page) => {
      if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
      setMentionRelatedOptions((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.type === item.type && existing.id === item.id))]);
      setMentionRelatedOffset((current) => current + 10);
      setMentionRelatedHasMore(page.hasMore);
      setAccountNames((current) => { const next = new Map(current); page.items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
    }).catch(() => {
      if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
      setMentionSearchError("Could not load search results. Please try again.");
    }).finally(() => {
      mentionLoadMoreInFlightRef.current = false;
      if (requestIsLatest(requestId, latestMentionSearchRef.current)) setMentionSearchLoading(false);
    });
  };
  const handleMentionSearchScroll = (event: Event) => {
    const target = event.currentTarget as HTMLDivElement;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 48) loadMoreMentionRelations();
  };

  const chooseTitleSearchResult = (index: number) => {
    if (!draft) return;
    const trigger = extractTitleSearchTrigger(draft.title);
    if (trigger?.kind === "related") {
      const item = titleRelatedOptions[index];
      if (!item) return;
      setAccountNames((current) => new Map(current).set(item.accountId, item.accountName));
      setDraft({ ...draft, ...applyRelatedSelection(draft.title, item) });
    } else if (trigger?.kind === "user") {
      const user = matchingTitleUsers[index];
      if (!user) return;
      setDraft({ ...draft, title: appendMentionToken(draft.title, user.displayName) });
      setEventShares((current) => current.some((share) => share.userKey === user.userKey) ? current : [...current, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW", visibility: "DETAILS" }]);
    }
    setTitleSearchOpen(false); setHighlightedSearchIndex(-1);
    requestAnimationFrame(() => { titleInputRef.current?.focus(); const length = titleInputRef.current?.value.length ?? 0; titleInputRef.current?.setSelectionRange(length, length); });
  };

  const handleTitleKeyDown = (event: KeyboardEvent) => {
    if (composing || event.isComposing) return;
    if (event.key === "ArrowDown" && titleSearchOpen) { event.preventDefault(); setHighlightedSearchIndex((value) => Math.min(value + 1, 9)); return; }
    if (event.key === "ArrowUp" && titleSearchOpen) { event.preventDefault(); setHighlightedSearchIndex((value) => Math.max(value - 1, 0)); return; }
    if (event.key === "Escape" && titleSearchOpen) { event.preventDefault(); setTitleSearchOpen(false); setHighlightedSearchIndex(-1); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (titleSearchOpen) chooseTitleSearchResult(Math.max(0, highlightedSearchIndex));
    else void save();
  };

  const saveMentionUpdate = async (event: CalendarEvent, nextDraft: Draft, shares: CalendarEvent["shares"]) => {
    if (!event.canEdit) return;
    setSaving(true);
    try {
      const saved = await updateCalendarEvent(event, toInput(nextDraft, shares));
      setEvents((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMentionEditing(null); setMentionQuery(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save event relations."); }
    finally { setSaving(false); }
  };

  const eventRelationText = (event: CalendarEvent) => {
    const accountName = event.accountId == null ? "" : (accountNames.get(event.accountId) ?? relatedAccountName(event.accountId, event.relatedItemLabel));
    const ownerDisplayName = !event.canEdit ? (event.ownerDisplayName ?? "Unknown owner") : "";
    const participants = event.shares.map((share) => sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? "Unknown participant");
    return [ownerDisplayName ? `Shared by ${ownerDisplayName}` : "", accountName ? `@${accountName}` : "", participants.length ? `#${participants.join(",")}` : ""].filter(Boolean).join(" ");
  };
  const renderEventRelations = (event: CalendarEvent) => {
    const accountName = event.accountId == null ? "" : (accountNames.get(event.accountId) ?? relatedAccountName(event.accountId, event.relatedItemLabel));
    const ownerDisplayName = !event.canEdit ? (event.ownerDisplayName ?? "Unknown owner") : "";
    const participants = event.shares.map((share) => sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? "Unknown participant");
    if (!ownerDisplayName && !accountName && !participants.length) return null;
    return <div class="calendar-event-relations" aria-label="Event relations">
      {ownerDisplayName && <span class="calendar-event__shared-source" title={`Shared by ${ownerDisplayName}`}>↗ Shared by {ownerDisplayName}</span>}
      {accountName && (event.canEdit ? <button type="button" onClick={(click) => { click.stopPropagation(); setMentionEditing({ event, kind: "related" }); setMentionQuery(""); }}>@{accountName}</button> : <span>@{accountName}</span>)}
      {participants.length > 0 && (event.canEdit ? <button type="button" onClick={(click) => { click.stopPropagation(); setMentionEditing({ event, kind: "user" }); setMentionQuery(""); }}>#{participants.join(",")}</button> : <span>#{participants.join(",")}</span>)}
    </div>;
  };

  const beginDraftGesture = (pointer: PointerEvent, mode: "move" | "start" | "end") => {
    if (!timelineRef.current || !draft || draft.timeUnknown || draft.allDay) return;
    const target = (document.elementFromPoint(pointer.clientX, pointer.clientY) as HTMLElement | null) ?? (pointer.target as HTMLElement);
    if (mode === "move" && target.closest("input, button, textarea, select, a, [role=option]")) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    const bounds = timelineRef.current.getBoundingClientRect();
    const pointerId = pointer.pointerId;
    const originY = pointer.clientY;
    const originStart = timeToMinutes(draft.startTime);
    const originEnd = timeToMinutes(draft.endTime || minutesToTime(originStart + 60));
    const duration = Math.max(MIN_CALENDAR_DURATION_MINUTES, originEnd - originStart);
    let latestDraft = draft;
    let changed = false;
    (pointer.currentTarget as HTMLElement).setPointerCapture?.(pointerId);
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      move.preventDefault();
      const delta = Math.round(((move.clientY - originY) / bounds.height) * (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) / 10) * 10;
      let startMinutes = originStart;
      let endMinutes = originEnd;
      if (mode === "move") {
        startMinutes = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES - duration, originStart + delta));
        endMinutes = startMinutes + duration;
      } else if (mode === "start") {
        startMinutes = Math.max(TIMELINE_START_MINUTES, Math.min(originEnd - MIN_CALENDAR_DURATION_MINUTES, originStart + delta));
      } else {
        endMinutes = Math.min(TIMELINE_END_MINUTES, Math.max(originStart + MIN_CALENDAR_DURATION_MINUTES, originEnd + delta));
      }
      latestDraft = { ...latestDraft, startTime: minutesToTime(startMinutes), endTime: minutesToTime(endMinutes) };
      changed = latestDraft.startTime !== draft.startTime || latestDraft.endTime !== draft.endTime;
      setDraft(latestDraft);
    };
    const cleanup = (finished: PointerEvent) => {
      if (finished.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cleanup);
    };
    const persist = async () => {
      if (!editing?.canEdit || !changed) return;
      setSaving(true);
      try {
        const saved = await updateCalendarEvent(editing, toInput(latestDraft, eventShares));
        setEvents((current) => current.map((item) => item.id === saved.id ? saved : item));
        const savedDraft = draftFromEvent(saved);
        setEditing(saved);
        setDraft(savedDraft);
        editorBaselineRef.current = { draft: { ...savedDraft }, shares: [...eventShares] };
        setError("");
      } catch (reason) {
        setDraft(draftFromEvent(editing));
        setError(reason instanceof Error ? `${reason.message} The change was reverted.` : "Could not save the event time. The change was reverted.");
      } finally { setSaving(false); }
    };
    const finish = (end: PointerEvent) => { if (end.pointerId !== pointerId) return; onMove(end); cleanup(end); void persist(); };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cleanup);
  };

  const persistTimelineRange = async (event: CalendarEvent, startMinutes: number, endMinutes: number) => {
    const previous = event;
    const nextDraft = { ...draftFromEvent(event), allDay: false, timeUnknown: false, startTime: minutesToTime(startMinutes), endTime: minutesToTime(endMinutes) };
    setTimelinePreview(null);
    setSaving(true);
    try {
      const saved = await updateCalendarEventEntity(event, toInput(nextDraft, event.shares));
      setEvents((current) => current.map((item) => item.id === saved.id ? saved : item));
      setError("");
    } catch (reason) {
      setEvents((current) => current.map((item) => item.id === previous.id ? previous : item));
      setError(reason instanceof Error ? `${reason.message} The change was reverted.` : "Could not save the event time. The change was reverted.");
    } finally { setSaving(false); }
  };

  const beginResize = (pointer: PointerEvent, event: CalendarEvent, edge: "start" | "end" = "end") => {
    if (!event.canEdit || !timelineRef.current) return;
    if (existingGesturePointerIdRef.current !== null) return;
    pointer.preventDefault(); pointer.stopPropagation();
    const pointerId = pointer.pointerId;
    const captureTarget = document.documentElement;
    captureTarget.setPointerCapture(pointerId);
    existingGesturePointerIdRef.current = pointerId;
    const start = timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time);
    const originalEnd = timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time);
    let latest = { startMinutes: start, endMinutes: originalEnd };
    const timeline = timelineRef.current;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (next.cancelable) next.preventDefault();
      const rect = timeline.getBoundingClientRect();
      const snapped = snapTimelinePointer(next.clientY, rect.top, rect.height, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES, true);
      latest = edge === "start"
        ? { startMinutes: Math.min(originalEnd - MIN_CALENDAR_DURATION_MINUTES, snapped), endMinutes: originalEnd }
        : resizeTimelineRange(start, snapped);
      setTimelinePreview({ eventId: event.id, ...latest });
    };
    const cleanup = (finished: PointerEvent) => {
      if (finished.pointerId !== pointerId) return;
      suppressExistingClickUntilRef.current = performance.now() + 500;
      captureTarget.removeEventListener("pointermove", move);
      captureTarget.removeEventListener("pointerup", end);
      captureTarget.removeEventListener("pointercancel", cleanup);
      if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
      if (existingGesturePointerIdRef.current === pointerId) existingGesturePointerIdRef.current = null;
    };
    const end = (finished: PointerEvent) => { if (finished.pointerId !== pointerId) return; move(finished); cleanup(finished); void persistTimelineRange(event, latest.startMinutes, latest.endMinutes); };
    captureTarget.addEventListener("pointermove", move, { passive: false });
    captureTarget.addEventListener("pointerup", end);
    captureTarget.addEventListener("pointercancel", cleanup);
  };

  const beginMove = (pointer: PointerEvent, event: CalendarEvent) => {
    if (!event.canEdit || !timelineRef.current || (pointer.target as HTMLElement).closest("button, input, textarea, select, [role=separator], .calendar-event__text")) return;
    if (existingGesturePointerIdRef.current !== null) return;
    const timeline = timelineRef.current;
    const pointerId = pointer.pointerId;
    const captureTarget = document.documentElement;
    captureTarget.setPointerCapture(pointerId);
    existingGesturePointerIdRef.current = pointerId;
    const originalStart = timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time);
    const originalEnd = timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time);
    const duration = Math.max(MIN_CALENDAR_DURATION_MINUTES, originalEnd - originalStart);
    const pointerStart = snapTimelinePointer(pointer.clientY, timeline.getBoundingClientRect().top, timeline.getBoundingClientRect().height);
    let latest = { startMinutes: originalStart, endMinutes: originalEnd };
    let moved = false;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (!moved && Math.abs(next.clientY - pointer.clientY) < 4) return;
      moved = true;
      if (next.cancelable) next.preventDefault();
      const bounds = timeline.getBoundingClientRect();
      const current = snapTimelinePointer(next.clientY, bounds.top, bounds.height);
      const shifted = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES - duration, originalStart + current - pointerStart));
      latest = { startMinutes: shifted, endMinutes: shifted + duration };
      setTimelinePreview({ eventId: event.id, ...latest });
    };
    const cleanup = (finished: PointerEvent) => {
      if (finished.pointerId !== pointerId) return;
      if (moved) suppressExistingClickUntilRef.current = performance.now() + 500;
      captureTarget.removeEventListener("pointermove", move);
      captureTarget.removeEventListener("pointerup", end);
      captureTarget.removeEventListener("pointercancel", cleanup);
      if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
      if (existingGesturePointerIdRef.current === pointerId) existingGesturePointerIdRef.current = null;
    };
    const end = (finished: PointerEvent) => { if (finished.pointerId !== pointerId) return; move(finished); cleanup(finished); if (moved) void persistTimelineRange(event, latest.startMinutes, latest.endMinutes); else setTimelinePreview(null); };
    captureTarget.addEventListener("pointermove", move, { passive: false });
    captureTarget.addEventListener("pointerup", end);
    captureTarget.addEventListener("pointercancel", cleanup);
  };

  const beginExistingEventGesture = (pointer: PointerEvent, event: CalendarEvent) => {
    if (pointer.pointerType !== "touch") {
      beginMove(pointer, event);
      return;
    }
    const bounds = (pointer.currentTarget as HTMLElement).getBoundingClientRect();
    const compactResizeRailStart = bounds.right - Math.min(44, bounds.width * 0.45);
    if (bounds.height <= 24 && pointer.clientX < compactResizeRailStart) {
      beginMove(pointer, event);
      return;
    }
    if (bounds.height <= 24) {
      beginResize(pointer, event, pointer.clientY < bounds.top + bounds.height / 2 ? "start" : "end");
      return;
    }
    const touchEdgeSize = Math.min(18, Math.max(8, bounds.height * 0.25));
    const relativeY = pointer.clientY - bounds.top;
    if (relativeY <= touchEdgeSize) beginResize(pointer, event, "start");
    else if (relativeY >= bounds.height - touchEdgeSize) beginResize(pointer, event, "end");
    else beginMove(pointer, event);
  };

  const renderDraftEditor = (compact = false) => {
    if (!draft) return null;
    const editable = !editing || editing.canEdit;
    const timed = !draft.timeUnknown && !draft.allDay;
    return <section
      class={`calendar-inline-editor calendar-inline-editor--block calendar-block-editor${compact ? " is-compact" : ""}`}
      data-calendar-editor="block"
      data-event-id={editing?.id ?? "new"}
      aria-label={editing ? "Edit event block directly" : "Create event block directly"}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (!editable || !timed) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const mode = event.pointerType === "touch"
          ? event.clientY <= bounds.top + 6 ? "start" : event.clientY >= bounds.bottom - 6 ? "end" : "move"
          : target?.closest(".calendar-resize-handle--start") ? "start" : target?.closest(".calendar-resize-handle--end") ? "end" : "move";
        beginDraftGesture(event, mode);
      }}
    >
      {editable && timed && <button type="button" class="calendar-resize-handle calendar-resize-handle--start" aria-label="Adjust start time" />}
      <div class="calendar-block-editor__head">
        <span class="calendar-block-editor__time">{timed ? `${draft.startTime}–${draft.endTime}` : draft.allDay ? "All day" : "Unscheduled"}</span>
        <span class="calendar-block-editor__actions">
          {editable && <>
            <button id="calendar-editor-options-launcher" type="button" aria-label="Recurrence" title="Recurrence" aria-haspopup="dialog" aria-expanded={editorMenuOpen} onClick={toggleSettings}>↻</button>
            <button type="button" class={draft.forcePrivate ? "is-active" : ""} aria-pressed={draft.forcePrivate} aria-label={`Private: ${draft.forcePrivate ? "On" : "Off"}`} title={`Private: ${draft.forcePrivate ? "On" : "Off"}`} onClick={() => void toggleDraftFlag("forcePrivate")}>🔒</button>
            <button type="button" class={draft.vacation ? "is-active" : ""} aria-pressed={draft.vacation} aria-label={`Time Off: ${draft.vacation ? "On" : "Off"}`} title={`Time Off: ${draft.vacation ? "On" : "Off"}`} onClick={() => void toggleDraftFlag("vacation")}>🏖</button>
            <oj-c-popup opened={editorMenuOpen} launcher="#calendar-editor-options-launcher" anchor="#calendar-editor-options-launcher" placement="bottom-end" autoDismiss="none" initialFocus="none" onojClose={closeSettings}>
              {settingsDraft && <div class="calendar-options-popover calendar-options-popover__jet-content" role="dialog" aria-label="Recurrence">
                <strong class="calendar-options-popover__title">Recurrence</strong>
                <label>Recurrence<select aria-label="Recurrence" value={settingsDraft.recurrence} onChange={(event) => { const recurrence = event.currentTarget.value as Draft["recurrence"]; setSettingsDraft({ ...settingsDraft, recurrence, recurrenceUntil: recurrence === "NONE" ? "" : settingsDraft.recurrenceUntil || settingsDraft.startDate }); }}><option value="NONE">Does not repeat</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
                {settingsDraft.recurrence !== "NONE" && <label>Repeat until<input aria-label="Repeat until" type="date" min={settingsDraft.startDate} required value={settingsDraft.recurrenceUntil} onInput={(event) => setSettingsDraft({ ...settingsDraft, recurrenceUntil: event.currentTarget.value })} /></label>}
                <label>Working days<input aria-label="Working days" type="number" min="1" max="366" required value={settingsDraft.workingDays} onInput={(event) => setSettingsDraft({ ...settingsDraft, workingDays: Math.max(1, Math.min(366, Number(event.currentTarget.value) || 1)) })} /></label>
                <button type="button" class="primary" disabled={saving} onClick={() => void applySettings()}>Apply</button>
              </div>}
            </oj-c-popup>
          </>}
          {(titleEditing || !editing) && editable && <button type="button" aria-label="Save" disabled={saving || !draft.title.trim()} onClick={() => void save()}>Save</button>}
          {(titleEditing || !editing) && <button type="button" aria-label="Cancel editing" onClick={() => { if (editing) { setDraft(draftFromEvent(editing)); setTitleEditing(false); } else closeEditor(); }}>Cancel</button>}
          {editing?.canEdit && <button type="button" disabled={saving} onClick={() => void toggleCancelled()}>{editing.status === "CANCELLED" ? "Reopen Event" : "Cancel Event"}</button>}
          {editing?.canEdit && <button type="button" class="danger" disabled={saving} onClick={() => void removeEvent()}>Delete</button>}
        </span>
      </div>
      {titleEditing || !editing ? <input
        ref={titleInputRef}
        class="calendar-block-editor__title"
        aria-label="Event title"
        aria-autocomplete="list"
        autoFocus={editable}
        disabled={!editable}
        value={draft.title}
        placeholder="Enter title · @Account · #Participants"
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={handleTitleKeyDown}
        onInput={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
      /> : <button type="button" class="calendar-block-editor__title calendar-block-editor__title--selected" aria-label="Event title, double-click to edit" onClick={(event) => { if (event.detail >= 2 && editing) beginTitleEdit(editing); }} onDblClick={() => editing && beginTitleEdit(editing)}><EventTitle text={draft.title} onEdit={() => editing && beginTitleEdit(editing)} onTouchTap={(pointer) => editing ? handleEventTitleTouchTap(editing, pointer) : false} /></button>}
      {(draftAccountName || eventShares.length > 0) && <div class="calendar-event-relations" aria-label="Event relations"><span>{draftAccountName && `@${draftAccountName}`}</span>{eventShares.length > 0 && <span>#{eventShares.map((share) => sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? "Unknown participant").join(",")}</span>}</div>}
      <div class="calendar-block-editor__search">{titleSearchOpen && <div class="calendar-title-search" role="listbox" onScroll={handleTitleSearchScroll}>{(extractTitleSearchTrigger(draft.title)?.kind === "related" ? titleRelatedOptions : matchingTitleUsers).map((item, index) => <button key={"accountId" in item ? `${item.type}:${item.id}` : item.userKey} type="button" role="option" aria-selected={index === highlightedSearchIndex} onClick={() => chooseTitleSearchResult(index)}>{"accountId" in item ? <strong>{item.label}</strong> : item.displayName}</button>)}{extractTitleSearchTrigger(draft.title)?.kind === "related" && titleRelatedHasMore && <button type="button" onClick={loadMoreTitleRelations} disabled={titleSearchLoading}>Scroll down for more</button>}{titleSearchError ? <span class="calendar-inline-search__error" role="alert">{titleSearchError}</span> : titleSearchLoading ? <span class="account-search-empty" role="status">Searching…</span> : !(extractTitleSearchTrigger(draft.title)?.kind === "related" ? titleRelatedOptions : matchingTitleUsers).length ? <span class="account-search-empty">No results</span> : null}</div>}</div>
      {error && <div class="app-message app-message--error" role="alert">{error}</div>}
      {editable && timed && <button type="button" class="calendar-resize-handle calendar-resize-handle--end" aria-label="Adjust end time" />}
    </section>;
  };

  const eventColor = (event: CalendarEvent) => event.status === "CANCELLED"
    ? displayPreferences.cancelledColor
    : event.forcePrivate
      ? displayPreferences.privateColor
      : event.canEdit
        ? displayPreferences.ownColor
        : event.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0];
  const eventDisplayTitle = (event: CalendarEvent) => event.title;

  return <section class="calendar-page" aria-labelledby="calendar-heading">
    <section class="calendar-page-card">
    {breadcrumb && <div class="calendar-breadcrumb">{breadcrumb}</div>}
    <header class="page-section-header calendar-toolbar">
      <div><span class="kpi-eyebrow">Activity planning</span><h2 id="calendar-heading">Calendar</h2></div>
      <div class="calendar-toolbar__month" aria-label="Calendar navigation">
        <button type="button" onClick={() => shiftYear(-1)} aria-label="Previous year">«</button>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <strong aria-live="polite">{monthTitle(cursor)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="Next month">›</button>
        <button type="button" onClick={() => shiftYear(1)} aria-label="Next year">»</button>
        <button type="button" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button>
        {canWrite && <button type="button" disabled={saving} onClick={() => void openSharing()}>Manage sharing</button>}
      </div>
      <div class="calendar-legend" aria-label="Calendar legend">
        <span><button id="calendar-color-own" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "OWN"} aria-label="Change My Events color" style={{ backgroundColor: colorTarget === "OWN" && draftColor ? draftColor : displayPreferences.ownColor }} onClick={() => openColorPicker("OWN")} />My Events</span>
        {calendarShares.filter((share) => share.direction === "OUTGOING" && share.status === "ACCEPTED").map((share) => { const safeKey = share.userKey.replace(/[^a-zA-Z0-9_-]/g, "-"); const target = `SHARED:${share.userKey}` as const; return <span key={share.userKey}><button id={`calendar-color-shared-${safeKey}`} type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === target} aria-label={`${sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "Shared user"} color change`} style={{ backgroundColor: colorTarget === target && draftColor ? draftColor : share.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0] }} onClick={() => openColorPicker(target)} />{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "Shared user"}</span>; })}
        <span><button id="calendar-color-private" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "PRIVATE"} aria-label="Change Private color" style={{ backgroundColor: colorTarget === "PRIVATE" && draftColor ? draftColor : displayPreferences.privateColor }} onClick={() => openColorPicker("PRIVATE")} />Private</span>
        <span><button id="calendar-color-cancelled" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "CANCELLED"} aria-label="Change Cancelled color" style={{ backgroundColor: colorTarget === "CANCELLED" && draftColor ? draftColor : displayPreferences.cancelledColor }} onClick={() => openColorPicker("CANCELLED")} />Cancelled</span>
        {colorTarget && <oj-c-popup opened={true} launcher={colorTarget.startsWith("SHARED:") ? `#calendar-color-shared-${colorTarget.slice(7).replace(/[^a-zA-Z0-9_-]/g, "-")}` : `#calendar-color-${colorTarget.toLowerCase()}`} anchor={colorTarget.startsWith("SHARED:") ? `#calendar-color-shared-${colorTarget.slice(7).replace(/[^a-zA-Z0-9_-]/g, "-")}` : `#calendar-color-${colorTarget.toLowerCase()}`} placement="bottom-start" autoDismiss="focusLoss" initialFocus="none" onojClose={() => { setColorTarget(null); setDraftColor(""); }}><div class="calendar-legend__palette calendar-legend__palette--jet-content" role="group" aria-label="Event display color selection">{CALENDAR_SHARE_COLORS.map((color) => <button type="button" aria-label={`Color ${color}`} aria-pressed={draftColor === color} style={{ backgroundColor: color }} onClick={() => setDraftColor(color)} />)}<label>Custom<input aria-label="Custom color" type="color" value={draftColor || persistedColor(colorTarget)} onInput={(event) => setDraftColor(event.currentTarget.value)} /></label><div class="calendar-legend__palette-actions"><button type="button" onClick={() => { setColorTarget(null); setDraftColor(""); }}>Cancel</button><button type="button" disabled={saving} onClick={() => void applyDraftColor()}>Apply</button></div></div></oj-c-popup>}
      </div>
    </header>
    {!canWrite && <div class="app-message">Read-only access. Write permission is required.</div>}
    {error && !draft && !sharingOpen && <div class="app-message app-message--error" role="alert">{error}</div>}
    {calendarLoading && <div class="calendar-local-loading" role="status">Loading calendar…</div>}
    <section class="calendar-surface" aria-label="Monthly calendar">
    <div class="calendar-grid" role="grid" aria-label={monthTitle(cursor)}>
      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day, index) => <div class={`calendar-grid__weekday${index === 0 ? " is-sunday" : index === 6 ? " is-saturday" : ""}`} role="columnheader">{day}</div>)}
      {cells.map((cell, cellIndex) => {
        const dayEvents = events.filter((event) => eventOccursOnDisplayedDate(event, cell.date));
        const holiday = holidays.get(cell.date);
        const activities = weeklyActivities.filter((activity) => activity.createdAt.slice(0, 10) === cell.date);
        return <div class={`calendar-day${cell.inMonth ? "" : " is-outside"}${cell.date === today ? " is-today" : ""}${cell.date === selectedDate ? " is-selected" : ""}${cellIndex % 7 === 0 ? " is-sunday" : cellIndex % 7 === 6 ? " is-saturday" : ""}${holiday ? " is-holiday" : ""}`} role="gridcell" tabIndex={0} aria-label={`${cell.date}${holiday ? `, ${holiday}` : ""}`} onClick={() => setSelectedDate(cell.date)} onDblClick={() => { if (performance.now() - lastTouchOpenAtRef.current > 500) openDayTimeline(cell.date); }} onPointerUp={(pointer) => handleDayTouchTap(cell.date, pointer)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDayTimeline(cell.date); } }}>
          <div class="calendar-day__heading"><time dateTime={cell.date}>{cell.day}</time>{holiday && <span class="calendar-day__kind">{holiday}</span>}</div>
          {dayEvents.map((event) => {
            const time = !event.allDay && !event.timeUnknown ? eventLocalParts(event.startsAt, event.timezone).time : "";
            const shared = !event.canEdit;
            const ownerColor = eventColor(event);
            const icon = event.status === "CANCELLED" ? "⊘" : event.forcePrivate ? "🔒" : event.allDay ? "▣" : event.timeUnknown ? "◷" : shared ? "↗" : "";
            return <div role="button" tabIndex={0} class={`calendar-event ${event.canEdit ? "is-own" : "is-shared-recipient"}${shared ? " is-shared" : ""}${event.forcePrivate ? " is-private" : ""}${event.allDay ? " is-all-day" : event.timeUnknown ? " is-time-unknown" : ""}${event.vacation ? " is-vacation" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}${selectedEventId === event.id ? " is-selected" : ""}`} style={{ "--owner-color": ownerColor }} onClick={(click) => { click.stopPropagation(); selectEvent(event); }} onDblClick={(click) => { click.preventDefault(); click.stopPropagation(); openEdit(event); }} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); selectEvent(event); } }}>{icon && <span class="calendar-event__status" aria-label={event.status === "CANCELLED" ? "Cancelled event" : event.forcePrivate ? "Private event" : event.allDay ? "All-day event" : event.timeUnknown ? "Unscheduled event" : "Shared event"}>{icon}</span>}<CalendarCardSummary primary={`${time ? `${time} ` : ""}${eventDisplayTitle(event)}`} secondary={eventRelationText(event)} />{selectedCalendarActions(event)}</div>;
          })}
          {activities.map((activity) => <button type="button" class="calendar-weekly-activity" onClick={(click) => { click.stopPropagation(); setViewingActivity(activity); }}>Weekly Activities</button>)}
        </div>;
      })}
    </div>
    </section>
    {dayOpen && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle={selectedDate}
      width="90vw" maxWidth="72rem" maxHeight="90vh"
      onojClose={requestDayClose}>
      <div slot="body" class="calendar-day-dialog calendar-day-dialog__jet-body">
      {(() => {
        const selectedEvents = events.filter((event) => eventOccursOnDisplayedDate(event, selectedDate));
        const untimed = selectedEvents.filter((event) => event.allDay || event.timeUnknown);
        const timed = selectedEvents.filter((event) => !event.allDay && !event.timeUnknown).map((event) => ({ event, startMinutes: timelinePreview?.eventId === event.id ? timelinePreview.startMinutes : timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time), endMinutes: timelinePreview?.eventId === event.id ? timelinePreview.endMinutes : timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time) })).filter(({ startMinutes, endMinutes }) => endMinutes > TIMELINE_START_MINUTES && startMinutes < TIMELINE_END_MINUTES);
        const laidOut = layoutTimelineEvents(timed.map(({ event, startMinutes, endMinutes }) => ({ id: event.id, startMinutes, endMinutes: Math.max(startMinutes + 20, endMinutes) })));
        return <div class="calendar-day-detail" onClick={(click) => { if (click.target === click.currentTarget) setSelectedEventId(null); }}>
          <section class="calendar-day-undated" aria-label="All-day or unscheduled events"><div class="calendar-day-undated__heading"><strong>All-day / Unscheduled</strong></div>
            {creationPreview && creationPreview.kind !== "TIMED" ? <div class="calendar-create-row-preview" aria-live="polite"><strong>{creationPreview.kind === "ALL_DAY" ? "All day" : "Unscheduled"}</strong><span>New event</span></div> : draft && (draft.allDay || draft.timeUnknown) ? renderDraftEditor(true) : <div class="calendar-day-blank-row"><select aria-label="New event time type" value={undatedCreateKind} onChange={(event) => { const kind = event.currentTarget.value as CreateLaneKind; undatedCreateKindRef.current = kind; setUndatedCreateKind(kind); openCreate(selectedDate); setDraft((current) => current ? { ...current, allDay: kind === "ALL_DAY", timeUnknown: kind === "UNKNOWN" } : current); }}><option value="ALL_DAY">All day</option><option value="UNKNOWN">Unscheduled</option></select><input aria-label="New event title" placeholder="Enter new event…" onFocus={() => openCreate(selectedDate)} onInput={(event) => { if (!draft) openCreate(selectedDate); setDraft((current) => current ? { ...current, title: event.currentTarget.value } : current); }} /></div>}
            <div class="calendar-day-undated__events">{untimed.filter((event) => event.id !== editing?.id).map((event) => <div role="button" tabIndex={0} class={`calendar-detail-event${event.vacation ? " is-vacation" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}${selectedEventId === event.id ? " is-selected" : ""}`} style={{ "--owner-color": eventColor(event) }} onClick={(click) => { click.stopPropagation(); selectEvent(event); }} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); selectEvent(event); } }}><span class="calendar-undated-kind calendar-undated-type" aria-label={event.allDay ? "All-day event" : "Unscheduled event"}>{event.vacation ? "🏖 Time Off" : event.allDay ? "▣ All day" : "◷ Unscheduled"}</span><EventTitle text={eventDisplayTitle(event)} onEdit={event.canEdit ? () => beginTitleEdit(event) : undefined} onTouchTap={event.canEdit ? (pointer) => handleEventTitleTouchTap(event, pointer) : undefined} /><div class="calendar-event__meta">{renderEventRelations(event)}</div>{selectedTimelineActions(event)}</div>)}</div>
          </section>
          <div class="calendar-day-timeline-scroll">
          <div class="calendar-day-timeline calendar-day-timeline--interactive" ref={timelineRef} onDblClick={handleTimelineDoubleClick} onPointerMove={(pointer) => { if (creationPreviewRef.current) return; const rect = pointer.currentTarget.getBoundingClientRect(); setHoverMinutes(snapTimelinePointer(pointer.clientY, rect.top, rect.height)); }} onPointerLeave={() => { if (!creationPreviewRef.current) setHoverMinutes(null); }} onContextMenu={(event) => { if (creationPreviewRef.current) event.preventDefault(); }} onPointerDown={beginTimelineCreate}>
            {Array.from({ length: 10 }, (_, index) => 9 + index).map((hour) => <div class="calendar-day-hour" style={{ top: `${((hour * 60 - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><time>{String(hour).padStart(2, "0")}:00</time></div>)}
            {hoverMinutes !== null && !creationPreview && <div class="calendar-time-cursor" style={{ top: `${((hoverMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><span role="tooltip">{minutesToTime(hoverMinutes)}</span></div>}
            {creationPreview?.kind === "TIMED" && <div class="calendar-create-preview" aria-live="polite" style={{ top: `${((creationPreview.startMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, height: `${((creationPreview.endMinutes - creationPreview.startMinutes) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><strong>New event</strong><span>{minutesToTime(creationPreview.startMinutes)}–{minutesToTime(creationPreview.endMinutes)}</span></div>}
            {laidOut.map((layout) => { const entry = timed.find(({ event }) => event.id === layout.id)!; const event = entry.event; if (editing?.id === event.id) return null; return <div role="button" tabIndex={0} aria-label={`${event.title}, ${minutesToTime(layout.startMinutes)}–${minutesToTime(layout.endMinutes)}`} class={`calendar-timeline-event${event.canEdit ? " is-editable" : ""}${layout.endMinutes - layout.startMinutes <= 30 ? " is-touch-compact" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}${selectedEventId === event.id ? " is-selected" : ""}`} style={{ "--owner-color": eventColor(event), top: `${((layout.startMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, height: `${((layout.endMinutes - layout.startMinutes) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, left: `calc(4.5rem + (100% - 5rem) * ${layout.column / layout.columnCount})`, width: `calc((100% - 5rem) / ${layout.columnCount} - 3px)` }} onPointerDown={(pointer) => beginExistingEventGesture(pointer, event)} onClick={(click) => { if (performance.now() < suppressExistingClickUntilRef.current) { click.preventDefault(); click.stopPropagation(); return; } click.stopPropagation(); selectEvent(event); }} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); selectEvent(event); } }}><small class="calendar-timeline-event__time">{minutesToTime(layout.startMinutes)}–{minutesToTime(layout.endMinutes)}</small><strong class="calendar-event__title" onDblClick={(click) => { if (!event.canEdit) return; click.preventDefault(); click.stopPropagation(); beginTitleEdit(event); }}>{eventDisplayTitle(event)}</strong>{renderEventRelations(event)}{selectedTimelineActions(event)}{event.canEdit && <><span class="calendar-resize-handle calendar-resize-handle--start" role="separator" aria-label="Adjust event start time" onPointerDown={(pointer) => beginResize(pointer, event, "start")} /><span class="calendar-resize-handle calendar-resize-handle--end" role="separator" aria-label="Adjust event end time" onPointerDown={(pointer) => beginResize(pointer, event, "end")} /></>}</div>; })}
            {draft && !draft.allDay && !draft.timeUnknown && <div class="calendar-timeline-editor" style={{ top: `${((timeToMinutes(draft.startTime) - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, height: `${Math.max(20, timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime)) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) * 100}%` }}>{renderDraftEditor(true)}</div>}
          </div>
          </div>
          {creationPreview && creationPreview.pointerType === "touch" && <div class="calendar-create-touch-tooltip" role="tooltip" style={{ left: `${creationPreview.clientX}px`, top: `${creationPreview.clientY}px` }}>{creationPreview.kind === "TIMED" ? `${minutesToTime(creationPreview.startMinutes)}–${minutesToTime(creationPreview.endMinutes)}` : creationPreview.kind === "ALL_DAY" ? "All day" : "Unscheduled"}</div>}
        </div>;
      })()}
      </div>
    </oj-c-dialog>}
    {closeConfirmOpen && <oj-c-dialog opened={true} modality="modal" cancelBehavior="none" dialogTitle="Save changes?" width="90vw" maxWidth="30rem">
      <div slot="body" class="calendar-close-confirm"><p>You have unsaved event changes.</p><div class="calendar-close-confirm__actions"><button type="button" onClick={() => setCloseConfirmOpen(false)}>Keep editing</button><button type="button" onClick={() => { setCloseConfirmOpen(false); closeEditor(); setDayOpen(false); }}>Discard and close</button><button type="button" class="primary" disabled={saving} onClick={() => void save().then((saved) => { if (saved) { setCloseConfirmOpen(false); setDayOpen(false); } })}>Save and close</button></div></div>
    </oj-c-dialog>}
    {sharingOpen && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle="Manage Calendar Sharing"
      width="90vw" maxWidth="42rem" maxHeight="90vh" onojClose={() => setSharingOpen(false)}>
      <div slot="body" class="calendar-event-editor calendar-event-editor__jet-body">
        <div class="calendar-event-form">
          Calendar sharing is view-only. Events appear after the recipient accepts, and Private events remain hidden.
          <div class="calendar-sharing">
            {calendarShares.map((share) => <div class="calendar-sharing__row" key={`${share.direction}-${share.userKey}`}>
              <span>{share.ownerBadgeColor && <span class="calendar-share-color" style={{ backgroundColor: share.ownerBadgeColor }} />}{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "User"} · {share.direction === "INCOMING" ? "Received request" : "Sent request"} · {share.status === "PENDING" ? "Pending" : "Shared"}</span>
              {share.direction === "INCOMING" && share.status === "PENDING" && <button type="button" disabled={saving} onClick={() => void acceptShare(share)}>Accept</button>}
              {share.direction === "INCOMING" && share.status === "ACCEPTED" && <button type="button" disabled={saving} onClick={() => void removeCalendarShare(share)}>Stop sharing</button>}
              {share.direction === "OUTGOING" && share.status === "PENDING" && <button type="button" disabled={saving} onClick={() => void removeCalendarShare(share)}>Cancel request</button>}
            </div>)}
            {!calendarShares.length && <span>No sharing requests or connections.</span>}
          </div>
          <label class="kap-field" ref={shareSearchRef}>Search for a user to share with<input type="search" value={shareUserQuery} placeholder="Search by name" onFocus={() => setShareSearchOpen(true)} onInput={(event) => { setShareUserQuery(event.currentTarget.value); setShareUserKey(""); setShareSearchOpen(true); }} />
          {shareSearchOpen && shareUserQuery && <div class="account-search-results" role="listbox">{matchingSharingUsers.map((user) => <button type="button" role="option" aria-selected={shareUserKey === user.userKey} onClick={() => { setShareUserKey(user.userKey); setShareUserQuery(user.displayName); setShareSearchOpen(false); }}>{user.displayName}</button>)}</div>}</label>
          After acceptance, the requester can view the recipient’s public events. The display color can be changed from the legend. Private events, Meeting Notes, and recordings are never shared.
          {error && <div class="app-message app-message--error" role="alert">{error}</div>}
        </div>
        <footer><span /><button type="button" onClick={() => setSharingOpen(false)}>Close</button><button type="button" class="primary" disabled={saving || !shareUserKey} onClick={() => void addCalendarShare()}>Send request</button></footer>
      </div>
    </oj-c-dialog>}
    {mentionEditing && <div class="calendar-mention-editor" role="dialog" aria-label={mentionEditing.kind === "related" ? "Change event relation" : "Change participants"} onClick={(click) => click.stopPropagation()}>
      <header><strong>{mentionEditing.kind === "related" ? "@ Relation" : "# Participants"}</strong><button type="button" aria-label="Close" onClick={() => setMentionEditing(null)}>×</button></header>
      <input autoFocus type="search" value={mentionQuery} placeholder={mentionEditing.kind === "related" ? "Search Account, Workload, or Opportunity" : "Search participants"} onInput={(event) => setMentionQuery(event.currentTarget.value)} onKeyDown={(key) => { if (key.key === "Escape") { key.preventDefault(); setMentionEditing(null); } }} />

      <div class="calendar-mention-editor__results" role="listbox" onScroll={handleMentionSearchScroll}>
        {mentionEditing.kind === "related" ? <>
          {mentionEditing.event.accountId && <button type="button" onClick={() => { const previousName = accountNames.get(mentionEditing.event.accountId!) ?? relatedAccountName(mentionEditing.event.accountId, mentionEditing.event.relatedItemLabel); void saveMentionUpdate(mentionEditing.event, { ...draftFromEvent(mentionEditing.event), title: replaceExistingRelatedMention(mentionEditing.event.title, previousName, ""), accountId: "", workloadId: "", opportunityDealId: "", opportunityId: "", relatedItemType: "", relatedItemId: "", relatedItemLabel: "" }, mentionEditing.event.shares); }}>Remove relation</button>}
          {mentionRelatedOptions.map((item) => <button key={`${item.type}:${item.id}`} type="button" role="option" aria-selected={mentionEditing.event.relatedItemType === item.type && mentionEditing.event.relatedItemId === item.id} onClick={() => void saveMentionUpdate(mentionEditing.event, { ...draftFromEvent(mentionEditing.event), ...applyRelatedSelection(mentionEditing.event.title, item, accountNames.get(mentionEditing.event.accountId ?? -1) ?? relatedAccountName(mentionEditing.event.accountId, mentionEditing.event.relatedItemLabel)) }, mentionEditing.event.shares)}><strong>{item.label}</strong></button>)}
          {mentionRelatedHasMore && <button type="button" onClick={loadMoreMentionRelations} disabled={mentionSearchLoading}>Load 10 more</button>}
        </> : mentionUserOptions.map((user) => {
          const existing = mentionEditing.event.shares.find((share) => share.userKey === user.userKey);
          const shares = existing ? mentionEditing.event.shares.filter((share) => share.userKey !== user.userKey) : [...mentionEditing.event.shares, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW" as const, visibility: "DETAILS" as const }];
          return <button type="button" role="option" aria-selected={Boolean(existing)} onClick={() => void saveMentionUpdate(mentionEditing.event, draftFromEvent(mentionEditing.event), shares)}><strong>#{user.displayName}</strong><small>{existing ? "Remove participant" : "Add participant"}</small></button>;
        })}
        {mentionSearchError ? <span class="calendar-inline-search__error" role="alert">{mentionSearchError}</span> : mentionSearchLoading ? <span class="account-search-empty" role="status">Searching…</span> : (mentionEditing.kind === "related" ? mentionRelatedOptions : mentionUserOptions).length === 0 ? <span class="account-search-empty">No results</span> : null}
      </div>
    </div>}
    </section>
    {viewingActivity && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle="Weekly Activities"
      width="92vw" maxWidth="34rem" maxHeight="90vh" onojClose={() => setViewingActivity(null)}>
      <div slot="body" class="calendar-weekly-popup calendar-weekly-popup__jet-body calendar-weekly-popup--vertical"><div class="calendar-weekly-popup__box"><strong>This Week</strong><div class="calendar-weekly-popup__text" dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(viewingActivity.thisWeekHtml || viewingActivity.thisWeekText || "No content") }} /></div><div class="calendar-weekly-popup__arrow" aria-hidden="true">↓</div><div class="calendar-weekly-popup__box"><strong>Next Week</strong><div class="calendar-weekly-popup__text" dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(viewingActivity.nextWeekHtml || viewingActivity.nextWeekText || "No content") }} /></div></div>
    </oj-c-dialog>}
  </section>;
}
