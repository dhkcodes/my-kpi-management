import { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojdialog";
import type { DialogElement } from "ojs/ojdialog";
import { createCalendarEventEntity, listCalendarEvents, listKoreanHolidays, syncCalendarEventShares, updateCalendarEventEntity, type CalendarEvent, type CalendarEventInput, type CalendarEventShare, type CalendarVisibility } from "../../data/calendarApi";
import { getDayKind, getFiscalYearRange, getMonthCells } from "../../data/calendarDateUtils";
import type { FiscalYear } from "../../data/kpiMockData";

const emptyDraft = (date: string): CalendarEventInput => ({
  title: "", startsAt: `${date}T09:00`, endsAt: `${date}T10:00`, allDay: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  accountId: null, location: "", description: "", visibility: "PRIVATE", shares: []
});
const localDate = (value: string) => value.slice(0, 10);
const monthLabel = (year: number, month: number) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));
const dayAccessibilityLabel = (kind: ReturnType<typeof getDayKind>, holidayName?: string) =>
  kind === "holiday" ? `Holiday · ${holidayName}` : kind === "sunday" ? "Weekend · Sunday" : kind === "saturday" ? "Weekend · Saturday" : "Weekday";

export function CalendarPage({ fiscalYear, canWrite, breadcrumb }: Readonly<{
  fiscalYear: FiscalYear; canWrite: boolean; breadcrumb?: ComponentChildren;
}>) {
  const initialRange = getFiscalYearRange(fiscalYear);
  const [cursor, setCursor] = useState(() => new Date(`${initialRange.fromDate}T00:00:00Z`));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [holidayNotice, setHolidayNotice] = useState("");
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<CalendarEventInput | null>(null);
  const [shareSync, setShareSync] = useState<{ event: CalendarEvent; shares: readonly CalendarEventShare[] } | null>(null);
  const dialogRef = useRef<DialogElement>(null);
  const range = useMemo(() => getFiscalYearRange(fiscalYear), [fiscalYear]);
  const cells = useMemo(() => getMonthCells(cursor.getUTCFullYear(), cursor.getUTCMonth()), [cursor]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void listCalendarEvents(fiscalYear).then((items) => { if (live) { setEvents(items); setError(""); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load calendar events."); })
      .finally(() => { if (live) setLoading(false); });
    const nextRange = getFiscalYearRange(fiscalYear);
    setCursor(new Date(`${nextRange.fromDate}T00:00:00Z`));
    return () => { live = false; };
  }, [fiscalYear]);

  useEffect(() => {
    let live = true;
    const year = cursor.getUTCFullYear();
    void listKoreanHolidays(year).then((items) => {
      if (!live) return;
      setHolidays(new Map(items.map((item) => [item.date, item.name])));
      setHolidayNotice("");
    }).catch(() => {
      if (!live) return;
      setHolidays(new Map());
      setHolidayNotice(`Korean holiday labels are unavailable for ${year}; the holiday service did not provide data. Weekend labels remain available.`);
    });
    return () => { live = false; };
  }, [cursor.getUTCFullYear()]);

  const openEditor = (event?: CalendarEvent, date?: string) => {
    if (!canWrite || shareSync || (event && event.canEdit === false)) return;
    setEditing(event ?? null);
    setDraft(event ? { title: event.title, startsAt: event.startsAt.slice(0, 16), endsAt: event.endsAt.slice(0, 16), allDay: event.allDay,
      timezone: event.timezone, accountId: event.accountId, location: event.location, description: event.description,
      visibility: event.visibility, shares: [...event.shares] } : emptyDraft(date ?? range.fromDate));
    setError("");
    queueMicrotask(() => dialogRef.current?.open());
  };
  const closeEditor = () => { if (!saving) { dialogRef.current?.close(); setDraft(null); setEditing(null); } };
  const save = async () => {
    if (!draft || !canWrite || saving) return;
    if (!draft.title.trim() || !draft.startsAt || !draft.endsAt) { setError("Title, start, and end are required."); return; }
    if (new Date(draft.endsAt).getTime() <= new Date(draft.startsAt).getTime()) { setError("End must be after start."); return; }
    try {
      setSaving(true);
      const input = { ...draft, title: draft.title.trim() };
      const saved = editing ? await updateCalendarEventEntity(editing, input) : await createCalendarEventEntity(input);
      setEvents((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      dialogRef.current?.close();
      setDraft(null);
      setEditing(null);
      try {
        const synchronized = await syncCalendarEventShares(saved, input.shares);
        setEvents((current) => current.map((item) => item.id === synchronized.id ? synchronized : item));
        setShareSync(null); setError("");
      } catch {
        setShareSync({ event: saved, shares: input.shares });
        setError("Event saved. Share settings were not fully synchronized. Retry sharing without saving the event again.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the event."); }
    finally { setSaving(false); }
  };
  const retryShareSync = async () => {
    if (!shareSync || saving) return;
    try {
      setSaving(true);
      const synchronized = await syncCalendarEventShares(shareSync.event, shareSync.shares);
      setEvents((current) => current.map((item) => item.id === synchronized.id ? synchronized : item));
      setShareSync(null); setError("");
    } catch { setError("Event remains saved, but share settings were not fully synchronized. Retry sharing when the service is available."); }
    finally { setSaving(false); }
  };
  const moveMonth = (amount: number) => {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + amount, 1));
    if (localDate(next.toISOString()) < range.fromDate || localDate(next.toISOString()) > range.toDate) return;
    setCursor(next);
  };
  const addShare = () => setDraft((current) => current ? { ...current, shares: [...current.shares, { userKey: "", permission: "VIEW", visibility: "DETAILS" }] } : current);
  const changeShare = (index: number, patch: Partial<CalendarEventShare>) => setDraft((current) => current ? { ...current,
    shares: current.shares.map((share, shareIndex) => shareIndex === index ? { ...share, ...patch } : share) } : current);

  return <section class="weekly-activities-page calendar-page">
    <header class="weekly-activities-page__header"><div>{breadcrumb}<span class="kpi-eyebrow">My Activities</span><h2>Calendar</h2>
      <p>Events are filtered by their start date in the selected Oracle fiscal year (June 1–May 31).</p></div>
      <oj-button chroming="callToAction" disabled={!canWrite || Boolean(shareSync)} onojAction={() => openEditor(undefined, localDate(cursor.toISOString()))}>Create event</oj-button></header>
    <div class="weekly-activity-filters calendar-toolbar">
      <div class="calendar-toolbar__month"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button><strong>{monthLabel(cursor.getUTCFullYear(), cursor.getUTCMonth())}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button></div>
      {!canWrite && <span class="kap-field__hint">Read-only access. Write permission is required.</span>}
    </div>
    {holidayNotice && <div class="kap-message-banner" role="status">{holidayNotice}</div>}
    {shareSync && <div class="kap-message-banner" role="alert"><strong>Event saved.</strong> Share settings were not fully synchronized. <button type="button" disabled={saving} onClick={() => void retryShareSync()}>{saving ? "Retrying…" : "Retry sharing"}</button></div>}
    {error && !draft && <div class="kap-error" role="alert">{error}</div>}
    {loading ? <div class="kap-empty-state" role="status">Loading calendar…</div> : <div class="calendar-grid" role="grid" aria-label={monthLabel(cursor.getUTCFullYear(), cursor.getUTCMonth())}>
      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day) => <div class="calendar-grid__weekday" role="columnheader" key={day}>{day}</div>)}
      {cells.map((cell) => {
        const holiday = holidays.get(cell.date); const kind = getDayKind(cell.date, holidays);
        const dayEvents = events.filter((item) => localDate(item.startsAt) === cell.date);
        return <div key={cell.date} role="gridcell" class={`calendar-day calendar-day--${kind}${cell.inMonth ? "" : " is-outside"}`} aria-label={`${cell.date}; ${dayAccessibilityLabel(kind, holiday)}`}>
          <div class="calendar-day__heading"><time dateTime={cell.date}>{cell.day}</time>{kind !== "weekday" && <span class="calendar-day__kind"><span aria-hidden="true">{kind === "holiday" ? "★" : "◐"}</span> {dayAccessibilityLabel(kind, holiday)}</span>}</div>
          {dayEvents.map((item) => <button type="button" class="calendar-event" key={item.id} onClick={() => openEditor(item)} disabled={!canWrite || Boolean(shareSync) || !item.canEdit}><strong>{item.effectiveVisibility === "BUSY_ONLY" ? "Busy" : item.title}</strong><span>{item.allDay ? "All day" : item.startsAt.slice(11, 16)}</span></button>)}
          {cell.inMonth && canWrite && <button class="calendar-day__add" type="button" disabled={Boolean(shareSync)} onClick={() => openEditor(undefined, cell.date)} aria-label={`Create event on ${cell.date}`}>+ Add</button>}
        </div>;
      })}</div>}
    {!loading && events.length === 0 && <div class="kap-empty-state"><strong>No calendar events for {fiscalYear}.</strong><p>Create an event to begin planning.</p></div>}

    <oj-dialog ref={dialogRef} initialVisibility="hide" dialogTitle={editing ? "Edit event" : "Create event"} cancelBehavior={saving ? "none" : "icon"} onojClose={() => { if (!saving) { setDraft(null); setEditing(null); } }} class="calendar-event-dialog">
      {draft && <div slot="body" class="kap-dialog-body calendar-event-form">
        <label class="kap-field"><span>Title</span><input value={draft.title} onInput={(e) => setDraft({ ...draft, title: e.currentTarget.value })} /></label>
        <div class="calendar-event-form__row"><label class="kap-field"><span>Start</span><input type="datetime-local" value={draft.startsAt} onInput={(e) => setDraft({ ...draft, startsAt: e.currentTarget.value })} /></label><label class="kap-field"><span>End</span><input type="datetime-local" value={draft.endsAt} onInput={(e) => setDraft({ ...draft, endsAt: e.currentTarget.value })} /></label></div>
        <label class="kap-check"><input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.currentTarget.checked })} /> All day</label>
        <label class="kap-field"><span>Account ID (optional)</span><input type="number" min="1" value={draft.accountId ?? ""} onInput={(e) => setDraft({ ...draft, accountId: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label>
        <label class="kap-field"><span>Location</span><input value={draft.location ?? ""} onInput={(e) => setDraft({ ...draft, location: e.currentTarget.value })} /></label>
        <label class="kap-field"><span>Description</span><textarea rows={3} value={draft.description ?? ""} onInput={(e) => setDraft({ ...draft, description: e.currentTarget.value })}></textarea></label>
        <label class="kap-field"><span>Visibility</span><select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.currentTarget.value as CalendarVisibility })}><option value="PRIVATE">PRIVATE — only me</option><option value="BUSY_ONLY">BUSY_ONLY — time only</option><option value="DETAILS">DETAILS — event details</option></select></label>
        <section class="calendar-sharing"><div><strong>Sharing</strong><button type="button" onClick={addShare}>Add person</button></div>{draft.shares.map((share, index) => <div class="calendar-sharing__row" key={index}><input aria-label={`Shared user ${index + 1}`} placeholder="User key or login ID" value={share.userKey} onInput={(e) => changeShare(index, { userKey: e.currentTarget.value })} /><select aria-label={`Permission for shared user ${index + 1}`} value={share.permission} onChange={(e) => changeShare(index, { permission: e.currentTarget.value as "VIEW" | "EDIT", visibility: e.currentTarget.value === "EDIT" ? "DETAILS" : share.visibility })}><option value="VIEW">VIEW</option><option value="EDIT">EDIT</option></select><select aria-label={`Visibility for shared user ${index + 1}`} value={share.visibility} disabled={share.permission === "EDIT"} onChange={(e) => changeShare(index, { visibility: e.currentTarget.value as CalendarVisibility })}><option value="BUSY_ONLY">BUSY_ONLY</option><option value="DETAILS">DETAILS</option></select><button type="button" aria-label={`Remove shared user ${index + 1}`} onClick={() => setDraft({ ...draft, shares: draft.shares.filter((_, shareIndex) => shareIndex !== index) })}>Remove</button></div>)}</section>
        {error && <div class="kap-error" role="alert">{error}</div>}
      </div>}
      <div slot="footer"><oj-button disabled={saving} onojAction={closeEditor}>Cancel</oj-button><oj-button chroming="callToAction" disabled={saving || !canWrite} onojAction={() => void save()}>{saving ? "Saving…" : "Save event"}</oj-button></div>
    </oj-dialog>
  </section>;
}
