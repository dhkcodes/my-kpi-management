import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import {
  AccountWorkloadRow,
  createAccountWorkloadRows,
  getAccountWorkloadMetadata
} from "../../data/accountsWorkloadsMockData";
import "ojs/ojbutton";
import "ojs/ojswitch";
import "ojs/ojdatetimepicker";

type EditableField = keyof Pick<
  AccountWorkloadRow,
  | "planNumber"
  | "account"
  | "workloadName"
  | "opptyNo"
  | "startDate"
  | "endDate"
  | "arrUsd"
  | "arrKrw"
  | "acrUsd"
  | "acrKrw"
  | "target"
  | "winProbability"
  | "latestUpdate"
  | "notes"
>;

type SortField = EditableField | "isImportant";

type EditCell = Readonly<{
  id: string;
  field: EditableField;
}>;

type Props = Readonly<{
  fiscalYear: FiscalYear;
}>;

const accountWorkloadMetadata = getAccountWorkloadMetadata();
const createRowsForFiscalYear = (fiscalYear: FiscalYear) =>
  fiscalYear === accountWorkloadMetadata.fiscalYear ? createAccountWorkloadRows() : [];

const editableFields: EditableField[] = [
  "planNumber",
  "account",
  "workloadName",
  "opptyNo",
  "startDate",
  "endDate",
  "arrUsd",
  "arrKrw",
  "acrUsd",
  "acrKrw",
  "target",
  "winProbability",
  "latestUpdate",
  "notes"
];

