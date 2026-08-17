import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import {
  buildKpiSummary,
  createEmptyKpiRow,
  getKpiToolbarActions,
  getMonthsForQuarter,
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
const workloadKpis = new Set<KpiActivityTab>(["B", "C1", "C2", "D1"]);

const displayValue = (row: KpiSpreadsheetRow, key: KpiFieldKey) => key === "manageTimeReflected"
  ? (row.manageTimeReflected ? "Reflected" : "Pending")
  : row[key] === null ? "—" : String(row[key] || "—");

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
    return <section class="kpi-sheet-summary" aria-labelledby="kpiD1Summary"><h3 id="kpiD1Summary">Target Quarter × Sales Stage ACR <small>USD K</small></h3>
      <div class="kpi-d1-matrix" role="table" aria-label="D1 target quarter by stage ACR matrix"><span></span>{stages.map((stage) => <strong>{stage}</strong>)}{quarters.map((quarter) => <><strong>{quarter}</strong>{stages.map((stage) => <span>{summary.d1[quarter][stage].toLocaleString()}</span>)}</>)}</div>
    </section>;
  }
  if (tab === "C1" || tab === "C2") {
    return <section class="kpi-sheet-summary" aria-labelledby="kpiMonthSummary"><h3 id="kpiMonthSummary">Fiscal Month → combined Target Quarter roll-up</h3>
      <div class="kpi-month-summary">{quarters.map((quarter) => <article><strong>{quarter}</strong>{getMonthsForQuarter(quarter).map((month) => <span>{month} <b>{summary.monthly[tab][quarter][month]}</b></span>)}<span class="is-total">{tab} rows <b>{summary.monthly[tab][quarter].total}</b></span><span class="is-combined">C1 + C2 <b>{summary.c1c2Combined[quarter].actual} / {summary.c1c2Combined[quarter].target}</b></span></article>)}</div>
    </section>;
  }
  return <section class="kpi-sheet-summary" aria-labelledby="kpiQuarterSummary"><h3 id="kpiQuarterSummary">Target Quarter count</h3>
    <div class="kpi-quarter-summary">{quarters.map((quarter) => <span><strong>{quarter}</strong><b>{summary.quarterly[tab][quarter]}</b> activities</span>)}</div>
  </section>;
}

function FieldEditor({ field, row, onChange }: Readonly<{
  field: KpiField;
  row: KpiSpreadsheetRow;
  onChange: (key: KpiFieldKey, value: string) => void;
}>) {
  const value = row[field.key] === null ? "" : String(row[field.key]);
  const options = field.type === "quarter" ? quarters : field.type === "month" ? getMonthsForQuarter(row.quarter) : field.type === "stage" ? stages : null;
  return <label><span>{field.label}</span>{field.type === "boolean"
    ? <input type="checkbox" checked={row.manageTimeReflected} onChange={(event) => onChange(field.key, String((event.currentTarget as HTMLInputElement).checked))} />
    : options ? <select value={value} onChange={(event) => onChange(field.key, (event.currentTarget as HTMLSelectElement).value)}>{options.map((option) => <option value={option}>{option}</option>)}</select>
      : <input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} min={field.type === "number" ? "0" : undefined} value={value} onInput={(event) => onChange(field.key, (event.currentTarget as HTMLInputElement).value)} />}</label>;
}

