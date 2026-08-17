import { Fragment, h, render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojtable";
import "ojs/ojdatetimepicker";
import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import {
  buildKpiSummary,
  createEmptyKpiRow,
  formatKpiWorkloadOption,
  getSelectedKpiRowIds,
  getKpiToolbarActions,
  getMonthsForQuarter,
  isKpiFieldChanged,
  isKpiDraftInvalid,
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
  KpiActivityTab
} from "../../data/kpiWorkspaceDefinition";

const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];
const stageLabels: Record<WorkloadStage, string> = { identified: "Identified", validated: "Validated", onboarded: "Onboarded" };
const stageTargets: Record<WorkloadStage, number> = { identified: 2000, validated: 1000, onboarded: 500 };
const activities = ["Solution Design", "Solution Proposal", "Solution Deployment"];

type ActiveCell = Readonly<{ rowId: string; field: KpiFieldKey }>;

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

function Summary({ rows, tab }: Readonly<{ rows: KpiSpreadsheetRow[]; tab: SpreadsheetKpiCode }>) {
  const summary = buildKpiSummary(rows);
  if (tab === "D1") {
    return <section class="kpi-sheet-summary" aria-labelledby="kpiD1Summary">
      <h3 id="kpiD1Summary">Sales Stage ACR <small>USD K</small></h3>
      <div class="kpi-d1-progress-grid" aria-label="Sales Stage ACR USD K by Delivery Date fiscal quarter">
        {quarters.map((quarter) => <article class="kpi-d1-progress-quarter">
          <h4>{quarter}</h4>
          {stages.map((stage) => {
            const actual = summary.d1[quarter][stage];
            const target = stageTargets[stage];
            const percent = Math.min(100, Math.round((actual / target) * 100));
            return <div class="kpi-d1-progress-item">
              <div class="kpi-d1-progress-label"><span>{stageLabels[stage]}</span><strong>{actual.toLocaleString()} / {target.toLocaleString()}K</strong></div>
              <div class="kpi-d1-progress-track" role="progressbar" aria-label={`${quarter} ${stageLabels[stage]} ${actual} of ${target}K`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={actual}>
                <span class={`kpi-d1-progress-fill kpi-d1-progress-fill--${stage}`} style={{ width: `${percent}%` }}></span>
              </div>
            </div>;
          })}
        </article>)}
      </div>
    </section>;
  }
  if (tab === "C1" || tab === "C2") {
    return <section class="kpi-sheet-summary" aria-labelledby="kpiMonthSummary"><h3 id="kpiMonthSummary">Fiscal Month → Delivery Date fiscal-quarter roll-up</h3>
      <div class="kpi-month-summary">{quarters.map((quarter) => <article><strong>{quarter}</strong>{getMonthsForQuarter(quarter).map((month) => <span>{month} <b>{summary.monthly[tab][quarter][month]}</b></span>)}<span class="is-total">{tab} rows <b>{summary.monthly[tab][quarter].total}</b></span><span class="is-combined">C1 + C2 <b>{summary.c1c2Combined[quarter].actual} / {summary.c1c2Combined[quarter].target}</b></span></article>)}</div>
    </section>;
  }
  return <section class="kpi-sheet-summary" aria-labelledby="kpiQuarterSummary"><h3 id="kpiQuarterSummary">Target Quarter count <small>by Delivery Date</small></h3>
    <div class="kpi-quarter-summary">{quarters.map((quarter) => <span><strong>{quarter}</strong><b>{summary.quarterly[tab][quarter]}</b> activities</span>)}</div>
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

  const choose = (option: KpiWorkloadOption) => { onChange(option); onCommit(); };
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
    }).finally(() => { if (requestVersion.current === requestVersionAtStart) setLoading(false); });
  };

  return <div class="kpi-workload-cell-editor">
    <input type="search" autofocus value={query} aria-label="Search Account, Workload, or Oppty.No"
      placeholder={row.accountWorkload || "Search Account, Workload, or Oppty.No"}
      onInput={(event) => { const next = (event.currentTarget as HTMLInputElement).value; queryRef.current = next; setQuery(next); }}
      onKeyDown={(event) => { if (event.key === "Enter" && options[0]) { event.preventDefault(); choose(options[0]); } }} />
    <div class="kpi-workload-cell-editor__results" role="listbox" aria-label="Workload search results"
      onScroll={(event) => { const target = event.currentTarget as HTMLDivElement; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 8) loadMore(); }}>
      {options.map((option) => <button type="button" role="option" onClick={() => choose(option)}>
        <strong>{formatKpiWorkloadOption(option)}</strong><small>Workload ID {option.workloadId}</small>
      </button>)}
      {loading && <span>Loading…</span>}
      {!loading && options.length === 0 && <span>No matching workload.</span>}
      {hasMore && <button type="button" onClick={loadMore}>Load 10 more</button>}
    </div>
  </div>;
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
    value={value} onvalueChanged={(event: CustomEvent) => onChange(field.key, `${event.detail.value ?? ""}`)} onKeyDown={commitOnEnter} autofocus></oj-input-date>;
  if (field.type === "boolean") return <label class="kpi-cell-editor--boolean"><input type="checkbox" checked={row.manageTimeReflected}
    onChange={(event) => { onChange(field.key, String((event.currentTarget as HTMLInputElement).checked)); onCommit(); }} /> <span>{row.manageTimeReflected ? "Reflected" : "Pending"}</span></label>;
  const options = field.type === "quarter" ? quarters
    : field.type === "month" ? getMonthsForQuarter(row.kpiCode === "D1" ? (row.targetQuarter || "Q1") : row.quarter)
      : field.type === "stage" ? stages : field.type === "activity" ? activities : null;
  if (options) return <select class="kpi-cell-editor" autofocus value={value} aria-label={field.label}
    onChange={(event) => onChange(field.key, (event.currentTarget as HTMLSelectElement).value)} onKeyDown={commitOnEnter}>
    {options.map((option) => <option value={option}>{field.type === "stage" ? stageLabels[option as WorkloadStage] : option}</option>)}
  </select>;
  return <input class="kpi-cell-editor" autofocus type={field.type === "number" ? "number" : "text"} min={field.type === "number" ? "0" : undefined}
    value={value} aria-label={field.label} onInput={(event) => onChange(field.key, (event.currentTarget as HTMLInputElement).value)} onKeyDown={commitOnEnter} />;
}

