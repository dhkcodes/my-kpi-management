import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "oj-c/dialog";
import "oj-c/popup";
import { beginAppBusy } from "../../app/appBusy";
import { apiFetchQuiet } from "../../auth/apiFetch";
import { CalendarColorScope, CalendarDisplayPreferences, CalendarEvent, CalendarEventInput, CalendarRelatedItemOption, CalendarRelatedItemType, CalendarShare, SharingUser, acceptCalendarShare, cancelCalendarEvent, changeCalendarDisplayPreference, changeCalendarShareColor, createCalendarEvent, deleteCalendarEvent, deleteCalendarShare, getCalendarDisplayPreferences, listCalendarEvents, listCalendarRelatedItems, listCalendarShares, listKoreanHolidays, listSharingUsers, reopenCalendarEvent, requestCalendarShare, updateCalendarEvent } from "../../data/calendarApi";
import { getFiscalYearForDate, getMonthCells } from "../../data/calendarDateUtils";
import { CALENDAR_SHARE_COLORS, LONG_PRESS_CREATE_DELAY_MS, TIMELINE_END_MINUTES, TIMELINE_START_MINUTES, applyRelatedSelection, appendMentionToken, eventCalendarDate, eventLocalParts, eventOccursOnDate, extractTitleSearchTrigger, layoutTimelineEvents, longPressMovementCancels, minutesToTime, normalizeEventRange, normalizeEventTimes, relatedAccountName, requestIsLatest, resizeTimelineRange, snapTimelinePointer, timelineCreationRange, timeToMinutes, titleWithAccountPrefix } from "../../data/calendarUx";
import { fetchWeeklyActivities, WeeklyActivityRecord } from "../../data/weeklyActivitiesApi";
import { sanitizeWeeklyActivityHtml } from "./weeklyActivityEditorSession";

