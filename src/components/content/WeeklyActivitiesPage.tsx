import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  createWeeklyActivity,
  fetchWeeklyActivities,
  getDefaultWeeklyActivityRange,
  updateWeeklyActivity,
  WeeklyActivitiesQuery,
  WeeklyActivityRecord
} from "../../data/weeklyActivitiesApi";
import { SharedWeeklyActivityEditor } from "./SharedWeeklyActivityEditor";
import { sanitizeWeeklyActivityHtml, WeeklyActivityDrafts } from "./weeklyActivityEditorSession";
import {
  fetchWeeklyActivityLoadedWindow,
  LatestRequestGuard,
  reconcileWeeklyActivityMutation,
  validateWeeklyActivityDraft,
  weeklyActivityMatchesQuery
} from "./weeklyActivitiesPageState";
import "ojs/ojbutton";
import "ojs/ojdatetimepicker";
import "ojs/ojinputtext";
import "ojs/ojprogress-circle";

const PAGE_SIZE = 50;

type EditSession = Readonly<{
  key: string;
  mode: "add" | "edit";
  activityId?: number;
  versionNo?: number;
  weekOfDate: string;
  drafts: WeeklyActivityDrafts;
}>;


const formatWeekDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

function ActivityContent({ html, label }: Readonly<{ html: string; label: string }>) {
  return <div class="weekly-activity-card__rich-text" aria-label={label} dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(html) }}></div>;
}

type WeeklyActivitiesPageProps = Readonly<{
  onDirtyStateChange?: (active: boolean) => void;
}>;

