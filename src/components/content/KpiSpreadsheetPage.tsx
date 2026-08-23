import { Fragment, h } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import Context = require("ojs/ojcontext");
import { ojDialog } from "ojs/ojdialog";
import { ojPopup } from "ojs/ojpopup";
import "ojs/ojdatetimepicker";
import "ojs/ojdialog";
import "ojs/ojbutton";
import "ojs/ojpopup";
import "ojs/ojprogress-circle";

import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import {
  computeKpiColumnLayout,
  createKpiActivityEditState,
  KpiActivityEditState,
  KpiSortState,
  nextKpiSort,
  sortKpiActivityRows,
  transitionKpiActivityEdit
} from "../../data/kpiActivityGridModel";
import {
  applyManagedToSelection,
  createEmptyKpiRow,
  formatKpiWorkloadOption,
  getKpiToolbarActions,
  getReflectedSelectionAction,
  getMonthsForQuarter,
  getQuarterStatus,
  getRowsForQuarter,
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
  KpiActivitySummary,
  KpiOverviewItem,
  KpiWorkloadOption,
  listKpiOverview,
  listKpiRows,
  listKpiSummary,
  listKpiWorkloadOptions,
  saveKpiRowsAtomic
} from "../../data/kpiSpreadsheetApi";
import { KpiGuideRecord } from "../../data/kpiConfigurationApi";
import {
  getKpiTabForRoute,
  KPI_ACTIVITY_TABS,
  KPI_OVERVIEW_ROWS,
  KPI_PORTFOLIO_ROWS
} from "../../data/kpiWorkspaceDefinition";

const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];
const stageLabels: Record<WorkloadStage, string> = { identified: "Identified", validated: "Validated", onboarded: "Onboarded" };
const activities = ["Solution Design", "Solution Proposal", "Solution Deployment"];
const collapsedKpiState = (): Record<SpreadsheetKpiCode, boolean> => ({
  A: false,
  B: false,
  C1: false,
  C2: false,
  D1: false,
  F: false,
  H: false
});
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

const portfolioQuarterStatuses = (
  summary: KpiActivitySummary | null,
  code: SpreadsheetKpiCode,
  fiscalYear: FiscalYear,
  asOf: string
) => quarters.map((quarter) => {
  if (!summary) return null;
  if (code === "D1") {
    const actual = summary.d1QuarterByStage[quarter];
    const achieved = stages.some((stage) => {
      const apiStage = stage.toUpperCase() as keyof typeof actual;
      return actual[apiStage].acrK >= summary.targets.d1AcrKPerQuarter[apiStage];
    });
    return getQuarterStatus(fiscalYear, quarter, achieved ? 1 : 0, 1, asOf);
  }
  if (code === "C1" || code === "C2") {
    const actual = summary.quarterCounts.C1[quarter] + summary.quarterCounts.C2[quarter];
    return getQuarterStatus(fiscalYear, quarter, actual, summary.targets.c1C2CombinedPerQuarter, asOf);
  }
  const target = summary.targets.countPerQuarter[code as keyof typeof summary.targets.countPerQuarter];
  return getQuarterStatus(fiscalYear, quarter, summary.quarterCounts[code][quarter], target, asOf);
});

type EditorRect = Readonly<{ left: number; top: number; width: number; height: number }>;
export type KpiNavigationGuard = (label: string, action: () => void) => void;

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
  ? (row.manageTimeReflected ? "Reflected in internal system" : "Not reflected in internal system")
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

