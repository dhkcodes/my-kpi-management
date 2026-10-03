import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { CalendarAccountOption, CalendarEvent, CalendarEventInput, CalendarShare, SharingUser, cancelCalendarEvent, createCalendarEvent, deleteCalendarShare, listCalendarAccounts, listCalendarEvents, listCalendarShares, listKoreanHolidays, listSharingUsers, reopenCalendarEvent, saveCalendarShare, updateCalendarEvent } from "../../data/calendarApi";
import { getFiscalYearForDate, getMonthCells } from "../../data/calendarDateUtils";
import { eventCalendarDate, eventLocalParts, eventOccursOnDate, getEventBadgeText, normalizeEventRange, normalizeEventTimes } from "../../data/calendarUx";


const todayIso = () => new Date().toISOString().slice(0, 10);
const monthTitle = (date: Date) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);

type Draft = {
  title: string; startDate: string; endDate: string; startTime: string; endTime: string;
  timeUnknown: boolean; allDay: boolean; accountId: string; location: string; description: string;
  forcePrivate: boolean; timezone: string;
};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
const blankDraft = (date: string): Draft => ({
  title: "", startDate: date, endDate: date, startTime: "09:00", endTime: "10:00", timeUnknown: false,
  allDay: false, accountId: "", location: "", description: "", forcePrivate: false, timezone: browserTimezone()
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
    accountId: draft.accountId ? Number(draft.accountId) : null, location: draft.location.trim() || null,
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
  const [advanced, setAdvanced] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountOptions, setAccountOptions] = useState<CalendarAccountOption[]>([]);
  const [accountNames, setAccountNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sharingOpen, setSharingOpen] = useState(false);
  const [calendarShares, setCalendarShares] = useState<CalendarShare[]>([]);
  const [sharingUsers, setSharingUsers] = useState<SharingUser[]>([]);
  const [shareUserQuery, setShareUserQuery] = useState("");
  const [shareDraft, setShareDraft] = useState<CalendarShare>({ userKey: "", visibility: "DETAILS", ownerBadgeColor: "#315fa8" });
  const today = todayIso();
  const cells = useMemo(() => getMonthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const accountById = accountNames;
  const matchingSharingUsers = useMemo(() => sharingUsers.filter((user) => !calendarShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(shareUserQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, calendarShares, shareUserQuery]);
  const matchingEventUsers = useMemo(() => sharingUsers.filter((user) => !eventShares.some((share) => share.userKey === user.userKey) && `${user.displayName} ${user.userKey}`.toLowerCase().includes(eventShareQuery.trim().toLowerCase())).slice(0, 10), [sharingUsers, eventShares, eventShareQuery]);

  useEffect(() => {
    let active = true;
    const fiscalYear = getFiscalYearForDate(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
    Promise.all([listCalendarEvents(fiscalYear), listKoreanHolidays(cursor.getFullYear())]).then(([items, days]) => {
      if (!active) return;
      setEvents(items);
      setHolidays(new Map(days.map((day) => [day.date, day.name])));
      setError("");
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Calendar could not be loaded."));
    return () => { active = false; };
  }, [cursor.getFullYear(), cursor.getMonth()]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const lookupFiscalYear = fiscalYear ?? getFiscalYearForDate(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
      void listCalendarAccounts(lookupFiscalYear, accountQuery).then((items) => {
        if (active) {
          setAccountOptions(items);
          setAccountNames((current) => {
            const next = new Map(current);
            items.forEach((account) => next.set(account.accountId, account.account));
            return next;
          });
        }
      }).catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Account 검색 결과를 불러오지 못했습니다.");
      });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [fiscalYear, cursor.getFullYear(), cursor.getMonth(), accountQuery]);

  const openCreate = (date: string) => {
    if (!canWrite) { setError("Read-only access. Write permission is required."); return; }
    setEditing(null); setEventShares([]); setEventShareQuery(""); setDraft(blankDraft(date)); setAdvanced(false); setAccountQuery(""); setError("");
  };
  const openEdit = (event: CalendarEvent) => { setEditing(event); setEventShares(event.shares); setEventShareQuery(""); setDraft(draftFromEvent(event)); setAdvanced(false); setAccountQuery(event.accountId ? accountById.get(event.accountId) ?? "" : ""); setError(""); };
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
  const openSharing = async () => {
    setSaving(true);
    try {
      const [shares, users] = await Promise.all([listCalendarShares(), listSharingUsers()]);
      setCalendarShares(shares); setSharingUsers(users); setSharingOpen(true); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공유 설정을 불러오지 못했습니다."); }
    finally { setSaving(false); }
  };
  const addCalendarShare = async () => {
    if (!shareDraft.userKey) { setError("공유할 사용자를 선택하세요."); return; }
    setSaving(true);
    try {
      const saved = await saveCalendarShare(shareDraft);
      setCalendarShares((current) => [...current.filter((item) => item.userKey !== saved.userKey), saved]);
      setShareDraft({ userKey: "", visibility: "DETAILS", ownerBadgeColor: "#315fa8" }); setShareUserQuery(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공유 설정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const removeCalendarShare = async (userKey: string) => {
    setSaving(true);
    try { await deleteCalendarShare(userKey); setCalendarShares((current) => current.filter((item) => item.userKey !== userKey)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공유를 해제하지 못했습니다."); }
    finally { setSaving(false); }
  };

  return <section class="calendar-page" aria-labelledby="calendar-heading">
    {breadcrumb}
    <header class="page-section-header calendar-toolbar">
      <div><h2 id="calendar-heading">Calendar</h2><p>날짜를 더블 클릭하여 일정을 만드세요.</p></div>
      <div class="calendar-toolbar__month" aria-label="달력 이동">
        <button type="button" onClick={() => shiftYear(-1)} aria-label="이전 연도">«</button>
        <button type="button" onClick={() => shift(-1)} aria-label="이전 달">‹</button>
        <strong aria-live="polite">{monthTitle(cursor)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="다음 달">›</button>
        <button type="button" onClick={() => shiftYear(1)} aria-label="다음 연도">»</button>
        <button type="button" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button>
        {canWrite && <button type="button" disabled={saving} onClick={() => void openSharing()}>전체 공유 관리</button>}
      </div>
      <div class="calendar-legend" aria-label="일정 범례"><span class="is-own">내 일정</span><span class="is-shared">공유됨</span><span class="is-private">비공개</span><span class="is-cancelled">취소됨</span></div>
    </header>
    {!canWrite && <div class="app-message">Read-only access. Write permission is required.</div>}
    {error && !draft && !sharingOpen && <div class="app-message app-message--error" role="alert">{error}</div>}
    <div class="calendar-grid" role="grid" aria-label={monthTitle(cursor)}>
      {["일", "월", "화", "수", "목", "금", "토"].map((day) => <div class="calendar-grid__weekday" role="columnheader">{day}</div>)}
      {cells.map((cell) => {
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
        return <div class={`calendar-day${cell.inMonth ? "" : " is-outside"}${cell.date === today ? " is-today" : ""}`} role="gridcell" aria-label={`${cell.date}${holiday ? `, ${holiday}` : ""}`} onDblClick={() => { if (canWrite) openCreate(cell.date); }}>
          <div class="calendar-day__heading"><time dateTime={cell.date}>{cell.day}</time>{holiday && <span class="calendar-day__kind">{holiday}</span>}</div>
          {dayEvents.map((event) => {
            const accountName = event.accountId ? accountById.get(event.accountId) : undefined;
            const text = getEventBadgeText({ accountName, title: event.title, startTime: eventLocalParts(event.startsAt, event.timezone).time, timeUnknown: event.timeUnknown, allDay: event.allDay });
            const shared = !event.canEdit || event.shares.length > 0;
            const ownerColor = event.ownerBadgeColor ?? `hsl(${(event.id * 47) % 300} 55% 38%)`;
            return <button type="button" class={`calendar-event ${event.canEdit ? "is-own" : "is-shared-recipient"}${shared ? " is-shared" : ""}${event.forcePrivate ? " is-private" : ""}${event.status === "CANCELLED" ? " is-cancelled" : ""}`} style={{ "--owner-color": ownerColor }} title={text} onClick={(click) => { click.stopPropagation(); openEdit(event); }}>{text}</button>;
          })}
          {canWrite && <button type="button" class="calendar-day__mobile-add" onClick={() => openCreate(cell.date)} aria-label={`${cell.date}에 일정 추가`}>＋</button>}
        </div>;
      })}
    </div>
    {sharingOpen && <div class="kap-modal-backdrop" onClick={() => setSharingOpen(false)}>
      <section class="calendar-event-editor" role="dialog" aria-modal="true" aria-labelledby="calendar-sharing-title" onClick={(click) => click.stopPropagation()}>
        <header><h3 id="calendar-sharing-title">전체 Calendar 공유 관리</h3><button type="button" onClick={() => setSharingOpen(false)} aria-label="닫기">×</button></header>
        <div class="calendar-event-form">
          <p>모든 공유는 보기 전용입니다. 일정 세부정보 또는 바쁨 여부만 공개할 수 있으며 강제 비공개 일정은 공개되지 않습니다.</p>
          <div class="calendar-sharing">
            {calendarShares.map((share) => <div class="calendar-sharing__row" key={share.userKey}>
              <span><span class="calendar-share-color" style={{ backgroundColor: share.ownerBadgeColor }} />{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.userKey} · VIEW · {share.visibility}</span>
              <button type="button" disabled={saving} onClick={() => void removeCalendarShare(share.userKey)}>해제</button>
            </div>)}
            {!calendarShares.length && <span>전체 공유 대상 없음</span>}
          </div>
          <label class="kap-field">사용자 검색<input type="search" value={shareUserQuery} placeholder="이름 또는 사용자 ID" onInput={(event) => { const query = event.currentTarget.value; setShareUserQuery(query); if (query.trim().length >= 2) void listSharingUsers(query).then(setSharingUsers).catch(() => undefined); }} /></label>
          {shareUserQuery && <div class="account-search-results" role="listbox">{matchingSharingUsers.map((user) => <button type="button" role="option" aria-selected={shareDraft.userKey === user.userKey} onClick={() => { setShareDraft({ ...shareDraft, userKey: user.userKey }); setShareUserQuery(user.displayName); }}>{user.displayName} <small>{user.userKey}</small></button>)}</div>}
          <div class="calendar-event-form__row"><label class="kap-field">공개 범위<select value={shareDraft.visibility} onChange={(event) => setShareDraft({ ...shareDraft, visibility: event.currentTarget.value as CalendarShare["visibility"] })}><option value="DETAILS">일정 세부정보</option><option value="BUSY_ONLY">바쁨 여부만</option></select></label><label class="kap-field">공유자 색상<input type="color" value={shareDraft.ownerBadgeColor} onInput={(event) => setShareDraft({ ...shareDraft, ownerBadgeColor: event.currentTarget.value })} /></label></div>
          {error && <div class="app-message app-message--error" role="alert">{error}</div>}
        </div>
        <footer><span /><button type="button" onClick={() => setSharingOpen(false)}>닫기</button><button type="button" class="primary" disabled={saving || !shareDraft.userKey} onClick={() => void addCalendarShare()}>공유 추가</button></footer>
      </section>
    </div>}
    {draft && <div class="kap-modal-backdrop" onClick={closeEditor}>
      <section class="calendar-event-editor" role="dialog" aria-modal="true" aria-labelledby="event-editor-title" onClick={(click) => click.stopPropagation()}>
        <header><h3 id="event-editor-title">{editing ? "일정 편집" : "새 일정"}</h3><button type="button" onClick={closeEditor} aria-label="닫기">×</button></header>
        <fieldset class="calendar-event-form" disabled={Boolean(editing && !editing.canEdit)}>
          <label class="kap-field">제목 *<input autoFocus value={draft.title} onInput={(e) => setDraft({ ...draft, title: e.currentTarget.value })} /></label>
          <div class="calendar-event-form__row">
            <label class="kap-field">From *<input type="date" required value={draft.startDate} onInput={(e) => { const startDate = e.currentTarget.value; setDraft({ ...draft, startDate, endDate: draft.endDate && draft.endDate >= startDate ? draft.endDate : startDate }); }} /></label>
            <label class="kap-field">To<input type="date" min={draft.startDate} value={draft.endDate} placeholder={draft.startDate} onInput={(e) => setDraft({ ...draft, endDate: e.currentTarget.value })} /><small>비워 두면 시작 날짜와 같게 저장됩니다.</small></label>
          </div>
          <label class="kap-field account-search-field">Account 검색<input type="search" value={accountQuery} placeholder="고객사 이름 검색" onInput={(e) => { setAccountQuery(e.currentTarget.value); setDraft((current) => current ? { ...current, accountId: "" } : current); }} aria-autocomplete="list" />
            {accountQuery && <div class="account-search-results" role="listbox">{accountOptions.map((account) => <button type="button" role="option" aria-selected={draft.accountId === String(account.accountId)} onClick={() => { setDraft({ ...draft, accountId: String(account.accountId) }); setAccountQuery(account.account); }}>{account.account}</button>)}</div>}
          </label>
          <button class="calendar-advanced-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>고급 설정 {advanced ? "접기" : "펼치기"}</button>
          {advanced && <div class="calendar-advanced-panel">
            <div class="calendar-event-form__row"><label class="kap-field">시작 시간<input type="time" value={draft.startTime} disabled={draft.allDay || draft.timeUnknown} onInput={(e) => { const value = e.currentTarget.value; setDraft((current) => current ? { ...current, startTime: value } : current); }} /></label><label class="kap-field">종료 시간<input type="time" value={draft.endTime} disabled={draft.allDay || draft.timeUnknown} onInput={(e) => { const value = e.currentTarget.value; setDraft((current) => current ? { ...current, endTime: value } : current); }} /></label></div>
            <div class="calendar-event-options"><label class="kap-check"><input type="checkbox" checked={draft.timeUnknown} disabled={draft.allDay} onChange={(e) => setDraft({ ...draft, timeUnknown: e.currentTarget.checked })} />시간 미정</label><label class="kap-check"><input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.currentTarget.checked, timeUnknown: false })} />종일</label><label class="kap-check"><input type="checkbox" checked={draft.forcePrivate} onChange={(e) => setDraft({ ...draft, forcePrivate: e.currentTarget.checked })} />강제 비공개</label></div>
            <label class="kap-field">장소<input value={draft.location} onInput={(e) => setDraft({ ...draft, location: e.currentTarget.value })} /></label>
            <label class="kap-field">설명<textarea rows={3} value={draft.description} onInput={(e) => setDraft({ ...draft, description: e.currentTarget.value })} /></label>
          </div>}
          {(!editing || editing.canEdit) && !draft.forcePrivate && <section class="calendar-sharing"><strong>이 일정 공유 · VIEW 전용</strong>
            {eventShares.map((share) => <div class="calendar-sharing__row" key={share.userKey}><span>{sharingUsers.find((user) => user.userKey === share.userKey)?.displayName ?? share.displayName ?? share.userKey} · VIEW</span><select aria-label={`${share.userKey} 공개 범위`} value={share.visibility} onChange={(event) => setEventShares((current) => current.map((item) => item.userKey === share.userKey ? { ...item, visibility: event.currentTarget.value as "BUSY_ONLY" | "DETAILS" } : item))}><option value="DETAILS">DETAILS</option><option value="BUSY_ONLY">BUSY_ONLY</option></select><button type="button" onClick={() => setEventShares((current) => current.filter((item) => item.userKey !== share.userKey))}>제거</button></div>)}
            <label class="kap-field">사용자 검색<input type="search" value={eventShareQuery} placeholder="이름 또는 사용자 ID" onInput={(event) => { const query = event.currentTarget.value; setEventShareQuery(query); if (query.trim().length >= 2) void listSharingUsers(query).then(setSharingUsers).catch(() => undefined); }} /></label>
            {eventShareQuery && <div class="account-search-results" role="listbox">{matchingEventUsers.map((user) => <button type="button" role="option" onClick={() => { setEventShares((current) => [...current, { userKey: user.userKey, displayName: user.displayName, permission: "VIEW", visibility: "DETAILS" }]); setEventShareQuery(""); }}>{user.displayName} <small>{user.userKey}</small></button>)}</div>}
          </section>}
          {editing && !editing.canEdit && <aside class="calendar-sharing-readonly"><strong>공유 일정 (읽기 전용)</strong><p>이 일정의 Calendar 공유 권한은 Meeting Notes·녹음·전사·요약으로 확장되지 않습니다.</p></aside>}
          {error && <div class="app-message app-message--error" role="alert">{error}</div>}
        </fieldset>
        <footer>{editing?.canEdit && <button type="button" class="danger" disabled={saving} onClick={() => void toggleCancelled()}>{editing.status === "CANCELLED" ? "일정 다시 열기" : "일정 취소"}</button>}<span /><button type="button" onClick={closeEditor}>닫기</button>{(!editing || editing.canEdit) && <button type="button" class="primary" disabled={saving} onClick={() => void save()}>{saving ? "저장 중…" : "저장"}</button>}</footer>
      </section>
    </div>}
  </section>;
}
