import { Fragment, h, render } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { ImmutableKeySet, KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojtable";
import "ojs/ojdatetimepicker";
import "ojs/ojdialog";
import "ojs/ojbutton";
import "ojs/ojpopup";
import { ojPopup } from "ojs/ojpopup";
import { Selector } from "oj-c/selector";
import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import {
  buildKpiSummary,
  createEmptyKpiRow,
  formatKpiWorkloadOption,
  getSelectedKpiRowIds,
  getKpiToolbarActions,
  getMonthsForQuarter,
  getQuarterStatus,
  getRowsForQuarter,
  isD1QuarterAchieved,
  isKpiFieldChanged,
  isKpiDraftInvalid,
  isKpiRowChanged,
  KPI_FIELD_CONTRACTS,
  KpiField,
  KpiFieldKey,
  KpiSpreadsheetRow,
  SpreadsheetKpiCode
} from "../../data/kpiSpreadsheet";
import {
  deleteKpiRow,
  KpiOverviewItem,
  KpiWorkloadOption,
  listKpiOverview,
  listKpiRows,
  listKpiWorkloadOptions,
  saveKpiRow
} from "../../data/kpiSpreadsheetApi";
import {
  getKpiTabForRoute,
  KPI_ACTIVITY_TABS,
  KPI_OVERVIEW_ROWS,
  KPI_QUARTER_COUNT_TARGETS,
  KpiActivityTab
} from "../../data/kpiWorkspaceDefinition";

const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];
const stageLabels: Record<WorkloadStage, string> = { identified: "Identified", validated: "Validated", onboarded: "Onboarded" };
const stageTargets: Record<WorkloadStage, number> = { identified: 2000, validated: 1000, onboarded: 500 };
const activities = ["Solution Design", "Solution Proposal", "Solution Deployment"];

type ActiveCell = Readonly<{ rowId: string; field: KpiFieldKey }>;
export type KpiNavigationGuard = (label: string, action: () => void) => void;

const immutableSelectedIds = (keySet: ImmutableKeySet<string>, availableIds: readonly string[]) => {
  const keys = keySet.keys;
  if (keys.all) {
    const deleted = keys.deletedKeys;
    return availableIds.filter((id) => !deleted.has(id));
  }
  return Array.from(keys.keys.values());
};

const displayValue = (row: KpiSpreadsheetRow, key: KpiFieldKey) => key === "manageTimeReflected"
  ? (row.manageTimeReflected ? "Reflected" : "Pending")
  : key === "stage" && row.stage ? stageLabels[row.stage] : row[key] === null ? "—" : String(row[key] || "—");

function KpiWorkspaceTabs({ routeId, onNavigate }: Readonly<{
  routeId: string;
  onNavigate: (routeId: string) => void;
}>) {
  const activeTab = getKpiTabForRoute(routeId);
  return <nav class="kpi-sheet-tabs" aria-label="KPI Activities tabs">
    {KPI_ACTIVITY_TABS.map((item) => <button type="button" class={item.tab === activeTab ? "is-active" : ""}
      aria-selected={item.tab === activeTab} onClick={() => onNavigate(item.routeId)}>
      {item.tab !== "Overview" && <span class="kpi-sheet-tab-code" aria-hidden="true">{item.tab}</span>}
      <span>{item.label}</span>
    </button>)}
  </nav>;
}


