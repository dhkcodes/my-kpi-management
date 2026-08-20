import { Fragment, h } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import Context = require("ojs/ojcontext");
import { RowDataGridProvider } from "ojs/ojrowdatagridprovider";
import { ojDataGrid } from "ojs/ojdatagrid";
import { ojDialog } from "ojs/ojdialog";
import { ojPopup } from "ojs/ojpopup";
import "ojs/ojdatagrid";
import "ojs/ojdatetimepicker";
import "ojs/ojdialog";
import "ojs/ojbutton";
import "ojs/ojpopup";
import "ojs/ojprogress-circle";

import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import {
  carryKpiGridRowKey,
  computeKpiColumnLayout,
  createKpiActivityEditState,
  getKpiGridRowKey,
  KpiActivityEditState,
  KpiSortState,
  nextKpiSort,
  sortKpiActivityRows,
  transitionKpiActivityEdit
} from "../../data/kpiActivityGridModel";
import {
  buildKpiSummary,
  createEmptyKpiRow,
  formatKpiWorkloadOption,
  getKpiToolbarActions,
  getMonthsForQuarter,
  getQuarterStatus,
  getRowsForQuarter,
  isD1QuarterAchieved,
  isKpiDraftInvalid,
  isKpiFieldChanged,
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
  KPI_QUARTER_COUNT_TARGETS
} from "../../data/kpiWorkspaceDefinition";

const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];
const stageLabels: Record<WorkloadStage, string> = { identified: "Identified", validated: "Validated", onboarded: "Onboarded" };
const stageTargets: Record<WorkloadStage, number> = { identified: 2000, validated: 1000, onboarded: 500 };
const activities = ["Solution Design", "Solution Proposal", "Solution Deployment"];
const KPI_GRIDLINES = { horizontal: "visible" as const, vertical: "visible" as const };
const KPI_GRID_SELECTION_MODE = { row: "none" as const, cell: "none" as const };
const stopGridInteraction = (event: Event) => event.stopPropagation();
const waitForFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const minimumProgress = (startedAt: number, minimumMs = 450) => new Promise<void>((resolve) => {
  const remaining = Math.max(0, minimumMs - (performance.now() - startedAt));
  window.setTimeout(resolve, remaining);
});

const quarterStatusClass = (status: ReturnType<typeof getQuarterStatus>) => ({
  Achieved: "kpi-quarter-status-label--achieved",
  "Not Achieved": "kpi-quarter-status-label--not-achieved",
  "In Progress": "kpi-quarter-status-label--in-progress",
  "Not Started": "kpi-quarter-status-label--not-started"
})[status];

type KpiGridCellValue = KpiSpreadsheetRow[keyof KpiSpreadsheetRow];
type KpiGridCellData = { data: KpiGridCellValue };
type KpiGridProviderRow = KpiSpreadsheetRow & Readonly<{ __gridRowKey: string }>;
type KpiGridElement = HTMLElement;
type EditorRect = Readonly<{ left: number; top: number; width: number; height: number }>;
export type KpiNavigationGuard = (label: string, action: () => void) => void;

type CellRenderState = Readonly<{
  authoritativeRows: readonly KpiSpreadsheetRow[];
  beginEditing: (row: KpiSpreadsheetRow, field: KpiField, element: HTMLElement) => void;
  fields: readonly KpiField[];
  selectedIds: Set<string>;
  setRowSelection: (rowId: string, selected: boolean) => void;
  visibleRowsById: ReadonlyMap<string, KpiSpreadsheetRow>;
}>;

type HeaderRenderState = Readonly<{
  availableIds: readonly string[];
  fields: readonly KpiField[];
  selectedIds: Set<string>;
  setVisibleSelection: (ids: readonly string[]) => void;
  sort: KpiSortState | null;
  toggleSort: (field: KpiFieldKey) => void;
}>;

function KpiSelectAll({ availableIds, selectedIds, onSelectionChange }: Readonly<{
  availableIds: readonly string[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: readonly string[]) => void;
}>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedCount = availableIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = availableIds.length > 0 && selectedCount === availableIds.length;
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [allSelected, selectedCount]);
  return <input ref={inputRef} type="checkbox" aria-label="Select all KPI activities"
    checked={allSelected} disabled={availableIds.length === 0}
    onChange={(event) => onSelectionChange((event.currentTarget as HTMLInputElement).checked ? availableIds : [])} />;
}

function KpiRowSelector({ rowId, selected, onSelectionChange }: Readonly<{
  rowId: string;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
}>) {
  return <input type="checkbox" data-kpi-row-selector={rowId} aria-label={`Select KPI activity ${rowId}`}
    checked={selected} onChange={(event) => onSelectionChange((event.currentTarget as HTMLInputElement).checked)} />;
}

const displayValue = (row: KpiSpreadsheetRow, key: KpiFieldKey) => key === "manageTimeReflected"
  ? (row.manageTimeReflected ? "Reflected" : "Pending")
  : key === "stage" && row.stage ? stageLabels[row.stage] : row[key] === null ? "—" : String(row[key] || "—");