const EventTitle = ({ text }: { text: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const update = () => setOverflowing(Boolean(ref.current && ref.current.scrollWidth > ref.current.clientWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [text]);
  return <span ref={ref} class="calendar-event__text" title={overflowing ? text : undefined}>{text}</span>;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthTitle = (date: Date) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);

type Draft = {
  title: string; startDate: string; endDate: string; startTime: string; endTime: string;
  timeUnknown: boolean; allDay: boolean; accountId: string; relatedItemType: CalendarRelatedItemType | "";
  relatedItemId: string; relatedItemLabel: string; location: string; description: string;
  forcePrivate: boolean; timezone: string;
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
  allDay: false, accountId: "", relatedItemType: "", relatedItemId: "", relatedItemLabel: "",
  location: "", description: "", forcePrivate: false, timezone: browserTimezone()
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
    relatedItemType: event.relatedItemType ?? "", relatedItemId: event.relatedItemId == null ? "" : String(event.relatedItemId),
    relatedItemLabel: event.relatedItemLabel ?? "",
    location: event.location ?? "", description: event.description ?? "", forcePrivate: event.forcePrivate,
    timezone: event.timezone
  };
};
const toInput = (draft: Draft, shares: CalendarEvent["shares"]): CalendarEventInput => {
  const dates = normalizeEventRange(draft);
  const { startTime, endTime } = normalizeEventTimes(draft);
  return {
    title: draft.title.trim(), startsAt: `${dates.startDate}T${startTime}`,
    endsAt: draft.allDay || draft.timeUnknown || draft.endTime ? `${dates.endDate}T${endTime}` : null,
    allDay: draft.allDay, timeUnknown: draft.timeUnknown, forcePrivate: draft.forcePrivate,
    timezone: draft.timezone,
    accountId: draft.accountId ? Number(draft.accountId) : null,
    relatedItemType: draft.relatedItemType || null, relatedItemId: draft.relatedItemId ? Number(draft.relatedItemId) : null,
    relatedItemLabel: draft.relatedItemLabel || null, location: draft.location.trim() || null,
    description: draft.description.trim() || null, visibility: draft.forcePrivate ? "PRIVATE" : "DETAILS",
    shares
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
  const [eventShares, setEventShares] = useState<CalendarEvent["shares"]>([]);
  const [eventShareQuery, setEventShareQuery] = useState("");
  const [eventShareSearchOpen, setEventShareSearchOpen] = useState(false);
  const [titleRelatedOptions, setTitleRelatedOptions] = useState<CalendarRelatedItemOption[]>([]);
  const [accountNames, setAccountNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
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
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  const [creationPreview, setCreationPreview] = useState<CreationPreview | null>(null);
  const [undatedCreateKind, setUndatedCreateKind] = useState<CreateLaneKind>("UNKNOWN");
  const [weeklyActivities, setWeeklyActivities] = useState<WeeklyActivityRecord[]>([]);
  const [viewingActivity, setViewingActivity] = useState<WeeklyActivityRecord | null>(null);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [titleSearchOpen, setTitleSearchOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [mentionEditing, setMentionEditing] = useState<{ event: CalendarEvent; kind: "related" | "user" } | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");

  const [mentionRelatedOptions, setMentionRelatedOptions] = useState<CalendarRelatedItemOption[]>([]);
  const [mentionUserOptions, setMentionUserOptions] = useState<SharingUser[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const latestTitleSearchRef = useRef(0);
  const latestShareSearchRef = useRef(0);
  const latestMentionSearchRef = useRef(0);
  const lastTouchTapRef = useRef<{ date: string; at: number } | null>(null);
  const lastTouchOpenAtRef = useRef(0);
  const today = todayIso();

  const eventShareSearchRef = useRef<HTMLElement>(null);
  const shareSearchRef = useRef<HTMLLabelElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pendingCreateRef = useRef<PendingCreatePress | null>(null);
  const creationPreviewRef = useRef<CreationPreview | null>(null);
  const undatedCreateKindRef = useRef<CreateLaneKind>("UNKNOWN");
  const cells = useMemo(() => getMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const accountById = accountNames;
  const matchingSharingUsers = useMemo(() => sharingUsers.filter((user) => !calendarShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(shareUserQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, calendarShares, shareUserQuery]);
  const matchingEventUsers = useMemo(() => sharingUsers.filter((user) => !eventShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(eventShareQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, eventShares, eventShareQuery]);
  const matchingTitleUsers = useMemo(() => titleUserOptions.filter((user) => !eventShares.some((share) => share.userKey === user.userKey)).slice(0, 10), [titleUserOptions, eventShares]);
  const draftAccountName = draft?.accountId ? (accountById.get(Number(draft.accountId)) ?? relatedAccountName(Number(draft.accountId), draft.relatedItemLabel)) : "";

  useEffect(() => {
    let active = true;
    const finishBusy = beginAppBusy();
    const fiscalYear = getFiscalYearForDate(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
    const fromDate = cells[0]?.date ?? `${cursor.getFullYear()}-01-01`;
    const toDate = cells[cells.length - 1]?.date ?? `${cursor.getFullYear()}-12-31`;
    Promise.all([
      listCalendarEvents(fiscalYear, apiFetchQuiet),
      listKoreanHolidays(cursor.getFullYear(), apiFetchQuiet),
      listCalendarShares(apiFetchQuiet),
      getCalendarDisplayPreferences(apiFetchQuiet),
      fetchWeeklyActivities({ fromDate, toDate, size: 100 }).catch(() => ({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })),
      listSharingUsers().catch(() => [])
    ]).then(([items, days, shares, preferences, activities, users]) => {
      if (!active) return;
      setEvents(items);
      setHolidays(new Map(days.map((day) => [day.date, day.name])));
      setCalendarShares(shares);
      setDisplayPreferences(preferences);
      setWeeklyActivities(activities.items);
      setSharingUsers(users);
      setError("");
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Calendar could not be loaded."))
      .finally(finishBusy);
    return () => { active = false; };
  }, [cursor.getFullYear(), cursor.getMonth()]);

  useEffect(() => {
    const trigger = draft ? extractTitleSearchTrigger(draft.title) : null;
    if (!trigger) { setTitleSearchOpen(false); return; }
    setTitleSearchOpen(true);
    setHighlightedSearchIndex(-1);
    const requestId = ++latestTitleSearchRef.current;
    if (trigger.kind === "related") {
      const lookupFiscalYear = fiscalYear ?? getFiscalYearForDate(draft!.startDate);
      setTitleRelatedOptions([]);
      void listCalendarRelatedItems(lookupFiscalYear, trigger.query).then((items) => {
        if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
        setTitleRelatedOptions(items);
        setAccountNames((current) => { const next = new Map(current); items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
      }).catch(() => undefined);
    } else {
      setTitleUserOptions([]);
      void listSharingUsers(trigger.query).then((users) => {
        if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
        setTitleUserOptions(users);
      }).catch(() => undefined);
    }
  }, [draft?.title, draft?.startDate, fiscalYear]);

  useEffect(() => {
    if (!mentionEditing) return;
    const requestId = ++latestMentionSearchRef.current;
    if (mentionEditing.kind === "related") {
      const date = eventCalendarDate(mentionEditing.event.startsAt, mentionEditing.event.timezone);
      void listCalendarRelatedItems(fiscalYear ?? getFiscalYearForDate(date), mentionQuery).then((items) => {
        if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
        setMentionRelatedOptions(items);
        setAccountNames((current) => { const next = new Map(current); items.forEach((item) => next.set(item.accountId, item.accountName)); return next; });
      }).catch(() => undefined);
    } else {
      void listSharingUsers(mentionQuery).then((users) => {
        if (!requestIsLatest(requestId, latestMentionSearchRef.current)) return;
        setMentionUserOptions(users);
      }).catch(() => undefined);
    }
  }, [mentionEditing?.event.id, mentionEditing?.kind, mentionQuery, fiscalYear]);

  useEffect(() => {
    const closeSearches = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!eventShareSearchRef.current?.contains(target)) setEventShareSearchOpen(false);
      if (!shareSearchRef.current?.contains(target)) setShareSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeSearches);
    return () => document.removeEventListener("pointerdown", closeSearches);
  }, []);

  useEffect(() => {
    const query = (eventShareSearchOpen ? eventShareQuery : shareUserQuery).trim();
    if ((!shareSearchOpen && !eventShareSearchOpen) || query.length < 2) return;
    const requestId = ++latestShareSearchRef.current;
    void listSharingUsers(query).then((users) => {
      if (requestIsLatest(requestId, latestShareSearchRef.current)) setSharingUsers(users);
    }).catch(() => undefined);
  }, [shareSearchOpen, shareUserQuery, eventShareSearchOpen, eventShareQuery]);

  const openCreate = (date: string, startTime?: string) => {
    if (!canWrite) { setError("Read-only access. Write permission is required."); return; }
    const next = blankDraft(date);
    if (startTime) { next.timeUnknown = false; next.startTime = startTime; next.endTime = minutesToTime(timeToMinutes(startTime) + 60); }
    setSelectedDate(date); setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(next); setError("");
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
    const next = blankDraft(selectedDate);
    if (preview.kind === "TIMED") {
      next.timeUnknown = false;
      next.startTime = minutesToTime(preview.startMinutes);
      next.endTime = minutesToTime(preview.endMinutes);
    } else if (preview.kind === "ALL_DAY") {
      next.timeUnknown = false;
      next.allDay = true;
    }
    setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(next); setError("");
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
    const removeListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
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
  };
  const openEdit = (event: CalendarEvent) => { setSelectedDate(eventCalendarDate(event.startsAt, event.timezone)); setDayOpen(true); setEditing(event); setEventShares(event.shares); setEventShareQuery(""); setDraft(draftFromEvent(event)); setError(""); requestAnimationFrame(() => titleInputRef.current?.focus()); };
  const closeEditor = () => { setDraft(null); setEditing(null); setError(""); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingCreateRef.current || creationPreviewRef.current) { event.preventDefault(); clearCreateGesture(); return; }
      if (draft && !editing) { event.preventDefault(); closeEditor(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [draft, editing]);
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
    if (!draft?.startDate || !draft.title.trim()) { setError("제목과 시작 날짜는 필수입니다."); return; }
    setSaving(true);
    try {
      const input = toInput(draft, eventShares);
      if (input.endsAt && input.endsAt < input.startsAt) { setError("종료 일시는 시작 일시보다 빠를 수 없습니다."); return; }
      const saved = editing ? await updateCalendarEvent(editing, input) : await createCalendarEvent(input);
      setEvents((current) => [...current.filter((event) => event.id !== saved.id), saved]);
      closeEditor();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "일정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const toggleCancelled = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = editing.status === "CANCELLED" ? await reopenCalendarEvent(editing) : await cancelCalendarEvent(editing);
      setEvents((current) => current.map((event) => event.id === saved.id ? saved : event));
      closeEditor();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "일정 상태를 변경하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const removeEvent = async () => {
    if (!editing?.canEdit || !window.confirm("이 일정을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    setSaving(true);
    try {
      await deleteCalendarEvent(editing);
      setEvents((current) => current.filter((event) => event.id !== editing.id));
      closeEditor();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "일정을 삭제하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const openSharing = async () => {
    setSaving(true);
    try {
      const [shares, users] = await Promise.all([listCalendarShares(), listSharingUsers()]);
      setCalendarShares(shares); setSharingUsers(users); setSharingOpen(true); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공유 설정을 불러오지 못했습니다."); }
    finally { setSaving(false); }
  };
  const addCalendarShare = async () => {
    if (!shareUserKey) { setError("공유 요청을 보낼 사용자를 선택하세요."); return; }
    setSaving(true);
    try {
      const saved = await requestCalendarShare(shareUserKey);
      setCalendarShares((current) => [...current.filter((item) => item.userKey !== saved.userKey), saved]);
      setShareUserKey(""); setShareUserQuery(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공유 요청을 보내지 못했습니다."); }
    finally { setSaving(false); }
  };
  const acceptShare = async (share: CalendarShare) => {
    setSaving(true);
    try { const saved = await acceptCalendarShare(share.userKey); setCalendarShares((current) => current.map((item) => item.userKey === saved.userKey ? saved : item)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유 요청을 수락하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const updateShareColor = async (share: CalendarShare, color: string) => {
    setSaving(true);
    try { const saved = await changeCalendarShareColor(share.userKey, color); setCalendarShares((current) => current.map((item) => item.userKey === saved.userKey ? saved : item)); setColorTarget(null); setDraftColor(""); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유 색상을 변경하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const updateDisplayColor = async (scope: CalendarColorScope, color: string) => {
    setSaving(true);
    try { setDisplayPreferences(await changeCalendarDisplayPreference(scope, color)); setColorTarget(null); setDraftColor(""); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "표시 색상을 변경하지 못했습니다."); }
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
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유 요청 또는 공유를 취소하지 못했습니다."); }
    finally { setSaving(false); }
  };

  const chooseTitleSearchResult = (index: number) => {
    if (!draft) return;
    const trigger = extractTitleSearchTrigger(draft.title);
    if (trigger?.kind === "related") {
      const item = titleRelatedOptions[index];
      if (!item) return;
      setAccountNames((current) => new Map(current).set(item.accountId, item.accountName));
      setDraft({ ...draft, ...applyRelatedSelection("", item) });
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : "일정 관계를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  const renderEventRelations = (event: CalendarEvent) => {
    const accountName = event.accountId == null ? "" : (accountNames.get(event.accountId) ?? relatedAccountName(event.accountId, event.relatedItemLabel));
    if (!accountName && !event.shares.length) return null;
    return <div class="calendar-event-relations" aria-label="일정 관계">
      {accountName && (event.canEdit ? <button type="button" onClick={(click) => { click.stopPropagation(); setMentionEditing({ event, kind: "related" }); setMentionQuery(""); }}>@{accountName}</button> : <span>@{accountName}</span>)}
      {event.shares.map((share) => {
        const label = `#${sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? share.userKey}`;
        return event.canEdit ? <button type="button" key={share.userKey} onClick={(click) => { click.stopPropagation(); setMentionEditing({ event, kind: "user" }); setMentionQuery(""); }}>{label}</button> : <span key={share.userKey}>{label}</span>;
      })}
    </div>;
  };

  const beginResize = (pointer: PointerEvent, event: CalendarEvent, edge: "start" | "end" = "end") => {
    if (!event.canEdit || !timelineRef.current) return;
    pointer.preventDefault(); pointer.stopPropagation();
    openEdit(event);
    const start = timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time);
    const originalEnd = timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time);
    const timeline = timelineRef.current;
    const move = (next: PointerEvent) => {
      const rect = timeline.getBoundingClientRect();
      const snapped = snapTimelinePointer(next.clientY, rect.top, rect.height, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES, true);
      const range = edge === "start"
        ? { startMinutes: Math.min(originalEnd - 20, snapped), endMinutes: originalEnd }
        : resizeTimelineRange(start, snapped);
      setDraft((current) => current ? { ...current, timeUnknown: false, allDay: false, startTime: minutesToTime(range.startMinutes), endTime: minutesToTime(range.endMinutes) } : current);
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };

  const beginMove = (pointer: PointerEvent, event: CalendarEvent) => {
    if (!event.canEdit || !timelineRef.current || (pointer.target as HTMLElement).closest("button, input, textarea, select, [role=separator]")) return;
    const timeline = timelineRef.current;
    const originalStart = timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time);
    const originalEnd = timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time);
    const duration = Math.max(20, originalEnd - originalStart);
    const initialBounds = timeline.getBoundingClientRect();
    const pointerStart = snapTimelinePointer(pointer.clientY, initialBounds.top, initialBounds.height);
    openEdit(event);
    pointer.preventDefault();
    const move = (next: PointerEvent) => {
      const bounds = timeline.getBoundingClientRect();
      const current = snapTimelinePointer(next.clientY, bounds.top, bounds.height);
      const shifted = Math.max(TIMELINE_START_MINUTES, Math.min(TIMELINE_END_MINUTES - duration, originalStart + current - pointerStart));
      setDraft((value) => value ? { ...value, startTime: minutesToTime(shifted), endTime: minutesToTime(shifted + duration), allDay: false, timeUnknown: false } : value);
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };

  const renderDraftEditor = (compact = false) => draft && <section class={`calendar-inline-editor calendar-inline-editor--block${compact ? " is-compact" : ""}`} aria-labelledby="event-editor-title" onClick={(event) => event.stopPropagation()}>
    <header><h3 id="event-editor-title">{editing ? "일정 편집" : "새 일정"}</h3><div class="calendar-inline-editor__menu"><button id="calendar-editor-options-launcher" type="button" aria-label="일정 옵션" aria-haspopup="dialog" aria-expanded={editorMenuOpen} onClick={() => setEditorMenuOpen(!editorMenuOpen)}>•••</button><oj-c-popup opened={editorMenuOpen} launcher="#calendar-editor-options-launcher" anchor="#calendar-editor-options-launcher" placement="bottom-end" autoDismiss="focusLoss" initialFocus="none" onojClose={() => setEditorMenuOpen(false)}><div class="calendar-options-popover calendar-options-popover__jet-content" role="group" aria-label="일정 옵션"><label><input type="checkbox" checked={draft.forcePrivate} onChange={(event) => setDraft({ ...draft, forcePrivate: event.currentTarget.checked })} />비공개</label>{editing && <label><input type="checkbox" checked={editing.status === "CANCELLED"} onChange={() => void toggleCancelled()} />취소</label>}</div></oj-c-popup><button type="button" onClick={closeEditor} aria-label="닫기">×</button></div></header>
    <fieldset class="calendar-event-form" disabled={Boolean(editing && !editing.canEdit)}>
      <div class="calendar-inline-title"><div class="calendar-time-kind" aria-label="일정 시간 유형"><button type="button" class={draft.allDay ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: true, timeUnknown: false })}>하루종일</button><button type="button" class={draft.timeUnknown ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: false, timeUnknown: true })}>미지정</button><button type="button" class={!draft.allDay && !draft.timeUnknown ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: false, timeUnknown: false, startTime: draft.startTime || "09:00", endTime: draft.endTime || "10:00" })}>시간</button></div><label class="kap-field">제목 *<input ref={titleInputRef} autoFocus value={draft.title} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={handleTitleKeyDown} onInput={(e) => setDraft({ ...draft, title: e.currentTarget.value })} aria-autocomplete="list" /></label>
      {titleSearchOpen && <div class="calendar-title-search" role="listbox">{(extractTitleSearchTrigger(draft.title)?.kind === "related" ? titleRelatedOptions : matchingTitleUsers).slice(0, 10).map((item, index) => <button type="button" role="option" aria-selected={index === highlightedSearchIndex} onClick={() => chooseTitleSearchResult(index)}>{"type" in item ? <><strong>{item.type === "ACCOUNT" ? "Account" : item.type === "WORKLOAD" ? "Workload" : "Oppty"}</strong> {item.label}</> : item.displayName}</button>)}{!(extractTitleSearchTrigger(draft.title)?.kind === "related" ? titleRelatedOptions : matchingTitleUsers).length && <span class="account-search-empty">검색 중…</span>}</div>}</div>
      {(draftAccountName || eventShares.length > 0) && <div class="calendar-event-relations" aria-label="일정 관계"><span>{draftAccountName && `@${draftAccountName}`}</span>{eventShares.map((share) => <span key={share.userKey}>#{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? share.userKey}</span>)}</div>}
      <div class="calendar-event-form__row"><label class="kap-field">From *<input type="date" required value={draft.startDate} onInput={(e) => { const startDate = e.currentTarget.value; setDraft({ ...draft, startDate, endDate: draft.endDate && draft.endDate >= startDate ? draft.endDate : startDate }); }} /></label><label class="kap-field">To<input type="date" min={draft.startDate} value={draft.endDate} onInput={(e) => setDraft({ ...draft, endDate: e.currentTarget.value })} /></label></div>
      {!draft.allDay && !draft.timeUnknown && <div class="calendar-event-form__row"><label class="kap-field">시작 시간<input type="time" step="600" value={draft.startTime} onInput={(e) => setDraft({ ...draft, startTime: e.currentTarget.value })} /></label><label class="kap-field">종료 시간<input type="time" step="600" value={draft.endTime} onInput={(e) => setDraft({ ...draft, endTime: e.currentTarget.value })} /></label></div>}

      {editing && !editing.canEdit && <aside class="calendar-sharing-readonly"><strong>공유 일정 (읽기 전용)</strong><p>Calendar 공유 권한은 Meeting Notes·녹음·전사·요약으로 확장되지 않습니다.</p></aside>}
      {error && <div class="app-message app-message--error" role="alert">{error}</div>}
    </fieldset>
    <footer>{editing?.canEdit && <button type="button" class="danger" disabled={saving} onClick={() => void toggleCancelled()}>{editing.status === "CANCELLED" ? "일정 다시 열기" : "일정 취소"}</button>}{editing?.canEdit && <button type="button" class="danger calendar-delete" disabled={saving} onClick={() => void removeEvent()}>일정 삭제</button>}<span /><button type="button" onClick={closeEditor}>닫기</button>{(!editing || editing.canEdit) && <button type="button" class="primary" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "저장"}</button>}</footer>
  </section>;

  const eventColor = (event: CalendarEvent) => event.status === "CANCELLED"
    ? displayPreferences.cancelledColor
    : event.forcePrivate
      ? displayPreferences.privateColor
      : event.canEdit
        ? displayPreferences.ownColor
        : event.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0];
  const eventDisplayTitle = (event: CalendarEvent) => event.title;

  return <section class="calendar-page" aria-labelledby="calendar-heading">
    {breadcrumb}
    <section class="calendar-page-card">
    <header class="page-section-header calendar-toolbar">
      <div><h2 id="calendar-heading">Calendar</h2></div>
      <div class="calendar-toolbar__month" aria-label="달력 이동">
        <button type="button" onClick={() => shiftYear(-1)} aria-label="이전 연도">«</button>
        <button type="button" onClick={() => shift(-1)} aria-label="이전 달">‹</button>
        <strong aria-live="polite">{monthTitle(cursor)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="다음 달">›</button>
        <button type="button" onClick={() => shiftYear(1)} aria-label="다음 연도">»</button>
        <button type="button" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button>
        {canWrite && <button type="button" disabled={saving} onClick={() => void openSharing()}>전체 공유 관리</button>}
      </div>
      <div class="calendar-legend" aria-label="일정 범례">
        <span><button id="calendar-color-own" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "OWN"} aria-label="내 일정 색상 변경" style={{ backgroundColor: colorTarget === "OWN" && draftColor ? draftColor : displayPreferences.ownColor }} onClick={() => openColorPicker("OWN")} />내 일정</span>
        {calendarShares.filter((share) => share.direction === "OUTGOING" && share.status === "ACCEPTED").map((share) => { const safeKey = share.userKey.replace(/[^a-zA-Z0-9_-]/g, "-"); const target = `SHARED:${share.userKey}` as const; return <span key={share.userKey}><button id={`calendar-color-shared-${safeKey}`} type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === target} aria-label={`${sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "공유 사용자"} 색상 변경`} style={{ backgroundColor: colorTarget === target && draftColor ? draftColor : share.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0] }} onClick={() => openColorPicker(target)} />{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "공유 사용자"}</span>; })}
        <span><button id="calendar-color-private" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "PRIVATE"} aria-label="비공개 색상 변경" style={{ backgroundColor: colorTarget === "PRIVATE" && draftColor ? draftColor : displayPreferences.privateColor }} onClick={() => openColorPicker("PRIVATE")} />비공개</span>
        <span><button id="calendar-color-cancelled" type="button" class="calendar-legend__swatch" aria-haspopup="dialog" aria-expanded={colorTarget === "CANCELLED"} aria-label="취소됨 색상 변경" style={{ backgroundColor: colorTarget === "CANCELLED" && draftColor ? draftColor : displayPreferences.cancelledColor }} onClick={() => openColorPicker("CANCELLED")} />취소됨</span>
        {colorTarget && <oj-c-popup opened={true} launcher={colorTarget.startsWith("SHARED:") ? `#calendar-color-shared-${colorTarget.slice(7).replace(/[^a-zA-Z0-9_-]/g, "-")}` : `#calendar-color-${colorTarget.toLowerCase()}`} anchor={colorTarget.startsWith("SHARED:") ? `#calendar-color-shared-${colorTarget.slice(7).replace(/[^a-zA-Z0-9_-]/g, "-")}` : `#calendar-color-${colorTarget.toLowerCase()}`} placement="bottom-start" autoDismiss="focusLoss" initialFocus="none" onojClose={() => { setColorTarget(null); setDraftColor(""); }}><div class="calendar-legend__palette calendar-legend__palette--jet-content" role="group" aria-label="일정 표시 색상 선택">{CALENDAR_SHARE_COLORS.map((color) => <button type="button" aria-label={`색상 ${color}`} aria-pressed={draftColor === color} style={{ backgroundColor: color }} onClick={() => setDraftColor(color)} />)}<label>Custom<input aria-label="Custom 색상" type="color" value={draftColor || persistedColor(colorTarget)} onInput={(event) => setDraftColor(event.currentTarget.value)} /></label><div class="calendar-legend__palette-actions"><button type="button" onClick={() => { setColorTarget(null); setDraftColor(""); }}>취소</button><button type="button" disabled={saving} onClick={() => void applyDraftColor()}>적용</button></div></div></oj-c-popup>}
      </div>
    </header>
    {!canWrite && <div class="app-message">Read-only access. Write permission is required.</div>}
    {error && !draft && !sharingOpen && <div class="app-message app-message--error" role="alert">{error}</div>}
    <section class="calendar-surface" aria-label="월간 달력">
    <div class="calendar-grid" role="grid" aria-label={monthTitle(cursor)}>
      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day, index) => <div class={`calendar-grid__weekday${index === 0 ? " is-sunday" : index === 6 ? " is-saturday" : ""}`} role="columnheader">{day}</div>)}
      {cells.map((cell, cellIndex) => {
        const dayEvents = events.filter((event) => {
          const start = event.timeUnknown || event.allDay
            ? eventCalendarDate(event.startsAt, event.timezone)
            : eventLocalParts(event.startsAt, event.timezone).date;
          const end = event.timeUnknown || event.allDay
            ? eventCalendarDate(event.endsAt, event.timezone)
            : eventLocalParts(event.endsAt, event.timezone).date;
          return eventOccursOnDate(start, end, cell.date);
        });
        const holiday = holidays.get(cell.date);
        const activities = weeklyActivities.filter((activity) => activity.createdAt.slice(0, 10) === cell.date);
        return <div class={`calendar-day${cell.inMonth ? "" : " is-outside"}${cell.date === today ? " is-today" : ""}${cell.date === selectedDate ? " is-selected" : ""}${cellIndex % 7 === 0 ? " is-sunday" : cellIndex % 7 === 6 ? " is-saturday" : ""}${holiday ? " is-holiday" : ""}`} role="gridcell" tabIndex={0} aria-label={`${cell.date}${holiday ? `, ${holiday}` : ""}`} onClick={() => setSelectedDate(cell.date)} onDblClick={() => { if (performance.now() - lastTouchOpenAtRef.current > 500) openDayTimeline(cell.date); }} onPointerUp={(pointer) => handleDayTouchTap(cell.date, pointer)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDayTimeline(cell.date); } }}>
          <div class="calendar-day__heading"><time dateTime={cell.date}>{cell.day}</time>{holiday && <span class="calendar-day__kind">{holiday}</span>}</div>
          {dayEvents.map((event) => {
            const time = !event.allDay && !event.timeUnknown ? eventLocalParts(event.startsAt, event.timezone).time : "";
            const shared = !event.canEdit;
            const ownerColor = eventColor(event);
            const icon = event.status === "CANCELLED" ? "⊘" : event.forcePrivate ? "🔒" : shared ? "↗" : "●";
            return <div role="button" tabIndex={0} class={`calendar-event ${event.canEdit ? "is-own" : "is-shared-recipient"}${shared ? " is-shared" : ""}${event.forcePrivate ? " is-private" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}`} style={{ "--owner-color": ownerColor }} onClick={(click) => { click.stopPropagation(); setSelectedDate(cell.date); setDayOpen(true); openEdit(event); }} onKeyDown={(key) => { if (key.key === "Enter") openEdit(event); }}><span class="calendar-event__status" aria-hidden="true">{icon}</span><EventTitle text={eventDisplayTitle(event)} />{time && <small class="calendar-event__time">{time}</small>}{renderEventRelations(event)}</div>;
          })}
          {activities.map((activity) => <button type="button" class="calendar-weekly-activity" onClick={(click) => { click.stopPropagation(); setViewingActivity(activity); }}>Weekly Activities</button>)}
        </div>;
      })}
    </div>
    </section>
    {dayOpen && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle={selectedDate}
      width="90vw" maxWidth="72rem" maxHeight="90vh"
      onojClose={() => { setDayOpen(false); closeEditor(); }}>
      <div slot="body" class="calendar-day-dialog calendar-day-dialog__jet-body">
      <p class="calendar-day-dialog__hint">09:00–18:00 · 10분 단위</p>
      {(() => {
        const selectedEvents = events.filter((event) => eventOccursOnDate(eventCalendarDate(event.startsAt, event.timezone), eventCalendarDate(event.endsAt, event.timezone), selectedDate));
        const untimed = selectedEvents.filter((event) => event.allDay || event.timeUnknown);
        const timed = selectedEvents.filter((event) => !event.allDay && !event.timeUnknown).map((event) => ({ event, startMinutes: timeToMinutes(eventLocalParts(event.startsAt, event.timezone).time), endMinutes: timeToMinutes(eventLocalParts(event.endsAt, event.timezone).time) })).filter(({ startMinutes, endMinutes }) => endMinutes > TIMELINE_START_MINUTES && startMinutes < TIMELINE_END_MINUTES);
        const laidOut = layoutTimelineEvents(timed.map(({ event, startMinutes, endMinutes }) => ({ id: event.id, startMinutes, endMinutes: Math.max(startMinutes + 20, endMinutes) })));
        return <div class="calendar-day-detail">
          <section class="calendar-day-undated" aria-label="종일 또는 시간 미지정 일정"><div class="calendar-day-undated__heading"><strong>종일 / 시간 미지정</strong><span>유형을 선택해 연속으로 입력할 수 있습니다.</span></div>
            {creationPreview && creationPreview.kind !== "TIMED" ? <div class="calendar-create-row-preview" aria-live="polite"><strong>{creationPreview.kind === "ALL_DAY" ? "하루종일" : "시간 미지정"}</strong><span>새 일정</span></div> : draft && (draft.allDay || draft.timeUnknown) ? renderDraftEditor(true) : <div class="calendar-day-blank-row"><select aria-label="새 일정 시간 유형" value={undatedCreateKind} onChange={(event) => { const kind = event.currentTarget.value as CreateLaneKind; undatedCreateKindRef.current = kind; setUndatedCreateKind(kind); openCreate(selectedDate); setDraft((current) => current ? { ...current, allDay: kind === "ALL_DAY", timeUnknown: kind === "UNKNOWN" } : current); }}><option value="ALL_DAY">하루종일</option><option value="UNKNOWN">시간 미지정</option></select><input aria-label="새 일정 제목" placeholder="새 일정 입력…" onFocus={() => openCreate(selectedDate)} onInput={(event) => { if (!draft) openCreate(selectedDate); setDraft((current) => current ? { ...current, title: event.currentTarget.value } : current); }} /></div>}
            <div class="calendar-day-undated__events">{untimed.filter((event) => event.id !== editing?.id).map((event) => <div role="button" tabIndex={0} class={`calendar-detail-event${event.status === "CANCELLED" ? " is-cancelled" : ""}`} style={{ "--owner-color": eventColor(event) }} onClick={() => openEdit(event)} onKeyDown={(key) => { if (key.key === "Enter") openEdit(event); }}><span aria-hidden="true">{event.status === "CANCELLED" ? "⊘" : event.forcePrivate ? "🔒" : event.canEdit ? "●" : "↗"}</span><EventTitle text={eventDisplayTitle(event)} />{renderEventRelations(event)}</div>)}</div>
          </section>
          <div class="calendar-day-timeline calendar-day-timeline--interactive" ref={timelineRef} onPointerMove={(pointer) => { if (creationPreviewRef.current) return; const rect = pointer.currentTarget.getBoundingClientRect(); setHoverMinutes(snapTimelinePointer(pointer.clientY, rect.top, rect.height)); }} onPointerLeave={() => { if (!creationPreviewRef.current) setHoverMinutes(null); }} onContextMenu={(event) => { if (creationPreviewRef.current) event.preventDefault(); }} onPointerDown={beginTimelineCreate}>
            {Array.from({ length: 10 }, (_, index) => 9 + index).map((hour) => <div class="calendar-day-hour" style={{ top: `${((hour * 60 - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><time>{String(hour).padStart(2, "0")}:00</time></div>)}
            {hoverMinutes !== null && !creationPreview && <div class="calendar-time-cursor" style={{ top: `${((hoverMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><span role="tooltip">{minutesToTime(hoverMinutes)}</span></div>}
            {creationPreview?.kind === "TIMED" && <div class="calendar-create-preview" aria-live="polite" style={{ top: `${((creationPreview.startMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, height: `${((creationPreview.endMinutes - creationPreview.startMinutes) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%` }}><strong>새 일정</strong><span>{minutesToTime(creationPreview.startMinutes)}–{minutesToTime(creationPreview.endMinutes)}</span></div>}
            {laidOut.map((layout) => { const entry = timed.find(({ event }) => event.id === layout.id)!; const event = entry.event; if (editing?.id === event.id) return null; return <div role="button" tabIndex={0} aria-label={`${event.title}, ${minutesToTime(layout.startMinutes)}–${minutesToTime(layout.endMinutes)}`} class={`calendar-timeline-event${event.status === "CANCELLED" ? " is-cancelled" : ""}`} style={{ "--owner-color": eventColor(event), top: `${((layout.startMinutes - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, height: `${((layout.endMinutes - layout.startMinutes) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, left: `calc(4.5rem + (100% - 5rem) * ${layout.column / layout.columnCount})`, width: `calc((100% - 5rem) / ${layout.columnCount} - 3px)` }} onPointerDown={(pointer) => beginMove(pointer, event)} onClick={() => openEdit(event)} onKeyDown={(key) => { if (key.key === "Enter") openEdit(event); }}><span class="calendar-event__status" aria-hidden="true">{event.status === "CANCELLED" ? "⊘" : event.forcePrivate ? "🔒" : event.canEdit ? "●" : "↗"}</span><strong class="calendar-event__title">{eventDisplayTitle(event)}</strong>{renderEventRelations(event)}<small>{minutesToTime(layout.startMinutes)}–{minutesToTime(layout.endMinutes)}</small>{event.canEdit && <><span class="calendar-resize-handle calendar-resize-handle--start" role="separator" aria-label="일정 시작 시간 조절" onPointerDown={(pointer) => beginResize(pointer, event, "start")} /><span class="calendar-resize-handle calendar-resize-handle--end" role="separator" aria-label="일정 종료 시간 조절" onPointerDown={(pointer) => beginResize(pointer, event, "end")} /></>}</div>; })}
            {draft && !draft.allDay && !draft.timeUnknown && <div class="calendar-timeline-editor" style={{ top: `${((timeToMinutes(draft.startTime) - TIMELINE_START_MINUTES) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100}%`, minHeight: `${Math.max(7, ((timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime)) / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)) * 100)}%` }}>{renderDraftEditor(true)}</div>}
          </div>
          {creationPreview && creationPreview.pointerType === "touch" && <div class="calendar-create-touch-tooltip" role="tooltip" style={{ left: `${creationPreview.clientX}px`, top: `${creationPreview.clientY}px` }}>{creationPreview.kind === "TIMED" ? `${minutesToTime(creationPreview.startMinutes)}–${minutesToTime(creationPreview.endMinutes)}` : creationPreview.kind === "ALL_DAY" ? "하루종일" : "시간 미지정"}</div>}
        </div>;
      })()}
      </div>
    </oj-c-dialog>}
    {sharingOpen && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle="전체 Calendar 공유 관리"
      width="90vw" maxWidth="42rem" maxHeight="90vh" onojClose={() => setSharingOpen(false)}>
      <div slot="body" class="calendar-event-editor calendar-event-editor__jet-body">
        <div class="calendar-event-form">
          <p>Calendar 공유 요청은 보기 전용입니다. 상대가 요청을 수락해야 일정이 표시되며, 강제 비공개 일정은 공개되지 않습니다.</p>
          <div class="calendar-sharing">
            {calendarShares.map((share) => <div class="calendar-sharing__row" key={`${share.direction}-${share.userKey}`}>
              <span>{share.ownerBadgeColor && <span class="calendar-share-color" style={{ backgroundColor: share.ownerBadgeColor }} />}{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "사용자"} · {share.direction === "INCOMING" ? "받은 요청" : "보낸 요청"} · {share.status === "PENDING" ? "대기 중" : "공유 중"}</span>
              {share.direction === "INCOMING" && share.status === "PENDING" && <button type="button" disabled={saving} onClick={() => void acceptShare(share)}>수락</button>}
              {share.direction === "INCOMING" && share.status === "ACCEPTED" && <button type="button" disabled={saving} onClick={() => void removeCalendarShare(share)}>공유 취소</button>}
              {share.direction === "OUTGOING" && share.status === "PENDING" && <button type="button" disabled={saving} onClick={() => void removeCalendarShare(share)}>요청 취소</button>}
            </div>)}
            {!calendarShares.length && <span>공유 요청 또는 연결이 없습니다.</span>}
          </div>
          <label class="kap-field" ref={shareSearchRef}>공유 요청할 사용자 검색<input type="search" value={shareUserQuery} placeholder="이름으로 검색" onFocus={() => setShareSearchOpen(true)} onInput={(event) => { setShareUserQuery(event.currentTarget.value); setShareUserKey(""); setShareSearchOpen(true); }} />
          {shareSearchOpen && shareUserQuery && <div class="account-search-results" role="listbox">{matchingSharingUsers.map((user) => <button type="button" role="option" aria-selected={shareUserKey === user.userKey} onClick={() => { setShareUserKey(user.userKey); setShareUserQuery(user.displayName); setShareSearchOpen(false); }}>{user.displayName}</button>)}</div>}</label>
          <p>요청을 받은 사용자가 수락하면, 요청자에게 상대의 공개 일정이 보기 전용으로 표시됩니다. 표시 색상은 수락 후 범례에서 변경할 수 있습니다. 비공개 일정·Meeting Notes·녹음은 공유되지 않습니다.</p>
          {error && <div class="app-message app-message--error" role="alert">{error}</div>}
        </div>
        <footer><span /><button type="button" onClick={() => setSharingOpen(false)}>닫기</button><button type="button" class="primary" disabled={saving || !shareUserKey} onClick={() => void addCalendarShare()}>공유 요청</button></footer>
      </div>
    </oj-c-dialog>}
    {mentionEditing && <div class="calendar-mention-editor" role="dialog" aria-label={mentionEditing.kind === "related" ? "일정 관계 변경" : "일정 공유 변경"} onClick={(click) => click.stopPropagation()}>
      <header><strong>{mentionEditing.kind === "related" ? "@ 관계" : "# 공유"}</strong><button type="button" aria-label="닫기" onClick={() => setMentionEditing(null)}>×</button></header>
      <input autoFocus type="search" value={mentionQuery} placeholder={mentionEditing.kind === "related" ? "Account, Workload, Opportunity 검색" : "공유 사용자 검색"} onInput={(event) => setMentionQuery(event.currentTarget.value)} onKeyDown={(key) => { if (key.key === "Escape") { key.preventDefault(); setMentionEditing(null); } }} />

      <div class="calendar-mention-editor__results" role="listbox">
        {mentionEditing.kind === "related" ? <>
          {mentionEditing.event.accountId && <button type="button" onClick={() => void saveMentionUpdate(mentionEditing.event, { ...draftFromEvent(mentionEditing.event), accountId: "", relatedItemType: "", relatedItemId: "", relatedItemLabel: "" }, mentionEditing.event.shares)}>관계 제거</button>}
          {mentionRelatedOptions.map((item) => <button type="button" role="option" aria-selected={mentionEditing.event.relatedItemType === item.type && mentionEditing.event.relatedItemId === item.id} onClick={() => void saveMentionUpdate(mentionEditing.event, { ...draftFromEvent(mentionEditing.event), ...applyRelatedSelection("", item) }, mentionEditing.event.shares)}><strong>@{item.accountName}</strong><small>{item.label}</small></button>)}
        </> : mentionUserOptions.map((user) => {
          const existing = mentionEditing.event.shares.find((share) => share.userKey === user.userKey);
          const shares = existing ? mentionEditing.event.shares.filter((share) => share.userKey !== user.userKey) : [...mentionEditing.event.shares, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW" as const, visibility: "DETAILS" as const }];
          return <button type="button" role="option" aria-selected={Boolean(existing)} onClick={() => void saveMentionUpdate(mentionEditing.event, draftFromEvent(mentionEditing.event), shares)}><strong>#{user.displayName}</strong><small>{existing ? "공유 제거" : "VIEW / DETAILS 공유 추가"}</small></button>;
        })}
      </div>
    </div>}
    </section>
    {viewingActivity && <oj-c-dialog opened={true} modality="modal" cancelBehavior="icon" dialogTitle="Weekly Activities"
      width="92vw" maxWidth="34rem" maxHeight="90vh" onojClose={() => setViewingActivity(null)}>
      <div slot="body" class="calendar-weekly-popup calendar-weekly-popup__jet-body calendar-weekly-popup--vertical"><strong>This Week</strong><div class="calendar-weekly-popup__text" dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(viewingActivity.thisWeekHtml || viewingActivity.thisWeekText || "내용 없음") }} /><div class="calendar-weekly-popup__arrow" aria-hidden="true">↓</div><strong>Next Week</strong><div class="calendar-weekly-popup__text" dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(viewingActivity.nextWeekHtml || viewingActivity.nextWeekText || "내용 없음") }} /></div>
    </oj-c-dialog>}
  </section>;
}