function Summary({ rows, tab, fiscalYear, asOf, selectedQuarter, onSelectQuarter }: Readonly<{
  rows: KpiSpreadsheetRow[];
  tab: SpreadsheetKpiCode;
  fiscalYear: FiscalYear;
  asOf: string;
  selectedQuarter: Quarter | null;
  onSelectQuarter: (quarter: Quarter | null) => void;
}>) {
  const summary = buildKpiSummary(rows);
  const statusFor = (quarter: Quarter) => {
    if (tab === "D1") return getQuarterStatus(fiscalYear, quarter, isD1QuarterAchieved(summary.d1[quarter]) ? 1 : 0, 1, asOf);
    if (tab === "C1" || tab === "C2") {
      const combined = summary.c1c2Combined[quarter];
      return getQuarterStatus(fiscalYear, quarter, combined.actual, combined.target, asOf);
    }
    return getQuarterStatus(fiscalYear, quarter, summary.quarterly[tab][quarter], KPI_QUARTER_COUNT_TARGETS[tab as keyof typeof KPI_QUARTER_COUNT_TARGETS] ?? 1, asOf);
  };
  const cardClass = (quarter: Quarter, base: string) => `${base}${selectedQuarter === quarter ? " is-selected" : ""}`;
  if (tab === "D1") {
    return <section class="kpi-sheet-summary" aria-labelledby="kpiD1Summary">
      <div class="kpi-sheet-summary__heading"><h3 id="kpiD1Summary">Sales Stage ACR <small>USD K</small></h3></div>
      <div class="kpi-d1-progress-grid" aria-label="Sales Stage ACR USD K by Delivery Date fiscal quarter">
        {quarters.map((quarter) => <button type="button" class={cardClass(quarter, "kpi-d1-progress-quarter")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
          <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em>{statusFor(quarter)}</em></span>
          {stages.map((stage) => {
            const actual = summary.d1[quarter][stage];
            const target = stageTargets[stage];
            const percent = Math.min(100, Math.round((actual / target) * 100));
            return <span class="kpi-d1-progress-item">
              <span class="kpi-d1-progress-label"><span>{stageLabels[stage]}</span><strong>{actual.toLocaleString()} / {target.toLocaleString()}K</strong></span>
              <span class="kpi-d1-progress-track" role="progressbar" aria-label={`${quarter} ${stageLabels[stage]} ${actual} of ${target}K`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={actual}>
                <span class={`kpi-d1-progress-fill kpi-d1-progress-fill--${stage}`} style={{ width: `${percent}%` }}></span>
              </span>
            </span>;
          })}
        </button>)}
      </div>
    </section>;
  }
  const isCombined = tab === "C1" || tab === "C2";
  return <section class="kpi-sheet-summary" aria-labelledby="kpiQuarterSummary">
    <div class="kpi-sheet-summary__heading"><h3 id="kpiQuarterSummary">Target Quarter count</h3></div>
    <div class="kpi-quarter-summary">{quarters.map((quarter) => {
      const actual = isCombined ? summary.c1c2Combined[quarter].actual : summary.quarterly[tab][quarter];
      return <button type="button" class={cardClass(quarter, "kpi-quarter-card")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
        <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em>{statusFor(quarter)}</em></span>
        <b>{actual}</b>{isCombined && <small>C1 + C2 reflected</small>}
      </button>;
    })}</div>
  </section>;
}

function WorkloadCellEditor({ fiscalYear, row, onChange, onCommit }: Readonly<{
  fiscalYear: FiscalYear;
  row: KpiSpreadsheetRow;
  onChange: (option: KpiWorkloadOption) => void;
  onCommit: () => void;
}>) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KpiWorkloadOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryRef = useRef("");
  const requestVersion = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<ojPopup | null>(null);

  useEffect(() => {
    const popup = popupRef.current;
    return () => { if (popup?.isOpen()) popup.close(); };
  }, []);

  useEffect(() => {
    let active = true;
    const requestVersionAtStart = ++requestVersion.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listKpiWorkloadOptions(fiscalYear, query, 0).then((page) => {
        if (active && requestVersion.current === requestVersionAtStart && queryRef.current === query) {
          setOptions(page.items); setOffset(page.items.length); setHasMore(page.hasMore);
        }
      }).catch(() => {
        if (active && requestVersion.current === requestVersionAtStart) { setOptions([]); setOffset(0); setHasMore(false); }
      }).finally(() => { if (active && requestVersion.current === requestVersionAtStart) setLoading(false); });
    }, 200);
    return () => { active = false; requestVersion.current += 1; window.clearTimeout(timer); };
  }, [fiscalYear, query]);

  const choose = (option: KpiWorkloadOption) => {
    popupRef.current?.close();
    onChange(option);
    onCommit();
  };
  const loadMore = () => {
    if (loading || !hasMore) return;
    const requestVersionAtStart = requestVersion.current;
    const requestedQuery = query;
    setLoading(true);
    void listKpiWorkloadOptions(fiscalYear, query, offset).then((page) => {
      if (requestVersion.current !== requestVersionAtStart || queryRef.current !== requestedQuery) return;
      setOptions((current) => [...current, ...page.items]);
      setOffset((current) => current + page.items.length);
      setHasMore(page.hasMore);
    }).catch(() => undefined)
      .finally(() => { if (requestVersion.current === requestVersionAtStart) setLoading(false); });
  };

  useEffect(() => {
    const popup = popupRef.current;
    const launcher = inputRef.current;
    if (!popup || !launcher || (options.length === 0 && !loading)) return;
    if (popup.isOpen()) popup.refresh();
    else popup.open(launcher, {
      my: { horizontal: "start", vertical: "top" },
      at: { horizontal: "start", vertical: "bottom" },
      collision: "flipfit"
    });
  }, [loading, options]);

  return <div class="kpi-workload-cell-editor">
    <input ref={inputRef} type="search" value={query} aria-label="Search Account, Workload, or Oppty.No"
      placeholder={row.accountWorkload || "Search Account, Workload, or Oppty.No"}
      onInput={(event) => { const next = (event.currentTarget as HTMLInputElement).value; queryRef.current = next; setQuery(next); }}
      onKeyDown={(event) => { if (event.key === "Enter" && options[0]) { event.preventDefault(); choose(options[0]); } }} />
    <oj-popup ref={popupRef} class="kpi-workload-results-popup" autoDismiss="focusLoss" initialFocus="none" modality="modeless" tail="none"
      position={{ my: { horizontal: "start", vertical: "top" }, at: { horizontal: "start", vertical: "bottom" }, collision: "flipfit" }}>
      <div class="kpi-workload-cell-editor__results" role="listbox" aria-label="Workload search results"
        onScroll={(event) => { const target = event.currentTarget as HTMLDivElement; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 8) loadMore(); }}>
        {options.map((option) => <button type="button" role="option" title={formatKpiWorkloadOption(option)}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <strong>{formatKpiWorkloadOption(option)}</strong><small>Workload ID {option.workloadId}</small>
        </button>)}
        {loading && <span>Loading…</span>}
        {!loading && options.length === 0 && <span>No matching workload.</span>}
        {hasMore && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={loadMore}>Load 10 more</button>}
      </div>
    </oj-popup>
  </div>;
}