function KpiWorkspaceTabs({ routeId, onNavigate, disabled }: Readonly<{
  routeId: string;
  onNavigate: (routeId: string) => void;
  disabled: boolean;
}>) {
  const activeTab = getKpiTabForRoute(routeId);
  return <nav class="kpi-sheet-tabs" aria-label="KPI Activities tabs">
    {KPI_ACTIVITY_TABS.map((item) => <button type="button" class={item.tab === activeTab ? "is-active" : ""}
      aria-selected={item.tab === activeTab} disabled={disabled} onClick={() => onNavigate(item.routeId)}>
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
        {quarters.map((quarter) => {
          const status = statusFor(quarter);
          return <button type="button" class={cardClass(quarter, "kpi-d1-progress-quarter")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
            <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em class={`kpi-quarter-status-label ${quarterStatusClass(status)}`}>{status}</em></span>
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
          </button>;
        })}
      </div>
    </section>;
  }
  const combined = tab === "C1" || tab === "C2";
  return <section class="kpi-sheet-summary" aria-labelledby="kpiQuarterSummary">
    <div class="kpi-sheet-summary__heading"><h3 id="kpiQuarterSummary">Target Quarter count</h3></div>
    <div class="kpi-quarter-summary">{quarters.map((quarter) => {
      const actual = combined ? summary.c1c2Combined[quarter].actual : summary.quarterly[tab][quarter];
      const status = statusFor(quarter);
      return <button type="button" class={cardClass(quarter, "kpi-quarter-card")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
        <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em class={`kpi-quarter-status-label ${quarterStatusClass(status)}`}>{status}</em></span>
        <b class={`kpi-quarter-count-label ${quarterStatusClass(status)}`}>{actual}</b>{combined && <small>C1 + C2 reflected</small>}
      </button>;
    })}</div>
  </section>;
}

function KpiSingleCellEditor({ state, row, field, rect, fiscalYear, onInput, onWorkload, onWorkloadReset, onFinish, onCancelCell, onMove }: Readonly<{
  state: KpiActivityEditState;
  row: KpiSpreadsheetRow;
  field: KpiField;
  rect: EditorRect;
  fiscalYear: FiscalYear;
  onInput: (key: KpiFieldKey, value: string) => void;
  onWorkload: (option: KpiWorkloadOption) => void;
  onWorkloadReset: () => void;
  onFinish: () => void;
  onCancelCell: () => void;
  onMove: (direction: -1 | 1) => void;
}>) {
  const editorRef = useRef<HTMLElement | null>(null);
  const workloadInputRef = useRef<HTMLInputElement | null>(null);
  const workloadPopupRef = useRef<ojPopup | null>(null);
  const [workloadActive, setWorkloadActive] = useState(field.type === "workload");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KpiWorkloadOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const requestGenerationRef = useRef(0);
  const value = row[field.key] === null ? "" : String(row[field.key]);
  const isTextarea = field.type === "textarea";
  const maxWidth = Math.max(160, window.innerWidth - rect.left - 16);
  const overlayWidth = Math.min(isTextarea ? Math.max(rect.width, 360) : rect.width, maxWidth);
  const overlayHeight = isTextarea ? Math.max(rect.height, 144) : Math.max(rect.height, 44);

  const closePopup = useCallback(() => {
    const popup = workloadPopupRef.current;
    if (popup?.classList.contains("oj-complete") && popup.isOpen()) popup.close();
  }, []);

  const openPopup = useCallback(() => {
    const popup = workloadPopupRef.current;
    const launcher = workloadInputRef.current;
    if (!popup || !launcher || !workloadActive) return;
    void Context.getContext(popup).getBusyContext().whenReady().then(() => window.requestAnimationFrame(() => {
      const launcherRect = launcher.getBoundingClientRect();
      if (!launcher.isConnected || launcherRect.width <= 0 || launcherRect.height <= 0 || !workloadPopupRef.current) return;
      const launcherSelector = `#${launcher.id}`;
      popup.style.setProperty("--kpi-workload-popup-max-height", `${Math.max(64, window.innerHeight - launcherRect.bottom - 12)}px`);
      const position = {
        my: { horizontal: "start", vertical: "top" },
        at: { horizontal: "start", vertical: "bottom" },
        of: launcherSelector,
        collision: "none"
      } as const;
      popup.setProperty("position", position);
      if (popup.isOpen()) popup.refresh(); else popup.open(launcherSelector, position);
    }));
  }, [workloadActive]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    closePopup();
    setWorkloadActive(field.type === "workload");
    setQuery("");
    setOptions([]);
    setLoading(false);
    setHasMore(false);
    setOffset(0);
  }, [closePopup, field.type, state.generation]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current ?? workloadInputRef.current;
      editor?.focus();
      if (field.type === "workload") openPopup();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.generation]);

  useEffect(() => {
    if (!workloadActive || field.type !== "workload") return;
    let active = true;
    const requestGeneration = ++requestGenerationRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listKpiWorkloadOptions(fiscalYear, query, 0).then((page) => {
        if (!active || requestGenerationRef.current !== requestGeneration) return;
        setOptions(page.items); setOffset(page.items.length); setHasMore(page.hasMore);
      }).catch(() => {
        if (active && requestGenerationRef.current === requestGeneration) { setOptions([]); setOffset(0); setHasMore(false); }
      }).finally(() => { if (active && requestGenerationRef.current === requestGeneration) setLoading(false); });
    }, 180);
    return () => { active = false; requestGenerationRef.current += 1; window.clearTimeout(timer); };
  }, [field.type, fiscalYear, query, workloadActive]);

  useEffect(() => {
    if (field.type === "workload" && workloadActive) openPopup();
  }, [field.type, hasMore, loading, openPopup, options, workloadActive]);

  useEffect(() => () => closePopup(), [closePopup]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const requestGeneration = requestGenerationRef.current;
    setLoading(true);
    void listKpiWorkloadOptions(fiscalYear, query, offset).then((page) => {
      if (requestGenerationRef.current !== requestGeneration) return;
      setOptions((current) => [...current, ...page.items]);
      setOffset((current) => current + page.items.length);
      setHasMore(page.hasMore);
    }).catch(() => undefined).finally(() => { if (requestGenerationRef.current === requestGeneration) setLoading(false); });
  };

  const keyContract = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePopup(); onCancelCell(); return; }
    if (event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closePopup(); onMove(event.shiftKey ? -1 : 1); return; }
    if (event.key === "Enter" && !(event.currentTarget instanceof HTMLTextAreaElement && event.shiftKey)) {
      event.preventDefault(); event.stopPropagation(); closePopup(); onFinish();
    }
  };

  const chooseWorkload = (option: KpiWorkloadOption) => {
    closePopup(); setWorkloadActive(false); onWorkload(option); onFinish();
  };
  const resetWorkload = () => {
    closePopup(); setWorkloadActive(false); onWorkloadReset(); onFinish();
  };

  const overlayStyle = { left: `${rect.left}px`, top: `${rect.top}px`, width: `${overlayWidth}px`, height: `${overlayHeight}px` };
  const commonClass = `kpi-cell-editor-overlay${isTextarea ? " kpi-cell-editor-overlay--textarea" : ""}`;
  let editor: h.JSX.Element;
  if (field.type === "workload") {
    editor = <div class="kpi-workload-launcher">
      <input id={`kpi-workload-launcher-${state.generation}`} ref={workloadInputRef} type="search" value={query} aria-label="Search Account, Workload, or Oppty.No"
        placeholder={row.accountWorkload || "Search Account, Workload, or Oppty.No"}
        onInput={(event) => { setQuery((event.currentTarget as HTMLInputElement).value); setWorkloadActive(true); }}
        onClick={() => { setWorkloadActive(true); openPopup(); }} onKeyDown={keyContract} />
      <oj-popup ref={workloadPopupRef} class="kpi-workload-results-popup" autoDismiss="focusLoss" initialFocus="none" modality="modeless" tail="none">
        <div class="kpi-workload-cell-editor__results" role="listbox" aria-label="Workload search results"
          onScroll={(event) => { const target = event.currentTarget as HTMLDivElement; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 8) loadMore(); }}>
          <button type="button" role="option" class="kpi-workload-reset-option" onMouseDown={(event) => event.preventDefault()} onClick={resetWorkload}>
            <strong>선택 안함</strong><small>기존 값으로 되돌리기</small>
          </button>
          {options.map((option) => <button type="button" role="option" title={formatKpiWorkloadOption(option)}
            onMouseDown={(event) => event.preventDefault()} onClick={() => chooseWorkload(option)}>
            <strong>{formatKpiWorkloadOption(option)}</strong><small>Workload ID {option.workloadId}</small>
          </button>)}
          {loading && <span>Loading…</span>}
          {!loading && options.length === 0 && <span>No matching workload.</span>}
          {hasMore && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={loadMore}>Load 10 more</button>}
        </div>
      </oj-popup>
    </div>;
  } else if (field.type === "textarea") {
    editor = <textarea ref={editorRef as any} class="kpi-cell-editor-control kpi-cell-editor-control--textarea" value={value}
      aria-label={field.label} onInput={(event) => onInput(field.key, (event.currentTarget as HTMLTextAreaElement).value)} onKeyDown={keyContract}></textarea>;
  } else if (field.type === "date") {
    editor = <oj-input-date ref={editorRef as any} class="kpi-cell-editor-control kpi-cell-editor-control--date" labelHint={field.label} labelEdge="none"
      value={value} onvalueChanged={(event: CustomEvent) => { onInput(field.key, `${event.detail.value ?? ""}`); onFinish(); }} onKeyDown={keyContract}></oj-input-date>;
  } else if (field.type === "manageTime") {
    editor = <select ref={editorRef as any} class="kpi-cell-editor-control" value={row.manageTimeReflected ? "Reflected" : "Pending"} aria-label="Manage Time"
      onChange={(event) => { onInput(field.key, String((event.currentTarget as HTMLSelectElement).value === "Reflected")); onFinish(); }} onKeyDown={keyContract}>
      <option value="Pending">Pending</option><option value="Reflected">Reflected</option>
    </select>;
  } else {
    const choices = field.type === "quarter" ? quarters
      : field.type === "month" ? getMonthsForQuarter(row.kpiCode === "D1" ? (row.targetQuarter || "Q1") : row.quarter)
        : field.type === "stage" ? stages : field.type === "activity" ? activities : null;
    editor = choices ? <select ref={editorRef as any} class="kpi-cell-editor-control" value={value} aria-label={field.label}
      onChange={(event) => { onInput(field.key, (event.currentTarget as HTMLSelectElement).value); onFinish(); }} onKeyDown={keyContract}>
      {choices.map((choice) => <option value={choice}>{field.type === "stage" ? stageLabels[choice as WorkloadStage] : choice}</option>)}
    </select> : <input ref={editorRef as any} class="kpi-cell-editor-control" type={field.type === "number" ? "number" : "text"}
      min={field.type === "number" ? "0" : undefined} value={value} aria-label={field.label}
      onInput={(event) => onInput(field.key, (event.currentTarget as HTMLInputElement).value)} onKeyDown={keyContract} />;
  }

  return <div data-kpi-single-editor data-kpi-editor-row={row.id} data-kpi-editor-field={field.key}
    class={commonClass} style={overlayStyle} onMouseDown={stopGridInteraction} onClick={stopGridInteraction} onDblClick={stopGridInteraction}>
    {editor}
  </div>;
}