export function KpiSpreadsheetPage({ fiscalYear, routeId, onNavigate }: Readonly<{
  fiscalYear: FiscalYear;
  routeId: string;
  onNavigate: (routeId: string) => void;
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
  const sessionVersion = useRef(0);
  const sessionKeyRef = useRef(`${routeId}:${fiscalYear}`);
  const previousSessionKeyRef = useRef(sessionKeyRef.current);
  const currentDraftsRef = useRef(drafts);
  const deferredDraftsRef = useRef(new Map<string, KpiSpreadsheetRow[]>());
  sessionKeyRef.current = `${routeId}:${fiscalYear}`;
  currentDraftsRef.current = drafts;

  useEffect(() => {
    sessionVersion.current += 1;
    const previousSessionKey = previousSessionKeyRef.current;
    if (previousSessionKey !== sessionKeyRef.current) {
      if (currentDraftsRef.current.length > 0) deferredDraftsRef.current.set(previousSessionKey, currentDraftsRef.current);
      else deferredDraftsRef.current.delete(previousSessionKey);
      previousSessionKeyRef.current = sessionKeyRef.current;
    }
    const deferred = deferredDraftsRef.current.get(sessionKeyRef.current) ?? [];
    deferredDraftsRef.current.delete(sessionKeyRef.current);
    setDrafts(deferred); setActiveCell(null); setSelectedIds(new Set());
  }, [routeId, fiscalYear]);
  useEffect(() => {
    let active = true;
    setRows([]); setOverviewItems([]); setApiMessage("Loading KPI activities…");
    void Promise.all([listKpiRows(fiscalYear), listKpiOverview(fiscalYear)]).then(([items, overview]) => {
      if (active) {
        setRows(items);
        setOverviewItems(overview.items);
        setApiMessage(`Live API connected · ${items.length} activities · as of ${overview.asOf}`);
      }
    }).catch(() => { if (active) setApiMessage("KPI API unavailable — no fallback customer data is shown"); });
    return () => { active = false; };
  }, [fiscalYear, reloadVersion]);

  const authoritativeRows = useMemo(() => activeTab === "Overview" ? rows : rows.filter((row) => row.kpiCode === activeTab), [rows, activeTab]);
  const fields = activeTab === "Overview" ? [] : KPI_FIELD_CONTRACTS[activeTab];
  const effectiveRows = useMemo(() => {
    const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
    return [...authoritativeRows.map((row) => draftById.get(row.id) ?? row), ...drafts.filter((draft) => draft.id.startsWith("draft-"))];
  }, [authoritativeRows, drafts]);
  const dataProvider = useMemo(() => new ArrayDataProvider<string, KpiSpreadsheetRow>(effectiveRows, { keyAttributes: "id" }), [effectiveRows]);
  const selectedRows = effectiveRows.filter((row) => selectedIds.has(row.id) && !row.id.startsWith("draft-"));
  const activeDefinition = KPI_OVERVIEW_ROWS.find((row) => row.code === activeTab);
  const overviewByCode = useMemo(() => new Map(overviewItems.map((item) => [item.code, item])), [overviewItems]);
  const toolbarActions = getKpiToolbarActions(drafts.length, selectedRows.length);
  const saveDisabled = drafts.length === 0 || saving || drafts.some((draft) =>
    isKpiDraftInvalid(draft, authoritativeRows.find((row) => row.id === draft.id)));

  const ensureDraft = (row: KpiSpreadsheetRow) => {
    setDrafts((current) => current.some((draft) => draft.id === row.id) ? current : [...current, { ...row }]);
  };
  const beginCellEdit = (row: KpiSpreadsheetRow, field: KpiField) => {
    if (saving) return;
    ensureDraft(row);
    setActiveCell({ rowId: row.id, field: field.key });
  };
  const updateDraft = (row: KpiSpreadsheetRow, key: KpiFieldKey, value: string) => {
    setDrafts((current) => {
      const source = current.find((draft) => draft.id === row.id) ?? row;
      const updated = {
        ...source,
        [key]: key === "acrK" ? (value === "" ? null : Number(value)) : key === "manageTimeReflected" ? value === "true" : value
      } as KpiSpreadsheetRow;
      return current.some((draft) => draft.id === row.id)
        ? current.map((draft) => draft.id === row.id ? updated : draft)
        : [...current, updated];
    });
  };
  const selectWorkload = (row: KpiSpreadsheetRow, option: KpiWorkloadOption) => {
    setDrafts((current) => {
      const source = current.find((draft) => draft.id === row.id) ?? row;
      const updated = { ...source, workloadId: option.workloadId, mappingStatus: "VERIFIED" as const, accountWorkload: formatKpiWorkloadOption(option) };
      return current.some((draft) => draft.id === row.id)
        ? current.map((draft) => draft.id === row.id ? updated : draft)
        : [...current, updated];
    });
  };
  const cancelDrafts = () => {
    deferredDraftsRef.current.delete(sessionKeyRef.current);
    setDrafts([]); setActiveCell(null); setApiMessage("Unsaved KPI changes cancelled");
  };
  const addDraft = () => {
    const draft = createEmptyKpiRow(activeTab as SpreadsheetKpiCode, fiscalYear);
    setDrafts((current) => [...current, draft]);
    setActiveCell({ rowId: draft.id, field: KPI_FIELD_CONTRACTS[draft.kpiCode].find((field) => field.key !== "manageTimeReflected")?.key ?? "title" });
  };
  const saveDrafts = async () => {
    if (drafts.length === 0 || saving) return;
    const saveSession = sessionVersion.current;
    const saveSessionKey = sessionKeyRef.current;
    const draftSnapshot = drafts;
    setSaving(true); setActiveCell(null);
    const outcomes = await Promise.allSettled(draftSnapshot.map((draft) => saveKpiRow(draft)));
    const saved = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const failedDrafts = draftSnapshot.filter((_, index) => outcomes[index].status === "rejected");
    if (sessionVersion.current !== saveSession || sessionKeyRef.current !== saveSessionKey) {
      deferredDraftsRef.current.delete(saveSessionKey);
      if (failedDrafts.length > 0) {
        deferredDraftsRef.current.set(saveSessionKey, failedDrafts);
        if (sessionKeyRef.current === saveSessionKey) {
          setDrafts(failedDrafts); deferredDraftsRef.current.delete(saveSessionKey);
        }
      }
      setSaving(false); setReloadVersion((current) => current + 1); return;
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
  };
  const removeSelected = async () => {
    if (saving || selectedRows.length === 0 || !window.confirm(`Delete ${selectedRows.length} selected KPI activity row(s)?`)) return;
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
    const rowDirty = !saved || fields.some((field) => isKpiFieldChanged(saved, row, field.key));
    context.parentElement.className = [
      selectedIds.has(row.id) ? "is-selected" : "",
      rowDirty ? "is-unsaved-row" : "",
      row.manageTimeReflected ? "kpi-manage-time-reflected-row" : ""
    ].filter(Boolean).join(" ");
    render(<Fragment>{fields.map((field) => {
      const editing = activeCell?.rowId === row.id && activeCell.field === field.key;
      const changed = !saved || isKpiFieldChanged(saved, row, field.key);
      return <td class={[editing ? "is-editing-cell" : "", changed ? "is-unsaved-cell" : ""].filter(Boolean).join(" ") || undefined}
        onDblClick={() => beginCellEdit(row, field)}>
        {editing ? <FieldEditor field={field} row={row} fiscalYear={fiscalYear}
          onChange={(key, value) => updateDraft(row, key, value)}
          onWorkloadChange={(option) => selectWorkload(row, option)}
          onCommit={() => setActiveCell(null)} /> : <span>{displayValue(row, field.key)}</span>}
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
      <div class="kpi-overview-metrics" aria-label={`${fiscalYear} KPI portfolio summary`}><article><span>KPI categories</span><strong>7</strong></article><article><span>Activities</span><strong>{rows.length}</strong></article><article><span>Monthly-based</span><strong>2</strong></article><article><span>Stage/ACR-based</span><strong>1</strong></article></div>
      <section class="kpi-overview-portfolio" aria-labelledby="kpiPortfolioTitle"><div class="kpi-overview-portfolio__heading"><h3 id="kpiPortfolioTitle">{fiscalYear} KPI portfolio</h3><span>Summary + tables share fiscalYear</span></div>
        <div class="kpi-overview-portfolio__table-wrap"><table><thead><tr><th>KPI</th><th>Target</th><th>Summary model</th><th>Status</th></tr></thead><tbody>{KPI_OVERVIEW_ROWS.map((row) => { const overview = overviewByCode.get(row.code); return <tr><td><button type="button" class="kpi-overview-route-link" onClick={() => onNavigate(`activity-${row.code.toLowerCase()}`)}><span class="kpi-sheet-tab-code">{row.code}</span><strong>{row.name}</strong></button></td><td>{overview?.target ?? "—"}</td><td>{row.summaryModel}</td><td><span class={`kpi-status-badge kpi-status-badge--${(overview?.status ?? "unknown").toLowerCase().replace(" ", "-")}`} title={overview?.explanation}>{overview?.status ?? "—"}</span></td></tr>; })}</tbody></table></div>
      </section>
    </> : <>
      <div class="kpi-activity-toolbar" role="toolbar" aria-label={`${activeTab} activity actions`}>
        <div class="kpi-activity-toolbar__left"><button type="button" disabled={saving || drafts.length > 0} onClick={addDraft}>Add KPI Activity</button></div>
        <div class="kpi-activity-toolbar__right">
          {toolbarActions.includes("save") && <button type="button" disabled={saveDisabled} onClick={() => { void saveDrafts(); }}>Save</button>}
          {toolbarActions.includes("cancel") && <button type="button" disabled={saving} onClick={cancelDrafts}>Cancel</button>}
          {toolbarActions.includes("delete") && <button class="kpi-delete-button" type="button" disabled={saving} onClick={() => { void removeSelected(); }}>Delete</button>}
        </div>
      </div>
      <Summary rows={effectiveRows} tab={activeTab} />
      <div class="kpi-jet-table-wrap">
        <oj-table class="kpi-jet-editable-table" aria-label={`${activeTab} editable KPI activities`}
          data={dataProvider}
          columns={fields.map((field) => ({ headerText: field.label, field: field.key }))}
          display="grid" layout="contents" horizontalGridVisible="enabled" verticalGridVisible="enabled"
          selectionMode={{ row: "multipleToggle", column: "none" }} selectAllControl="visible"
          selected={{ row: new KeySetImpl(selectedIds), column: new KeySetImpl<string>() }}
          onselectedChanged={(event: CustomEvent) => setSelectedIds(new Set(getSelectedKpiRowIds(event.detail.value.row, effectiveRows.map((row) => row.id))))}
          rowRenderer={renderKpiRow}></oj-table>
      </div>
      {effectiveRows.length === 0 && <p class="kpi-sheet-empty">No {activeTab} activities for {fiscalYear}.</p>}
    </>}
  </section>;
}
