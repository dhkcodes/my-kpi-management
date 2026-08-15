import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  createWeeklyActivity,
  fetchWeeklyActivities,
  getDefaultWeeklyActivityRange,
  updateWeeklyActivity,
  WeeklyActivitiesQuery,
  WeeklyActivityRecord
} from "../../data/weeklyActivitiesApi";
import { SharedWeeklyActivityEditor } from "./SharedWeeklyActivityEditor";
import { WeeklyActivityDrafts } from "./weeklyActivityEditorSession";
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

const plainText = (html: string) => {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const document = new DOMParser().parseFromString(html, "text/html");
  return (document.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
};

const validateDraft = (session: EditSession): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.weekOfDate)) return "Select a valid Week Date.";
  const thisWeekText = plainText(session.drafts.thisWeekHtml);
  const nextWeekText = plainText(session.drafts.nextWeekHtml);
  if (!thisWeekText || !nextWeekText) return "Both Completed and Planned activities require meaningful content. Use ‘None’ when applicable.";
  if (thisWeekText.length > 20_000 || nextWeekText.length > 20_000 || thisWeekText.length + nextWeekText.length > 40_000) {
    return "Each activity field is limited to 20,000 plain-text characters (40,000 total).";
  }
  return "";
};

const formatWeekDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

function ActivityContent({ html, label }: Readonly<{ html: string; label: string }>) {
  return <div class="weekly-activity-card__rich-text" aria-label={label} dangerouslySetInnerHTML={{ __html: html }}></div>;
}

export function WeeklyActivitiesPage() {
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

  const load = async (nextQuery: WeeklyActivitiesQuery, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const page = await fetchWeeklyActivities(nextQuery);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setTotalElements(page.totalElements);
      setQuery(nextQuery);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Weekly Activities could not be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { void load(query); }, []);

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
    const validation = validateDraft(session);
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
      if (session.mode === "add") {
        await createWeeklyActivity(request);
      } else {
        await updateWeeklyActivity(session.activityId!, { ...request, versionNo: session.versionNo! });
      }
      setEditSession(null);
      await load({ ...query, page: 0 });
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
        <oj-button id="weeklyActivityAddButton" chroming="callToAction" disabled={Boolean(editSession) || saving} onojAction={startAdd}>
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
          disabled={Boolean(editSession) || loading}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, fromDate: `${event.detail.value ?? ""}` }))}>
        </oj-input-date>
        <oj-input-date
          id="weeklyActivityToDate"
          labelHint="To Date"
          labelEdge="inside"
          value={filters.toDate}
          disabled={Boolean(editSession) || loading}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, toDate: `${event.detail.value ?? ""}` }))}>
        </oj-input-date>
        <oj-input-text
          id="weeklyActivitySearch"
          labelHint="Content"
          labelEdge="inside"
          placeholder="Search Completed or Planned"
          value={filters.search}
          disabled={Boolean(editSession) || loading}
          onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, search: `${event.detail.value ?? ""}` }))}
          onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter") submitSearch(); }}>
        </oj-input-text>
        <div class="weekly-activity-filters__actions">
          <oj-button chroming="outlined" disabled={Boolean(editSession) || loading} onojAction={resetSearch}>Reset</oj-button>
          <oj-button id="weeklyActivitySearchButton" chroming="callToAction" disabled={Boolean(editSession) || loading} onojAction={submitSearch}>Search</oj-button>
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
                  <oj-button chroming="borderless" disabled={Boolean(editSession) || saving} onojAction={() => startEdit(record)}>Edit</oj-button>
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
          <oj-button chroming="outlined" disabled={loadingMore || Boolean(editSession)} onojAction={() => void load({ ...query, page: (query.page ?? 0) + 1 }, true)}>
            {loadingMore ? "Loading…" : "Load more"}
          </oj-button>
        )}
      </footer>
    </section>
  );
}