export function KpiSpreadsheetPage({ fiscalYear, routeId, onNavigate, onNavigationGuardChange }: Readonly<{
  fiscalYear: FiscalYear;
  routeId: string;
  onNavigate: (routeId: string) => void;
  onNavigationGuardChange: (guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => void;
}>) {
  const activeTab = getKpiTabForRoute(routeId);
  const [rows, setRows] = useState<KpiSpreadsheetRow[]>([]);
  const [overviewItems, setOverviewItems] = useState<KpiOverviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [drafts, setDrafts] = useState<KpiSpreadsheetRow[]>([]);
  const [editState, setEditState] = useState<KpiActivityEditState>(createKpiActivityEditState);
  const editStateRef = useRef(editState);
  editStateRef.current = editState;
  const editRowSnapshotRef = useRef<KpiSpreadsheetRow | null>(null);
  const [editorRect, setEditorRect] = useState<EditorRect | null>(null);
  const editorAnchorRef = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const savingDialogDesiredRef = useRef(false);
  const savingDialogGenerationRef = useRef(0);
  const [apiMessage, setApiMessage] = useState("Loading KPI activities…");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(null);
  const [sortState, setSortState] = useState<KpiSortState | null>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [pendingNavigation, setPendingNavigation] = useState<null | { label: string; action: () => void }>(null);
  const [descriptionPopup, setDescriptionPopup] = useState("");
  const gridRef = useRef<KpiGridElement | null>(null);
  const gridHostRef = useRef<HTMLDivElement | null>(null);
  const providerMutationGenerationRef = useRef(0);
  const providerSettlementRef = useRef<{ generation: number; resolve: (settled: boolean) => void } | null>(null);
  const navigationQueueRef = useRef(Promise.resolve());
  const navigationDialogRef = useRef<ojDialog | null>(null);
  const cancelDialogRef = useRef<ojDialog | null>(null);
  const deleteDialogRef = useRef<ojDialog | null>(null);
  const savingDialogRef = useRef<ojDialog | null>(null);
  const descriptionPopupRef = useRef<ojPopup | null>(null);
  const navigationStayButtonRef = useRef<any>(null);
  const cancelKeepButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const sessionVersion = useRef(0);
  const sessionKeyRef = useRef(`${routeId}:${fiscalYear}`);
  const gridRowKeysRef = useRef(new Map<string, string>());
  const providerRowCacheRef = useRef(new Map<string, { source: KpiSpreadsheetRow; provider: KpiGridProviderRow }>());
  sessionKeyRef.current = `${routeId}:${fiscalYear}`;

  const activeRows = useMemo(() => rows.filter((row) => row.fiscalYear === fiscalYear), [rows, fiscalYear]);
  const authoritativeRows = useMemo(() => activeTab === "Overview" ? activeRows : activeRows.filter((row) => row.kpiCode === activeTab), [activeRows, activeTab]);
  const fields = activeTab === "Overview" ? [] : KPI_FIELD_CONTRACTS[activeTab];
  const gridSchemaKey = `${fiscalYear}:${activeTab}`;
  const activeDrafts = useMemo(() => drafts.filter((draft) =>
    draft.fiscalYear === fiscalYear && (activeTab === "Overview" || draft.kpiCode === activeTab)), [drafts, fiscalYear, activeTab]);
  const fiscalYearDrafts = useMemo(() => drafts.filter((draft) => draft.fiscalYear === fiscalYear), [drafts, fiscalYear]);
  const draftById = useMemo(() => new Map(activeDrafts.map((draft) => [draft.id, draft])), [activeDrafts]);
  const effectiveRows = useMemo(() => [
    ...activeDrafts.filter((draft) => draft.id.startsWith("draft-")),
    ...authoritativeRows.map((row) => draftById.get(row.id) ?? row)
  ], [authoritativeRows, draftById, activeDrafts]);
  const summaryRows = useMemo(() => {
    const byId = new Map(fiscalYearDrafts.map((draft) => [draft.id, draft]));
    return [...fiscalYearDrafts.filter((draft) => draft.id.startsWith("draft-")), ...activeRows.map((row) => byId.get(row.id) ?? row)];
  }, [fiscalYearDrafts, activeRows]);
  const activeSortState = sortState && fields.some((field) => field.key === sortState.field) ? sortState : null;
  const quarterRows = useMemo(() => getRowsForQuarter(effectiveRows, selectedQuarter), [effectiveRows, selectedQuarter]);
  const visibleRows = useMemo(() => sortKpiActivityRows(quarterRows, activeSortState), [quarterRows, activeSortState]);
  const providerRows = useMemo<KpiGridProviderRow[]>(() => visibleRows.map((row) => {
    const key = getKpiGridRowKey(gridRowKeysRef.current, row.id);
    const cached = providerRowCacheRef.current.get(key);
    if (cached?.source === row) return cached.provider;
    const provider = { ...row, __gridRowKey: key };
    providerRowCacheRef.current.set(key, { source: row, provider });
    return provider;
  }), [visibleRows]);
  const visibleRowsById = useMemo(() => new Map(visibleRows.map((row) => [row.id, row])), [visibleRows]);
  const visibleRowsByIdRef = useRef(visibleRowsById);
  visibleRowsByIdRef.current = visibleRowsById;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [columnLayout, setColumnLayout] = useState(() => computeKpiColumnLayout(fields, 960));

  const reconcileDraft = useCallback((current: KpiSpreadsheetRow[], updated: KpiSpreadsheetRow) => {
    const saved = rows.find((item) => item.id === updated.id);
    const keep = updated.id.startsWith("draft-") || !saved || isKpiRowChanged(saved, updated, fields);
    if (!keep) return current.filter((draft) => draft.id !== updated.id);
    return current.some((draft) => draft.id === updated.id)
      ? current.map((draft) => draft.id === updated.id ? updated : draft)
      : [...current, updated];
  }, [fields, rows]);

  const applyDraftValue = (source: KpiSpreadsheetRow, key: KpiFieldKey, value: string): KpiSpreadsheetRow => ({
    ...source,
    [key]: key === "acrK" ? (value === "" ? null : Number(value)) : key === "manageTimeReflected" ? value === "true" : value
  } as KpiSpreadsheetRow);

  const finishEditing = useCallback(() => {
    setEditState((current) => transitionKpiActivityEdit(current, { type: "finish", hasDrafts: drafts.length > 0 }));
    setEditorRect(null);
    editorAnchorRef.current = null;
    editRowSnapshotRef.current = null;
  }, [drafts.length]);

  const updateDraft = useCallback((row: KpiSpreadsheetRow, key: KpiFieldKey, value: string) => {
    const source = draftById.get(row.id) ?? row;
    const updated = applyDraftValue(source, key, value);
    setDrafts((current) => reconcileDraft(current, updated));
    setEditState((current) => transitionKpiActivityEdit(current, {
      type: "input",
      value,
      hasOtherDrafts: drafts.some((draft) => draft.id !== row.id)
    }));
  }, [draftById, drafts, reconcileDraft]);

  const selectWorkload = useCallback((row: KpiSpreadsheetRow, option: KpiWorkloadOption) => {
    const source = draftById.get(row.id) ?? row;
    const updated = { ...source, workloadId: option.workloadId, mappingStatus: "VERIFIED" as const, accountWorkload: formatKpiWorkloadOption(option) };
    setDrafts((current) => reconcileDraft(current, updated));
    setEditState((current) => transitionKpiActivityEdit(current, { type: "input", value: updated.accountWorkload, hasOtherDrafts: drafts.some((draft) => draft.id !== row.id) }));
  }, [draftById, drafts, reconcileDraft]);

  const resetWorkload = useCallback((row: KpiSpreadsheetRow) => {
    const source = draftById.get(row.id) ?? row;
    const original = rows.find((item) => item.id === row.id);
    const updated = { ...source, workloadId: original?.workloadId ?? null, mappingStatus: original?.mappingStatus ?? "UNMATCHED", accountWorkload: original?.accountWorkload ?? "" } as KpiSpreadsheetRow;
    setDrafts((current) => reconcileDraft(current, updated));
    setEditState((current) => transitionKpiActivityEdit(current, { type: "input", value: updated.accountWorkload, hasOtherDrafts: drafts.some((draft) => draft.id !== row.id) }));
  }, [draftById, drafts, reconcileDraft, rows]);

  const beginEditing = useCallback((row: KpiSpreadsheetRow, field: KpiField, element: HTMLElement) => {
    if (saving || editStateRef.current.phase === "saving" || editStateRef.current.phase === "cancelling") return;
    if (editStateRef.current.cell?.rowId === row.id && editStateRef.current.cell.field === field.key) return;
    const latest = draftById.get(row.id) ?? row;
    editRowSnapshotRef.current = { ...latest };
    editorAnchorRef.current = element;
    const rect = element.getBoundingClientRect();
    setEditorRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setEditState((current) => transitionKpiActivityEdit(current, {
      type: "begin",
      cell: { rowId: row.id, field: field.key },
      value: latest[field.key] === null ? "" : String(latest[field.key])
    }));
  }, [draftById, saving]);

  const cancelCurrentCell = useCallback(() => {
    const snapshot = editRowSnapshotRef.current;
    if (snapshot) setDrafts((current) => reconcileDraft(current, snapshot));
    finishEditing();
  }, [finishEditing, reconcileDraft]);

  const moveCell = useCallback((rowId: string, fieldKey: KpiFieldKey, direction: -1 | 1) => {
    const cells = visibleRows.flatMap((row) => fields.map((field) => ({ row, field })));
    const index = cells.findIndex((item) => item.row.id === rowId && item.field.key === fieldKey);
    if (index < 0 || cells.length === 0) { finishEditing(); return; }
    const next = cells[(index + direction + cells.length) % cells.length];
    const selector = `[data-kpi-grid-row="${CSS.escape(next.row.id)}"][data-kpi-grid-field="${next.field.key}"]`;
    const element = gridRef.current?.querySelector<HTMLElement>(selector);
    if (element) beginEditing(next.row, next.field, element); else finishEditing();
  }, [beginEditing, fields, finishEditing, visibleRows]);

  useEffect(() => {
    if (!editState.cell) return;
    const updateRect = () => {
      const anchor = editorAnchorRef.current;
      if (!anchor?.isConnected) { finishEditing(); return; }
      const rect = anchor.getBoundingClientRect();
      setEditorRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => { window.removeEventListener("resize", updateRect); window.removeEventListener("scroll", updateRect, true); };
  }, [editState.cell, finishEditing]);

  useEffect(() => {
    if (!editState.cell) return;
    const finishOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest("[data-kpi-single-editor]") || target.closest("oj-popup.kpi-workload-results-popup")) return;
      finishEditing();
    };
    document.addEventListener("pointerdown", finishOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", finishOnOutsidePointer, true);
  }, [editState.cell, finishEditing]);

  useEffect(() => {
    if (drafts.length > 0 && editStateRef.current.phase === "view") {
      setEditState((current) => transitionKpiActivityEdit(current, { type: "finish", hasDrafts: true }));
    }
    if (drafts.length === 0 && !editStateRef.current.cell && editStateRef.current.phase === "dirty") {
      setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" }));
    }
  }, [drafts.length]);

  useEffect(() => {
    sessionVersion.current += 1;
    gridRowKeysRef.current.clear();
    providerRowCacheRef.current.clear();
    setDrafts([]); setSelectedIds(new Set()); setSelectedQuarter(null); setSortState(null);
    setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" }));
    setEditorRect(null); editorAnchorRef.current = null; editRowSnapshotRef.current = null;
  }, [routeId, fiscalYear]);

  useEffect(() => {
    let active = true;
    setRows([]); setOverviewItems([]); setApiMessage("Loading KPI activities…");
    void Promise.all([listKpiRows(fiscalYear), listKpiOverview(fiscalYear)]).then(([items, overview]) => {
      if (!active) return;
      setRows(items); setOverviewItems(overview.items); setAsOf(overview.asOf);
      setApiMessage(`Live API connected · ${items.length} activities · as of ${overview.asOf}`);
    }).catch(() => { if (active) setApiMessage("KPI API unavailable — no fallback customer data is shown"); });
    return () => { active = false; };
  }, [fiscalYear, reloadVersion]);

  useEffect(() => {
    const host = gridHostRef.current;
    if (!host || fields.length === 0) return;
    const apply = (width: number) => setColumnLayout(computeKpiColumnLayout(fields, width));
    apply(host.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === host);
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [activeTab, fields]);

  const headerOptions = useMemo(() => ({
    column: {
      style: (context: { index: number }) => {
        if (context.index === 0) return `width:${columnLayout.selectorWidth}px`;
        const field = fields[context.index - 1];
        return `width:${field ? columnLayout.widths[field.key] ?? 112 : 112}px`;
      }
    }
  }), [columnLayout, fields]);

  const cellOptions = useMemo(() => ({
    editable: "disable" as const,
    className: (context: ojDataGrid.CellContext<string, KpiGridCellData>) => {
      const providerRow = (context.metadata as { rowItem?: { data?: KpiSpreadsheetRow } }).rowItem?.data;
      const row = providerRow ? (visibleRowsByIdRef.current.get(providerRow.id) ?? providerRow) : null;
      const field = fieldsRef.current[context.indexes.column - 1];
      return [
        context.indexes.column > 0 ? "kpi-data-grid-cell" : "kpi-selector-grid-cell",
        row?.manageTimeReflected ? "kpi-reflected-grid-cell" : "",
        field?.type === "textarea" ? "kpi-textarea-grid-cell" : ""
      ].filter(Boolean).join(" ") || null;
    }
  }), []);

  const dataProvider = useMemo(() => new MutableArrayDataProvider<string, KpiGridProviderRow>([], { keyAttributes: "__gridRowKey" }), [gridSchemaKey]);
  const gridColumns = useMemo<Array<keyof KpiSpreadsheetRow>>(() => ["id", ...fields.map((field) => field.key)], [fields]);
  const dataGridProvider = useMemo(() => new RowDataGridProvider<KpiGridCellValue, string, KpiGridProviderRow>(dataProvider, {
    columns: { databody: gridColumns },
    columnHeaders: { column: ["", ...fields.map((field) => field.label)] }
  }), [dataProvider, fields, gridColumns]);
  useEffect(() => {
    if (!saving) {
      dataProvider.data = providerRows;
      return;
    }
    const generation = ++providerMutationGenerationRef.current;
    let cancelled = false;
    void (async () => {
      const settle = (settled: boolean) => {
        const pending = providerSettlementRef.current;
        if (pending && generation >= pending.generation) {
          pending.resolve(settled);
          providerSettlementRef.current = null;
        }
      };
      try {
        const grid = gridRef.current;
        const busyContext = grid?.isConnected ? Context.getContext(grid).getBusyContext() : null;
        if (busyContext) await busyContext.whenReady();
        if (cancelled || generation !== providerMutationGenerationRef.current) return;
        if (!grid?.isConnected || gridRef.current !== grid) { settle(false); return; }
        dataProvider.data = providerRows;
        if (busyContext && grid.isConnected && gridRef.current === grid) await busyContext.whenReady();
        if (cancelled || generation !== providerMutationGenerationRef.current) return;
        settle(grid.isConnected && gridRef.current === grid);
      } catch (error) {
        console.error("KPI grid provider reconciliation failed", error);
        if (!cancelled && generation === providerMutationGenerationRef.current) settle(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dataProvider, providerRows, saving]);

  useEffect(() => () => {
    const pending = providerSettlementRef.current;
    if (pending) pending.resolve(false);
    providerSettlementRef.current = null;
  }, []);

  const selectableVisibleIds = visibleRows.filter((row) => !row.id.startsWith("draft-")).map((row) => row.id);
  const selectedRows = visibleRows.filter((row) => selectedIds.has(row.id) && !row.id.startsWith("draft-"));
  const setVisibleSelection = useCallback((ids: readonly string[]) => setSelectedIds(new Set(ids)), []);
  const setRowSelection = useCallback((rowId: string, selected: boolean) => setSelectedIds((current) => {
    const next = new Set(current); if (selected) next.add(rowId); else next.delete(rowId); return next;
  }), []);

  useEffect(() => {
    const input = gridRef.current?.querySelector<HTMLInputElement>('input[aria-label="Select all KPI activities"]');
    const selectedCount = selectableVisibleIds.filter((id) => selectedIds.has(id)).length;
    if (input) {
      input.checked = selectableVisibleIds.length > 0 && selectedCount === selectableVisibleIds.length;
      input.indeterminate = selectedCount > 0 && selectedCount < selectableVisibleIds.length;
    }
    gridRef.current?.querySelectorAll<HTMLInputElement>('input[data-kpi-row-selector]').forEach((selector) => {
      selector.checked = selectedIds.has(selector.dataset.kpiRowSelector ?? "");
    });
    gridRef.current?.querySelectorAll<HTMLElement>('[data-kpi-grid-row]').forEach((cell) => {
      cell.classList.toggle("is-selected", selectedIds.has(cell.dataset.kpiGridRow ?? ""));
    });
  }, [selectedIds, visibleRows]);

  const toggleSort = useCallback((field: KpiFieldKey) => {
    finishEditing();
    setSortState((current) => nextKpiSort(current, field));
  }, [finishEditing]);

  const cellRenderStateRef = useRef<CellRenderState | null>(null);
  cellRenderStateRef.current = { authoritativeRows, beginEditing, fields, selectedIds, setRowSelection, visibleRowsById };
  const headerRenderStateRef = useRef<HeaderRenderState | null>(null);
  headerRenderStateRef.current = { availableIds: selectableVisibleIds, fields, selectedIds, setVisibleSelection, sort: activeSortState, toggleSort };

  const renderKpiCell = useCallback((context: ojDataGrid.CellTemplateContext<KpiGridCellData>) => {
    const state = cellRenderStateRef.current;
    if (!state) return null;
    const providerRow = (context.item.metadata as { rowItem: { data: KpiSpreadsheetRow } }).rowItem.data;
    const row = state.visibleRowsById.get(providerRow.id) ?? providerRow;
    const saved = state.authoritativeRows.find((item) => item.id === row.id);
    const rowDirty = !saved || isKpiRowChanged(saved, row, state.fields);
    const baseClasses = ["kpi-grid-cell", state.selectedIds.has(row.id) ? "is-selected" : "", row.manageTimeReflected ? "kpi-manage-time-reflected-row" : ""].filter(Boolean).join(" ");
    if (context.item.columnIndex === 0) return <div class={`${baseClasses} kpi-selector-cell`} data-kpi-grid-row={row.id}
      onMouseDown={stopGridInteraction} onClick={stopGridInteraction} onDblClick={stopGridInteraction} onKeyDown={stopGridInteraction}>
      <KpiRowSelector rowId={row.id} selected={state.selectedIds.has(row.id)} onSelectionChange={(selected) => state.setRowSelection(row.id, selected)} />
    </div>;
    const field = state.fields[context.item.columnIndex - 1];
    if (!field) return null;
    const changed = !saved || isKpiFieldChanged(saved, row, field.key);
    const fixedValue = field.type !== "workload" && field.type !== "textarea";
    const classes = [baseClasses, fixedValue ? "kpi-grid-cell--fixed" : "", rowDirty ? "is-unsaved-row" : "", changed ? "is-unsaved-cell" : ""].filter(Boolean).join(" ");
    return <div class={classes} data-kpi-grid-row={row.id} data-kpi-grid-field={field.key}
      onDblClick={(event) => { event.preventDefault(); event.stopPropagation(); state.beginEditing(row, field, event.currentTarget); }}>
      {field.type === "textarea" ? <span class="kpi-cell-description">{displayValue(row, field.key)}</span> : <span>{displayValue(row, field.key)}</span>}
    </div>;
  }, []);

  const renderKpiColumnHeader = useCallback((context: ojDataGrid.HeaderTemplateContext<string>) => {
    const state = headerRenderStateRef.current;
    if (context.item.index === 0 && state) return <div class="kpi-select-all-header" onMouseDown={stopGridInteraction} onClick={stopGridInteraction} onDblClick={stopGridInteraction}>
      <KpiSelectAll availableIds={state.availableIds} selectedIds={state.selectedIds} onSelectionChange={state.setVisibleSelection} />
    </div>;
    const field = state?.fields[context.item.index - 1];
    if (!field || !state) return null;
    const activeSort = state.sort?.field === field.key;
    return <div class="kpi-grid-column-header" role="columnheader"
      aria-sort={activeSort ? (state.sort?.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" class="kpi-grid-sort-button" data-kpi-sort-field={field.key}
        aria-label={`Sort by ${field.label}`} aria-pressed={activeSort}
        onClick={() => state.toggleSort(field.key)}>
        <span class="kpi-grid-header-title">{field.label}</span><span class="kpi-grid-sort-indicator" aria-hidden="true">{activeSort ? (state.sort?.direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </div>;
  }, []);

  useEffect(() => {
    gridRef.current?.querySelectorAll<HTMLButtonElement>(".kpi-grid-sort-button").forEach((button) => {
      const field = button.dataset.kpiSortField as KpiFieldKey | undefined;
      const active = field && sortState?.field === field;
      const sortValue = active ? (sortState?.direction === "asc" ? "ascending" : "descending") : "none";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.closest('[role="columnheader"]')?.setAttribute("aria-sort", sortValue);
      const indicator = button.querySelector(".kpi-grid-sort-indicator");
      if (indicator) indicator.textContent = active ? (sortState?.direction === "asc" ? "▲" : "▼") : "↕";
    });
  }, [sortState, visibleRows.length]);

  const editorRow = editState.cell ? visibleRowsById.get(editState.cell.rowId) : null;
  const editorField = editState.cell ? fields.find((field) => field.key === editState.cell?.field) : null;
  const activeDefinition = KPI_OVERVIEW_ROWS.find((row) => row.code === activeTab);
  const overviewByCode = useMemo(() => new Map(overviewItems.map((item) => [item.code, item])), [overviewItems]);
  const toolbarActions = getKpiToolbarActions(drafts.length, selectedRows.length);
  const invalidDraftCount = drafts.filter((draft) => isKpiDraftInvalid(draft, rows.find((row) => row.id === draft.id))).length;
  const reflectedRequirementsMissing = drafts.some((draft) => draft.manageTimeReflected && (!draft.deliveryDate || !draft.srNumber.trim()));
  const saveDisabled = drafts.length === 0 || saving || drafts.some((draft) => isKpiDraftInvalid(draft, authoritativeRows.find((row) => row.id === draft.id)));

  const addDraft = () => {
    if (saving || drafts.length > 0 || editState.cell || activeTab === "Overview") return;
    const draft = createEmptyKpiRow(activeTab as SpreadsheetKpiCode, fiscalYear);
    setDrafts([draft]);
    void (async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await waitForFrame();
        const field = fields[0];
        const element = gridRef.current?.querySelector<HTMLElement>(`[data-kpi-grid-row="${CSS.escape(draft.id)}"][data-kpi-grid-field="${field.key}"]`);
        if (element) { beginEditing(draft, field, element); return; }
      }
    })();
  };

  const cancelDrafts = useCallback(() => {
    setEditState((current) => transitionKpiActivityEdit(current, { type: "cancel" }));
    setEditorRect(null); editorAnchorRef.current = null; editRowSnapshotRef.current = null;
    setDrafts([]); setSelectedIds(new Set()); setApiMessage("Unsaved KPI changes discarded");
    cancelDialogRef.current?.close();
    setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" }));
  }, []);

  useEffect(() => {
    const dialog = savingDialogRef.current;
    if (!dialog) return;
    let active = true;
    const generation = ++savingDialogGenerationRef.current;
    const busyContext = Context.getContext(dialog).getBusyContext();
    void busyContext.whenReady().then(() => {
      if (!active || generation !== savingDialogGenerationRef.current || savingDialogRef.current !== dialog || savingDialogDesiredRef.current !== saving) return;
      if (saving) {
        if (!dialog.isOpen()) dialog.open();
      } else if (dialog.isOpen()) {
        dialog.close();
      }
    }).catch((error) => {
      if (active) console.error("KPI saving dialog synchronization failed", error);
    });
    return () => { active = false; };
  }, [saving]);

  const settleSavingDialogClosed = useCallback(async (): Promise<boolean> => {
    savingDialogDesiredRef.current = false;
    savingDialogGenerationRef.current += 1;
    const dialog = savingDialogRef.current;
    if (!dialog) return true;
    try {
      const busyContext = Context.getContext(dialog).getBusyContext();
      await busyContext.whenReady();
      if (dialog.isOpen()) dialog.close();
      await busyContext.whenReady();
      return !dialog.isOpen();
    } catch (error) {
      console.error("KPI saving dialog close failed", error);
      return false;
    }
  }, []);


  const saveDrafts = async (): Promise<boolean> => {
    if (drafts.length === 0) return true;
    if (saving || saveDisabled) return false;
    finishEditing();
    const startedAt = performance.now();
    const saveSession = sessionVersion.current;
    const saveSessionKey = sessionKeyRef.current;
    const draftSnapshot = drafts;
    setEditState((current) => transitionKpiActivityEdit(current, { type: "save" }));
    savingDialogDesiredRef.current = true;
    setSaving(true);
    const outcomes = await Promise.allSettled(draftSnapshot.map((draft) => saveKpiRow(draft)));
    await minimumProgress(startedAt);
    const saved = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const failedDrafts = draftSnapshot.filter((_, index) => outcomes[index].status === "rejected");
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      await settleSavingDialogClosed();
      setSaving(false); setReloadVersion((current) => current + 1); setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" })); return false;
    }
    draftSnapshot.forEach((draft, index) => {
      if (outcomes[index].status === "fulfilled") {
        carryKpiGridRowKey(gridRowKeysRef.current, draft.id, outcomes[index].value.id);
      }
    });
    let providerSettled: Promise<boolean> | null = null;
    if (saved.length > 0) {
      providerSettled = new Promise<boolean>((resolve) => {
        providerSettlementRef.current = { generation: providerMutationGenerationRef.current + 1, resolve };
      });
    }
    if (saved.length > 0) setRows((current) => {
      const savedByOldId = new Map(draftSnapshot.map((draft, index) => [draft.id, outcomes[index].status === "fulfilled" ? outcomes[index].value : null]));
      const next = current.map((row) => savedByOldId.get(row.id) ?? row).filter(Boolean) as KpiSpreadsheetRow[];
      return [...next, ...draftSnapshot.flatMap((draft, index) => draft.id.startsWith("draft-") && outcomes[index].status === "fulfilled" ? [outcomes[index].value] : [])];
    });
    setDrafts(failedDrafts);
    setSelectedIds(new Set(failedDrafts.map((row) => row.id)));
    const providerReady = providerSettled ? await providerSettled : true;
    if (!providerReady) {
      setApiMessage("Grid synchronization failed; KPI activities were reloaded");
      await settleSavingDialogClosed();
      setSaving(false); setReloadVersion((current) => current + 1); setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" })); return false;
    }
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      await settleSavingDialogClosed();
      setSaving(false); setReloadVersion((current) => current + 1); setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" })); return false;
    }
    setApiMessage(failedDrafts.length === 0 ? `${saved.length} KPI activity row(s) saved` : `${saved.length} saved · ${failedDrafts.length} failed`);
    await settleSavingDialogClosed();
    setSaving(false);
    setEditState((current) => transitionKpiActivityEdit(current, { type: "save-result", hasFailures: failedDrafts.length > 0 }));
    return failedDrafts.length === 0;
  };

  const removeSelected = async () => {
    if (saving || selectedRows.length === 0) return;
    const rowsToDelete = [...selectedRows];
    const deleteSession = sessionVersion.current;
    const deleteSessionKey = sessionKeyRef.current;
    savingDialogDesiredRef.current = true;
    setSaving(true);
    const outcomes = await Promise.allSettled(rowsToDelete.map((row) => deleteKpiRow(row)));
    if (sessionVersion.current !== deleteSession || sessionKeyRef.current !== deleteSessionKey) {
      await settleSavingDialogClosed();
      setSaving(false);
      setReloadVersion((current) => current + 1);
      return;
    }
    const deletedIds = new Set(rowsToDelete.filter((_, index) => outcomes[index].status === "fulfilled").map((row) => row.id));
    const failedIds = rowsToDelete.filter((_, index) => outcomes[index].status === "rejected").map((row) => row.id);
    setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
    deletedIds.forEach((id) => gridRowKeysRef.current.delete(id));
    setDrafts((current) => current.filter((row) => !deletedIds.has(row.id)));
    setSelectedIds(new Set(failedIds));
    setApiMessage(failedIds.length === 0 ? `${deletedIds.size} KPI activity row(s) deleted` : `${deletedIds.size} deleted · ${failedIds.length} failed`);
    await settleSavingDialogClosed();
    setSaving(false);
  };

  const settleGridBeforeNavigation = useCallback(async (action: () => void) => {
    await waitForFrame();
    const grid = gridRef.current;
    if (grid?.isConnected) {
      try {
        await Context.getContext(grid).getBusyContext().whenReady();
      } catch (error) {
        setApiMessage(error instanceof Error ? error.message : "KPI Grid did not settle before navigation.");
        return;
      }
      await waitForFrame();
      if (grid !== gridRef.current || !grid.isConnected) return;
    }
    setSelectedIds(new Set());
    action();
  }, []);

  const requestProtectedNavigation = useCallback<KpiNavigationGuard>((label, action) => {
    finishEditing();
    const settledAction = () => {
      navigationQueueRef.current = navigationQueueRef.current.then(() => settleGridBeforeNavigation(action));
    };
    if (drafts.length === 0) { settledAction(); return; }
    setPendingNavigation({ label, action: settledAction });
    void waitForFrame().then(() => navigationDialogRef.current?.open());
  }, [drafts.length, finishEditing, settleGridBeforeNavigation]);
  useEffect(() => {
    onNavigationGuardChange(requestProtectedNavigation, drafts.length > 0);
    return () => onNavigationGuardChange(null, false);
  }, [drafts.length, onNavigationGuardChange, requestProtectedNavigation]);

  const selectQuarter = (quarter: Quarter | null) => requestProtectedNavigation(quarter ?? "Fiscal Year", () => {
    setSelectedIds(new Set()); setSelectedQuarter((current) => current === quarter ? null : quarter);
  });
  const requestCancel = () => {
    finishEditing();
    if (drafts.length === 0) return;
    void waitForFrame().then(() => cancelDialogRef.current?.open());
  };

  return <section class="kpi-spreadsheet-page" aria-labelledby="kpiSpreadsheetTitle" data-kpi-tab={activeTab} data-kpi-edit-phase={editState.phase}>
    <header class="kpi-spreadsheet-page__header"><div><span class="kpi-eyebrow">KPI Activities / {activeTab}</span>
      <h2 id="kpiSpreadsheetTitle">{activeTab === "Overview" ? "KPI Performance" : `[${activeTab}] ${activeDefinition?.name ?? "KPI Activity"}`}</h2>
      <p>{activeTab === "Overview" ? "FY-scoped KPI activity workspace" : `${activeDefinition?.target} · ${activeDefinition?.summaryModel}`}</p>
      <p class="kpi-api-status" role="status">{apiMessage}</p></div>
      <div class="kpi-spreadsheet-page__fiscal-year" aria-label="Selected fiscal year"><span>Fiscal Year</span><strong>{fiscalYear}</strong></div>
    </header>
    <KpiWorkspaceTabs routeId={routeId} onNavigate={onNavigate} disabled={saving} />

    {activeTab === "Overview" ? <Fragment>
      <div class="kpi-overview-metrics" aria-label={`${fiscalYear} KPI portfolio summary`}><article><span>KPI categories</span><strong>7</strong></article><article><span>Reflected activities</span><strong>{rows.filter((row) => row.manageTimeReflected).length}</strong></article><article><span>Count-based</span><strong>6</strong></article><article><span>Stage/ACR-based</span><strong>1</strong></article></div>
      <section class="kpi-overview-portfolio" aria-labelledby="kpiPortfolioTitle"><div class="kpi-overview-portfolio__heading"><h3 id="kpiPortfolioTitle">{fiscalYear} KPI portfolio</h3><span>Summary + tables share fiscalYear</span></div>
        <div class="kpi-overview-portfolio__table-wrap"><table><thead><tr><th>KPI</th><th>Target</th><th>Summary model</th><th>Status</th></tr></thead><tbody>{KPI_OVERVIEW_ROWS.map((row) => { const overview = overviewByCode.get(row.code); return <tr><td><button type="button" class="kpi-overview-route-link" onClick={() => onNavigate(`activity-${row.code.toLowerCase()}`)}><span class="kpi-sheet-tab-code">{row.code}</span><strong>{row.name}</strong></button></td><td>{overview?.target ?? "—"}</td><td>{row.summaryModel}</td><td><span class={`kpi-status-badge kpi-status-badge--${(overview?.status ?? "unknown").toLowerCase().replace(" ", "-")}`} title={overview?.explanation}>{overview?.status ?? "—"}</span></td></tr>; })}</tbody></table></div>
      </section>
    </Fragment> : <Fragment>
      <div class="kpi-activity-toolbar" role="toolbar" aria-label={`${activeTab} activity actions`}>
        <div class="kpi-activity-toolbar__left"><button type="button" disabled={saving || drafts.length > 0 || editState.cell !== null} onClick={addDraft}>Add KPI Activity</button></div>
        <div class="kpi-activity-toolbar__right">
          {toolbarActions.includes("save") && <button type="button" disabled={saveDisabled} onClick={() => { void saveDrafts(); }}>Save</button>}
          {toolbarActions.includes("cancel") && <button type="button" disabled={saving} onClick={requestCancel}>Cancel</button>}
          {toolbarActions.includes("delete") && <button class="kpi-delete-button" type="button" disabled={saving} onClick={() => deleteDialogRef.current?.open()}>Delete</button>}
        </div>
      </div>
      {invalidDraftCount > 0 && <p class="kpi-draft-validation" role="alert">{reflectedRequirementsMissing
        ? "Reflected requires both SR Number and Delivery Date."
        : "Complete required fields before saving."}</p>}
      <Summary rows={summaryRows} tab={activeTab} fiscalYear={fiscalYear} asOf={asOf} selectedQuarter={selectedQuarter} onSelectQuarter={selectQuarter} />
      <div ref={gridHostRef} class="kpi-jet-table-wrap" style={`--kpi-grid-content-width:${columnLayout.totalWidth}px`}>
        <oj-data-grid key={gridSchemaKey} data-kpi-grid-schema={gridSchemaKey}
          ref={gridRef} class="kpi-jet-editable-grid" aria-label={`${activeTab} editable KPI activities`}
          data={dataGridProvider} editMode="none" cell={cellOptions} gridlines={KPI_GRIDLINES}
          header={headerOptions} selectionMode={KPI_GRID_SELECTION_MODE}>
          <template slot="cellTemplate" render={renderKpiCell} />
          <template slot="columnHeaderTemplate" render={renderKpiColumnHeader} />
        </oj-data-grid>
      </div>
      {visibleRows.length === 0 && <p class="kpi-sheet-empty">No {activeTab} activities for {selectedQuarter ?? fiscalYear}.</p>}
      {editorRow && editorField && editorRect && <KpiSingleCellEditor state={editState} row={editorRow} field={editorField} rect={editorRect}
        fiscalYear={fiscalYear} onInput={(key, value) => updateDraft(editorRow, key, value)}
        onWorkload={(option) => selectWorkload(editorRow, option)} onWorkloadReset={() => resetWorkload(editorRow)}
        onFinish={finishEditing} onCancelCell={cancelCurrentCell} onMove={(direction) => moveCell(editorRow.id, editorField.key, direction)} />}
    </Fragment>}

    <oj-popup ref={descriptionPopupRef} class="kpi-description-popup" autoDismiss="focusLoss" tail="simple">{descriptionPopup}</oj-popup>
    <oj-dialog ref={savingDialogRef} class="kpi-saving-dialog" initialVisibility="hide" modality="modal" cancelBehavior="none" dragAffordance="none" resizeBehavior="none" dialogTitle="Saving">
      <div class="kpi-saving-content" role="status" aria-live="polite"><oj-progress-circle value={-1} size="sm" aria-label="Saving KPI activities"></oj-progress-circle><span>Saving KPI activities…</span></div>
    </oj-dialog>
    <oj-dialog ref={cancelDialogRef} class="kpi-cancel-dialog" dialogTitle="Unsaved KPI changes" initialVisibility="hide" modality="modal" cancelBehavior="escape"
      onojOpen={() => cancelKeepButtonRef.current?.focus()}>
      <div slot="body"><p>You have unsaved KPI changes. Choose whether to save them, discard them, or keep editing.</p></div>
      <div slot="footer" class="kpi-dialog-actions">
        <oj-button disabled={saving || saveDisabled} onojAction={() => { cancelDialogRef.current?.close(); void saveDrafts(); }}>Save changes</oj-button>
        <oj-button chroming="danger" disabled={saving} onojAction={cancelDrafts}>Discard changes</oj-button>
        <oj-button ref={cancelKeepButtonRef} disabled={saving} onojAction={() => cancelDialogRef.current?.close()}>Keep editing</oj-button>
      </div>
    </oj-dialog>
    <oj-dialog ref={navigationDialogRef} dialogTitle="Unsaved KPI changes" initialVisibility="hide" cancelBehavior="escape"
      onojOpen={() => navigationStayButtonRef.current?.focus()} onojClose={() => setPendingNavigation(null)}>
      <div slot="body"><p>You have unsaved KPI changes. Save them before continuing to {pendingNavigation?.label}, or discard them.</p></div>
      <div slot="footer" class="kpi-dialog-actions">
        <oj-button ref={navigationStayButtonRef} disabled={saving} onojAction={() => { navigationDialogRef.current?.close(); setPendingNavigation(null); }}>Stay</oj-button>
        <oj-button disabled={saving || saveDisabled} onojAction={() => { const action = pendingNavigation?.action; navigationDialogRef.current?.close(); setPendingNavigation(null); void (async () => { if (await saveDrafts()) action?.(); })(); }}>Save and Continue</oj-button>
        <oj-button disabled={saving} onojAction={() => { const action = pendingNavigation?.action; cancelDrafts(); navigationDialogRef.current?.close(); setPendingNavigation(null); action?.(); }}>Discard and Continue</oj-button>
      </div>
    </oj-dialog>
    <oj-dialog ref={deleteDialogRef} dialogTitle="Delete selected KPI activities" initialVisibility="hide" cancelBehavior="escape" onojOpen={() => deleteCancelButtonRef.current?.focus()}>
      <div slot="body"><p>Delete {selectedRows.length} selected KPI activity row(s)? This action is applied only after confirmation.</p></div>
      <div slot="footer" class="kpi-dialog-actions">
        <oj-button ref={deleteCancelButtonRef} disabled={saving} onojAction={() => deleteDialogRef.current?.close()}>Cancel</oj-button>
        <oj-button chroming="danger" disabled={saving} onojAction={() => { deleteDialogRef.current?.close(); void removeSelected(); }}>Delete</oj-button>
      </div>
    </oj-dialog>
  </section>;
}