function BufferedFieldEditor({ field, value, onChange, onCommit }: Readonly<{
  field: KpiField;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}>) {
  const [editorValue, setEditorValue] = useState(value);
  useEffect(() => setEditorValue(value), [value]);
  const commit = () => onChange(editorValue);
  const commitOnEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || (field.type === "textarea" && event.shiftKey)) return;
    event.preventDefault();
    commit();
    onCommit();
  };
  if (field.type === "textarea") return <textarea class="kpi-cell-editor kpi-cell-editor--textarea" value={editorValue}
    aria-label={field.label} onInput={(event) => setEditorValue((event.currentTarget as HTMLTextAreaElement).value)}
    onBlur={commit} onKeyDown={commitOnEnter}></textarea>;
  return <input class="kpi-cell-editor" type={field.type === "number" ? "number" : "text"}
    min={field.type === "number" ? "0" : undefined} value={editorValue} aria-label={field.label}
    onInput={(event) => setEditorValue((event.currentTarget as HTMLInputElement).value)} onBlur={commit} onKeyDown={commitOnEnter} />;
}

function FieldEditor({ field, row, fiscalYear, onChange, onWorkloadChange, onCommit }: Readonly<{
  field: KpiField;
  row: KpiSpreadsheetRow;
  fiscalYear: FiscalYear;
  onChange: (key: KpiFieldKey, value: string) => void;
  onWorkloadChange: (option: KpiWorkloadOption) => void;
  onCommit: () => void;
}>) {
  const value = row[field.key] === null ? "" : String(row[field.key]);
  const commitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") { event.preventDefault(); onCommit(); }
  };
  if (field.type === "workload") return <WorkloadCellEditor fiscalYear={fiscalYear} row={row} onChange={onWorkloadChange} onCommit={onCommit} />;
  if (field.type === "date") return <oj-input-date class="kpi-cell-editor kpi-cell-editor--date" labelHint={field.label} labelEdge="none"
    value={value} onvalueChanged={(event: CustomEvent) => onChange(field.key, `${event.detail.value ?? ""}`)} onKeyDown={commitOnEnter}></oj-input-date>;
  if (field.type === "manageTime") return <select class="kpi-cell-editor" value={row.manageTimeReflected ? "Reflected" : "Pending"} aria-label="Manage Time"
    onChange={(event) => onChange(field.key, String((event.currentTarget as HTMLSelectElement).value === "Reflected"))} onKeyDown={commitOnEnter}>
    <option value="Pending">Pending</option><option value="Reflected">Reflected</option>
  </select>;
  const options = field.type === "quarter" ? quarters
    : field.type === "month" ? getMonthsForQuarter(row.kpiCode === "D1" ? (row.targetQuarter || "Q1") : row.quarter)
      : field.type === "stage" ? stages : field.type === "activity" ? activities : null;
  if (options) return <select class="kpi-cell-editor" value={value} aria-label={field.label}
    onChange={(event) => onChange(field.key, (event.currentTarget as HTMLSelectElement).value)} onKeyDown={commitOnEnter}>
    {options.map((option) => <option value={option}>{field.type === "stage" ? stageLabels[option as WorkloadStage] : option}</option>)}
  </select>;
  return <BufferedFieldEditor field={field} value={value} onChange={(next) => onChange(field.key, next)} onCommit={onCommit} />;
}

