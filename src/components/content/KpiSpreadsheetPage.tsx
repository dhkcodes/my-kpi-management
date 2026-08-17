import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear, Quarter, WorkloadStage } from "../../data/kpiExcelParser";
import { kpiSpreadsheetSyntheticRows } from "../../data/kpiMockData";
import {
  buildKpiSummary, createEmptyKpiRow, getMonthsForQuarter, KPI_FIELD_CONTRACTS, KPI_TABS,
  isKpiWriteContextCurrent, KpiField, KpiFieldKey, KpiSpreadsheetRow, KpiWorkspaceTab, SpreadsheetKpiCode
} from "../../data/kpiSpreadsheet";
import { deleteKpiRow, listKpiRows, saveKpiRow } from "../../data/kpiSpreadsheetApi";

const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];
const routeTabs: Record<string, KpiWorkspaceTab> = {
  kpis: "Overview", "activity-a": "A", "activity-b": "B", "activity-c1": "C1", "activity-c2": "C2",
  "activity-d1": "D1", "activity-f": "F", "activity-h": "H"
};
const codeLabels: Record<SpreadsheetKpiCode, string> = {
  A: "Market Awareness", B: "Early Discovery", C1: "Workshops", C2: "POCs", D1: "New Workload", F: "Customer References", H: "Technical Content"
};

const displayValue = (row: KpiSpreadsheetRow, key: KpiFieldKey) => key === "manageTimeReflected"
  ? (row.manageTimeReflected ? "Reflected" : "Pending")
  : row[key] === null ? "—" : String(row[key] || "—");

function Summary({ rows, tab }: Readonly<{ rows: KpiSpreadsheetRow[]; tab: KpiWorkspaceTab }>) {
  const summary = buildKpiSummary(rows);
  if (tab === "Overview") {
    return <div class="kpi-sheet-overview" aria-label="KPI quarterly overview">{KPI_TABS.slice(1).map((code) => <article><strong>{code}</strong><span>{codeLabels[code as SpreadsheetKpiCode]}</span><div>{quarters.map((q) => <span>{q} <b>{summary.quarterly[code as SpreadsheetKpiCode][q]}</b></span>)}</div></article>)}</div>;
  }
  if (tab === "D1") {
    return <div class="kpi-sheet-summary"><h3>D1 ACR by quarter and stage <small>USD K</small></h3><div class="kpi-d1-matrix" role="table" aria-label="D1 quarter by stage ACR matrix"><span></span>{stages.map((stage) => <strong>{stage}</strong>)}{quarters.map((quarter) => <><strong>{quarter}</strong>{stages.map((stage) => <span>{summary.d1[quarter][stage].toLocaleString()}</span>)}</>)}</div></div>;
  }
  if (tab === "C1" || tab === "C2") {
    return <div class="kpi-sheet-summary"><h3>{tab} monthly-to-quarter summary</h3><div class="kpi-month-summary">{quarters.map((quarter) => <article><strong>{quarter}</strong>{getMonthsForQuarter(quarter).map((month) => <span>{month} <b>{summary.monthly[tab][quarter][month]}</b></span>)}<span class="is-total">Quarter <b>{summary.monthly[tab][quarter].total}</b></span></article>)}</div></div>;
  }
  return <div class="kpi-sheet-summary"><h3>{tab} quarterly summary</h3><div class="kpi-quarter-summary">{quarters.map((quarter) => <span><strong>{quarter}</strong><b>{summary.quarterly[tab][quarter]}</b> records</span>)}</div></div>;
}

function FieldEditor({ field, row, onChange }: Readonly<{ field: KpiField; row: KpiSpreadsheetRow; onChange: (key: KpiFieldKey, value: string) => void }>) {
  const value = row[field.key] === null ? "" : String(row[field.key]);
  const options = field.type === "quarter" ? quarters : field.type === "month" ? getMonthsForQuarter(row.quarter) : field.type === "stage" ? stages : null;
  return <label><span>{field.label}</span>{field.type === "boolean"
    ? <input type="checkbox" checked={row.manageTimeReflected} onChange={(event) => onChange(field.key, String((event.currentTarget as HTMLInputElement).checked))} />
    : options ? <select value={value} onChange={(event) => onChange(field.key, (event.currentTarget as HTMLSelectElement).value)}>{options.map((option) => <option value={option}>{option}</option>)}</select>
      : <input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} min={field.type === "number" ? "0" : undefined} value={value} onInput={(event) => onChange(field.key, (event.currentTarget as HTMLInputElement).value)} />}</label>;
}

