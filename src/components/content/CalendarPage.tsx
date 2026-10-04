import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CalendarColorScope, CalendarDisplayPreferences, CalendarEvent, CalendarEventInput, CalendarRelatedItemOption, CalendarRelatedItemType, CalendarShare, SharingUser, acceptCalendarShare, cancelCalendarEvent, changeCalendarDisplayPreference, changeCalendarShareColor, createCalendarEvent, deleteCalendarEvent, deleteCalendarShare, getCalendarDisplayPreferences, listCalendarEvents, listCalendarRelatedItems, listCalendarShares, listKoreanHolidays, listSharingUsers, reopenCalendarEvent, requestCalendarShare, updateCalendarEvent } from "../../data/calendarApi";
import { getFiscalYearForDate, getMonthCells } from "../../data/calendarDateUtils";
import { CALENDAR_SHARE_COLORS, appendMentionToken, eventCalendarDate, eventLocalParts, eventOccursOnDate, extractTitleSearchTrigger, getEventBadgeText, normalizeEventRange, normalizeEventTimes, prependRelatedToken, requestIsLatest } from "../../data/calendarUx";
import { fetchWeeklyActivities, WeeklyActivityRecord } from "../../data/weeklyActivitiesApi";

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
  const [advanced, setAdvanced] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountOptions, setAccountOptions] = useState<CalendarRelatedItemOption[]>([]);
  const [accountNames, setAccountNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sharingOpen, setSharingOpen] = useState(false);
  const [calendarShares, setCalendarShares] = useState<CalendarShare[]>([]);
  const [displayPreferences, setDisplayPreferences] = useState<CalendarDisplayPreferences>({ ownColor: "#245B83", privateColor: "#704895", cancelledColor: "#6F6F6F" });
  const [colorTarget, setColorTarget] = useState<CalendarColorScope | `SHARED:${string}` | null>(null);
  const [sharingUsers, setSharingUsers] = useState<SharingUser[]>([]);
  const [titleUserOptions, setTitleUserOptions] = useState<SharingUser[]>([]);
  const [shareUserQuery, setShareUserQuery] = useState("");
  const [shareSearchOpen, setShareSearchOpen] = useState(false);
  const [shareUserKey, setShareUserKey] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [weeklyActivities, setWeeklyActivities] = useState<WeeklyActivityRecord[]>([]);
  const [viewingActivity, setViewingActivity] = useState<WeeklyActivityRecord | null>(null);
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [titleSearchOpen, setTitleSearchOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const latestTitleSearchRef = useRef(0);
  const latestShareSearchRef = useRef(0);
  const today = todayIso();
  const accountSearchRef = useRef<HTMLLabelElement>(null);
  const eventShareSearchRef = useRef<HTMLElement>(null);
  const shareSearchRef = useRef<HTMLLabelElement>(null);
  const lastTouchRef = useRef<{ date: string; at: number } | null>(null);
  const cells = useMemo(() => getMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const accountById = accountNames;
  const matchingSharingUsers = useMemo(() => sharingUsers.filter((user) => !calendarShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(shareUserQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, calendarShares, shareUserQuery]);
  const matchingEventUsers = useMemo(() => sharingUsers.filter((user) => !eventShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(eventShareQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, eventShares, eventShareQuery]);
  const matchingTitleUsers = useMemo(() => titleUserOptions.filter((user) => !eventShares.some((share) => share.userKey === user.userKey)).slice(0, 10), [titleUserOptions, eventShares]);
  const relatedTitlePrefix = draft?.relatedItemLabel ? `[${draft.relatedItemLabel}]` : "";
  const hasRelatedTitlePrefix = Boolean(draft && relatedTitlePrefix && (draft.title === relatedTitlePrefix || draft.title.startsWith(`${relatedTitlePrefix} `)));
  const titleInputValue = draft ? (hasRelatedTitlePrefix ? draft.title.slice(relatedTitlePrefix.length).trimStart() : draft.title) : "";

  useEffect(() => {
    let active = true;
    const fiscalYear = getFiscalYearForDate(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
    const fromDate = cells[0]?.date ?? `${cursor.getFullYear()}-01-01`;
    const toDate = cells[cells.length - 1]?.date ?? `${cursor.getFullYear()}-12-31`;
    Promise.all([
      listCalendarEvents(fiscalYear),
      listKoreanHolidays(cursor.getFullYear()),
      listCalendarShares(),
      getCalendarDisplayPreferences(),
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
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Calendar could not be loaded."));
    return () => { active = false; };
  }, [cursor.getFullYear(), cursor.getMonth()]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const lookupFiscalYear = fiscalYear ?? getFiscalYearForDate(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
      void listCalendarRelatedItems(lookupFiscalYear, accountQuery).then((items) => {
        if (active) {
          setAccountOptions(items);
          setAccountNames((current) => {
            const next = new Map(current);
            items.forEach((item) => next.set(item.accountId, item.accountName));
            return next;
          });
        }
      }).catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Account 검색 결과를 불러오지 못했습니다.");
      });
    }, 1000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [fiscalYear, cursor.getFullYear(), cursor.getMonth(), accountQuery]);

  useEffect(() => {
    const trigger = draft ? extractTitleSearchTrigger(draft.title) : null;
    if (!trigger) { setTitleSearchOpen(false); return; }
    const requestId = ++latestTitleSearchRef.current;
    const timer = window.setTimeout(() => {
      if (trigger.kind === "related") {
        const lookupFiscalYear = fiscalYear ?? getFiscalYearForDate(draft!.startDate);
        void listCalendarRelatedItems(lookupFiscalYear, trigger.query).then((items) => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setAccountOptions(items); setTitleSearchOpen(true); setHighlightedSearchIndex(-1);
        }).catch(() => undefined);
      } else {
        void listSharingUsers(trigger.query).then((users) => {
          if (!requestIsLatest(requestId, latestTitleSearchRef.current)) return;
          setTitleUserOptions(users); setTitleSearchOpen(true); setHighlightedSearchIndex(-1);
        }).catch(() => undefined);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [draft?.title, draft?.startDate, fiscalYear]);

  useEffect(() => {
    const closeSearches = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountSearchRef.current?.contains(target)) setAccountSearchOpen(false);
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
    const timer = window.setTimeout(() => {
      void listSharingUsers(query).then((users) => {
        if (requestIsLatest(requestId, latestShareSearchRef.current)) setSharingUsers(users);
      }).catch(() => undefined);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [shareSearchOpen, shareUserQuery, eventShareSearchOpen, eventShareQuery]);

  const openCreate = (date: string, startTime?: string) => {
    if (!canWrite) { setError("Read-only access. Write permission is required."); return; }
    const next = blankDraft(date);
    if (startTime) { next.timeUnknown = false; next.startTime = startTime; next.endTime = `${String(Math.min(18, Number(startTime.slice(0, 2)) + 1)).padStart(2, "0")}:00`; }
    setSelectedDate(date); setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(next); setAdvanced(false); setAccountQuery(""); setAccountSearchOpen(false); setError("");
  };
  const openEdit = (event: CalendarEvent) => { setSelectedDate(eventCalendarDate(event.startsAt, event.timezone)); setEditing(event); setEventShares(event.shares); setEventShareQuery(""); setDraft(draftFromEvent(event)); setAdvanced(false); setAccountQuery(event.relatedItemLabel ?? (event.accountId ? accountById.get(event.accountId) ?? "" : "")); setError(""); };
  const closeEditor = () => { setDraft(null); setEditing(null); setError(""); };
  const shift = (months: number) => setCursor((value) => new Date(value.getFullYear(), value.getMonth() + months, 1));
  const shiftYear = (years: number) => setCursor((value) => new Date(value.getFullYear() + years, value.getMonth(), 1));
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
    try { const saved = await changeCalendarShareColor(share.userKey, color); setCalendarShares((current) => current.map((item) => item.userKey === saved.userKey ? saved : item)); setColorTarget(null); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유 색상을 변경하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const updateDisplayColor = async (scope: CalendarColorScope, color: string) => {
    setSaving(true);
    try { setDisplayPreferences(await changeCalendarDisplayPreference(scope, color)); setColorTarget(null); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "표시 색상을 변경하지 못했습니다."); }
    finally { setSaving(false); }
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
      const item = accountOptions[index];
      if (!item) return;
      setDraft({ ...draft, title: prependRelatedToken(draft.title, item.label), accountId: String(item.accountId), relatedItemType: item.type, relatedItemId: String(item.id), relatedItemLabel: item.label });
    } else if (trigger?.kind === "user") {
      const user = matchingTitleUsers[index];
      if (!user) return;
      setDraft({ ...draft, title: appendMentionToken(draft.title, user.displayName) });
      setEventShares((current) => current.some((share) => share.userKey === user.userKey) ? current : [...current, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW", visibility: "DETAILS" }]);
    }
    setTitleSearchOpen(false); setHighlightedSearchIndex(-1);
  };

  const handleTitleKeyDown = (event: KeyboardEvent) => {
    if (composing) return;
    if (event.key === "ArrowDown" && titleSearchOpen) { event.preventDefault(); setHighlightedSearchIndex((value) => Math.min(value + 1, 9)); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (titleSearchOpen) chooseTitleSearchResult(Math.max(0, highlightedSearchIndex));
    else void save();
  };

  const eventColor = (event: CalendarEvent) => event.status === "CANCELLED"
    ? displayPreferences.cancelledColor
    : event.forcePrivate
      ? displayPreferences.privateColor
      : event.canEdit
        ? displayPreferences.ownColor
        : event.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0];

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
        <span><button type="button" class="calendar-legend__swatch" aria-label="내 일정 색상 변경" style={{ backgroundColor: displayPreferences.ownColor }} onClick={() => setColorTarget(colorTarget === "OWN" ? null : "OWN")} />내 일정</span>
        {calendarShares.filter((share) => share.direction === "OUTGOING" && share.status === "ACCEPTED").map((share) => <span key={share.userKey}><button type="button" class="calendar-legend__swatch" aria-label={`${sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "공유 사용자"} 색상 변경`} style={{ backgroundColor: share.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0] }} onClick={() => setColorTarget(colorTarget === `SHARED:${share.userKey}` ? null : `SHARED:${share.userKey}`)} />{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? "공유 사용자"}</span>)}
        <span><button type="button" class="calendar-legend__swatch" aria-label="비공개 색상 변경" style={{ backgroundColor: displayPreferences.privateColor }} onClick={() => setColorTarget(colorTarget === "PRIVATE" ? null : "PRIVATE")} />비공개</span>
        <span><button type="button" class="calendar-legend__swatch" aria-label="취소됨 색상 변경" style={{ backgroundColor: displayPreferences.cancelledColor }} onClick={() => setColorTarget(colorTarget === "CANCELLED" ? null : "CANCELLED")} />취소됨</span>
        {colorTarget && <div class="calendar-legend__palette" role="dialog" aria-label="일정 표시 색상 선택">{CALENDAR_SHARE_COLORS.map((color) => <button type="button" aria-label={`색상 ${color}`} style={{ backgroundColor: color }} onClick={() => colorTarget.startsWith("SHARED:") ? void updateShareColor(calendarShares.find((share) => share.userKey === colorTarget.slice(7))!, color) : void updateDisplayColor(colorTarget as CalendarColorScope, color)} />)}<label>Custom<input aria-label="Custom 색상" type="color" value={colorTarget.startsWith("SHARED:") ? calendarShares.find((share) => share.userKey === colorTarget.slice(7))?.ownerBadgeColor ?? CALENDAR_SHARE_COLORS[0] : colorTarget === "OWN" ? displayPreferences.ownColor : colorTarget === "PRIVATE" ? displayPreferences.privateColor : displayPreferences.cancelledColor} onInput={(event) => colorTarget.startsWith("SHARED:") ? void updateShareColor(calendarShares.find((share) => share.userKey === colorTarget.slice(7))!, event.currentTarget.value) : void updateDisplayColor(colorTarget as CalendarColorScope, event.currentTarget.value)} /></label></div>}
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
        return <div class={`calendar-day${cell.inMonth ? "" : " is-outside"}${cell.date === today ? " is-today" : ""}${cell.date === selectedDate ? " is-selected" : ""}${cellIndex % 7 === 0 ? " is-sunday" : cellIndex % 7 === 6 ? " is-saturday" : ""}${holiday ? " is-holiday" : ""}`} role="gridcell" aria-label={`${cell.date}${holiday ? `, ${holiday}` : ""}`} onClick={() => setSelectedDate(cell.date)} onDblClick={() => { if (canWrite) openCreate(cell.date); }} onTouchEnd={() => {
          const now = Date.now(); const previous = lastTouchRef.current;
          if (canWrite && previous?.date === cell.date && now - previous.at < 400) { lastTouchRef.current = null; openCreate(cell.date); }
          else lastTouchRef.current = { date: cell.date, at: now };
        }}>
          <div class="calendar-day__heading"><time dateTime={cell.date}>{cell.day}</time>{holiday && <span class="calendar-day__kind">{holiday}</span>}</div>
          {dayEvents.map((event) => {
            const accountName = event.relatedItemLabel ?? (event.accountId ? accountById.get(event.accountId) : undefined);
            const text = getEventBadgeText({ accountName, title: event.title, startTime: eventLocalParts(event.startsAt, event.timezone).time, timeUnknown: event.timeUnknown, allDay: event.allDay });
            const shared = !event.canEdit;
            const ownerColor = eventColor(event);
            return <button type="button" class={`calendar-event ${event.canEdit ? "is-own" : "is-shared-recipient"}${shared ? " is-shared" : ""}${event.forcePrivate ? " is-private" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}`} style={{ "--owner-color": ownerColor }} onClick={(click) => { click.stopPropagation(); openEdit(event); }}><EventTitle text={text} /></button>;
          })}
          {activities.map((activity) => <button type="button" class="calendar-weekly-activity" onClick={(click) => { click.stopPropagation(); setViewingActivity(activity); }}>Weekly Activities</button>)}
        </div>;
      })}
    </div>
    </section>
    <section class="calendar-day-detail" aria-label={`${selectedDate} 일간 일정`}>
      <header><div><strong>{selectedDate}</strong><span>09:00–18:00</span></div><small>빈 공간을 더블클릭하거나 모바일에서 두 번 탭해 일정을 추가하세요.</small></header>
      <div class="calendar-day-undated">
        {[{ label: "종일", allDay: true }, { label: "시간 미정", allDay: false }].map((area) => <div class="calendar-day-undated__lane" onDblClick={() => { openCreate(selectedDate); setDraft((current) => current ? { ...current, allDay: area.allDay, timeUnknown: !area.allDay } : current); }} onTouchEnd={() => {
          const key = `${selectedDate}-${area.label}`; const now = Date.now(); const previous = lastTouchRef.current;
          if (previous?.date === key && now - previous.at < 400) { lastTouchRef.current = null; openCreate(selectedDate); setDraft((current) => current ? { ...current, allDay: area.allDay, timeUnknown: !area.allDay } : current); }
          else lastTouchRef.current = { date: key, at: now };
        }}><span>{area.label}</span>{events.filter((event) => eventOccursOnDate(eventCalendarDate(event.startsAt, event.timezone), eventCalendarDate(event.endsAt, event.timezone), selectedDate) && (area.allDay ? event.allDay : event.timeUnknown)).map((event) => <button type="button" class="calendar-detail-event" style={{ "--owner-color": eventColor(event) }} onClick={() => openEdit(event)}><EventTitle text={event.title} /></button>)}</div>)}
      </div>
      <div class="calendar-day-timeline">
        {Array.from({ length: 10 }, (_, index) => 9 + index).map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          const key = `${selectedDate}-${time}`;
          const timed = events.filter((event) => !event.allDay && !event.timeUnknown && eventLocalParts(event.startsAt, event.timezone).date === selectedDate && eventLocalParts(event.startsAt, event.timezone).time.slice(0, 2) === time.slice(0, 2));
          return <div class="calendar-day-slot" onDblClick={() => openCreate(selectedDate, time)} onTouchEnd={() => { const now = Date.now(); const previous = lastTouchRef.current; if (previous?.date === key && now - previous.at < 400) { lastTouchRef.current = null; openCreate(selectedDate, time); } else lastTouchRef.current = { date: key, at: now }; }}><time>{time}</time><div>{timed.map((event) => <button type="button" class="calendar-detail-event" style={{ "--owner-color": eventColor(event) }} onClick={() => openEdit(event)}><EventTitle text={event.title} /></button>)}</div></div>;
        })}
      </div>
    </section>
    {sharingOpen && <div class="kap-modal-backdrop" onClick={() => setSharingOpen(false)}>
      <section class="calendar-event-editor" role="dialog" aria-modal="true" aria-labelledby="calendar-sharing-title" onClick={(click) => click.stopPropagation()}>
        <header><h3 id="calendar-sharing-title">전체 Calendar 공유 관리</h3><button type="button" onClick={() => setSharingOpen(false)} aria-label="닫기">×</button></header>
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
      </section>
    </div>}
    {draft && <section class="calendar-inline-editor" aria-labelledby="event-editor-title">
        <header><h3 id="event-editor-title">{editing ? "일정 편집" : "새 일정"}</h3><div class="calendar-inline-editor__menu"><button type="button" aria-label="일정 옵션" aria-expanded={editorMenuOpen} onClick={() => setEditorMenuOpen(!editorMenuOpen)}>•••</button>{editorMenuOpen && <div class="calendar-options-popover"><label><input type="checkbox" checked={draft.forcePrivate} onChange={(event) => setDraft({ ...draft, forcePrivate: event.currentTarget.checked })} />비공개</label>{editing && <label><input type="checkbox" checked={editing.status === "CANCELLED"} onChange={() => void toggleCancelled()} />취소</label>}</div>}<button type="button" onClick={closeEditor} aria-label="닫기">×</button></div></header>
        <fieldset class="calendar-event-form" disabled={Boolean(editing && !editing.canEdit)}>
          <div class="calendar-inline-title"><div class="calendar-time-kind" aria-label="일정 시간 유형"><button type="button" class={draft.allDay ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: true, timeUnknown: false })}>하루종일</button><button type="button" class={draft.timeUnknown ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: false, timeUnknown: true })}>미정</button><button type="button" class={!draft.allDay && !draft.timeUnknown ? "is-selected" : ""} onClick={() => setDraft({ ...draft, allDay: false, timeUnknown: false, startTime: draft.startTime || "09:00", endTime: draft.endTime || "10:00" })}>시간</button></div><label class="kap-field">제목 *{draft.relatedItemLabel && <span class="calendar-related-token">[{draft.relatedItemLabel}]</span>}<input autoFocus value={titleInputValue} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={handleTitleKeyDown} onInput={(e) => setDraft({ ...draft, title: hasRelatedTitlePrefix ? `${relatedTitlePrefix} ${e.currentTarget.value}`.trim() : e.currentTarget.value })} aria-autocomplete="list" /></label>
          {titleSearchOpen && <div class="calendar-title-search" role="listbox">{(extractTitleSearchTrigger(draft.title)?.kind === "related" ? accountOptions : matchingTitleUsers).slice(0, 10).map((item, index) => <button type="button" role="option" aria-selected={index === highlightedSearchIndex} onClick={() => chooseTitleSearchResult(index)}>{"type" in item ? <><strong>{item.type === "ACCOUNT" ? "Account" : item.type === "WORKLOAD" ? "Workload" : "Oppty"}</strong> {item.label}</> : item.displayName}</button>)}</div>}</div>
          <div class="calendar-event-form__row">
            <label class="kap-field">From *<input type="date" required value={draft.startDate} onInput={(e) => { const startDate = e.currentTarget.value; setDraft({ ...draft, startDate, endDate: draft.endDate && draft.endDate >= startDate ? draft.endDate : startDate }); }} /></label>
            <label class="kap-field">To<input type="date" min={draft.startDate} value={draft.endDate} placeholder={draft.startDate} onInput={(e) => setDraft({ ...draft, endDate: e.currentTarget.value })} /><small>비워 두면 시작 날짜와 같게 저장됩니다.</small></label>
          </div>
          <label class="kap-field account-search-field" ref={accountSearchRef}>Account / Workload / Oppty 선택 (선택 사항)<input type="search" value={accountQuery} placeholder="Account, Workload 또는 Oppty 검색" onFocus={() => setAccountSearchOpen(true)} onInput={(e) => { setAccountQuery(e.currentTarget.value); setAccountSearchOpen(true); setDraft((current) => current ? { ...current, accountId: "", relatedItemType: "", relatedItemId: "", relatedItemLabel: "" } : current); }} aria-autocomplete="list" />
            {accountSearchOpen && accountQuery && <div class="account-search-results" role="listbox">{accountOptions.map((item) => <button type="button" role="option" aria-selected={draft.relatedItemType === item.type && draft.relatedItemId === String(item.id)} onClick={() => { setDraft({ ...draft, accountId: String(item.accountId), relatedItemType: item.type, relatedItemId: String(item.id), relatedItemLabel: item.label }); setAccountQuery(item.label); setAccountSearchOpen(false); }}><strong>{item.type === "ACCOUNT" ? "Account" : item.type === "WORKLOAD" ? "Workload" : "Oppty"}</strong><span>{item.label}</span></button>)}{!accountOptions.length && <span class="account-search-empty">검색 결과가 없습니다.</span>}</div>}
          </label>
          <button class="calendar-advanced-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>고급 설정 {advanced ? "접기" : "펼치기"}</button>
          {advanced && <div class="calendar-advanced-panel">
            <div class="calendar-event-form__row"><label class="kap-field">시작 시간<input type="time" value={draft.startTime} disabled={draft.allDay || draft.timeUnknown} onInput={(e) => { const value = e.currentTarget.value; setDraft((current) => current ? { ...current, startTime: value } : current); }} /></label><label class="kap-field">종료 시간<input type="time" value={draft.endTime} disabled={draft.allDay || draft.timeUnknown} onInput={(e) => { const value = e.currentTarget.value; setDraft((current) => current ? { ...current, endTime: value } : current); }} /></label></div>
            <div class="calendar-event-options"><label class="kap-check"><input type="checkbox" checked={draft.timeUnknown} disabled={draft.allDay} onChange={(e) => setDraft({ ...draft, timeUnknown: e.currentTarget.checked })} />시간 미정</label><label class="kap-check"><input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.currentTarget.checked, timeUnknown: false })} />하루종일</label></div>
            <label class="kap-field">장소<input value={draft.location} onInput={(e) => setDraft({ ...draft, location: e.currentTarget.value })} /></label>
            <label class="kap-field">설명<textarea rows={3} value={draft.description} onInput={(e) => setDraft({ ...draft, description: e.currentTarget.value })} /></label>
          </div>}
          {(!editing || editing.canEdit) && !draft.forcePrivate && <section ref={eventShareSearchRef} class="calendar-sharing"><strong>이 일정 공유 · 모든 공유는 보기 전용</strong>
            {eventShares.map((share) => <div class="calendar-sharing__row" key={share.userKey}><span>{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? "사용자"} · VIEW · DETAILS</span><button type="button" onClick={() => setEventShares((current) => current.filter((item) => item.userKey !== share.userKey))}>제거</button></div>)}
            <label class="kap-field">사용자 검색<input type="search" value={eventShareQuery} placeholder="이름으로 검색" onFocus={() => setEventShareSearchOpen(true)} onInput={(event) => { setEventShareQuery(event.currentTarget.value); setEventShareSearchOpen(true); }} /></label>
            {eventShareSearchOpen && eventShareQuery && <div class="account-search-results" role="listbox">{matchingEventUsers.map((user) => <button type="button" role="option" onClick={() => { setEventShares((current) => [...current, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW", visibility: "DETAILS" }]); setEventShareQuery(""); setEventShareSearchOpen(false); }}>{user.displayName}</button>)}</div>}
          </section>}
          {editing && !editing.canEdit && <aside class="calendar-sharing-readonly"><strong>공유 일정 (읽기 전용)</strong><p>이 일정의 Calendar 공유 권한은 Meeting Notes·녹음·전사·요약으로 확장되지 않습니다.</p></aside>}
          {error && <div class="app-message app-message--error" role="alert">{error}</div>}
        </fieldset>
        <footer>{editing?.canEdit && <button type="button" class="danger" disabled={saving} onClick={() => void toggleCancelled()}>{editing.status === "CANCELLED" ? "일정 다시 열기" : "일정 취소"}</button>}{editing?.canEdit && <button type="button" class="danger calendar-delete" disabled={saving} onClick={() => void removeEvent()}>일정 삭제</button>}<span /><button type="button" onClick={closeEditor}>닫기</button>{(!editing || editing.canEdit) && <button type="button" class="primary" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "저장"}</button>}</footer>
      </section>}
    </section>
    {viewingActivity && <div class="kap-modal-backdrop" onClick={() => setViewingActivity(null)}><section class="calendar-weekly-popup" role="dialog" aria-modal="true" aria-labelledby="weekly-activity-title" onClick={(event) => event.stopPropagation()}><header><h3 id="weekly-activity-title">Weekly Activities</h3><button type="button" aria-label="닫기" onClick={() => setViewingActivity(null)}>×</button></header><div><strong>이번 주</strong><p class="calendar-weekly-popup__text">{viewingActivity.thisWeekText || "내용 없음"}</p><strong>다음 주</strong><p class="calendar-weekly-popup__text">{viewingActivity.nextWeekText || "내용 없음"}</p></div></section></div>}
  </section>;
}