export function KpiSpreadsheetPage({ fiscalYear, routeId, onNavigate, onNavigationGuardChange }: Readonly<{
  fiscalYear: FiscalYear;
  routeId: string;
  onNavigate: (routeId: string) => void;
  onNavigationGuardChange: (guard: KpiNavigationGuard | null) => void;
}>) {
  const activeTab = getKpiTabForRoute(routeId);
  const [rows, setRows] = useState<KpiSpreadsheetRow[]>([]);
  const [overviewItems, setOverviewItems] = useState<KpiOverviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<KpiSpreadsheetRow[]>([]);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiMessage, setApiMessage] = useState("Loading KPI activities…");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [pendingNavigation, setPendingNavigation] = useState<null | { label: string; action: () => void }>(null);

  const [descriptionPopup, setDescriptionPopup] = useState("");
  const navigationDialogRef = useRef<any>(null);
  const deleteDialogRef = useRef<any>(null);
  const navigationStayButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const descriptionPopupRef = useRef<any>(null);
  const descriptionPopupOpenTimerRef = useRef(0);
  const sessionVersion = useRef(0);
  const sessionKeyRef = useRef(`${routeId}:${fiscalYear}`);
  sessionKeyRef.current = `${routeId}:${fiscalYear}`;
  const requestProtectedNavigation = useCallback<KpiNavigationGuard>((label, action) => {
    if (drafts.length === 0) { action(); return; }
    setPendingNavigation({ label, action });
    window.setTimeout(() => navigationDialogRef.current?.open(), 0);
  }, [drafts.length]);

  useEffect(() => {
    onNavigationGuardChange(drafts.length > 0 ? requestProtectedNavigation : null);
    return () => onNavigationGuardChange(null);
  }, [drafts.length, onNavigationGuardChange, requestProtectedNavigation]);
  useEffect(() => () => window.clearTimeout(descriptionPopupOpenTimerRef.current), []);

  useEffect(() => {
    sessionVersion.current += 1;
    setDrafts([]); setActiveCell(null); setSelectedIds(new Set()); setSelectedQuarter(null);
  }, [routeId, fiscalYear]);
  useEffect(() => {
    let active = true;
    setRows([]); setOverviewItems([]); setApiMessage("Loading KPI activities…");
    void Promise.all([listKpiRows(fiscalYear), listKpiOverview(fiscalYear)]).then(([items, overview]) => {
      if (active) {
        setRows(items);
        setOverviewItems(overview.items); setAsOf(overview.asOf);
        setApiMessage(`Live API connected · ${items.length} activities · as of ${overview.asOf}`);
      }
    }).catch(() => { if (active) setApiMessage("KPI API unavailable — no fallback customer data is shown"); });
    return () => { active = false; };
  }, [fiscalYear, reloadVersion]);
  useEffect(() => {
    if (!activeCell) return;
    let cancelled = false;
    let attempts = 0;
    let frame = 0;
    let settleTimer = 0;
    const focusEditor = () => {
      if (cancelled) return;
      const wrapper = document.querySelector(`[data-kpi-editor-row="${activeCell.rowId}"][data-kpi-editor-field="${activeCell.field}"]`);
      const editor = wrapper?.querySelector("input, select, textarea, oj-input-date") as HTMLElement | null;
      if (editor) {
        editor.focus();
        settleTimer = window.setTimeout(() => {
          const focused = document.activeElement as HTMLElement | null;
          if (!cancelled && (focused === document.body || focused?.tagName === "OJ-TABLE")) editor.focus();
        }, 150);
        return;
      }
      if (attempts++ < 20) frame = window.requestAnimationFrame(focusEditor);
    };
    frame = window.requestAnimationFrame(focusEditor);
    return () => { cancelled = true; window.cancelAnimationFrame(frame); window.clearTimeout(settleTimer); };
  }, [activeCell]);

  const authoritativeRows = useMemo(() => activeTab === "Overview" ? rows : rows.filter((row) => row.kpiCode === activeTab), [rows, activeTab]);
  const fields = activeTab === "Overview" ? [] : KPI_FIELD_CONTRACTS[activeTab];
  const effectiveRows = useMemo(() => {
    const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
    return [...drafts.filter((draft) => draft.id.startsWith("draft-")), ...authoritativeRows.map((row) => draftById.get(row.id) ?? row)];
  }, [authoritativeRows, drafts]);
  const summaryRows = useMemo(() => {
    const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
    return [...drafts.filter((draft) => draft.id.startsWith("draft-")), ...rows.map((row) => draftById.get(row.id) ?? row)];
  }, [rows, drafts]);
  const visibleRows = useMemo(() => getRowsForQuarter(effectiveRows, selectedQuarter), [effectiveRows, selectedQuarter]);
  const dataProvider = useMemo(() => new ArrayDataProvider<string, KpiSpreadsheetRow>(visibleRows, { keyAttributes: "id" }), [visibleRows]);
  const selectedRows = visibleRows.filter((row) => selectedIds.has(row.id) && !row.id.startsWith("draft-"));
  const activeDefinition = KPI_OVERVIEW_ROWS.find((row) => row.code === activeTab);
  const overviewByCode = useMemo(() => new Map(overviewItems.map((item) => [item.code, item])), [overviewItems]);
  const toolbarActions = getKpiToolbarActions(drafts.length, selectedRows.length);
  const invalidDraftCount = drafts.filter((draft) => isKpiDraftInvalid(draft, rows.find((row) => row.id === draft.id))).length;
  const reflectedRequirementsMissing = drafts.some((draft) => draft.manageTimeReflected
    && (!draft.deliveryDate || (draft.kpiCode !== "H" && !draft.srNumber.trim())));
  const saveDisabled = drafts.length === 0 || saving || drafts.some((draft) =>
    isKpiDraftInvalid(draft, authoritativeRows.find((row) => row.id === draft.id)));

  const beginCellEdit = (row: KpiSpreadsheetRow, field: KpiField) => {
    if (saving) return;
    setActiveCell({ rowId: row.id, field: field.key });
  };
  const reconcileDraft = (current: KpiSpreadsheetRow[], updated: KpiSpreadsheetRow) => {
    const saved = rows.find((item) => item.id === updated.id);
    const keep = updated.id.startsWith("draft-") || !saved || isKpiRowChanged(saved, updated, fields);
    if (!keep) return current.filter((draft) => draft.id !== updated.id);
    return current.some((draft) => draft.id === updated.id)
      ? current.map((draft) => draft.id === updated.id ? updated : draft)
      : [...current, updated];
  };
  const updateDraft = (row: KpiSpreadsheetRow, key: KpiFieldKey, value: string) => {
    setDrafts((current) => {
      const source = current.find((draft) => draft.id === row.id) ?? row;
      const updated = {
        ...source,
        [key]: key === "acrK" ? (value === "" ? null : Number(value)) : key === "manageTimeReflected" ? value === "true" : value
      } as KpiSpreadsheetRow;
      return reconcileDraft(current, updated);
    });
  };
  const selectWorkload = (row: KpiSpreadsheetRow, option: KpiWorkloadOption) => {
    setDrafts((current) => {
      const source = current.find((draft) => draft.id === row.id) ?? row;
      const updated = { ...source, workloadId: option.workloadId, mappingStatus: "VERIFIED" as const, accountWorkload: formatKpiWorkloadOption(option) };
      return reconcileDraft(current, updated);
    });
  };
  const cancelDrafts = () => {
    setDrafts([]); setActiveCell(null); setSelectedIds(new Set()); setApiMessage("Unsaved KPI changes cancelled");
  };
  const selectQuarter = (quarter: Quarter | null) => {
    setSelectedIds(new Set()); setActiveCell(null);
    setSelectedQuarter((current) => current === quarter ? null : quarter);
  };
  const cancelDescriptionPopupOpen = () => {
    window.clearTimeout(descriptionPopupOpenTimerRef.current);
    descriptionPopupOpenTimerRef.current = 0;
  };
  const openDescriptionPopup = (anchor: HTMLElement, value: string) => {
    cancelDescriptionPopupOpen();
    setDescriptionPopup(value);
    descriptionPopupOpenTimerRef.current = window.setTimeout(() => {
      descriptionPopupOpenTimerRef.current = 0;
      descriptionPopupRef.current?.open(anchor);
    }, 0);
  };
  const closeDescriptionPopup = () => {
    cancelDescriptionPopupOpen();
    descriptionPopupRef.current?.close();
  };
  const addDraft = () => {
    const draft = createEmptyKpiRow(activeTab as SpreadsheetKpiCode, fiscalYear);
    setDrafts((current) => [...current, draft]);
    setActiveCell({ rowId: draft.id, field: KPI_FIELD_CONTRACTS[draft.kpiCode].find((field) => field.key !== "manageTimeReflected")?.key ?? "title" });
  };
  const saveDrafts = async (): Promise<boolean> => {
    if (drafts.length === 0) return true;
    if (saving || saveDisabled) return false;
    const saveSession = sessionVersion.current;
    const saveSessionKey = sessionKeyRef.current;
    const draftSnapshot = drafts;
    setSaving(true); setActiveCell(null);
    const outcomes = await Promise.allSettled(draftSnapshot.map((draft) => saveKpiRow(draft)));
    const saved = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const failedDrafts = draftSnapshot.filter((_, index) => outcomes[index].status === "rejected");
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      setSaving(false); setReloadVersion((current) => current + 1); return false;
    }
    if (saved.length > 0) setRows((current) => {
      const savedByOldId = new Map(draftSnapshot.map((draft, index) => [draft.id, outcomes[index].status === "fulfilled" ? outcomes[index].value : null]));
      const next = current.map((row) => savedByOldId.get(row.id) ?? row).filter(Boolean) as KpiSpreadsheetRow[];
      return [...next, ...draftSnapshot.flatMap((draft, index) => draft.id.startsWith("draft-") && outcomes[index].status === "fulfilled" ? [outcomes[index].value] : [])];
    });
    setDrafts(failedDrafts);
    setSelectedIds(new Set(failedDrafts.map((row) => row.id)));
    setApiMessage(failedDrafts.length === 0 ? `${saved.length} KPI activity row(s) saved` : `${saved.length} saved · ${failedDrafts.length} failed`);
    setSaving(false);
    return failedDrafts.length === 0;
  };
  const removeSelected = async () => {
    if (saving || selectedRows.length === 0) return;
    const deleteSession = sessionVersion.current;
    const deleteSessionKey = sessionKeyRef.current;
    const rowsToDelete = selectedRows;
    setSaving(true);
    const outcomes = await Promise.allSettled(rowsToDelete.map((row) => deleteKpiRow(row)));
    if (sessionVersion.current !== deleteSession || sessionKeyRef.current !== deleteSessionKey) {
      setSaving(false); setReloadVersion((current) => current + 1); return;
    }
    const deletedIds = new Set(rowsToDelete.filter((_, index) => outcomes[index].status === "fulfilled").map((row) => row.id));
    const failedIds = rowsToDelete.filter((_, index) => outcomes[index].status === "rejected").map((row) => row.id);
    setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
    setDrafts((current) => current.filter((row) => !deletedIds.has(row.id)));
    setSelectedIds(new Set(failedIds));
    setApiMessage(failedIds.length === 0 ? `${deletedIds.size} KPI activity row(s) deleted` : `${deletedIds.size} deleted · ${failedIds.length} failed`);
    setSaving(false);
  };

  const renderKpiRow = (context: { data: KpiSpreadsheetRow; parentElement: Element }) => {
    const row = context.data;
    const saved = authoritativeRows.find((item) => item.id === row.id);
    const rowDirty = !saved || isKpiRowChanged(saved, row, fields);
    context.parentElement.className = [
      selectedIds.has(row.id) ? "is-selected" : "",
      rowDirty ? "is-unsaved-row" : "",
      row.manageTimeReflected ? "kpi-manage-time-reflected-row" : ""
    ].filter(Boolean).join(" ");
    render(<Fragment>
      <td class="kpi-selector-cell">
        <Selector rowKey={row.id} selectedKeys={new KeySetImpl(selectedIds)} selectionMode="multiple"
          aria-label={`Select KPI activity ${row.id}`}
          onSelectedKeysChanged={(keySet) => setSelectedIds(new Set(immutableSelectedIds(keySet, visibleRows.map((item) => item.id))))} />
      </td>
      {fields.map((field) => {
      const editing = row.id.startsWith("draft-") || (activeCell?.rowId === row.id && activeCell.field === field.key);
      const changed = !saved || isKpiFieldChanged(saved, row, field.key);
      return <td class={[editing ? "is-editing-cell" : "", changed ? "is-unsaved-cell" : ""].filter(Boolean).join(" ") || undefined}
        onDblClick={() => beginCellEdit(row, field)}>
        {editing ? <div data-kpi-editor-row={row.id} data-kpi-editor-field={field.key}><FieldEditor field={field} row={row} fiscalYear={fiscalYear}
          onChange={(key, value) => updateDraft(row, key, value)}
          onWorkloadChange={(option) => selectWorkload(row, option)}
          onCommit={() => { if (!row.id.startsWith("draft-")) setActiveCell(null); }} /></div>
          : field.type === "textarea" ? <span class="kpi-cell-description" tabIndex={0}
            onMouseEnter={(event) => openDescriptionPopup(event.currentTarget, displayValue(row, field.key))}
            onMouseLeave={closeDescriptionPopup} onFocus={(event) => openDescriptionPopup(event.currentTarget, displayValue(row, field.key))}
            onBlur={closeDescriptionPopup}>{displayValue(row, field.key)}</span>
          : <span>{displayValue(row, field.key)}</span>}
      </td>;
    })}</Fragment>, context.parentElement);
  };

  return <section class="kpi-spreadsheet-page" aria-labelledby="kpiSpreadsheetTitle" data-kpi-tab={activeTab}>
    <header class="kpi-spreadsheet-page__header"><div><span class="kpi-eyebrow">KPI Activities / {activeTab}</span>
      <h2 id="kpiSpreadsheetTitle">{activeTab === "Overview" ? "KPI Performance" : `[${activeTab}] ${activeDefinition?.name ?? "KPI Activity"}`}</h2>
      <p>{activeTab === "Overview" ? "FY-scoped KPI activity workspace" : `${activeDefinition?.target} · ${activeDefinition?.summaryModel}`}</p>
      <p class="kpi-api-status" role="status">{apiMessage}</p></div>
      <div class="kpi-spreadsheet-page__fiscal-year" aria-label="Selected fiscal year"><span>Fiscal Year</span><strong>{fiscalYear}</strong></div>
    </header>
    <KpiWorkspaceTabs routeId={routeId} onNavigate={onNavigate} />

    {activeTab === "Overview" ? <>
      <div class="kpi-overview-metrics" aria-label={`${fiscalYear} KPI portfolio summary`}><article><span>KPI categories</span><strong>7</strong></article><article><span>Reflected activities</span><strong>{rows.filter((row) => row.manageTimeReflected).length}</strong></article><article><span>Count-based</span><strong>6</strong></article><article><span>Stage/ACR-based</span><strong>1</strong></article></div>
      <section class="kpi-overview-portfolio" aria-labelledby="kpiPortfolioTitle"><div class="kpi-overview-portfolio__heading"><h3 id="kpiPortfolioTitle">{fiscalYear} KPI portfolio</h3><span>Summary + tables share fiscalYear</span></div>
        <div class="kpi-overview-portfolio__table-wrap"><table><thead><tr><th>KPI</th><th>Target</th><th>Summary model</th><th>Status</th></tr></thead><tbody>{KPI_OVERVIEW_ROWS.map((row) => { const overview = overviewByCode.get(row.code); return <tr><td><button type="button" class="kpi-overview-route-link" onClick={() => onNavigate(`activity-${row.code.toLowerCase()}`)}><span class="kpi-sheet-tab-code">{row.code}</span><strong>{row.name}</strong></button></td><td>{overview?.target ?? "—"}</td><td>{row.summaryModel}</td><td><span class={`kpi-status-badge kpi-status-badge--${(overview?.status ?? "unknown").toLowerCase().replace(" ", "-")}`} title={overview?.explanation}>{overview?.status ?? "—"}</span></td></tr>; })}</tbody></table></div>
      </section>
    </> : <>
      <div class="kpi-activity-toolbar" role="toolbar" aria-label={`${activeTab} activity actions`}>
        <div class="kpi-activity-toolbar__left"><button type="button" disabled={saving || drafts.length > 0} onClick={addDraft}>Add KPI Activity</button></div>
        <div class="kpi-activity-toolbar__right">
          {toolbarActions.includes("save") && <button type="button" disabled={saveDisabled} onClick={() => { void saveDrafts(); }}>Save</button>}
          {toolbarActions.includes("cancel") && <button type="button" disabled={saving} onClick={cancelDrafts}>Cancel</button>}
          {toolbarActions.includes("delete") && <button class="kpi-delete-button" type="button" disabled={saving} onClick={() => deleteDialogRef.current?.open()}>Delete</button>}
        </div>
      </div>
      {invalidDraftCount > 0 && <p class="kpi-draft-validation" role="alert">{reflectedRequirementsMissing
        ? (activeTab === "H" ? "Reflected H requires Delivery Date." : "Reflected requires both SR Number and Delivery Date.")
        : "Complete required fields before saving."}</p>}
      <Summary rows={summaryRows} tab={activeTab} fiscalYear={fiscalYear} asOf={asOf} selectedQuarter={selectedQuarter} onSelectQuarter={selectQuarter} />
      <div class="kpi-jet-table-wrap">
        <oj-table class="kpi-jet-editable-table" aria-label={`${activeTab} editable KPI activities`}
          data={dataProvider}
          columns={[{ headerText: "Select", id: "selector" }, ...fields.map((field) => ({ headerText: field.label, field: field.key }))]}
          display="grid" layout="contents" horizontalGridVisible="enabled" verticalGridVisible="enabled"
          selectionMode={{ row: "none", column: "none" }}
          rowRenderer={renderKpiRow}></oj-table>
      </div>
      {visibleRows.length === 0 && <p class="kpi-sheet-empty">No {activeTab} activities for {selectedQuarter ?? fiscalYear}.</p>}
    </>}
    <oj-popup ref={descriptionPopupRef} class="kpi-description-popup" autoDismiss="focusLoss" tail="simple">{descriptionPopup}</oj-popup>
    <oj-dialog ref={navigationDialogRef} dialogTitle="Unsaved KPI changes" initialVisibility="hide" cancelBehavior="escape"
      onojOpen={() => navigationStayButtonRef.current?.focus()} onojClose={() => setPendingNavigation(null)}>
      <div slot="body"><p>You have unsaved KPI changes. Save them before continuing to {pendingNavigation?.label}, or discard them.</p></div>
      <div slot="footer" class="kpi-dialog-actions">
        <oj-button ref={navigationStayButtonRef} disabled={saving} onojAction={() => { navigationDialogRef.current?.close(); setPendingNavigation(null); }}>Stay</oj-button>
        <oj-button disabled={saving || saveDisabled} onojAction={() => { void (async () => {
          const continued = await saveDrafts();
          if (!continued) return;
          const action = pendingNavigation?.action; navigationDialogRef.current?.close(); setPendingNavigation(null); action?.();
        })(); }}>Save and Continue</oj-button>
        <oj-button disabled={saving} onojAction={() => { const action = pendingNavigation?.action; cancelDrafts(); navigationDialogRef.current?.close(); setPendingNavigation(null); action?.(); }}>Discard and Continue</oj-button>
      </div>
    </oj-dialog>
    <oj-dialog ref={deleteDialogRef} dialogTitle="Delete selected KPI activities" initialVisibility="hide" cancelBehavior="escape"
      onojOpen={() => deleteCancelButtonRef.current?.focus()}>
      <div slot="body"><p>Delete {selectedRows.length} selected KPI activity row(s)? This action is applied only after confirmation.</p></div>
      <div slot="footer" class="kpi-dialog-actions">
        <oj-button ref={deleteCancelButtonRef} disabled={saving} onojAction={() => deleteDialogRef.current?.close()}>Cancel</oj-button>
        <oj-button chroming="danger" disabled={saving} onojAction={() => { deleteDialogRef.current?.close(); void removeSelected(); }}>Delete</oj-button>
      </div>
    </oj-dialog>
  </section>;
}