export function WeeklyActivitiesPage({ onDirtyStateChange }: WeeklyActivitiesPageProps) {
  const defaultRange = getDefaultWeeklyActivityRange();
  const [filters, setFilters] = useState({ ...defaultRange, search: "" });
  const [query, setQuery] = useState<WeeklyActivitiesQuery>({ ...defaultRange, search: "", page: 0, size: PAGE_SIZE });
  const [items, setItems] = useState<WeeklyActivityRecord[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const requestGuardRef = useRef(new LatestRequestGuard());
  const controlsBusy = loading || loadingMore || saving;

  const load = async (nextQuery: WeeklyActivitiesQuery, append = false, clearBeforeLoad = !append) => {
    const requestId = requestGuardRef.current.begin();
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    if (clearBeforeLoad) {
      setItems([]);
      setTotalElements(0);
    }
    try {
      const page = await fetchWeeklyActivities(nextQuery);
      if (!requestGuardRef.current.isLatest(requestId)) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setTotalElements(page.totalElements);
      setQuery(nextQuery);
    } catch (cause) {
      if (!requestGuardRef.current.isLatest(requestId)) return;
      setError(cause instanceof Error ? cause.message : "Weekly Activities could not be loaded.");
    } finally {
      if (requestGuardRef.current.isLatest(requestId)) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => { void load(query); }, []);

  useEffect(() => {
    onDirtyStateChange?.(Boolean(editSession));
  }, [editSession, onDirtyStateChange]);

  useEffect(() => () => onDirtyStateChange?.(false), [onDirtyStateChange]);

  useEffect(() => {
    if (!editSession) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editSession]);

  const submitSearch = () => {
    if (!filters.fromDate || !filters.toDate || filters.fromDate > filters.toDate) {
      setFilterError("From Date must be on or before To Date.");
      return;
    }
    setFilterError("");
    setEditSession(null);
    void load({ ...filters, page: 0, size: PAGE_SIZE });
  };

  const resetSearch = () => {
    const next = { ...getDefaultWeeklyActivityRange(), search: "" };
    setFilters(next);
    setFilterError("");
    setEditSession(null);
    void load({ ...next, page: 0, size: PAGE_SIZE });
  };

  const startAdd = () => {
    setEditError("");
    setEditSession({
      key: `add-${Date.now()}`,
      mode: "add",
      weekOfDate: getDefaultWeeklyActivityRange().toDate,
      drafts: { thisWeekHtml: "", nextWeekHtml: "" }
    });
  };

  const startEdit = (record: WeeklyActivityRecord) => {
    setEditError("");
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(record.activityId);
      return next;
    });
    setEditSession({
      key: `edit-${record.activityId}-${record.versionNo}`,
      mode: "edit",
      activityId: record.activityId,
      versionNo: record.versionNo,
      weekOfDate: record.weekOfDate,
      drafts: { thisWeekHtml: record.thisWeekHtml, nextWeekHtml: record.nextWeekHtml }
    });
  };

  const save = async () => {
    const session = editSession;
    if (!session) return;
    const validation = validateWeeklyActivityDraft(session.weekOfDate, session.drafts);
    if (validation) {
      setEditError(validation);
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const request = {
        weekOfDate: session.weekOfDate,
        thisWeekHtml: session.drafts.thisWeekHtml,
        nextWeekHtml: session.drafts.nextWeekHtml
      };
      const saved = session.mode === "add"
        ? await createWeeklyActivity(request)
        : await updateWeeklyActivity(session.activityId!, { ...request, versionNo: session.versionNo! });
      setItems((current) => reconcileWeeklyActivityMutation(current, saved, query));
      const savedMatchesQuery = weeklyActivityMatchesQuery(saved, query);
      if (session.mode === "add" && savedMatchesQuery) setTotalElements((current) => current + 1);
      if (session.mode === "edit" && !savedMatchesQuery) setTotalElements((current) => Math.max(0, current - 1));
      setEditSession(null);
      const requestId = requestGuardRef.current.begin();
      const authoritative = await fetchWeeklyActivityLoadedWindow(query);
      if (requestGuardRef.current.isLatest(requestId)) {
        setItems(authoritative.items);
        setTotalElements(authoritative.totalElements);
      }
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Weekly Activity could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = (session: EditSession) => (
    <section class="weekly-activity-inline-editor" aria-label={session.mode === "add" ? "Add weekly activity" : "Edit weekly activity"}>
      <div class="weekly-activity-week-date">
        <oj-input-date
          id={`weeklyActivityWeekDate-${session.key}`}
          labelHint="Week Date"
          labelEdge="inside"
          value={session.weekOfDate}
          disabled={saving}
          onvalueChanged={(event: CustomEvent) => setEditSession((current) => current ? { ...current, weekOfDate: `${event.detail.value ?? ""}` } : current)}>
        </oj-input-date>
      </div>
      <SharedWeeklyActivityEditor
        key={session.key}
        drafts={session.drafts}
        disabled={saving}
        onDraftsChange={(drafts) => setEditSession((current) => current ? { ...current, drafts } : current)}
      />
      {editError && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{editError}</div>}
      <div class="weekly-activity-inline-editor__actions">
        <oj-button chroming="outlined" disabled={saving} onojAction={() => { setEditSession(null); setEditError(""); }}>Cancel</oj-button>
        <oj-button chroming="callToAction" disabled={saving} onojAction={() => void save()}>{saving ? "Saving…" : "Save Row"}</oj-button>
      </div>
    </section>
  );

  return (
    <section id="weeklyActivitiesPage" class="weekly-activities-page" aria-labelledby="weeklyActivitiesTitle">
      <header class="weekly-activities-page__header">
        <div>
          <span class="kpi-eyebrow">Activity planning</span>
          <h2 id="weeklyActivitiesTitle">Weekly Activities</h2>
          <p>Review completed work and plan next-week actions in one weekly row.</p>
        </div>
        <oj-button id="weeklyActivityAddButton" chroming="callToAction" disabled={Boolean(editSession) || controlsBusy} onojAction={startAdd}>
          <span slot="startIcon" class="oj-ux-ico-plus" aria-hidden="true"></span>
          Add Activity
        </oj-button>
      </header>

      <section class="weekly-activity-filters" aria-label="Weekly Activities filters">
        <oj-input-date
          id="weeklyActivityFromDate"
          labelHint="From Date"
          labelEdge="inside"
          value={filters.fromDate}
          disabled={Boolean(editSession) || controlsBusy}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, fromDate: `${event.detail.value ?? ""}` }))}>
        </oj-input-date>
        <oj-input-date
          id="weeklyActivityToDate"
          labelHint="To Date"
          labelEdge="inside"
          value={filters.toDate}
          disabled={Boolean(editSession) || controlsBusy}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, toDate: `${event.detail.value ?? ""}` }))}>
        </oj-input-date>
        <oj-input-text
          id="weeklyActivitySearch"
          labelHint="Content"
          labelEdge="inside"
          placeholder="Search Completed or Planned"
          value={filters.search}
          disabled={Boolean(editSession) || controlsBusy}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, search: `${event.detail.value ?? ""}` }))}
          onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter") submitSearch(); }}>
        </oj-input-text>
        <div class="weekly-activity-filters__actions">
          <oj-button chroming="outlined" disabled={Boolean(editSession) || controlsBusy} onojAction={resetSearch}>Reset</oj-button>
          <oj-button id="weeklyActivitySearchButton" chroming="callToAction" disabled={Boolean(editSession) || controlsBusy} onojAction={submitSearch}>Search</oj-button>
        </div>
      </section>
      {filterError && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{filterError}</div>}
      {error && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{error}</div>}

      {editSession?.mode === "add" && (
        <article class="weekly-activity-card weekly-activity-card--editing">
          <header class="weekly-activity-card__header"><h3>New Weekly Activity</h3></header>
          {renderEditor(editSession)}
        </article>
      )}

      {loading ? (
        <div class="weekly-activity-state" role="status" aria-busy="true">
          <oj-progress-circle value={-1} size="md" aria-label="Loading Weekly Activities"></oj-progress-circle>
          <span>Loading Weekly Activities…</span>
        </div>
      ) : items.length === 0 ? (
        <div class="weekly-activity-state" role="status">No weekly activities match the selected range and content.</div>
      ) : (
        <div class="weekly-activity-list" aria-label="Weekly Activities newest first">
          {items.map((record) => {
            const isCollapsed = collapsed.has(record.activityId);
            const isEditing = editSession?.mode === "edit" && editSession.activityId === record.activityId;
            return (
              <article key={record.activityId} class={isEditing ? "weekly-activity-card weekly-activity-card--editing" : "weekly-activity-card"}>
                <header class="weekly-activity-card__header">
                  <button
                    type="button"
                    class="weekly-activity-disclosure"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${formatWeekDate(record.weekOfDate)}`}
                    onClick={() => setCollapsed((current) => {
                      const next = new Set(current);
                      next.has(record.activityId) ? next.delete(record.activityId) : next.add(record.activityId);
                      return next;
                    })}>
                    <span class={isCollapsed ? "oj-ux-ico-chevron-right" : "oj-ux-ico-chevron-down"} aria-hidden="true"></span>
                  </button>
                  <h3>{formatWeekDate(record.weekOfDate)}</h3>
                  <oj-button chroming="borderless" disabled={Boolean(editSession) || controlsBusy} onojAction={() => startEdit(record)}>Edit</oj-button>
                </header>
                {!isCollapsed && (
                  <>
                    <div class="weekly-activity-card__sections">
                      <section aria-labelledby={`completed-${record.activityId}`}>
                        <h4 id={`completed-${record.activityId}`}>This Week · Completed</h4>
                        <ActivityContent html={record.thisWeekHtml} label="Completed activities" />
                      </section>
                      <div class="weekly-activity-direction" aria-hidden="true">↓</div>
                      <section aria-labelledby={`planned-${record.activityId}`}>
                        <h4 id={`planned-${record.activityId}`}>Next Week · Planned</h4>
                        <ActivityContent html={record.nextWeekHtml} label="Planned activities" />
                      </section>
                    </div>
                    {isEditing && editSession && renderEditor(editSession)}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      <footer class="weekly-activities-page__footer">
        <span>{items.length} of {totalElements} activities</span>
        {items.length < totalElements && (
          <oj-button chroming="outlined" disabled={controlsBusy || Boolean(editSession)} onojAction={() => void load({ ...query, page: (query.page ?? 0) + 1 }, true)}>
            {loadingMore ? "Loading…" : "Load more"}
          </oj-button>
        )}
      </footer>
    </section>
  );
}