function WorkloadSelector({ fiscalYear, draft, onSelect }: Readonly<{
  fiscalYear: FiscalYear;
  draft: KpiSpreadsheetRow;
  onSelect: (option: KpiWorkloadOption) => void;
}>) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KpiWorkloadOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listKpiWorkloadOptions(fiscalYear, query, 0).then((page) => {
        if (active) { setOptions(page.items); setOffset(page.items.length); setHasMore(page.hasMore); }
      }).catch(() => { if (active) { setOptions([]); setOffset(0); setHasMore(false); } })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [fiscalYear, query]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    setLoading(true);
    void listKpiWorkloadOptions(fiscalYear, query, offset).then((page) => {
      setOptions((current) => [...current, ...page.items]);
      setOffset((current) => current + page.items.length);
      setHasMore(page.hasMore);
    }).finally(() => setLoading(false));
  };

  return <div class="kpi-workload-selector"><label><span>Account / Workload / Oppty.No</span>
    <input type="search" placeholder="Search Account, Workload, or Oppty.No" value={query}
      onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)} />
  </label>
    {draft.accountWorkload && <p class="kpi-workload-selector__current"><strong>Selected:</strong> {draft.accountWorkload} {draft.workloadId ? `(ID ${draft.workloadId})` : "(Imported unmatched value)"}</p>}
    <div class="kpi-workload-selector__results" role="listbox" aria-label="Workload search results"
      onScroll={(event) => { const el = event.currentTarget as HTMLDivElement; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) loadMore(); }}>
      {options.map((option) => <button type="button" role="option" onClick={() => onSelect(option)}>
        <strong>{option.accountName}</strong><span>{option.workloadName}</span><small>{option.opptyNo || "No Oppty.No"}</small>
      </button>)}
      {loading && <p>Loading…</p>}
      {!loading && options.length === 0 && <p>No matching workload.</p>}
    </div>
  </div>;
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
  const [saving, setSaving] = useState(false);
  const [apiMessage, setApiMessage] = useState("Loading KPI activities…");

  useEffect(() => { setDrafts([]); setSelectedIds(new Set()); }, [routeId, fiscalYear]);
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
  }, [fiscalYear]);

  const visibleRows = useMemo(() => activeTab === "Overview" ? rows : rows.filter((row) => row.kpiCode === activeTab), [rows, activeTab]);
  const activeDefinition = KPI_OVERVIEW_ROWS.find((row) => row.code === activeTab);
  const fields = activeTab === "Overview" ? [] : KPI_FIELD_CONTRACTS[activeTab];
  const selectedRows = visibleRows.filter((row) => selectedIds.has(row.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const updateDraft = (draftId: string, key: KpiFieldKey, value: string) => setDrafts((current) => current.map((draft) => draft.id === draftId ? ({ ...draft,
    [key]: key === "acrK" ? (value === "" ? null : Number(value)) : key === "manageTimeReflected" ? value === "true" : value,
    ...(key === "quarter" && (draft.kpiCode === "C1" || draft.kpiCode === "C2") && !getMonthsForQuarter(value as Quarter).includes(draft.month) ? { month: getMonthsForQuarter(value as Quarter)[0] } : {}) }) : draft));
  const selectWorkload = (draftId: string, option: KpiWorkloadOption) => setDrafts((current) => current.map((draft) => draft.id === draftId ? ({ ...draft,
    workloadId: option.workloadId, mappingStatus: "VERIFIED",
    accountWorkload: [option.accountName, option.workloadName, option.opptyNo].filter(Boolean).join(" / ")
  }) : draft));
  const saveDrafts = async () => {
    if (drafts.length === 0 || saving) return;
    setSaving(true);
    const outcomes = await Promise.allSettled(drafts.map((draft) => saveKpiRow(draft)));
    const saved = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const failed = drafts.filter((_, index) => outcomes[index].status === "rejected");
    if (saved.length > 0) setRows((current) => {
      const savedById = new Map(saved.map((row) => [row.id, row]));
      const existingIds = new Set(current.map((row) => row.id));
      return [...current.map((row) => savedById.get(row.id) ?? row), ...saved.filter((row) => !existingIds.has(row.id))];
    });
    setDrafts(failed);
    setSelectedIds(new Set(failed.length > 0 ? failed.map((row) => row.id) : saved.map((row) => row.id)));
    setApiMessage(failed.length === 0 ? `${saved.length} KPI activity row(s) saved` : `${saved.length} saved · ${failed.length} failed`);
    setSaving(false);
  };
  const removeSelected = async () => {
    if (saving || selectedRows.length === 0 || !window.confirm(`Delete ${selectedRows.length} selected KPI activity row(s)?`)) return;
    setSaving(true);
    try {
      await Promise.all(selectedRows.map((row) => deleteKpiRow(row)));
      const deleted = new Set(selectedRows.map((row) => row.id));
      setRows((current) => current.filter((row) => !deleted.has(row.id))); setSelectedIds(new Set()); setDrafts([]);
      setApiMessage("Selected KPI activities deleted");
    } catch { setApiMessage("Delete failed — reload before retrying"); }
    finally { setSaving(false); }
  };
  const overviewByCode = useMemo(() => new Map(overviewItems.map((item) => [item.code, item])), [overviewItems]);
  const hasDrafts = drafts.length > 0;
  const toolbarActions = getKpiToolbarActions(drafts.length, selectedRows.length);
  const saveDisabled = !hasDrafts || saving || drafts.some((draft) => !draft.deliveryDate ||
    (workloadKpis.has(draft.kpiCode) && draft.id.startsWith("draft-") && draft.workloadId == null) ||
    (draft.kpiCode === "D1" && (!draft.stage || draft.acrK === null || !draft.targetQuarter)));

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
        <div class="kpi-activity-toolbar__left">
          <button type="button" disabled={saving || hasDrafts} onClick={() => setDrafts([createEmptyKpiRow(activeTab, fiscalYear)])}>Add KPI Activity</button>
          <button type="button" disabled={saving || hasDrafts || selectedRows.length === 0} onClick={() => setDrafts(selectedRows.map((row) => ({ ...row })))}>Edit</button>
        </div>
        <div class="kpi-activity-toolbar__right">
          {toolbarActions.includes("save") && <button type="button" disabled={saveDisabled} onClick={() => { void saveDrafts(); }}>Save</button>}
          {toolbarActions.includes("cancel") && <button type="button" disabled={saving} onClick={() => setDrafts([])}>Cancel</button>}
          {toolbarActions.includes("delete") && <button type="button" disabled={saving} onClick={() => { void removeSelected(); }}>Delete</button>}
        </div>
      </div>
      <Summary rows={rows} tab={activeTab} />
      {drafts.map((draft) => <section class="kpi-inline-editor" aria-label={`${draft.kpiCode} activity editor`}>
        <div class="kpi-inline-editor__fields">{KPI_FIELD_CONTRACTS[draft.kpiCode].map((field) => field.key === "accountWorkload"
          ? <WorkloadSelector fiscalYear={fiscalYear} draft={draft} onSelect={(option) => selectWorkload(draft.id, option)} />
          : <FieldEditor field={field} row={draft} onChange={(key, value) => updateDraft(draft.id, key, value)} />)}</div>
      </section>)}
      <div class="kpi-sheet-table-wrap"><table class="kpi-sheet-table"><thead><tr><th aria-label="Select"></th>{fields.map((field) => <th>{field.label}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr class={selectedIds.has(row.id) ? "is-selected" : ""}><td><input type="checkbox" aria-label={`Select ${row.kpiCode} activity`} checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>{fields.map((field) => <td>{displayValue(row, field.key)}</td>)}</tr>)}</tbody></table></div>
      <div class="kpi-sheet-cards">{visibleRows.map((row) => <article><label><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} /> Select</label>{fields.map((field) => <div><span>{field.label}</span><strong>{displayValue(row, field.key)}</strong></div>)}</article>)}</div>
      {visibleRows.length === 0 && <p class="kpi-sheet-empty">No {activeTab} activities for {fiscalYear}.</p>}
    </>}
  </section>;
}
