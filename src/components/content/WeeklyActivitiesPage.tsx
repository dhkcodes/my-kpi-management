import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  createWeeklyActivity,
  deleteWeeklyActivity,
  fetchWeeklyActivities,
  getDefaultWeeklyActivityRange,
  updateWeeklyActivity,
  WeeklyActivitiesQuery,
  WeeklyActivityRecord
} from "../../data/weeklyActivitiesApi";
import { SharedWeeklyActivityEditor } from "./SharedWeeklyActivityEditor";
import {
  hasWeeklyActivityFormattingParity,
  promoteWeeklyActivityListMarkerStyles,
  sanitizeWeeklyActivityHtml,
  WeeklyActivityDrafts,
  WeeklyActivityTarget
} from "./weeklyActivityEditorSession";
import {
  executeWeeklyActivityDelete,
  fetchWeeklyActivityLoadedWindow,
  isWeeklyActivityDraftDirty,
  LatestRequestGuard,
  reconcileWeeklyActivityMutation,
  resolveFocusAfterRemoval,
  validateWeeklyActivityDraft,
  weeklyActivityMatchesQuery
} from "./weeklyActivitiesPageState";
import "ojs/ojbutton";
import "ojs/ojdatetimepicker";
import "ojs/ojdialog";
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
  baselineWeekOfDate: string;
  baselineDrafts: WeeklyActivityDrafts;
  initialTarget: WeeklyActivityTarget;
}>;

type DialogElement = HTMLElement & { open: () => void; close: () => void };
type PostActionFocus =
  | Readonly<{ kind: "edit" | "delete"; activityId: number }>
  | Readonly<{ kind: "add" | "reload" }>;

const formatWeekDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

