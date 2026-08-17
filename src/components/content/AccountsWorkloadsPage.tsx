import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import { AccountsWorkloadsBatchSaveResponse, AccountsWorkloadsListQuery } from "../../data/accountsWorkloadsApi";
import { AccountsWorkloadsDataSource } from "../../data/accountsWorkloadsDataSource";
import { FxRateRecord } from "../../data/kpiConfigurationApi";
import { applyDraftDelete, applyDraftRestore, hasSelectedDeletedRows, resolveDeleteMode, withMinimumPendingDuration } from "../../data/accountsWorkloadsSelection";
import {
  AccountWorkloadMetadata,
  AccountWorkloadRow
} from "../../data/accountsWorkloadsMockData";
import "ojs/ojbutton";
import "ojs/ojswitch";
import "ojs/ojdatetimepicker";
import "ojs/ojdialog";
import "ojs/ojprogress-circle";
import { ojDialog } from "ojs/ojdialog";

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
  rows: AccountWorkloadRow[];
  metadata: AccountWorkloadMetadata;
  query: Omit<AccountsWorkloadsListQuery, "fiscalYear">;
  dataSource: AccountsWorkloadsDataSource;
  fxRate: FxRateRecord | null;
  fxLoading: boolean;
  fxError: string;
  accountsWorkloadsRefreshing: boolean;
  onQueryChange: (query: Omit<AccountsWorkloadsListQuery, "fiscalYear">) => void;
  onRefresh: () => void;
  onDraftStateChange: (active: boolean) => void;
  onRowsChange: (rows: AccountWorkloadRow[], permanentDeleteIds: string[], fxRate?: FxRateRecord) => Promise<AccountsWorkloadsBatchSaveResponse>;
}>;

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

const centerAlignedFields = new Set<EditableField>([
  "startDate",
  "endDate",
  "opptyNo",
  "target",
  "winProbability"
]);
const rightAlignedFields = new Set<EditableField>(["arrUsd", "arrKrw", "acrUsd", "acrKrw"]);
const fieldAlignmentClass = (field: EditableField) =>
  rightAlignedFields.has(field)
    ? "accounts-workloads-cell--right"
    : centerAlignedFields.has(field)
      ? "accounts-workloads-cell--center"
      : "accounts-workloads-cell--left";

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