const targetOptions = (["FY26", "FY27", "FY28"] as FiscalYear[])
  .flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year} Q${quarter}`));

const columnLabels: Record<EditableField | "rowNo" | "isImportant", string> = {
  rowNo: "No",
  isImportant: "!",
  planNumber: "Plan Number",
  account: "Account",
  workloadName: "Workload Name (Enduser)",
  opptyNo: "Oppty No",
  startDate: "Start Date",
  endDate: "End Date",
  arrUsd: "ARR($)",
  arrKrw: "ARR(₩)",
  acrUsd: "ACR($)",
  acrKrw: "ACR(₩)",
  target: "Target",
  winProbability: "Win Prob.",
  latestUpdate: "Latest Update",
  notes: "Notes"
};

const currencyUsdFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0
});

const currencyKrwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0
});

const formatUsd = (value: number | null) => (value === null ? "—" : `$${currencyUsdFormatter.format(value)}`);
const formatKrw = (value: number | null) => (value === null ? "—" : `₩${currencyKrwFormatter.format(Math.round(value))}`);
const formatProbability = (value: number | null) => (value === null ? "—" : `${value}%`);

const comparableValue = (value: unknown) => value ?? "";

const isFieldChanged = (savedRows: AccountWorkloadRow[], row: AccountWorkloadRow, field: EditableField) => {
  const savedRow = savedRows.find((item) => item.id === row.id);
  return Boolean(savedRow && comparableValue(savedRow[field]) !== comparableValue(row[field]));
};

const sortValue = (row: AccountWorkloadRow, field: SortField) => {
  const value = row[field];
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return value ?? "";
};

const numberFromInput = (value: string) => {
  const normalized = value.replace(/[$₩,\s]/g, "");
  if (normalized === "" || normalized === "—" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const updateCurrencyPair = (row: AccountWorkloadRow, field: EditableField, value: number | null, exchangeRate: number): AccountWorkloadRow => {
  const next = { ...row, [field]: value } as AccountWorkloadRow;
  if (field === "arrUsd") next.arrKrw = value === null ? null : Math.round(value * exchangeRate);
  if (field === "arrKrw") next.arrUsd = value === null ? null : Number((value / exchangeRate).toFixed(2));
  if (field === "acrUsd") next.acrKrw = value === null ? null : Math.round(value * exchangeRate);
  if (field === "acrKrw") next.acrUsd = value === null ? null : Number((value / exchangeRate).toFixed(2));
  return next;
};

const createEmptyRow = (fiscalYear: FiscalYear): AccountWorkloadRow => ({
  id: `new-${Date.now()}`,
  sourceRowNumber: 0,
  planNumber: "",
  account: "",
  workloadName: "",
  opptyNo: "",
  startDate: "",
  endDate: "",
  arrUsd: null,
  arrKrw: null,
  acrUsd: null,
  acrKrw: null,
  target: `${fiscalYear} Q1`,
  winProbability: null,
  latestUpdate: "",
  notes: "",
  isImportant: false,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null
});

function EditableCell({
  row,
  field,
  value,
  onChange,
  onCommit
}: Readonly<{
  row: AccountWorkloadRow;
  field: EditableField;
  value: AccountWorkloadRow[EditableField];
  onChange: (rowId: string, field: EditableField, value: string) => void;
  onCommit: () => void;
}>) {
  const inputId = `${row.id}-${field}`;
  const commitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !(event.currentTarget instanceof HTMLTextAreaElement && event.shiftKey)) {
      event.preventDefault();
      onCommit();
    }
  };
  if (field === "latestUpdate" || field === "notes") {
    return (
      <textarea
        id={inputId}
        class="accounts-workloads-edit-field accounts-workloads-edit-field--textarea"
        value={`${value ?? ""}`}
        onInput={(event) => onChange(row.id, field, (event.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={commitOnEnter}
        autofocus
      />
    );
  }

  if (field === "startDate" || field === "endDate") {
    return (
      <oj-input-date
        id={inputId}
        class="accounts-workloads-edit-field accounts-workloads-jet-date"
        labelHint={columnLabels[field]}
        labelEdge="none"
        userAssistanceDensity="compact"
        value={`${value ?? ""}`}
        datePicker={{
          changeMonth: "select",
          changeYear: "select",
          daysOutsideMonth: "visible"
        }}
        onvalueChanged={(event: CustomEvent) => onChange(row.id, field, `${event.detail.value ?? ""}`)}
        onKeyDown={commitOnEnter}
        autofocus>
      </oj-input-date>
    );
  }

  if (["arrUsd", "arrKrw", "acrUsd", "acrKrw", "winProbability"].includes(field)) {
    return (
      <input
        id={inputId}
        class="accounts-workloads-edit-field"
        type="number"
        value={value === null ? "" : `${value}`}
        onInput={(event) => onChange(row.id, field, (event.currentTarget as HTMLInputElement).value)}
        onKeyDown={commitOnEnter}
        autofocus
      />
    );
  }

  if (field === "target") {
    return (
      <select
        id={inputId}
        class="accounts-workloads-edit-field"
        value={`${value ?? ""}`}
        onInput={(event) => onChange(row.id, field, (event.currentTarget as HTMLSelectElement).value)}
        onKeyDown={commitOnEnter}
        autofocus>
        <option value="">—</option>
        {targetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return (
    <input
      id={inputId}
      class="accounts-workloads-edit-field"
      value={`${value ?? ""}`}
      onInput={(event) => onChange(row.id, field, (event.currentTarget as HTMLInputElement).value)}
      onKeyDown={commitOnEnter}
      autofocus
    />
  );
}

export function AccountsWorkloadsPage({ fiscalYear }: Props) {
  const [rows, setRows] = useState<AccountWorkloadRow[]>(() => createRowsForFiscalYear(fiscalYear));
  const [draftRows, setDraftRows] = useState<AccountWorkloadRow[]>(() => createRowsForFiscalYear(fiscalYear));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortField, setSortField] = useState<SortField>("account");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [addingRow, setAddingRow] = useState<AccountWorkloadRow | null>(null);
  const [savedExchangeRate, setSavedExchangeRate] = useState(accountWorkloadMetadata.exchangeRate);
  const [exchangeRate, setExchangeRate] = useState(accountWorkloadMetadata.exchangeRate);
  const [fxPopoverOpen, setFxPopoverOpen] = useState(false);
  const [draftExchangeRate, setDraftExchangeRate] = useState(`${accountWorkloadMetadata.exchangeRate}`);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ left: 0, max: 0, clientWidth: 0 });

  const updateScrollState = () => {
    const grid = gridScrollRef.current;
    if (!grid) return;
    setScrollState({
      left: Math.round(grid.scrollLeft),
      max: Math.max(0, Math.round(grid.scrollWidth - grid.clientWidth)),
      clientWidth: Math.round(grid.clientWidth)
    });
  };

  const moveHorizontally = (direction: -1 | 1) => {
    const grid = gridScrollRef.current;
    if (!grid) return;
    const step = Math.max(320, Math.round(grid.clientWidth * 0.72));
    grid.scrollTo({ left: grid.scrollLeft + direction * step, behavior: "smooth" });
    window.setTimeout(updateScrollState, 240);
  };

  const handleGridWheel = (event: WheelEvent) => {
    if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    const grid = gridScrollRef.current;
    if (!grid) return;
    grid.scrollLeft += event.deltaY;
    updateScrollState();
  };

  const handleGridKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveHorizontally(event.key === "ArrowLeft" ? -1 : 1);
  };

  const visibleRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const orderingRows = editCell ? rows : draftRows;
    const filtered = orderingRows.filter((row) => {
      const matchesDeleted = includeDeleted || !row.isDeleted;
      const matchesSearch =
        search === "" ||
        row.account.toLowerCase().includes(search) ||
        row.workloadName.toLowerCase().includes(search) ||
        row.opptyNo.toLowerCase().includes(search) ||
        row.planNumber.toLowerCase().includes(search);
      return matchesDeleted && matchesSearch;
    });
    return [...filtered].sort((left, right) => {
      const leftValue = sortValue(left, sortField);
      const rightValue = sortValue(right, sortField);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : `${leftValue}`.localeCompare(`${rightValue}`);
      return sortDirection === "asc" ? comparison : comparison * -1;
    }).map((row) => draftRows.find((draftRow) => draftRow.id === row.id) ?? row);
  }, [draftRows, editCell, includeDeleted, rows, searchTerm, sortDirection, sortField]);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [visibleRows.length, addingRow]);

  const selectedVisibleRowIds = visibleRows.map((row) => row.id).filter((id) => selectedRowIds.includes(id));
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleRowIds.length === visibleRows.length;
  const selectedCount = selectedVisibleRowIds.length;
  const showFooterActions = Boolean(editCell || isDirty || addingRow);
  const hasFiscalYearSeed = fiscalYear === accountWorkloadMetadata.fiscalYear;

  useEffect(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.id));
    setSelectedRowIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [visibleRows]);

  const commitActiveCell = () => {
    setEditCell(null);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const sortIndicator = (field: SortField) => (sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "↕");

  const updateDraftCell = (rowId: string, field: EditableField, rawValue: string) => {
    setDraftRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        if (["arrUsd", "arrKrw", "acrUsd", "acrKrw"].includes(field)) {
          return updateCurrencyPair(row, field, numberFromInput(rawValue), exchangeRate);
        }
        if (field === "winProbability") {
          return { ...row, winProbability: numberFromInput(rawValue) };
        }
        return { ...row, [field]: rawValue };
      })
    );
    setIsDirty(true);
  };

  const updateAddRowCell = (field: EditableField, rawValue: string) => {
    setAddingRow((current) => {
      const row = current ?? createEmptyRow(fiscalYear);
      if (["arrUsd", "arrKrw", "acrUsd", "acrKrw"].includes(field)) {
        return updateCurrencyPair(row, field, numberFromInput(rawValue), exchangeRate);
      }
      if (field === "winProbability") {
        return { ...row, winProbability: numberFromInput(rawValue) };
      }
      return { ...row, [field]: rawValue };
    });
  };

  const saveGridChanges = () => {
    setRows(draftRows);
    setSavedExchangeRate(exchangeRate);
    setDraftExchangeRate(`${exchangeRate}`);
    setIsDirty(false);
    setEditCell(null);
  };

  const cancelEditSession = () => {
    setDraftRows(rows);
    setExchangeRate(savedExchangeRate);
    setDraftExchangeRate(`${savedExchangeRate}`);
    setIsDirty(false);
    setEditCell(null);
    setAddingRow(null);
  };

  const addRow = () => {
    setAddingRow(createEmptyRow(fiscalYear));
  };

  const saveAddRow = () => {
    if (!addingRow || !addingRow.account.trim() || !addingRow.workloadName.trim()) return;
    const nextRows = [...draftRows, addingRow];
    setRows(nextRows);
    setDraftRows(nextRows);
    setSavedExchangeRate(exchangeRate);
    setDraftExchangeRate(`${exchangeRate}`);
    setAddingRow(null);
    setIsDirty(false);
    setEditCell(null);
  };

  const highlightSelected = () => {
    setDraftRows((current) =>
      current.map((row) => selectedVisibleRowIds.includes(row.id) ? { ...row, isImportant: !row.isImportant } : row)
    );
    setIsDirty(true);
  };

  const deleteSelected = () => {
    setDraftRows((current) =>
      current.map((row) => selectedVisibleRowIds.includes(row.id)
        ? { ...row, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: "current-user" }
        : row)
    );
    setSelectedRowIds((current) => current.filter((id) => !selectedVisibleRowIds.includes(id)));
    setIsDirty(true);
  };

  const applyExchangeRate = () => {
    const parsed = numberFromInput(draftExchangeRate);
    if (parsed === null || parsed <= 0) return;
    setExchangeRate(parsed);
    setDraftRows((current) =>
      current.map((row) => ({
        ...row,
        arrKrw: row.arrUsd === null ? row.arrKrw : Math.round(row.arrUsd * parsed),
        acrKrw: row.acrUsd === null ? row.acrKrw : Math.round(row.acrUsd * parsed)
      }))
    );
    setAddingRow((current) => current ? {
      ...current,
      arrKrw: current.arrUsd === null ? current.arrKrw : Math.round(current.arrUsd * parsed),
      acrKrw: current.acrUsd === null ? current.acrKrw : Math.round(current.acrUsd * parsed)
    } : current);
    setIsDirty(true);
    setFxPopoverOpen(false);
  };

  const cancelExchangeRateEdit = () => {
    setDraftExchangeRate(`${exchangeRate}`);
    setFxPopoverOpen(false);
  };

  const toggleSelection = (rowId: string) => {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
    );
  };

  const toggleAllVisibleRows = () => {
    const visibleIds = visibleRows.map((row) => row.id);
    setSelectedRowIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const renderEditableCell = (row: AccountWorkloadRow, field: EditableField, displayValue: string) => {
    const isEditing = editCell?.id === row.id && editCell.field === field;
    const isChanged = isFieldChanged(rows, row, field);
    const value = row[field];
    const cellClass = [
      field === "latestUpdate" ? "accounts-workloads-latest-cell" : "",
      isEditing ? "is-editing-cell" : "",
      isChanged ? "is-unsaved-cell" : ""
    ].filter(Boolean).join(" ");
    return (
      <td class={cellClass || undefined} onDblClick={() => setEditCell({ id: row.id, field })}>
        {isEditing ? (
          <EditableCell row={row} field={field} value={value} onChange={updateDraftCell} onCommit={commitActiveCell} />
        ) : field === "latestUpdate" ? (
          <span class="accounts-workloads-update-trigger" tabIndex={0} aria-label={row.latestUpdate}>
            <span class="accounts-workloads-update-summary">{row.latestUpdate || "—"}</span>
            <span class="accounts-workloads-update-popup" role="tooltip">{row.latestUpdate || "No update yet."}</span>
          </span>
        ) : (
          displayValue
        )}
      </td>
    );
  };

  const renderAddInput = (field: EditableField, placeholder: string, type: "text" | "date" | "number" | "textarea" = "text") => {
    const value = addingRow?.[field];
    if (type === "date") {
      return (
        <oj-input-date
          class="accounts-workloads-edit-field accounts-workloads-jet-date accounts-workloads-jet-date--add"
          labelHint={placeholder}
          labelEdge="none"
          userAssistanceDensity="compact"
          value={`${value ?? ""}`}
          datePicker={{
            changeMonth: "select",
            changeYear: "select",
            daysOutsideMonth: "visible"
          }}
          onvalueChanged={(event: CustomEvent) => updateAddRowCell(field, `${event.detail.value ?? ""}`)}>
        </oj-input-date>
      );
    }
    if (type === "textarea") {
      return (
        <textarea
          class="accounts-workloads-edit-field accounts-workloads-edit-field--textarea"
          value={`${value ?? ""}`}
          placeholder={placeholder}
          onInput={(event) => updateAddRowCell(field, (event.currentTarget as HTMLTextAreaElement).value)}
        />
      );
    }
    return (
      <input
        class="accounts-workloads-edit-field"
        type={type}
        value={value === null ? "" : `${value ?? ""}`}
        placeholder={placeholder}
        onInput={(event) => updateAddRowCell(field, (event.currentTarget as HTMLInputElement).value)}
      />
    );
  };

  return (
    <section class="accounts-workloads-page" aria-labelledby="accountsWorkloadsTitle">
      <div class="accounts-workloads-header">
        <div>
          <span class="kpi-eyebrow">My Customers 360</span>
          <h2 id="accountsWorkloadsTitle">Accounts &amp; Workloads</h2>
          <p class="kpi-panel__description">
            {hasFiscalYearSeed
              ? `Manage ${fiscalYear} accounts and workloads from ${accountWorkloadMetadata.sourceSheet}. Mock seed rows: ${accountWorkloadMetadata.parsedRowCount}.`
              : `Manage ${fiscalYear} accounts and workloads. No mock seed workbook is loaded for this fiscal year.`}
          </p>
        </div>
        <div class="accounts-workloads-fx">
          <button type="button" class="accounts-workloads-fx__button" onClick={() => setFxPopoverOpen((value) => !value)} aria-expanded={fxPopoverOpen ? "true" : "false"}>
            <span>Exchange Rate (USD to KRW)</span>
            <strong>1 USD = KRW {currencyKrwFormatter.format(exchangeRate)}</strong>
          </button>
          {fxPopoverOpen && (
            <div class="accounts-workloads-fx-popover" role="dialog" aria-label="Edit exchange rate">
              <label>
                <span>Exchange Rate (USD to KRW)</span>
                <input
                  type="number"
                  value={draftExchangeRate}
                  onInput={(event) => setDraftExchangeRate((event.currentTarget as HTMLInputElement).value)}
                />
              </label>
              <p>ARR/ACR USD and KRW pairs recalculate automatically after Apply.</p>
              <div class="accounts-workloads-popover-actions">
                <button type="button" class="accounts-workloads-button accounts-workloads-button--primary" onClick={applyExchangeRate}>Apply</button>
                <button type="button" class="accounts-workloads-button" onClick={cancelExchangeRateEdit}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div class="accounts-workloads-toolbar" aria-label="Accounts and workloads actions">
        <label class="accounts-workloads-search">
          <span>Search</span>
          <input value={searchTerm} onInput={(event) => setSearchTerm((event.currentTarget as HTMLInputElement).value)} placeholder="Account / Workload / Oppty / Plan Number" />
        </label>
        <label class="accounts-workloads-switch">
          <span>Include deleted</span>
          <oj-switch
            value={includeDeleted}
            onvalueChanged={(event: CustomEvent) => setIncludeDeleted(Boolean(event.detail.value))}
            aria-label="Include deleted rows">
          </oj-switch>
        </label>
        <div class="accounts-workloads-actions accounts-workloads-actions--compact">
          <oj-button class="accounts-workloads-jet-button" chroming="callToAction" onojAction={addRow}>Add Row</oj-button>
          <oj-button class="accounts-workloads-jet-button" chroming="outlined" disabled={selectedCount === 0} onojAction={highlightSelected}>Highlight</oj-button>
          <oj-button class="accounts-workloads-jet-button" chroming="danger" disabled={selectedCount === 0} onojAction={deleteSelected}>Delete</oj-button>
        </div>
        <span class="accounts-workloads-selected-count">Selected rows: {selectedCount}</span>
      </div>

      <div class="accounts-workloads-grid-shell">
        <div class="accounts-workloads-scroll-hint" role="note">Use fixed arrows, Shift + mouse wheel, or ← / → while the grid is focused.</div>
        <div class="accounts-workloads-scroll-controls" aria-label="Horizontal table navigation">
          <button type="button" class="accounts-workloads-scroll-control" aria-label="Move table left" title="Move left" disabled={scrollState.left <= 0} onClick={() => moveHorizontally(-1)}>‹</button>
          <button type="button" class="accounts-workloads-scroll-control" aria-label="Move table right" title="Move right" disabled={scrollState.left >= scrollState.max} onClick={() => moveHorizontally(1)}>›</button>
        </div>

      <div class="accounts-workloads-grid-wrap" aria-label={`${fiscalYear} accounts and workloads grid`} ref={gridScrollRef} tabIndex={0} onScroll={updateScrollState} onWheel={handleGridWheel} onKeyDown={handleGridKeyDown}>
        <table class="accounts-workloads-grid">
          <thead>
            <tr>
              <th class="is-sticky accounts-workloads-selection-col">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisibleRows} aria-label="Select or clear all visible rows" />
              </th>
              <th class="is-sticky accounts-workloads-no-col">No</th>
              <th class="is-sticky accounts-workloads-important-col">
                <button type="button" onClick={() => toggleSort("isImportant")}>! {sortIndicator("isImportant")}</button>
              </th>
              <th class="is-sticky accounts-workloads-plan-col">
                <button type="button" onClick={() => toggleSort("planNumber")}>{columnLabels.planNumber} {sortIndicator("planNumber")}</button>
              </th>
              <th class="is-sticky accounts-workloads-account-col">
                <button type="button" onClick={() => toggleSort("account")}>{columnLabels.account} {sortIndicator("account")}</button>
              </th>
              {editableFields.filter((field) => !["planNumber", "account"].includes(field)).map((field) => (
                <th key={field}>
                  <button type="button" onClick={() => toggleSort(field)}>{columnLabels[field]} {sortIndicator(field)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.id} class={`${row.isImportant ? "is-important" : ""} ${row.isDeleted ? "is-deleted" : ""}`}>
                <td class="is-sticky accounts-workloads-selection-col">
                  <input type="checkbox" checked={selectedRowIds.includes(row.id)} onChange={() => toggleSelection(row.id)} aria-label={`Select ${row.account} ${row.workloadName}`} />
                </td>
                <td class="is-sticky accounts-workloads-no-col">{index + 1}</td>
                <td class="is-sticky accounts-workloads-important-col">{row.isImportant ? <span class="accounts-workloads-important-badge">!</span> : ""}</td>
                {renderEditableCell(row, "planNumber", row.planNumber || "—")}
                {renderEditableCell(row, "account", row.account)}
                {renderEditableCell(row, "workloadName", row.workloadName)}
                {renderEditableCell(row, "opptyNo", row.opptyNo || "—")}
                {renderEditableCell(row, "startDate", row.startDate || "—")}
                {renderEditableCell(row, "endDate", row.endDate || "—")}
                {renderEditableCell(row, "arrUsd", formatUsd(row.arrUsd))}
                {renderEditableCell(row, "arrKrw", formatKrw(row.arrKrw))}
                {renderEditableCell(row, "acrUsd", formatUsd(row.acrUsd))}
                {renderEditableCell(row, "acrKrw", formatKrw(row.acrKrw))}
                {renderEditableCell(row, "target", row.target || "—")}
                {renderEditableCell(row, "winProbability", formatProbability(row.winProbability))}
                {renderEditableCell(row, "latestUpdate", row.latestUpdate)}
                {renderEditableCell(row, "notes", row.notes || "—")}
              </tr>
            ))}
            {visibleRows.length === 0 && !addingRow && (
              <tr class="is-empty-row">
                <td colSpan={17}>No accounts or workloads match the current filters.</td>
              </tr>
            )}
            {addingRow && (
              <tr class="is-adding-row">
                <td class="is-sticky accounts-workloads-selection-col">New</td>
                <td class="is-sticky accounts-workloads-no-col">—</td>
                <td class="is-sticky accounts-workloads-important-col"></td>
                <td>{renderAddInput("planNumber", "UCM / PAYG")}</td>
                <td>{renderAddInput("account", "Account *")}</td>
                <td>{renderAddInput("workloadName", "Workload *")}</td>
                <td>{renderAddInput("opptyNo", "Oppty")}</td>
                <td>{renderAddInput("startDate", "Start", "date")}</td>
                <td>{renderAddInput("endDate", "End", "date")}</td>
                <td>{renderAddInput("arrUsd", "USD", "number")}</td>
                <td>{renderAddInput("arrKrw", "KRW", "number")}</td>
                <td>{renderAddInput("acrUsd", "USD", "number")}</td>
                <td>{renderAddInput("acrKrw", "KRW", "number")}</td>
                <td>{renderAddInput("target", "FY27 Q1")}</td>
                <td>{renderAddInput("winProbability", "%", "number")}</td>
                <td>{renderAddInput("latestUpdate", "Latest update", "textarea")}</td>
                <td>{renderAddInput("notes", "Notes", "textarea")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {showFooterActions && (
        <div class="accounts-workloads-footer-actions">
          <div class="accounts-workloads-rule-note">
            <strong>Unsaved changes are highlighted.</strong> Save commits the current edit session; Cancel restores the original rows and removes any new row.
          </div>
          <div class="accounts-workloads-save-actions">
            <button
              type="button"
              class="accounts-workloads-button accounts-workloads-button--primary"
              onClick={addingRow ? saveAddRow : saveGridChanges}>
              Save
            </button>
            <button type="button" class="accounts-workloads-button" onClick={cancelEditSession}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