function Summary({ summary, tab, fiscalYear, asOf, selectedQuarter, onSelectQuarter, id, expanded }: Readonly<{
  summary: KpiActivitySummary | null;
  tab: SpreadsheetKpiCode;
  fiscalYear: FiscalYear;
  asOf: string;
  selectedQuarter: Quarter | null;
  onSelectQuarter: (quarter: Quarter | null) => void;
  id: string;
  expanded: boolean;
}>) {
  if (!summary) return <section id={id} class="kpi-sheet-summary" hidden={!expanded}><p role="status">Delivery summary is unavailable.</p></section>;
  const statusFor = (quarter: Quarter) => {
    if (tab === "D1") {
      const actual = summary.d1QuarterByStage[quarter];
      const achieved = stages.some((stage) => actual[stage.toUpperCase() as keyof typeof actual].acrK >= summary.targets.d1AcrKPerQuarter[stage.toUpperCase() as keyof typeof summary.targets.d1AcrKPerQuarter]);
      return getQuarterStatus(fiscalYear, quarter, achieved ? 1 : 0, 1, asOf);
    }
    if (tab === "C1" || tab === "C2") {
      const actual = summary.quarterCounts.C1[quarter] + summary.quarterCounts.C2[quarter];
      return getQuarterStatus(fiscalYear, quarter, actual, summary.targets.c1C2CombinedPerQuarter, asOf);
    }
    const target = summary.targets.countPerQuarter[tab as keyof typeof summary.targets.countPerQuarter];
    return getQuarterStatus(fiscalYear, quarter, summary.quarterCounts[tab][quarter], target, asOf);
  };
  const cardClass = (quarter: Quarter, base: string) => `${base}${selectedQuarter === quarter ? " is-selected" : ""}`;
  if (tab === "D1") {
    return <section id={id} class="kpi-sheet-summary" aria-labelledby="kpiD1Summary" hidden={!expanded}>
      <div class="kpi-sheet-summary__heading"><h3 id="kpiD1Summary">Sales Stage ACR <small>USD K by Delivery Quarter</small></h3></div>
      <div class="kpi-d1-progress-grid" aria-label="Sales Stage ACR USD K by Delivery Date fiscal quarter">
        {quarters.map((quarter) => {
          const status = statusFor(quarter);
          return <button type="button" class={cardClass(quarter, "kpi-d1-progress-quarter")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
            <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em class={`kpi-quarter-status-label ${quarterStatusClass(status)}`}>{status}</em></span>
            {stages.map((stage) => {
              const apiStage = stage.toUpperCase() as keyof KpiActivitySummary["targets"]["d1AcrKPerQuarter"];
              const actual = summary.d1QuarterByStage[quarter][apiStage].acrK;
              const target = summary.targets.d1AcrKPerQuarter[apiStage];
              const percent = target === 0 ? 100 : Math.min(100, Math.round((actual / target) * 100));
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
  return <section id={id} class="kpi-sheet-summary" aria-labelledby="kpiQuarterSummary" hidden={!expanded}>
    <div class="kpi-sheet-summary__heading"><h3 id="kpiQuarterSummary">Delivery Quarter Count</h3></div>
    <div class="kpi-quarter-summary">{quarters.map((quarter) => {
      const c1 = summary.quarterCounts.C1[quarter];
      const c2 = summary.quarterCounts.C2[quarter];
      const actual = combined ? c1 + c2 : summary.quarterCounts[tab][quarter];
      const status = statusFor(quarter);
      return <button type="button" class={cardClass(quarter, "kpi-quarter-card")} aria-pressed={selectedQuarter === quarter} onClick={() => onSelectQuarter(quarter)}>
        <span class="kpi-quarter-card__heading"><strong>{quarter}</strong><em class={`kpi-quarter-status-label ${quarterStatusClass(status)}`}>{status}</em></span>
        <b class={`kpi-quarter-count-label ${quarterStatusClass(status)}`}>{actual}</b>
        {combined && <small>C1 + C2 combined · C1 {c1} + C2 {c2} · target {summary.targets.c1C2CombinedPerQuarter}</small>}
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
  onFinish: (currentCellDirty?: boolean) => void;
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
  const [activeWorkloadIndex, setActiveWorkloadIndex] = useState(0);
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
    setActiveWorkloadIndex(0);
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
        setActiveWorkloadIndex((current) => Math.min(current, page.items.length));
      }).catch(() => {
        if (active && requestGenerationRef.current === requestGeneration) {
          setOptions([]); setOffset(0); setHasMore(false); setActiveWorkloadIndex(0);
        }
      }).finally(() => { if (active && requestGenerationRef.current === requestGeneration) setLoading(false); });
    }, 180);
    return () => { active = false; requestGenerationRef.current += 1; window.clearTimeout(timer); };
  }, [field.type, fiscalYear, query, workloadActive]);

  useEffect(() => {
    if (field.type === "workload" && workloadActive) openPopup();
  }, [field.type, hasMore, loading, openPopup, options, workloadActive]);

  useEffect(() => () => closePopup(), [closePopup]);

  useEffect(() => {
    const retainEditorFocusUntilKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Escape") event.preventDefault();
    };
    const finishKeyboardAfterFocusMove = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); closePopup(); onCancelCell(); return;
      }
      if (event.key === "Tab") {
        event.preventDefault(); closePopup(); onMove(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", retainEditorFocusUntilKeyUp, true);
    window.addEventListener("keyup", finishKeyboardAfterFocusMove);
    return () => {
      window.removeEventListener("keydown", retainEditorFocusUntilKeyUp, true);
      window.removeEventListener("keyup", finishKeyboardAfterFocusMove);
    };
  }, [closePopup, onCancelCell, onMove]);

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

  const chooseWorkload = (option: KpiWorkloadOption) => {
    closePopup(); setWorkloadActive(false); onWorkload(option); onFinish();
  };
  const resetWorkload = () => {
    closePopup(); setWorkloadActive(false); onWorkloadReset(); onFinish();
  };

  const blockContractKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLTextAreaElement && event.key === "Enter" && event.shiftKey) return;
    const workloadArrow = field.type === "workload" && (event.key === "ArrowDown" || event.key === "ArrowUp");
    if (["Escape", "Tab", "Enter"].includes(event.key) || workloadArrow) {
      event.preventDefault(); event.stopPropagation();
    }
  };

  const keyContract = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePopup(); onCancelCell(); return; }
    if (event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closePopup(); onMove(event.shiftKey ? -1 : 1); return; }
    if (field.type === "workload" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault(); event.stopPropagation();
      setWorkloadActive(true); openPopup();
      setActiveWorkloadIndex((current) => event.key === "ArrowDown"
        ? Math.min(options.length, current + 1)
        : Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement && event.shiftKey)) {
      event.preventDefault(); event.stopPropagation();
      if (field.type === "workload" && workloadActive && workloadPopupRef.current?.isOpen()) {
        if (activeWorkloadIndex === 0) resetWorkload();
        else if (options[activeWorkloadIndex - 1]) chooseWorkload(options[activeWorkloadIndex - 1]);
        return;
      }
      closePopup(); onFinish();
    }
  };

  const overlayStyle = { left: `${rect.left}px`, top: `${rect.top}px`, width: `${overlayWidth}px`, height: `${overlayHeight}px` };
  const commonClass = `kpi-cell-editor-overlay${isTextarea ? " kpi-cell-editor-overlay--textarea" : ""}`;
  let editor: h.JSX.Element;
  if (field.type === "workload") {
    editor = <div class="kpi-workload-launcher">
      <input id={`kpi-workload-launcher-${state.generation}`} ref={workloadInputRef} type="search" value={query} role="combobox" aria-label="Search Account, Workload, or Oppty.No"
        aria-controls={`kpi-workload-options-${state.generation}`} aria-expanded={workloadActive}
        aria-activedescendant={`kpi-workload-option-${state.generation}-${activeWorkloadIndex}`}
        placeholder={row.accountWorkload || "Search Account, Workload, or Oppty.No"}
        onInput={(event) => { setQuery((event.currentTarget as HTMLInputElement).value); setActiveWorkloadIndex(0); setWorkloadActive(true); }}
        onClick={() => { setWorkloadActive(true); openPopup(); }} onKeyDown={blockContractKey} onKeyUp={keyContract} />
      <oj-popup ref={workloadPopupRef} class="kpi-workload-results-popup" autoDismiss="focusLoss" initialFocus="none" modality="modeless" tail="none">
        <div id={`kpi-workload-options-${state.generation}`} class="kpi-workload-cell-editor__results" role="listbox" aria-label="Workload search results"
          onScroll={(event) => { const target = event.currentTarget as HTMLDivElement; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 8) loadMore(); }}>
          <button id={`kpi-workload-option-${state.generation}-0`} type="button" role="option" aria-selected={activeWorkloadIndex === 0} tabIndex={-1}
            class="kpi-workload-reset-option" onMouseDown={(event) => event.preventDefault()} onClick={resetWorkload}>
            <strong>선택 안함</strong><small>기존 값으로 되돌리기</small>
          </button>
          {options.map((option, index) => <button key={option.workloadId} id={`kpi-workload-option-${state.generation}-${index + 1}`} type="button" role="option"
            aria-selected={activeWorkloadIndex === index + 1} tabIndex={-1} title={formatKpiWorkloadOption(option)}
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
      aria-label={field.label} onInput={(event) => onInput(field.key, (event.currentTarget as HTMLTextAreaElement).value)} onKeyDown={blockContractKey} onKeyUp={keyContract}></textarea>;
  } else if (field.type === "date") {
    editor = <oj-input-date ref={editorRef as any} class="kpi-cell-editor-control kpi-cell-editor-control--date" labelHint={field.label} labelEdge="none"
      value={value} onvalueChanged={(event: CustomEvent) => {
        const nextValue = `${event.detail.value ?? ""}`;
        onInput(field.key, nextValue);
        onFinish(nextValue !== state.originalValue);
      }} onKeyDown={blockContractKey} onKeyUp={keyContract}></oj-input-date>;
  } else {
    const choices = field.type === "quarter" ? quarters
      : field.type === "month" ? getMonthsForQuarter(row.kpiCode === "D1" ? (row.targetQuarter || "Q1") : row.quarter)
        : field.type === "stage" ? stages : field.type === "activity" ? activities : null;
    editor = choices ? <select ref={editorRef as any} class="kpi-cell-editor-control" value={value} aria-label={field.label}
      onChange={(event) => { onInput(field.key, (event.currentTarget as HTMLSelectElement).value); onFinish(); }} onKeyDown={blockContractKey} onKeyUp={keyContract}>
      {choices.map((choice) => <option value={choice}>{field.type === "stage" ? stageLabels[choice as WorkloadStage] : choice}</option>)}
    </select> : <input ref={editorRef as any} class="kpi-cell-editor-control" type={field.type === "number" ? "number" : "text"}
      min={field.type === "number" ? "0" : undefined} value={value} aria-label={field.label}
      onInput={(event) => onInput(field.key, (event.currentTarget as HTMLInputElement).value)} onKeyDown={blockContractKey} onKeyUp={keyContract} />;
  }

  return <div data-kpi-single-editor data-kpi-editor-row={row.id} data-kpi-editor-field={field.key}
    class={commonClass} style={overlayStyle} onMouseDown={stopGridInteraction} onClick={stopGridInteraction} onDblClick={stopGridInteraction}>
    {editor}
  </div>;
}

export function KpiSpreadsheetPage({ fiscalYear, routeId, guideDataFiscalYear, guideRecords, guideLoading, guideError, onNavigate, onNavigationGuardChange, onWriteStateChange }: Readonly<{
  fiscalYear: FiscalYear;
  routeId: string;
  guideDataFiscalYear: FiscalYear | null;
  guideRecords: KpiGuideRecord[];
  guideLoading: boolean;
  guideError: string;
  onNavigate: (routeId: string) => void;
  onNavigationGuardChange: (guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => void;
  onWriteStateChange: (active: boolean) => void;
}>) {
  const activeTab = getKpiTabForRoute(routeId);
  const tableScopeKey = `${fiscalYear}:${activeTab}`;
  const [rows, setRows] = useState<KpiSpreadsheetRow[]>([]);
  const [overviewItems, setOverviewItems] = useState<KpiOverviewItem[]>([]);
  const [activitySummary, setActivitySummary] = useState<KpiActivitySummary | null>(null);
  const [selectionByScope, setSelectionByScope] = useState<Record<string, Set<string>>>({});

  const [drafts, setDrafts] = useState<KpiSpreadsheetRow[]>([]);
  const [editState, setEditState] = useState<KpiActivityEditState>(createKpiActivityEditState);
  const editStateRef = useRef(editState);
  editStateRef.current = editState;
  const editRowSnapshotRef = useRef<KpiSpreadsheetRow | null>(null);
  const [editorRect, setEditorRect] = useState<EditorRect | null>(null);
  const editorAnchorRef = useRef<HTMLElement | null>(null);
  const pendingAutoEditRowIdRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const beginWrite = () => { setSaving(true); onWriteStateChange(true); };
  const endWrite = () => { setSaving(false); onWriteStateChange(false); };
  const savingDialogDesiredRef = useRef(false);
  const savingDialogGenerationRef = useRef(0);
  const [apiMessage, setApiMessage] = useState("Loading KPI activities…");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(null);
  const [summaryExpandedByTab, setSummaryExpandedByTab] = useState<Record<SpreadsheetKpiCode, boolean>>(collapsedKpiState);
  const [guideExpandedByTab, setGuideExpandedByTab] = useState<Record<SpreadsheetKpiCode, boolean>>(collapsedKpiState);
  const [sortByScope, setSortByScope] = useState<Record<string, KpiSortState | null>>({});
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [pendingNavigation, setPendingNavigation] = useState<null | { label: string; action: () => void }>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const tableHostRef = useRef<HTMLDivElement | null>(null);
  const navigationDialogRef = useRef<ojDialog | null>(null);
  const cancelDialogRef = useRef<ojDialog | null>(null);
  const deleteDialogRef = useRef<ojDialog | null>(null);
  const savingDialogRef = useRef<ojDialog | null>(null);
  const navigationStayButtonRef = useRef<any>(null);
  const cancelKeepButtonRef = useRef<any>(null);
  const deleteCancelButtonRef = useRef<any>(null);
  const sessionVersion = useRef(0);
  const sessionKeyRef = useRef(`${routeId}:${fiscalYear}`);
  sessionKeyRef.current = `${routeId}:${fiscalYear}`;

  const activeRows = useMemo(() => rows.filter((row) => row.fiscalYear === fiscalYear), [rows, fiscalYear]);
  const authoritativeRows = useMemo(() => activeTab === "Overview" ? activeRows : activeRows.filter((row) => row.kpiCode === activeTab), [activeRows, activeTab]);
  const fields = activeTab === "Overview" ? [] : KPI_FIELD_CONTRACTS[activeTab];
  const showSummary = activeTab !== "Overview";
  const activeDrafts = useMemo(() => drafts.filter((draft) =>
    draft.fiscalYear === fiscalYear && (activeTab === "Overview" || draft.kpiCode === activeTab)), [drafts, fiscalYear, activeTab]);
  const draftById = useMemo(() => new Map(activeDrafts.map((draft) => [draft.id, draft])), [activeDrafts]);
  const effectiveRows = useMemo(() => [
    ...activeDrafts.filter((draft) => draft.id.startsWith("draft-")),
    ...authoritativeRows.map((row) => draftById.get(row.id) ?? row)
  ], [authoritativeRows, draftById, activeDrafts]);
  const selectedIds = selectionByScope[tableScopeKey] ?? new Set<string>();
  const setSelectedIds = useCallback((nextValue: Set<string> | ((current: Set<string>) => Set<string>)) => {
    setSelectionByScope((current) => {
      const currentSelection = current[tableScopeKey] ?? new Set<string>();
      const nextSelection = typeof nextValue === "function" ? nextValue(currentSelection) : nextValue;
      return { ...current, [tableScopeKey]: nextSelection };
    });
  }, [tableScopeKey]);
  const sortState = sortByScope[tableScopeKey] ?? null;
  const setSortState = useCallback((nextValue: KpiSortState | null | ((current: KpiSortState | null) => KpiSortState | null)) => {
    setSortByScope((current) => {
      const currentSort = current[tableScopeKey] ?? null;
      const nextSort = typeof nextValue === "function" ? nextValue(currentSort) : nextValue;
      return { ...current, [tableScopeKey]: nextSort };
    });
  }, [tableScopeKey]);
  const activeSortState = sortState && fields.some((field) => field.key === sortState.field) ? sortState : null;
  const quarterRows = useMemo(() => getRowsForQuarter(effectiveRows, showSummary ? selectedQuarter : null), [effectiveRows, selectedQuarter, showSummary]);
  const visibleRows = useMemo(() => sortKpiActivityRows(quarterRows, activeSortState), [quarterRows, activeSortState]);
  const visibleRowsById = useMemo(() => new Map(visibleRows.map((row) => [row.id, row])), [visibleRows]);
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

  const finishEditing = useCallback((currentCellDirty = false) => {
    setEditState((current) => transitionKpiActivityEdit(current, { type: "finish", hasDrafts: currentCellDirty || drafts.length > 0 }));
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
    if (field.type === "manageTime") return;
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

  useEffect(() => {
    const rowId = pendingAutoEditRowIdRef.current;
    if (!rowId || editState.cell || fields.length === 0) return;
    const row = drafts.find((draft) => draft.id === rowId);
    const field = fields.find((item) => item.type !== "manageTime");
    if (!row || !field) return;
    const element = tableRef.current?.querySelector<HTMLElement>(
      `[data-kpi-grid-row="${CSS.escape(rowId)}"][data-kpi-grid-field="${field.key}"]`
    );
    if (!element) return;
    pendingAutoEditRowIdRef.current = null;
    beginEditing(row, field, element);
  }, [beginEditing, drafts, editState.cell, fields]);

  useEffect(() => {
    const anchor = editorAnchorRef.current;
    const host = tableHostRef.current;
    if (!editState.cell || !anchor || !host) return;
    const syncEditorRect = () => {
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      setEditorRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    host.addEventListener("scroll", syncEditorRect, { passive: true });
    window.addEventListener("resize", syncEditorRect);
    return () => {
      host.removeEventListener("scroll", syncEditorRect);
      window.removeEventListener("resize", syncEditorRect);
    };
  }, [editState.cell]);

  const cancelCurrentCell = useCallback(() => {
    const snapshot = editRowSnapshotRef.current;
    if (snapshot) setDrafts((current) => reconcileDraft(current, snapshot));
    finishEditing();
  }, [finishEditing, reconcileDraft]);

  const moveCell = useCallback((rowId: string, fieldKey: KpiFieldKey, direction: -1 | 1) => {
    const cells = visibleRows.flatMap((row) => fields.filter((field) => field.type !== "manageTime").map((field) => ({ row, field })));
    const index = cells.findIndex((item) => item.row.id === rowId && item.field.key === fieldKey);
    if (index < 0 || cells.length === 0) { finishEditing(); return; }
    const next = cells[(index + direction + cells.length) % cells.length];
    const selector = `[data-kpi-grid-row="${CSS.escape(next.row.id)}"][data-kpi-grid-field="${next.field.key}"]`;
    const element = tableRef.current?.querySelector<HTMLElement>(selector);
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
      if (!target || target.closest("[data-kpi-single-editor]") || target.closest("oj-popup.kpi-workload-results-popup") || target.closest(".oj-datepicker-popup")) return;
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
    pendingAutoEditRowIdRef.current = null;
    setSelectedQuarter(null);
    setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" }));
    setEditorRect(null); editorAnchorRef.current = null; editRowSnapshotRef.current = null;
  }, [routeId, fiscalYear]);

  useEffect(() => {
    let active = true;
    setRows([]); setOverviewItems([]); setActivitySummary(null); setApiMessage("Loading KPI activities…");
    void Promise.all([listKpiRows(fiscalYear), listKpiOverview(fiscalYear), listKpiSummary(fiscalYear)]).then(([items, overview, summary]) => {
      if (!active) return;
      setRows(items); setOverviewItems(overview.items); setActivitySummary(summary); setAsOf(overview.asOf);
      setApiMessage(`Live API connected · ${items.length} activities · as of ${overview.asOf}`);
    }).catch(() => { if (active) setApiMessage("KPI API unavailable — no fallback customer data is shown"); });
    return () => { active = false; };
  }, [fiscalYear, reloadVersion]);

  useEffect(() => {
    const host = tableHostRef.current;
    if (!host || fields.length === 0) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      setColumnLayout(computeKpiColumnLayout(fields, Math.max(0, host.clientWidth - 1)));
    };
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    };
    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeTab, fields]);

  const selectableVisibleIds = visibleRows.map((row) => row.id);
  const selectedRows = visibleRows.filter((row) => selectedIds.has(row.id));
  const setVisibleSelection = useCallback((ids: readonly string[]) => setSelectedIds(new Set(ids)), [setSelectedIds]);
  const setRowSelection = useCallback((rowId: string, selected: boolean) => setSelectedIds((current) => {
    const next = new Set(current); if (selected) next.add(rowId); else next.delete(rowId); return next;
  }), [setSelectedIds]);
  const activateSelectorCell = (event: KeyboardEvent, action: () => void) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && ![" ", "Space", "Spacebar"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); action();
  };
  const toggleVisibleSelectionFromCell = (event: MouseEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    setVisibleSelection(selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.has(id)) ? [] : selectableVisibleIds);
  };
  const toggleRowSelectionFromCell = (event: MouseEvent, rowId: string) => {
    if (event.target instanceof HTMLInputElement) return;
    setRowSelection(rowId, !selectedIds.has(rowId));
  };

  const applyManaged = (managed: boolean) => {
    if (saving || selectedRows.length === 0) return;
    finishEditing();
    const selected = selectedRows.map((row) => row.id);
    setDrafts((current) => applyManagedToSelection(authoritativeRows, current, selected, managed));
    setApiMessage(`${selected.length} KPI activity row(s) marked ${managed ? "reflected" : "not reflected"} in Draft`);
  };

  const toggleSort = useCallback((field: KpiFieldKey) => {
    finishEditing();
    setSortState((current) => nextKpiSort(current, field));
  }, [finishEditing, setSortState]);

  const renderNativeCell = (row: KpiSpreadsheetRow, field: KpiField) => {
    const saved = authoritativeRows.find((item) => item.id === row.id);
    const rowDirty = !saved || isKpiRowChanged(saved, row, fields);
    const changed = !saved || isKpiFieldChanged(saved, row, field.key);
    const fixedValue = field.type !== "workload" && field.type !== "textarea";
    const classes = [
      "kpi-grid-cell",
      fixedValue ? "kpi-grid-cell--fixed" : "",
      selectedIds.has(row.id) ? "is-selected" : "",
      row.manageTimeReflected ? "kpi-manage-time-reflected-row" : "",
      rowDirty ? "is-unsaved-row" : "",
      changed ? "is-unsaved-cell" : ""
    ].filter(Boolean).join(" ");
    const editable = field.type !== "manageTime";
    return <td key={field.key} class={classes} data-kpi-grid-row={row.id} data-kpi-grid-field={field.key}
      tabIndex={0} aria-label={`${field.label}: ${displayValue(row, field.key) || "blank"}`}
      onKeyDown={(event) => {
        if (!["Enter", " ", "Space", "Spacebar", "F2"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
      }}
      onKeyUp={(event) => {
        if (!["Enter", " ", "Space", "Spacebar", "F2"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); if (editable) beginEditing(row, field, event.currentTarget);
      }}
      onDblClick={(event) => { event.preventDefault(); event.stopPropagation(); if (editable) beginEditing(row, field, event.currentTarget); }}>
      {field.type === "manageTime"
        ? <span class={`kpi-reflected-status-badge ${row.manageTimeReflected ? "is-reflected" : "is-not-reflected"}`} role="img"
            aria-label={row.manageTimeReflected ? "Reflected in internal system" : "Not reflected in internal system"}
            title={row.manageTimeReflected ? "Reflected in internal system" : "Not reflected in internal system"}>
            <span class={row.manageTimeReflected ? "oj-ux-ico-check-circle" : "oj-ux-ico-clock"} aria-hidden="true"></span>
            <span aria-hidden="true">{row.manageTimeReflected ? "Reflected" : "Pending"}</span>
          </span>
        : field.type === "textarea" ? <span class="kpi-cell-description">{displayValue(row, field.key)}</span> : <span>{displayValue(row, field.key)}</span>}
    </td>;
  };

  const editorRow = editState.cell ? visibleRowsById.get(editState.cell.rowId) : null;
  const editorField = editState.cell ? fields.find((field) => field.key === editState.cell?.field) : null;
  const activeDefinition = KPI_OVERVIEW_ROWS.find((row) => row.code === activeTab);
  const overviewByCode = useMemo(() => new Map(overviewItems.map((item) => [item.code, item])), [overviewItems]);
  const activeTarget = activeTab === "Overview" ? "" : overviewByCode.get(activeTab)?.target ?? "Target unavailable";
  const toolbarActions = getKpiToolbarActions(drafts.length, selectedRows.length);
  const reflectedAction = getReflectedSelectionAction(selectedRows);
  const invalidDraftCount = drafts.filter((draft) => isKpiDraftInvalid(draft, rows.find((row) => row.id === draft.id))).length;
  const reflectedRequirementsMissing = drafts.some((draft) => draft.manageTimeReflected
    && (!draft.deliveryDate || (draft.kpiCode !== "H" && !draft.srNumber.trim())));
  const saveDisabled = drafts.length === 0 || saving || drafts.some((draft) => isKpiDraftInvalid(draft, authoritativeRows.find((row) => row.id === draft.id)));
  const salesSummary = activeTab === "D1";
  const activityTab = activeTab as SpreadsheetKpiCode;

  const summaryExpanded = summaryExpandedByTab[activityTab] ?? false;
  const summaryId = salesSummary ? "kpiSalesStageAcrSummary" : "kpiTargetQuarterCountSummary";
  const summaryLabel = salesSummary ? "Stage / ACR" : "Quarter Summary";
  const guideId = `kpiActivityGuide${activityTab}`;
  const guideExpanded = guideExpandedByTab[activityTab] ?? false;
  const guideRecordsStale = guideDataFiscalYear !== fiscalYear;
  const activeGuide = guideRecords.find((item) => item.kpiCode === activeTab && item.fiscalYear === fiscalYear);
  const toggleSummary = () => setSummaryExpandedByTab((current) => ({
    ...current,
    [activityTab]: !current[activityTab]
  }));
  const toggleGuide = () => setGuideExpandedByTab((current) => ({
    ...current,
    [activityTab]: !current[activityTab]
  }));

  const addDraft = () => {
    if (saving || drafts.length > 0 || editState.cell || activeTab === "Overview") return;
    const draft = createEmptyKpiRow(activeTab as SpreadsheetKpiCode, fiscalYear);
    pendingAutoEditRowIdRef.current = draft.id;
    setDrafts([draft]);
  };

  const cancelDrafts = useCallback(() => {
    pendingAutoEditRowIdRef.current = null;
    setEditState((current) => transitionKpiActivityEdit(current, { type: "cancel" }));
    setEditorRect(null); editorAnchorRef.current = null; editRowSnapshotRef.current = null;
    setDrafts([]); setSelectedIds(new Set()); setApiMessage("Unsaved KPI changes discarded");
    cancelDialogRef.current?.close();
    setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" }));
  }, [setSelectedIds]);

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
    beginWrite();
    let saved: KpiSpreadsheetRow[] = [];
    let failed = false;
    try {
      saved = await saveKpiRowsAtomic(draftSnapshot);
    } catch {
      failed = true;
    }
    await minimumProgress(startedAt);
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      await settleSavingDialogClosed();
      endWrite(); setReloadVersion((current) => current + 1); setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" })); return false;
    }
    if (!failed) {
      setRows((current) => {
        const savedByOldId = new Map(draftSnapshot.map((draft, index) => [draft.id, saved[index]]));
        const next = current.map((row) => savedByOldId.get(row.id) ?? row);
        return [...next, ...draftSnapshot.flatMap((draft, index) => draft.id.startsWith("draft-") ? [saved[index]] : []).filter(Boolean)];
      });
      setDrafts([]);
      setSelectedIds(new Set());
      setReloadVersion((current) => current + 1);
    }
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      await settleSavingDialogClosed();
      endWrite(); setReloadVersion((current) => current + 1); setEditState((current) => transitionKpiActivityEdit(current, { type: "reset" })); return false;
    }
    setApiMessage(failed ? "KPI changes could not be saved. Drafts are unchanged; retry when ready." : `${saved.length} KPI activity row(s) saved atomically`);
    await settleSavingDialogClosed();
    endWrite();
    setEditState((current) => transitionKpiActivityEdit(current, { type: "save-result", hasFailures: failed }));
    return !failed;
  };

  const removeSelected = async () => {
    if (saving || selectedRows.length === 0) return;
    const rowsToDelete = [...selectedRows];
    const deleteSession = sessionVersion.current;
    const deleteSessionKey = sessionKeyRef.current;
    savingDialogDesiredRef.current = true;
    beginWrite();
    const outcomes = await Promise.allSettled(rowsToDelete.map((row) => deleteKpiRow(row)));
    if (sessionVersion.current !== deleteSession || sessionKeyRef.current !== deleteSessionKey) {
      await settleSavingDialogClosed();
      endWrite();
      setReloadVersion((current) => current + 1);
      return;
    }
    const deletedIds = new Set(rowsToDelete.filter((_, index) => outcomes[index].status === "fulfilled").map((row) => row.id));
    const failedIds = rowsToDelete.filter((_, index) => outcomes[index].status === "rejected").map((row) => row.id);
    setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
    setDrafts((current) => current.filter((row) => !deletedIds.has(row.id)));
    setSelectedIds(new Set(failedIds));
    setApiMessage(failedIds.length === 0 ? `${deletedIds.size} KPI activity row(s) deleted` : `${deletedIds.size} deleted · ${failedIds.length} failed`);
    setReloadVersion((current) => current + 1);
    await settleSavingDialogClosed();
    endWrite();
  };

  const requestProtectedNavigation = useCallback<KpiNavigationGuard>((label, action) => {
    finishEditing();
    if (drafts.length === 0) { action(); return; }
    setPendingNavigation({ label, action });
    void waitForFrame().then(() => navigationDialogRef.current?.open());
  }, [drafts.length, finishEditing]);
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
      <p>{activeTab === "Overview" ? "FY-scoped KPI activity workspace" : `${activeTarget} · ${activeDefinition?.summaryModel}`}</p>
      <p class="kpi-api-status" role="status">{apiMessage}</p></div>
      <div class="kpi-spreadsheet-page__fiscal-year" aria-label="Selected fiscal year"><span>Fiscal Year</span><strong>{fiscalYear}</strong></div>
    </header>
    <KpiWorkspaceTabs routeId={routeId} onNavigate={onNavigate} disabled={saving} />

    {activeTab === "Overview" ? <Fragment>
      <div class="kpi-overview-metrics" aria-label={`${fiscalYear} KPI portfolio summary`}><article><span>KPI categories</span><strong>7</strong></article><article><span>Reflected activities</span><strong>{rows.filter((row) => row.manageTimeReflected).length}</strong></article><article><span>Count-based</span><strong>6</strong></article><article><span>Stage/ACR-based</span><strong>1</strong></article></div>
      <section class="kpi-overview-portfolio" aria-labelledby="kpiPortfolioTitle"><div class="kpi-overview-portfolio__heading"><h3 id="kpiPortfolioTitle">{fiscalYear} KPI portfolio</h3><span>Quarter status from reflected Delivery Date activity</span></div>
        <div class="kpi-overview-portfolio__table-wrap"><table><thead><tr><th>KPI</th><th>Target</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead><tbody>{KPI_PORTFOLIO_ROWS.map((row) => { const overview = overviewByCode.get(row.code); const statuses = portfolioQuarterStatuses(activitySummary, row.code, fiscalYear, asOf); return <tr><td><button type="button" class="kpi-overview-route-link" onClick={() => onNavigate(`activity-${row.code.toLowerCase()}`)}><span class="kpi-sheet-tab-code">{row.code === "C1" ? "C1+C2" : row.code}</span><strong>{row.name}</strong></button></td><td>{overview?.target ?? "—"}</td>{statuses.map((status, index) => <td key={`${row.code}:${quarters[index]}`}><span class={`kpi-status-badge kpi-status-badge--${(status ?? "unknown").toLowerCase().replace(" ", "-")}`}>{status ?? "—"}</span></td>)}</tr>; })}</tbody></table></div>
      </section>
    </Fragment> : <Fragment>
      <div class="kpi-activity-toolbar" role="toolbar" aria-label={`${activeTab} activity actions`}>
        <div class="kpi-activity-toolbar__left"><button type="button" disabled={saving || drafts.length > 0 || editState.cell !== null} onClick={addDraft}>Add KPI Activity</button>
          {showSummary && <button type="button" class="kpi-summary-toggle" aria-controls={summaryId} aria-expanded={summaryExpanded} onClick={toggleSummary}>
            <span class="kpi-toggle-chevron" aria-hidden="true">{summaryExpanded ? "⌄" : "›"}</span>
            <span>{summaryLabel}</span>
          </button>}
          <button type="button" class="kpi-guide-toggle" aria-controls={guideId} aria-expanded={guideExpanded} onClick={toggleGuide}>
            <span class="kpi-toggle-chevron" aria-hidden="true">{guideExpanded ? "⌄" : "›"}</span>
            <span>KPI Guide</span>
          </button>
        </div>
        <div class="kpi-activity-toolbar__right">
          {reflectedAction && <button type="button" class="kpi-reflected-action" disabled={saving}
            title={reflectedAction.label} aria-label={reflectedAction.label}
            onClick={() => applyManaged(reflectedAction.managed)}>{reflectedAction.label}</button>}
          {toolbarActions.includes("save") && <button type="button" disabled={saveDisabled} onClick={() => { void saveDrafts(); }}>Save</button>}
          {toolbarActions.includes("cancel") && <button type="button" disabled={saving} onClick={requestCancel}>Cancel</button>}
          {toolbarActions.includes("delete") && <button class="kpi-delete-button" type="button" disabled={saving} onClick={() => deleteDialogRef.current?.open()}>Delete</button>}
        </div>
      </div>
      {invalidDraftCount > 0 && <p class="kpi-draft-validation" role="alert">{reflectedRequirementsMissing
        ? "Reflected requires both SR Number and Delivery Date."
        : "Complete required fields before saving."}</p>}
      {showSummary && <Summary id={summaryId} expanded={summaryExpanded} summary={activitySummary} tab={activeTab} fiscalYear={fiscalYear} asOf={asOf} selectedQuarter={selectedQuarter} onSelectQuarter={selectQuarter} />}
      <section id={guideId} class="kpi-activity-guide" hidden={!guideExpanded} aria-labelledby={`${guideId}Title`}>
        <div class="kpi-activity-guide__heading">
          <div><span class="kpi-eyebrow">{activeTab} KPI Guide</span><h3 id={`${guideId}Title`}>{activeDefinition?.name}</h3></div>
          <span>{fiscalYear}</span>
        </div>
        {(guideLoading || guideRecordsStale) ? <p role="status">Loading KPI Guide…</p> : guideError ? <p class="kpi-activity-guide__error" role="alert">{guideError}</p> : activeGuide ? <Fragment>
          <dl class="kpi-activity-guide__facts">
            {activeGuide.combinedSrType ? <div><dt>SR / Business SR Type</dt><dd>{activeGuide.combinedSrType}</dd></div> : <Fragment>
              <div><dt>SR Type</dt><dd>{activeGuide.srType}</dd></div>
              <div><dt>Business SR Type</dt><dd>{activeGuide.businessSrType}</dd></div>
            </Fragment>}
            <div><dt>Target</dt><dd>{activeGuide?.targetPerQuarter}</dd></div>
            <div><dt>Activity</dt><dd>{activeGuide?.activity}</dd></div>
            <div><dt>Task Type</dt><dd>{activeGuide.taskType}</dd></div>
            <div><dt>What are we measuring?</dt><dd>{activeGuide?.measuring}</dd></div>
          </dl>
          {(activeGuide.details || activeGuide.notes) && <div class="kpi-activity-guide__detail">
            {activeGuide.details && <p>{activeGuide.details}</p>}
            {activeGuide.notes && <p><strong>Notes</strong><br />{activeGuide.notes}</p>}
          </div>}
        </Fragment> : <p role="status">No KPI Guide is available for {activeTab}.</p>}
      </section>
      <div ref={tableHostRef} class="kpi-activities-table-wrap" data-kpi-table-scope={tableScopeKey}>
        <table ref={tableRef} class="kpi-activities-table" aria-label={`${activeTab} editable KPI activities`}
          style={{ width: `${columnLayout.totalWidth}px` }}>
          <colgroup>
            <col style={{ width: `${columnLayout.selectorWidth}px` }} />
            {fields.map((field) => <col key={field.key} style={{ width: `${columnLayout.widths[field.key] ?? 112}px` }} />)}
          </colgroup>
          <thead><tr>
            <th class="kpi-grid-column-header kpi-selector-cell" scope="col" tabIndex={0}
              aria-label="Toggle all visible KPI activities" onClick={toggleVisibleSelectionFromCell}
              onKeyDown={(event) => activateSelectorCell(event, () => setVisibleSelection(selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.has(id)) ? [] : selectableVisibleIds))}>
              <div class="kpi-select-all-header" onMouseDown={stopGridInteraction} onDblClick={stopGridInteraction}>
                <KpiSelectAll availableIds={selectableVisibleIds} selectedIds={selectedIds} onSelectionChange={setVisibleSelection} />
              </div>
            </th>
            {fields.map((field) => {
              const activeSort = activeSortState?.field === field.key;
              const ariaSort = activeSort ? (activeSortState?.direction === "asc" ? "ascending" : "descending") : "none";
              return <th key={field.key} class="kpi-grid-column-header" scope="col" aria-sort={ariaSort}>
                <button type="button" class="kpi-grid-sort-button" data-kpi-sort-field={field.key}
                  aria-label={`Sort by ${field.label}`} aria-pressed={activeSort}
                  onClick={() => toggleSort(field.key)}>
                  <span class="kpi-grid-header-title">{field.label}</span>
                  <span class="kpi-grid-sort-indicator" aria-hidden="true">{activeSort ? (activeSortState?.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>;
            })}
          </tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={`${tableScopeKey}:${row.id}`} data-kpi-row-id={row.id}
            class={[row.manageTimeReflected ? "kpi-manage-time-reflected-row" : "", selectedIds.has(row.id) ? "is-selected" : ""].filter(Boolean).join(" ")}>
            <td class="kpi-grid-cell kpi-selector-cell" data-kpi-grid-row={row.id} tabIndex={0}
              aria-label={`Toggle selection for KPI activity ${row.id}`}
              onClick={(event) => toggleRowSelectionFromCell(event, row.id)} onDblClick={stopGridInteraction}
              onKeyDown={(event) => activateSelectorCell(event, () => setRowSelection(row.id, !selectedIds.has(row.id)))}>
              <KpiRowSelector rowId={row.id} selected={selectedIds.has(row.id)} onSelectionChange={(selected) => setRowSelection(row.id, selected)} />
            </td>
            {fields.map((field) => renderNativeCell(row, field))}
          </tr>)}</tbody>
        </table>
      </div>
      {visibleRows.length === 0 && <p class="kpi-sheet-empty">No {activeTab} activities for {selectedQuarter ?? fiscalYear}.</p>}
      {editorRow && editorField && editorRect && <KpiSingleCellEditor state={editState} row={editorRow} field={editorField} rect={editorRect}
        fiscalYear={fiscalYear} onInput={(key, value) => updateDraft(editorRow, key, value)}
        onWorkload={(option) => selectWorkload(editorRow, option)} onWorkloadReset={() => resetWorkload(editorRow)}
        onFinish={finishEditing} onCancelCell={cancelCurrentCell} onMove={(direction) => moveCell(editorRow.id, editorField.key, direction)} />}
    </Fragment>}

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