export function AccountsWorkloadsPage({
  fiscalYear,
  rows,
  metadata,
  query,
  dataSource,
  fxRate,
  fxLoading,
  fxError,
  accountsWorkloadsRefreshing,
  onQueryChange,
  onRefresh,
  onDraftStateChange,
  onRowsChange
}: Props) {
  const [draftRows, setDraftRows] = useState<AccountWorkloadRow[]>(rows);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(Boolean(query.includeDeleted));
  const [sortField, setSortField] = useState<SortField>((query.sort as SortField | undefined) ?? "account");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(query.direction ?? "asc");
  const [searchTerm, setSearchTerm] = useState(query.search ?? "");
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [addingRow, setAddingRow] = useState<AccountWorkloadRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [permanentDeleteIds, setPermanentDeleteIds] = useState<string[]>([]);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const initialExchangeRate = fxRate?.rateValue ?? metadata.exchangeRate;
  const [savedExchangeRate, setSavedExchangeRate] = useState(initialExchangeRate);
  const [exchangeRate, setExchangeRate] = useState(initialExchangeRate);
  const [fxPopoverOpen, setFxPopoverOpen] = useState(false);
  const [draftExchangeRate, setDraftExchangeRate] = useState(`${initialExchangeRate}`);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const savingDialogRef = useRef<ojDialog>(null);
  const deleteDialogRef = useRef<ojDialog>(null);
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

  useEffect(() => {
    if (!accountsWorkloadsRefreshing) {
      setSearchTerm(query.search ?? "");
      setIncludeDeleted(Boolean(query.includeDeleted));
      setSortField((query.sort as SortField | undefined) ?? "account");
      setSortDirection(query.direction ?? "asc");
    }
  }, [accountsWorkloadsRefreshing, query.direction, query.includeDeleted, query.search, query.sort]);

  const visibleRows = useMemo(() => {
    const sourceRows = editCell ? rows : draftRows;
    if (dataSource === "api") {
      return sourceRows.map((row) => draftRows.find((draftRow) => draftRow.id === row.id) ?? row);
    }
    const search = searchTerm.trim().toLowerCase();
    const filtered = sourceRows.filter((row) => {
      const matchesDeleted = includeDeleted || !row.isDeleted || selectedRowIds.includes(row.id);
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
  }, [dataSource, draftRows, editCell, includeDeleted, rows, searchTerm, selectedRowIds, sortDirection, sortField]);

  useEffect(() => {
    if (!isDirty && !addingRow && !editCell) setDraftRows(rows);
  }, [addingRow, editCell, isDirty, rows]);

  useEffect(() => {
    if (!fxRate || isDirty) return;
    setSavedExchangeRate(fxRate.rateValue);
    setExchangeRate(fxRate.rateValue);
    setDraftExchangeRate(`${fxRate.rateValue}`);
  }, [fxRate, isDirty]);

  const draftActive = Boolean(isDirty || addingRow || editCell);
  useEffect(() => {
    onDraftStateChange(draftActive);
    return () => onDraftStateChange(false);
  }, [draftActive, onDraftStateChange]);

  useEffect(() => {
    if (saving) savingDialogRef.current?.open();
    else if (savingDialogRef.current?.isOpen()) savingDialogRef.current.close();
  }, [saving]);

  useEffect(() => {
    if (confirmPermanentDelete) deleteDialogRef.current?.open();
    else if (deleteDialogRef.current?.isOpen()) deleteDialogRef.current.close();
  }, [confirmPermanentDelete]);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [visibleRows.length, addingRow]);

  const selectedVisibleRowIds = visibleRows.map((row) => row.id).filter((id) => selectedRowIds.includes(id));
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleRowIds.length === visibleRows.length;
  const selectedCount = selectedVisibleRowIds.length;
  const selectedHasDeletedRows = hasSelectedDeletedRows(rows, selectedVisibleRowIds);
  const deleteMode = resolveDeleteMode(rows, selectedVisibleRowIds);
  const showFooterActions = Boolean(editCell || isDirty || addingRow);
  const hasFiscalYearSeed = fiscalYear === metadata.fiscalYear;

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

  const submitSearch = () => {
    onQueryChange({ ...query, search: searchTerm, includeDeleted, sort: sortField, direction: sortDirection });
  };

  const submitSearchOnEnter = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitSearch();
  };

  const toggleSort = (field: SortField) => {
    const direction = sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(direction);
    onQueryChange({ ...query, search: query.search, includeDeleted, sort: field, direction });
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

  const saveGridChanges = async () => {
    const rowsToSave = addingRow ? [...draftRows, addingRow] : draftRows;
    if (addingRow && (!addingRow.account.trim() || !addingRow.workloadName.trim())) return;
    const draftFxRate = fxRate && exchangeRate !== savedExchangeRate
      ? { ...fxRate, rateValue: exchangeRate }
      : undefined;
    setSaving(true);
    setSaveError("");
    try {
      const authoritative = await withMinimumPendingDuration(() =>
        onRowsChange(rowsToSave, permanentDeleteIds, draftFxRate)
      );
      setDraftRows(authoritative.items);
      if (authoritative.fxRate) {
        setSavedExchangeRate(authoritative.fxRate.rateValue);
        setExchangeRate(authoritative.fxRate.rateValue);
        setDraftExchangeRate(`${authoritative.fxRate.rateValue}`);
      } else {
        setSavedExchangeRate(exchangeRate);
        setDraftExchangeRate(`${exchangeRate}`);
      }
      setAddingRow(null);
      setIsDirty(false);
      setEditCell(null);
      setPermanentDeleteIds([]);
      setSelectedRowIds([]);
    } catch (error) {
      setSaveError(error instanceof Error && error.name === "AccountsWorkloadsApiError" && "status" in error && error.status === 409
        ? "Another user changed this data. Reload the latest data before saving again."
        : "The changes could not be saved. Your drafts are unchanged; check the API connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditSession = () => {
    setDraftRows(rows);
    setExchangeRate(savedExchangeRate);
    setDraftExchangeRate(`${savedExchangeRate}`);
    setIsDirty(false);
    setEditCell(null);
    setAddingRow(null);
    setPermanentDeleteIds([]);
  };

  const addRow = () => {
    setAddingRow(createEmptyRow(fiscalYear));
  };

  const highlightSelected = () => {
    setDraftRows((current) =>
      current.map((row) => selectedVisibleRowIds.includes(row.id) ? { ...row, isImportant: !row.isImportant } : row)
    );
    setIsDirty(true);
  };

  const stageDraftDelete = () => {
    const activeIds = selectedVisibleRowIds.filter((id) => !rows.find((row) => row.id === id)?.isDeleted);
    setDraftRows((current) => applyDraftDelete(current, activeIds, "current-user", new Date().toISOString()));
    setIsDirty(true);
  };

  const deleteSelected = () => {
    if (deleteMode === "permanent" || deleteMode === "mixed") {
      setPermanentDeleteIds(selectedVisibleRowIds.filter((id) => rows.find((row) => row.id === id)?.isDeleted));
      setConfirmPermanentDelete(true);
      return;
    }
    stageDraftDelete();
  };

  const permanentlyDeleteSelected = () => {
    const ids = [...permanentDeleteIds];
    const activeIds = selectedVisibleRowIds.filter((id) => !rows.find((row) => row.id === id)?.isDeleted);
    const nextRows = applyDraftDelete(
      draftRows.filter((row) => !ids.includes(row.id)),
      activeIds,
      "current-user",
      new Date().toISOString()
    );
    setConfirmPermanentDelete(false);
    setDraftRows(nextRows);
    setIsDirty(true);
    setSelectedRowIds([]);
  };

  const restoreSelected = () => {
    setDraftRows((current) => applyDraftRestore(current, selectedVisibleRowIds, rows));
    setIsDirty(true);
  };

  const applyExchangeRate = () => {
    const parsed = numberFromInput(draftExchangeRate);
    if (parsed === null || parsed <= 0 || !fxRate) return;
    setExchangeRate(parsed);
    setDraftExchangeRate(`${parsed}`);
    setDraftRows((current) =>
      current.map((row) => row.isDeleted ? row : ({
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
      fieldAlignmentClass(field),
      field === "latestUpdate" ? "accounts-workloads-latest-cell" : "",
      field === "notes" ? "accounts-workloads-notes-cell" : "",
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
        ) : field === "notes" ? (
          <span class="accounts-workloads-notes-content" title={row.notes || "No notes."}>{displayValue}</span>
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
              ? `Manage ${fiscalYear} accounts and workloads from ${metadata.sourceSheet}. Loaded rows: ${metadata.parsedRowCount}.`
              : `Manage ${fiscalYear} accounts and workloads. No dataset is loaded for this fiscal year.`}
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
              {fxLoading && <p id="accountsWorkloadsFxLoading" role="status">Loading saved exchange rate…</p>}
              {fxError && <p id="accountsWorkloadsFxError" role="alert">{fxError}</p>}
              <div class="accounts-workloads-popover-actions">
                <button type="button" class="accounts-workloads-button accounts-workloads-button--primary" disabled={fxLoading || !fxRate} onClick={applyExchangeRate}>Apply</button>
                <button type="button" class="accounts-workloads-button" onClick={cancelExchangeRateEdit}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div class="accounts-workloads-toolbar" aria-label="Accounts and workloads actions">
        <div class="accounts-workloads-search">
          <label for="accountsWorkloadsSearchInput">Search</label>
          <div class="accounts-workloads-search__control">
            <input
              id="accountsWorkloadsSearchInput"
              value={searchTerm}
              disabled={draftActive || accountsWorkloadsRefreshing}
              title={draftActive ? "Save or cancel changes before changing the server query." : undefined}
              onInput={(event) => {
                const search = (event.currentTarget as HTMLInputElement).value;
                setSearchTerm(search);
              }}
              onKeyDown={submitSearchOnEnter}
              placeholder="Account / Workload / Oppty / Plan Number"
            />
            <button
              id="accountsWorkloadsSearchButton"
              type="button"
              aria-label="Search accounts and workloads"
              title="Search"
              disabled={draftActive || accountsWorkloadsRefreshing}
              onClick={submitSearch}>
              <span class="oj-ux-ico-search" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <label class="accounts-workloads-switch">
          <span>Include deleted</span>
          <oj-switch
            value={includeDeleted}
            disabled={draftActive || accountsWorkloadsRefreshing}
            onvalueChanged={(event: CustomEvent) => {
              const nextIncludeDeleted = Boolean(event.detail.value);
              setIncludeDeleted(nextIncludeDeleted);
              onQueryChange({ ...query, search: query.search, includeDeleted: nextIncludeDeleted, sort: sortField, direction: sortDirection });
            }}
            aria-label="Include deleted rows">
          </oj-switch>
        </label>
        <div class="accounts-workloads-actions accounts-workloads-actions--compact">
          <oj-button class="accounts-workloads-jet-button" chroming="callToAction" onojAction={addRow}>Add Row</oj-button>
          <oj-button class="accounts-workloads-jet-button" chroming="outlined" disabled={draftActive || accountsWorkloadsRefreshing} onojAction={onRefresh}>Refresh</oj-button>
          <oj-button class="accounts-workloads-jet-button" chroming="outlined" disabled={selectedCount === 0} onojAction={highlightSelected}>Highlight</oj-button>
          {selectedHasDeletedRows && (
            <oj-button class="accounts-workloads-jet-button" chroming="outlined" onojAction={restoreSelected}>Restore</oj-button>
          )}
          <oj-button class="accounts-workloads-jet-button" chroming="danger" disabled={selectedCount === 0} onojAction={deleteSelected}>Delete</oj-button>
        </div>
      </div>

      {saveError && <div class="accounts-workloads-save-error" role="alert">{saveError}</div>}

      <oj-dialog ref={savingDialogRef} class="accounts-workloads-saving-dialog" initialVisibility="hide" modality="modal" cancelBehavior="none" dragAffordance="none" resizeBehavior="none" dialogTitle="Saving">
        <div class="accounts-workloads-saving-content" role="status" aria-live="polite">
          <oj-progress-circle value={-1} size="sm" aria-label="Saving"></oj-progress-circle>
          <span>Saving changes…</span>
        </div>
      </oj-dialog>

      <oj-dialog ref={deleteDialogRef} class="accounts-workloads-delete-dialog" initialVisibility="hide" modality="modal" cancelBehavior="escape" dragAffordance="none" resizeBehavior="none" dialogTitle="Permanently delete?" onojClose={() => setConfirmPermanentDelete(false)}>
        <div class="accounts-workloads-delete-content">
          <p>{permanentDeleteIds.length} draft-deleted row(s) will be removed permanently. This action cannot be undone.</p>
          <div class="accounts-workloads-save-actions">
            <oj-button chroming="danger" onojAction={permanentlyDeleteSelected}>Delete permanently</oj-button>
            <oj-button chroming="outlined" onojAction={() => setConfirmPermanentDelete(false)}>Cancel</oj-button>
          </div>
        </div>
      </oj-dialog>

      <div class="accounts-workloads-grid-shell">
        {accountsWorkloadsRefreshing && <div class="accounts-workloads-table-refresh" role="status" aria-live="polite">Refreshing table…</div>}
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
              <th class="is-sticky accounts-workloads-no-col accounts-workloads-cell--center">No</th>
              <th class="is-sticky accounts-workloads-important-col accounts-workloads-cell--center">
                <button type="button" disabled={draftActive || accountsWorkloadsRefreshing} onClick={() => toggleSort("isImportant")}>! {sortIndicator("isImportant")}</button>
              </th>
              <th class="is-sticky accounts-workloads-plan-col">
                <button type="button" disabled={draftActive || accountsWorkloadsRefreshing} onClick={() => toggleSort("planNumber")}>{columnLabels.planNumber} {sortIndicator("planNumber")}</button>
              </th>
              <th class="is-sticky accounts-workloads-account-col">
                <button type="button" disabled={draftActive || accountsWorkloadsRefreshing} onClick={() => toggleSort("account")}>{columnLabels.account} {sortIndicator("account")}</button>
              </th>
              {editableFields.filter((field) => !["planNumber", "account"].includes(field)).map((field) => (
                <th key={field} class={fieldAlignmentClass(field)}>
                  <button type="button" disabled={draftActive || accountsWorkloadsRefreshing} onClick={() => toggleSort(field)}>{columnLabels[field]} {sortIndicator(field)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.id} data-row-id={row.id} class={`${row.isImportant ? "is-important" : ""} ${row.isDeleted ? "is-deleted" : ""}`}>
                <td class="is-sticky accounts-workloads-selection-col">
                  <input type="checkbox" checked={selectedRowIds.includes(row.id)} onChange={() => toggleSelection(row.id)} aria-label={`Select ${row.account} ${row.workloadName}`} />
                </td>
                <td class="is-sticky accounts-workloads-no-col accounts-workloads-cell--center">{index + 1}</td>
                <td class="is-sticky accounts-workloads-important-col accounts-workloads-cell--center">{row.isImportant ? <span class="accounts-workloads-important-badge">!</span> : ""}</td>
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
                <td class="is-sticky accounts-workloads-no-col accounts-workloads-cell--center">—</td>
                <td class="is-sticky accounts-workloads-important-col accounts-workloads-cell--center"></td>
                <td class="accounts-workloads-cell--left">{renderAddInput("planNumber", "UCM / PAYG")}</td>
                <td class="accounts-workloads-cell--left">{renderAddInput("account", "Account *")}</td>
                <td class="accounts-workloads-cell--left">{renderAddInput("workloadName", "Workload *")}</td>
                <td class="accounts-workloads-cell--center">{renderAddInput("opptyNo", "Oppty")}</td>
                <td class="accounts-workloads-cell--center">{renderAddInput("startDate", "Start", "date")}</td>
                <td class="accounts-workloads-cell--center">{renderAddInput("endDate", "End", "date")}</td>
                <td class="accounts-workloads-cell--right">{renderAddInput("arrUsd", "USD", "number")}</td>
                <td class="accounts-workloads-cell--right">{renderAddInput("arrKrw", "KRW", "number")}</td>
                <td class="accounts-workloads-cell--right">{renderAddInput("acrUsd", "USD", "number")}</td>
                <td class="accounts-workloads-cell--right">{renderAddInput("acrKrw", "KRW", "number")}</td>
                <td class="accounts-workloads-cell--center">{renderAddInput("target", "FY27 Q1")}</td>
                <td class="accounts-workloads-cell--center">{renderAddInput("winProbability", "%", "number")}</td>
                <td class="accounts-workloads-cell--left">{renderAddInput("latestUpdate", "Latest update", "textarea")}</td>
                <td class="accounts-workloads-cell--left">{renderAddInput("notes", "Notes", "textarea")}</td>
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
              disabled={saving}
              onClick={saveGridChanges}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" class="accounts-workloads-button" disabled={saving} onClick={cancelEditSession}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