function ActivityContent({ html, label, onDblClick }: Readonly<{ html: string; label: string; onDblClick: () => void }>) {
  return <div class="weekly-activity-card__rich-text weekly-activity-card__rich-text--editable" aria-label={label} title="Double-click to edit" onDblClick={onDblClick} dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(html) }}></div>;
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
  const [rowError, setRowError] = useState<{ activityId: number; message: string } | null>(null);
  const [mutationWarning, setMutationWarning] = useState("");
  const [staleDeleteIds, setStaleDeleteIds] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WeeklyActivityRecord | null>(null);
  const [postActionFocus, setPostActionFocus] = useState<PostActionFocus | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const requestGuardRef = useRef(new LatestRequestGuard());
  const deleteDialogRef = useRef<DialogElement | null>(null);
  const dateInputRef = useRef<HTMLElement | null>(null);
  const addTriggerRef = useRef<HTMLElement | null>(null);
  const reloadTriggerRef = useRef<HTMLElement | null>(null);
  const editTriggerRefs = useRef(new Map<number, HTMLElement>());
  const deleteTriggerRefs = useRef(new Map<number, HTMLElement>());
  const editorFlushRef = useRef<(() => WeeklyActivityDrafts) | null>(null);
  const controlsBusy = loading || loadingMore || saving || deleting;
  const editSessionDirty = editSession ? isWeeklyActivityDraftDirty(
    editSession.weekOfDate,
    editSession.drafts,
    editSession.baselineWeekOfDate,
    editSession.baselineDrafts
  ) : false;

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
      if (!append) setExpanded(new Set());
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setTotalElements(page.totalElements);
      setQuery(nextQuery);
      if (!append) {
        setMutationWarning("");
        setStaleDeleteIds(new Set());
        setRowError(null);
      }
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
    onDirtyStateChange?.(editSessionDirty);
  }, [editSessionDirty, onDirtyStateChange]);

  useEffect(() => () => onDirtyStateChange?.(false), [onDirtyStateChange]);

  useEffect(() => {
    if (!editSessionDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editSessionDirty]);

  useEffect(() => {
    if (editSession?.mode !== "edit") return;
    requestAnimationFrame(() => dateInputRef.current?.focus());
  }, [editSession?.key]);

  useEffect(() => {
    if (!postActionFocus || controlsBusy) return;
    let target: HTMLElement | undefined | null;
    switch (postActionFocus.kind) {
      case "add": target = addTriggerRef.current; break;
      case "reload": target = reloadTriggerRef.current; break;
      case "edit": target = editTriggerRefs.current.get(postActionFocus.activityId); break;
      case "delete": target = deleteTriggerRefs.current.get(postActionFocus.activityId); break;
    }
    if (!target) return;
    requestAnimationFrame(() => target?.focus());
    setPostActionFocus(null);
  }, [postActionFocus, controlsBusy, items]);

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
    setRowError(null);
    const weekOfDate = getDefaultWeeklyActivityRange().toDate;
    const drafts = { thisWeekHtml: "", nextWeekHtml: "" };
    setEditSession({
      key: `add-${Date.now()}`,
      mode: "add",
      weekOfDate,
      drafts,
      baselineWeekOfDate: weekOfDate,
      baselineDrafts: drafts,
      initialTarget: "thisWeek"
    });
  };

  const startEdit = (record: WeeklyActivityRecord, initialTarget: WeeklyActivityTarget = "thisWeek") => {
    setEditError("");
    setRowError(null);
    setExpanded((current) => {
      const next = new Set(current);
      next.add(record.activityId);
      return next;
    });
    const drafts = { thisWeekHtml: record.thisWeekHtml, nextWeekHtml: record.nextWeekHtml };
    setEditSession({
      key: `edit-${record.activityId}-${record.versionNo}`,
      mode: "edit",
      activityId: record.activityId,
      versionNo: record.versionNo,
      weekOfDate: record.weekOfDate,
      drafts,
      baselineWeekOfDate: record.weekOfDate,
      baselineDrafts: drafts,
      initialTarget
    });
  };

  const cancelEdit = () => {
    const activityId = editSession?.activityId;
    setEditSession(null);
    setEditError("");
    setPostActionFocus(activityId ? { kind: "edit", activityId } : { kind: "add" });
  };

  const focusEditOrAdd = (activityId: number | null) => {
    setPostActionFocus(activityId ? { kind: "edit", activityId } : { kind: "add" });
  };

  const applyAuthoritativePage = (page: Awaited<ReturnType<typeof fetchWeeklyActivityLoadedWindow>>) => {
    setItems(page.items);
    setTotalElements(page.totalElements);
  };

  const save = async () => {
    const session = editSession;
    if (!session) return;
    const flushedDrafts = editorFlushRef.current?.() ?? session.drafts;
    const normalizedDrafts = {
      thisWeekHtml: promoteWeeklyActivityListMarkerStyles(sanitizeWeeklyActivityHtml(flushedDrafts.thisWeekHtml)),
      nextWeekHtml: promoteWeeklyActivityListMarkerStyles(sanitizeWeeklyActivityHtml(flushedDrafts.nextWeekHtml))
    };
    setEditSession((current) => current ? { ...current, drafts: normalizedDrafts } : current);
    const validation = validateWeeklyActivityDraft(session.weekOfDate, normalizedDrafts);
    if (validation) {
      setEditError(validation);
      return;
    }
    setSaving(true);
    setEditError("");
    setMutationWarning("");
    try {
      const request = {
        weekOfDate: session.weekOfDate,
        thisWeekHtml: normalizedDrafts.thisWeekHtml,
        nextWeekHtml: normalizedDrafts.nextWeekHtml
      };
      let saved: WeeklyActivityRecord;
      try {
        saved = session.mode === "add"
          ? await createWeeklyActivity(request)
          : await updateWeeklyActivity(session.activityId!, { ...request, versionNo: session.versionNo! });
      } catch (cause) {
        setEditError(cause instanceof Error ? cause.message : "Weekly Activity could not be saved.");
        return;
      }

      const formattingPreserved = hasWeeklyActivityFormattingParity(request.thisWeekHtml, saved.thisWeekHtml)
        && hasWeeklyActivityFormattingParity(request.nextWeekHtml, saved.nextWeekHtml);
      if (!formattingPreserved) {
        setItems((current) => reconcileWeeklyActivityMutation(current, saved, query));
        const baselineDrafts = { thisWeekHtml: saved.thisWeekHtml, nextWeekHtml: saved.nextWeekHtml };
        setEditSession({
          key: `edit-${saved.activityId}-${saved.versionNo}-format-retry`,
          mode: "edit",
          activityId: saved.activityId,
          versionNo: saved.versionNo,
          weekOfDate: saved.weekOfDate,
          drafts: normalizedDrafts,
          baselineWeekOfDate: saved.weekOfDate,
          baselineDrafts,
          initialTarget: session.initialTarget
        });
        setEditError("The running Backend removed requested formatting. Your draft remains open. Deploy or restart the matching Backend, reload, then retry.");
        return;
      }

      setItems((current) => reconcileWeeklyActivityMutation(current, saved, query));
      const savedMatchesQuery = weeklyActivityMatchesQuery(saved, query);
      if (session.mode === "add" && savedMatchesQuery) setTotalElements((current) => current + 1);
      if (session.mode === "edit" && !savedMatchesQuery) setTotalElements((current) => Math.max(0, current - 1));
      setEditSession(null);
      focusEditOrAdd(savedMatchesQuery ? saved.activityId : null);

      const requestId = requestGuardRef.current.begin();
      try {
        const authoritative = await fetchWeeklyActivityLoadedWindow(query);
        if (requestGuardRef.current.isLatest(requestId)) applyAuthoritativePage(authoritative);
      } catch {
        if (requestGuardRef.current.isLatest(requestId)) {
          setMutationWarning("Changes were saved, but the latest list could not be refreshed. Reload the list before making another change.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (record: WeeklyActivityRecord) => {
    setPendingDelete(record);
    setRowError(null);
    requestAnimationFrame(() => deleteDialogRef.current?.open());
  };

  const closeDeleteDialog = () => {
    const activityId = pendingDelete?.activityId;
    deleteDialogRef.current?.close();
    setPendingDelete(null);
    if (activityId) requestAnimationFrame(() => deleteTriggerRefs.current.get(activityId)?.focus());
  };

  const confirmDelete = async () => {
    const record = pendingDelete;
    if (!record) return;
    const focusActivityId = resolveFocusAfterRemoval(items, record.activityId);
    setDeleting(true);
    setRowError(null);
    setMutationWarning("");
    try {
      const outcome = await executeWeeklyActivityDelete(
        record,
        deleteWeeklyActivity,
        () => fetchWeeklyActivityLoadedWindow(query),
        () => {
          deleteDialogRef.current?.close();
          setPendingDelete(null);
          setItems((current) => current.filter(({ activityId }) => activityId !== record.activityId));
          setTotalElements((current) => Math.max(0, current - 1));
        }
      );

      if (outcome.status === "deleted") {
        if (outcome.page) applyAuthoritativePage(outcome.page);
        if (outcome.refreshError) {
          setMutationWarning("The activity was deleted, but the latest list could not be refreshed. Do not retry the delete; reload the list to confirm current data.");
        }
        focusEditOrAdd(focusActivityId);
        return;
      }

      deleteDialogRef.current?.close();
      setPendingDelete(null);
      if (outcome.status === "conflict") {
        if (outcome.page) {
          applyAuthoritativePage(outcome.page);
          setStaleDeleteIds((current) => {
            const next = new Set(current);
            next.delete(record.activityId);
            return next;
          });
          if (outcome.page.items.some(({ activityId }) => activityId === record.activityId)) {
            setRowError({ activityId: record.activityId, message: "This activity changed since it was loaded. The latest version is shown; review it before deleting again." });
            setPostActionFocus({ kind: "delete", activityId: record.activityId });
          } else {
            setMutationWarning("This activity was changed or deleted elsewhere. The list has been refreshed.");
            focusEditOrAdd(focusActivityId);
          }
        } else {
          setStaleDeleteIds((current) => new Set(current).add(record.activityId));
          setRowError({ activityId: record.activityId, message: "This activity changed since it was loaded. Reload the list before deleting again." });
          setMutationWarning("The delete was not performed and the latest version could not be loaded. Reload the list before retrying.");
          setPostActionFocus({ kind: "reload" });
        }
        return;
      }

      setRowError({ activityId: record.activityId, message: outcome.error?.message ?? "Weekly Activity could not be deleted." });
      setPostActionFocus({ kind: "delete", activityId: record.activityId });
    } finally {
      setDeleting(false);
    }
  };

  const renderAddEditor = (session: EditSession) => (
    <section class="weekly-activity-inline-editor" aria-label="Add weekly activity">
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
        initialTarget={session.initialTarget}
        registerFlush={(flush) => { editorFlushRef.current = flush; }}
        onDraftsChange={(drafts) => setEditSession((current) => current ? { ...current, drafts } : current)}
      />
      {editError && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{editError}</div>}
      <div class="weekly-activity-inline-editor__actions">
        <oj-button chroming="outlined" disabled={saving} onojAction={cancelEdit}>Cancel</oj-button>
        <oj-button chroming="callToAction" disabled={saving} onojAction={() => void save()}>{saving ? "Saving…" : "Save"}</oj-button>
      </div>
    </section>
  );

  const renderViewContent = (record: WeeklyActivityRecord, target: WeeklyActivityTarget) => {
    const html = target === "thisWeek" ? record.thisWeekHtml : record.nextWeekHtml;
    const label = target === "thisWeek" ? "This Week activities" : "Next Week activities";
    return <ActivityContent html={html} label={label} onDblClick={() => startEdit(record, target)} />;
  };

  return (
    <section id="weeklyActivitiesPage" class="weekly-activities-page" aria-labelledby="weeklyActivitiesTitle">
      <header class="weekly-activities-page__header">
        <div>
          <span class="kpi-eyebrow">Activity planning</span>
          <h2 id="weeklyActivitiesTitle">Weekly Activities</h2>
          <p>Review completed work and plan next-week actions in one weekly row.</p>
        </div>
        <oj-button ref={(element: EventTarget | null) => { addTriggerRef.current = element as HTMLElement | null; }} id="weeklyActivityAddButton" chroming="callToAction" disabled={Boolean(editSession) || controlsBusy} onojAction={startAdd}>
          <span slot="startIcon" class="oj-ux-ico-plus" aria-hidden="true"></span>
          Add Activity
        </oj-button>
      </header>

      <section class="weekly-activity-filters" aria-label="Weekly Activities filters">
        <oj-input-date id="weeklyActivityFromDate" labelHint="From Date" labelEdge="inside" value={filters.fromDate} disabled={Boolean(editSession) || controlsBusy} onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, fromDate: `${event.detail.value ?? ""}` }))}></oj-input-date>
        <oj-input-date id="weeklyActivityToDate" labelHint="To Date" labelEdge="inside" value={filters.toDate} disabled={Boolean(editSession) || controlsBusy} onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, toDate: `${event.detail.value ?? ""}` }))}></oj-input-date>
        <oj-input-text id="weeklyActivitySearch" labelHint="Content" labelEdge="inside" placeholder="Search This Week or Next Week" value={filters.search} disabled={Boolean(editSession) || controlsBusy} onvalueChanged={(event: CustomEvent) => setFilters((current) => ({ ...current, search: `${event.detail.value ?? ""}` }))} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter") submitSearch(); }}></oj-input-text>
        <div class="weekly-activity-filters__actions">
          <oj-button chroming="outlined" disabled={Boolean(editSession) || controlsBusy} onojAction={resetSearch}>Reset</oj-button>
          <oj-button id="weeklyActivitySearchButton" chroming="callToAction" disabled={Boolean(editSession) || controlsBusy} onojAction={submitSearch}>Search</oj-button>
        </div>
      </section>
      {filterError && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{filterError}</div>}
      {error && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{error}</div>}
      {mutationWarning && (
        <div class="weekly-activity-message weekly-activity-message--warning" role="alert">
          <span>{mutationWarning}</span>
          <oj-button ref={(element: EventTarget | null) => { reloadTriggerRef.current = element as HTMLElement | null; }} chroming="outlined" disabled={controlsBusy || Boolean(editSession)} onojAction={() => void load(query, false, false)}>Reload list</oj-button>
        </div>
      )}

      {editSession?.mode === "add" && (
        <article class="weekly-activity-card weekly-activity-card--editing">
          <header class="weekly-activity-card__header"><h3>New Weekly Activity</h3></header>
          {renderAddEditor(editSession)}
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
            const isCollapsed = !expanded.has(record.activityId);
            const isEditing = editSession?.mode === "edit" && editSession.activityId === record.activityId;
            return (
              <article key={record.activityId} class={isEditing ? "weekly-activity-card weekly-activity-card--editing" : "weekly-activity-card"}>
                <header class="weekly-activity-card__header">
                  <button type="button" class="weekly-activity-disclosure" disabled={isEditing} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${formatWeekDate(record.weekOfDate)}`} onClick={() => setExpanded((current) => { const next = new Set(current); next.has(record.activityId) ? next.delete(record.activityId) : next.add(record.activityId); return next; })}>
                    <span class={isCollapsed ? "oj-ux-ico-chevron-right" : "oj-ux-ico-chevron-down"} aria-hidden="true"></span>
                  </button>
                  {isEditing && editSession ? (
                    <oj-input-date ref={dateInputRef} id={`weeklyActivityWeekDate-${editSession.key}`} class="weekly-activity-card__date-editor" labelHint="Week Date" labelEdge="none" value={editSession.weekOfDate} disabled={saving} onvalueChanged={(event: CustomEvent) => setEditSession((current) => current ? { ...current, weekOfDate: `${event.detail.value ?? ""}` } : current)}></oj-input-date>
                  ) : <h3>{formatWeekDate(record.weekOfDate)}</h3>}
                  <div class="weekly-activity-card__actions">
                    {isEditing ? (
                      <>
                        <oj-button key={`cancel-${record.activityId}`} chroming="outlined" disabled={saving} onojAction={cancelEdit}>Cancel</oj-button>
                        <oj-button key={`save-${record.activityId}`} chroming="callToAction" disabled={saving} onojAction={() => void save()}>{saving ? "Saving…" : "Save"}</oj-button>
                      </>
                    ) : (
                      <>
                        <oj-button key={`edit-${record.activityId}`} ref={(element: EventTarget | null) => { const trigger = element as HTMLElement | null; trigger ? editTriggerRefs.current.set(record.activityId, trigger) : editTriggerRefs.current.delete(record.activityId); }} chroming="borderless" aria-label={`Edit ${formatWeekDate(record.weekOfDate)}`} disabled={Boolean(editSession) || controlsBusy} onojAction={() => startEdit(record)}><span slot="startIcon" class="oj-ux-ico-edit" aria-hidden="true"></span></oj-button>
                        <oj-button key={`delete-${record.activityId}`} ref={(element: EventTarget | null) => { const trigger = element as HTMLElement | null; trigger ? deleteTriggerRefs.current.set(record.activityId, trigger) : deleteTriggerRefs.current.delete(record.activityId); }} chroming="borderless" aria-label={`Delete ${formatWeekDate(record.weekOfDate)}`} disabled={Boolean(editSession) || controlsBusy || staleDeleteIds.has(record.activityId)} onojAction={() => requestDelete(record)}><span slot="startIcon" class="oj-ux-ico-trash" aria-hidden="true"></span></oj-button>
                      </>
                    )}
                  </div>
                </header>
                {!isCollapsed && (
                  isEditing && editSession ? (
                    <div class="weekly-activity-card__inline-edit" aria-label={`Edit ${formatWeekDate(record.weekOfDate)}`}>
                      <SharedWeeklyActivityEditor key={editSession.key} drafts={editSession.drafts} disabled={saving} initialTarget={editSession.initialTarget} registerFlush={(flush) => { editorFlushRef.current = flush; }} onDraftsChange={(drafts) => setEditSession((current) => current ? { ...current, drafts } : current)} />
                      {editError && <div class="weekly-activity-message weekly-activity-message--error" role="alert">{editError}</div>}
                    </div>
                  ) : (
                    <div class="weekly-activity-card__sections">
                      <section aria-labelledby={`completed-${record.activityId}`}>
                        <h4 id={`completed-${record.activityId}`} class="weekly-activity-section-label weekly-activity-section-label--this-week">This Week</h4>
                        {renderViewContent(record, "thisWeek")}
                      </section>
                      <div class="weekly-activity-direction" aria-hidden="true">↓</div>
                      <section aria-labelledby={`planned-${record.activityId}`}>
                        <h4 id={`planned-${record.activityId}`} class="weekly-activity-section-label weekly-activity-section-label--next-week">Next Week</h4>
                        {renderViewContent(record, "nextWeek")}
                      </section>
                    </div>
                  )
                )}
                {rowError?.activityId === record.activityId && <div class="weekly-activity-message weekly-activity-message--error weekly-activity-message--row" role="alert">{rowError.message}</div>}
              </article>
            );
          })}
        </div>
      )}

      <footer class="weekly-activities-page__footer">
        <span>{items.length} of {totalElements} activities</span>
        {items.length < totalElements && <oj-button chroming="outlined" disabled={controlsBusy || Boolean(editSession)} onojAction={() => void load({ ...query, page: (query.page ?? 0) + 1 }, true)}>{loadingMore ? "Loading…" : "Load more"}</oj-button>}
      </footer>

      <oj-dialog ref={deleteDialogRef} class="weekly-activity-delete-dialog" initialVisibility="hide" modality="modal" cancelBehavior="escape" dragAffordance="none" resizeBehavior="none" dialogTitle="Delete weekly activity?" onojClose={() => { if (!deleting) { const activityId = pendingDelete?.activityId; setPendingDelete(null); if (activityId) requestAnimationFrame(() => deleteTriggerRefs.current.get(activityId)?.focus()); } }}>
        <div class="weekly-activity-delete-content">
          <p>{pendingDelete ? `${formatWeekDate(pendingDelete.weekOfDate)} and both activity columns will be permanently deleted. This action cannot be undone.` : "This action cannot be undone."}</p>
          <div class="weekly-activity-delete-actions">
            <oj-button chroming="outlined" disabled={deleting} onojAction={closeDeleteDialog}>Cancel</oj-button>
            <oj-button chroming="danger" disabled={deleting} onojAction={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete"}</oj-button>
          </div>
        </div>
      </oj-dialog>
    </section>
  );
}