export function KpiSpreadsheetPage({ fiscalYear, routeId, onWriteStateChange }: Readonly<{
  fiscalYear: FiscalYear;
  routeId: string;
  onWriteStateChange: (active: boolean) => void;
}>) {
  const [tab, setTab] = useState<KpiWorkspaceTab>(routeTabs[routeId] ?? "Overview");
  const [rows, setRows] = useState<KpiSpreadsheetRow[]>(() => kpiSpreadsheetSyntheticRows.filter((row) => row.fiscalYear === fiscalYear));
  const [draft, setDraft] = useState<KpiSpreadsheetRow | null>(null);
  const [saving, setSaving] = useState(false);
  const writeInFlightRef = useRef(false);
  const fiscalYearRef = useRef(fiscalYear);
  const routeIdRef = useRef(routeId);
  const draftContextRef = useRef<{ fiscalYear: FiscalYear; routeId: string } | null>(null);
  const writeGenerationRef = useRef(0);
  const [apiMessage, setApiMessage] = useState("Loading KPI activities…");
  fiscalYearRef.current = fiscalYear;
  routeIdRef.current = routeId;
  useEffect(() => {
    writeGenerationRef.current += 1;
    draftContextRef.current = null;
    setDraft(null);
    setTab(routeTabs[routeId] ?? "Overview");
  }, [routeId]);
  useEffect(() => {
    let active = true;
    writeGenerationRef.current += 1;
    draftContextRef.current = null; setDraft(null); setRows([]); setApiMessage("Loading KPI activities…");
    void listKpiRows(fiscalYear).then((items) => {
      if (active) { setRows(items); setApiMessage("Live API connected"); }
    }).catch(() => {
      if (active) {
        setRows(kpiSpreadsheetSyntheticRows.filter((row) => row.fiscalYear === fiscalYear));
        setApiMessage("API unavailable — showing synthetic fixtures only");
      }
    });
    return () => { active = false; };
  }, [fiscalYear]);
  const visibleRows = useMemo(() => tab === "Overview" ? rows : rows.filter((row) => row.kpiCode === tab), [rows, tab]);
  const fields = tab === "Overview" ? [] : KPI_FIELD_CONTRACTS[tab];
  const openDraft = (row: KpiSpreadsheetRow) => {
    if (row.fiscalYear !== fiscalYear) {
      setApiMessage("Context changed — wait for the selected fiscal year to load");
      return;
    }
    draftContextRef.current = { fiscalYear, routeId };
    setDraft(row);
  };
  const updateDraft = (key: KpiFieldKey, value: string) => setDraft((current) => current ? ({ ...current,
    [key]: key === "acrK" ? (value === "" ? null : Number(value)) : key === "manageTimeReflected" ? value === "true" : value,
    ...(key === "quarter" && (current.kpiCode === "C1" || current.kpiCode === "C2") && !getMonthsForQuarter(value as Quarter).includes(current.month) ? { month: getMonthsForQuarter(value as Quarter)[0] } : {}) }) : current);
  const saveDraft = async () => {
    if (!draft || writeInFlightRef.current) return;
    const draftContext = draftContextRef.current;
    const routedTab = routeTabs[routeId];
    if (!draftContext || draft.fiscalYear !== fiscalYear || draftContext.fiscalYear !== fiscalYear || draftContext.routeId !== routeId
      || (routedTab && routedTab !== "Overview" && draft.kpiCode !== routedTab)) {
      draftContextRef.current = null;
      setDraft(null);
      setApiMessage("Context changed — reopen the KPI row before saving");
      return;
    }
    const submittedDraft = draft;
    const context = { fiscalYear, routeId, generation: writeGenerationRef.current };
    writeInFlightRef.current = true;
    setSaving(true);
    onWriteStateChange(true);
    try {
      const saved = await saveKpiRow(submittedDraft);
      if (!isKpiWriteContextCurrent(context, fiscalYearRef.current, routeIdRef.current, writeGenerationRef.current)) return;
      setRows((current) => current.some((row) => row.id === submittedDraft.id) ? current.map((row) => row.id === submittedDraft.id ? saved : row) : [...current, saved]);
      setDraft(null); setApiMessage("Saved to KPI API");
    } catch {
      if (isKpiWriteContextCurrent(context, fiscalYearRef.current, routeIdRef.current, writeGenerationRef.current)) setApiMessage("Save failed — no local-only change was retained");
    } finally {
      writeInFlightRef.current = false;
      setSaving(false);
      onWriteStateChange(false);
    }
  };
  const removeRow = async (row: KpiSpreadsheetRow) => {
    const routedTab = routeTabs[routeId];
    if (row.fiscalYear !== fiscalYear || (routedTab && routedTab !== "Overview" && row.kpiCode !== routedTab)) {
      setApiMessage("Context changed — reopen the KPI activity before deleting");
      return;
    }
    if (writeInFlightRef.current || !window.confirm("Delete this KPI row?")) return;
    const context = { fiscalYear, routeId, generation: writeGenerationRef.current };
    writeInFlightRef.current = true;
    setSaving(true); onWriteStateChange(true);
    try {
      await deleteKpiRow(row);
      if (!isKpiWriteContextCurrent(context, fiscalYearRef.current, routeIdRef.current, writeGenerationRef.current)) return;
      setRows((current) => current.filter((item) => item.id !== row.id)); setApiMessage("KPI row deleted");
    } catch {
      if (isKpiWriteContextCurrent(context, fiscalYearRef.current, routeIdRef.current, writeGenerationRef.current)) setApiMessage("Delete failed — row was not removed");
    } finally {
      writeInFlightRef.current = false;
      setSaving(false); onWriteStateChange(false);
    }
  };

  return <section class="kpi-spreadsheet-page" aria-labelledby="kpiSpreadsheetTitle">
    <header><div><span class="kpi-eyebrow">Redwood Spreadsheet</span><h2 id="kpiSpreadsheetTitle">KAP KPI Workspace</h2><p>Quarterly evidence in one API-ready workspace. Delivery Date is the final data column.</p><p class="kpi-api-status" role="status">{apiMessage}</p></div>{tab !== "Overview" && <button type="button" disabled={saving} class="accounts-workloads-button accounts-workloads-button--primary" onClick={() => openDraft(createEmptyKpiRow(tab, fiscalYear))}>Add Row</button>}</header>
    <nav class="kpi-sheet-tabs" aria-label="KPI workspace tabs">{KPI_TABS.map((item) => <button type="button" class={item === tab ? "is-active" : ""} aria-selected={item === tab} onClick={() => { setTab(item); setDraft(null); }}>{item}</button>)}</nav>
    <Summary rows={rows} tab={tab} />
    {tab !== "Overview" && <>
      <div class="kpi-sheet-table-wrap"><table class="kpi-sheet-table"><thead><tr>{fields.map((field) => <th>{field.label}</th>)}<th>Row Actions</th></tr></thead><tbody>{visibleRows.map((row) => <tr>{fields.map((field) => <td>{displayValue(row, field.key)}</td>)}<td><button type="button" disabled={saving} onClick={() => openDraft({ ...row })}>Edit</button><button type="button" disabled={saving} onClick={() => { void removeRow(row); }}>Delete</button></td></tr>)}</tbody></table></div>
      <div class="kpi-sheet-cards">{visibleRows.map((row) => <article>{fields.map((field) => <div><span>{field.label}</span><strong>{displayValue(row, field.key)}</strong></div>)}<footer><button type="button" disabled={saving} onClick={() => openDraft({ ...row })}>Edit</button><button type="button" disabled={saving} onClick={() => { void removeRow(row); }}>Delete</button></footer></article>)}</div>
      {visibleRows.length === 0 && <p class="kpi-sheet-empty">No {tab} rows for {fiscalYear}. Add a synthetic or API-backed record.</p>}
    </>}
    {draft && <div class="kpi-sheet-editor-overlay" role="presentation"><form class="kpi-sheet-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}><header><h3>{rows.some((row) => row.id === draft.id) ? "Edit" : "Add"} {draft.kpiCode} Row</h3><button type="button" disabled={saving} aria-label="Close editor" onClick={() => setDraft(null)}>×</button></header><div>{KPI_FIELD_CONTRACTS[draft.kpiCode].map((field) => <FieldEditor field={field} row={draft} onChange={updateDraft} />)}</div><footer><button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button><button type="submit" class="accounts-workloads-button--primary" disabled={saving || !draft.deliveryDate || (draft.kpiCode === "D1" && (!draft.stage || draft.acrK === null || !draft.targetQuarter))}>{saving ? "Saving…" : "Save Row"}</button></footer></form></div>}
  </section>;
}
