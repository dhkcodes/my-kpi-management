import { KpiField, KpiFieldKey, KpiSpreadsheetRow } from "./kpiSpreadsheet";

export type KpiEditPhase = "view" | "editing" | "dirty" | "saving" | "cancelling";
export type KpiCellAddress = Readonly<{ rowId: string; field: KpiFieldKey }>;
export type KpiActivityEditState = Readonly<{
  phase: KpiEditPhase;
  generation: number;
  cell: KpiCellAddress | null;
  originalValue: string;
  value: string;
}>;

export type KpiActivityEditAction =
  | Readonly<{ type: "begin"; cell: KpiCellAddress; value: string }>
  | Readonly<{ type: "input"; value: string; hasOtherDrafts: boolean }>
  | Readonly<{ type: "finish"; hasDrafts: boolean }>
  | Readonly<{ type: "save" }>
  | Readonly<{ type: "save-result"; hasFailures: boolean }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "reset" }>;

export const createKpiActivityEditState = (): KpiActivityEditState => ({
  phase: "view",
  generation: 0,
  cell: null,
  originalValue: "",
  value: ""
});

export const transitionKpiActivityEdit = (
  state: KpiActivityEditState,
  action: KpiActivityEditAction
): KpiActivityEditState => {
  if (action.type === "reset") return { ...createKpiActivityEditState(), generation: state.generation + 1 };
  if (action.type === "save") {
    if (state.phase !== "dirty") return state;
    return { ...state, phase: "saving", cell: null };
  }
  if (action.type === "save-result") {
    if (state.phase !== "saving") return state;
    return {
      ...state,
      phase: action.hasFailures ? "dirty" : "view",
      cell: null,
      originalValue: "",
      value: ""
    };
  }
  if (action.type === "cancel") {
    if (state.phase === "saving" || state.phase === "cancelling") return state;
    return { ...state, phase: "cancelling", cell: null };
  }
  if (action.type === "begin") {
    if (state.phase === "saving" || state.phase === "cancelling") return state;
    return {
      phase: "editing",
      generation: state.generation + 1,
      cell: action.cell,
      originalValue: action.value,
      value: action.value
    };
  }
  if (action.type === "input") {
    if (!state.cell || (state.phase !== "editing" && state.phase !== "dirty")) return state;
    const currentCellChanged = action.value !== state.originalValue;
    return {
      ...state,
      phase: currentCellChanged || action.hasOtherDrafts ? "dirty" : "editing",
      value: action.value
    };
  }
  if (action.type === "finish") {
    if (state.phase === "saving" || state.phase === "cancelling") return state;
    return {
      ...state,
      phase: action.hasDrafts ? "dirty" : "view",
      cell: null,
      originalValue: "",
      value: ""
    };
  }
  return state;
};

export type KpiSortState = Readonly<{ field: KpiFieldKey; direction: "asc" | "desc" }>;

export const getKpiGridRowKey = (keys: ReadonlyMap<string, string>, rowId: string): string =>
  keys.get(rowId) ?? rowId;

export const carryKpiGridRowKey = (keys: Map<string, string>, previousRowId: string, nextRowId: string): void => {
  const stableKey = getKpiGridRowKey(keys, previousRowId);
  keys.delete(previousRowId);
  keys.set(nextRowId, stableKey);
};

export const nextKpiSort = (current: KpiSortState | null, field: KpiFieldKey): KpiSortState => ({
  field,
  direction: current?.field === field && current.direction === "asc" ? "desc" : "asc"
});

const sortableValue = (row: KpiSpreadsheetRow, field: KpiFieldKey): string | number => {
  if (field === "targetQuarter") return `${row.targetFiscalYear ?? ""} ${row.targetQuarter}`.trim().toLocaleLowerCase();
  const value = row[field];
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return `${value ?? ""}`.toLocaleLowerCase();
};

export const sortKpiActivityRows = (
  rows: readonly KpiSpreadsheetRow[],
  sort: KpiSortState | null
): KpiSpreadsheetRow[] => {
  if (!sort) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftDraft = left.row.id.startsWith("draft-");
      const rightDraft = right.row.id.startsWith("draft-");
      if (leftDraft !== rightDraft) return leftDraft ? -1 : 1;
      const leftValue = sortableValue(left.row, sort.field);
      const rightValue = sortableValue(right.row, sort.field);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : `${leftValue}`.localeCompare(`${rightValue}`, undefined, { numeric: true, sensitivity: "base" });
      return comparison === 0 ? left.index - right.index : sort.direction === "asc" ? comparison : -comparison;
    })
    .map(({ row }) => row);
};

export type KpiColumnLayout = Readonly<{
  selectorWidth: number;
  widths: Readonly<Partial<Record<KpiFieldKey, number>>>;
  totalWidth: number;
}>;

const fixedWidthFor = (field: KpiField): number | null => {
  if (field.type === "workload" || field.type === "textarea") return null;
  if (field.type === "manageTime") return 140;
  if (field.key === "srNumber") return 144;
  if (field.type === "date") return 140;
  if (field.type === "quarter" || field.type === "targetPeriod") return 156;
  if (field.type === "activity") return 164;
  if (field.type === "stage") return 132;
  if (field.key === "acrK") return 104;
  if (field.type === "number") return 104;
  if (field.type === "month") return 96;
  return 104;
};

const flexibleWeight = (field: KpiField) => field.type === "workload" ? 1.2 : 1;
const flexibleMinimum = (field: KpiField) => field.type === "workload" ? 220 : 200;

export const computeKpiColumnLayout = (
  fields: readonly KpiField[],
  availableWidth: number
): KpiColumnLayout => {
  const selectorWidth = 52;
  const widths: Partial<Record<KpiFieldKey, number>> = {};
  const flexible = fields.filter((field) => fixedWidthFor(field) === null);
  let fixedTotal = 0;
  fields.forEach((field) => {
    const width = fixedWidthFor(field);
    if (width === null) return;
    widths[field.key] = width;
    fixedTotal += width;
  });
  const flexibleMinimumTotal = flexible.reduce((sum, field) => sum + flexibleMinimum(field), 0);
  const flexibleBudget = Math.max(flexibleMinimumTotal, Math.floor(availableWidth) - selectorWidth - fixedTotal);
  const extraBudget = flexibleBudget - flexibleMinimumTotal;
  const totalWeight = flexible.reduce((sum, field) => sum + flexibleWeight(field), 0) || 1;
  const allocated: number[] = flexible.map((field) => flexibleMinimum(field)
    + Math.round(extraBudget * flexibleWeight(field) / totalWeight));
  if (allocated.length > 0) {
    const allocatedTotal = allocated.reduce((sum, width) => sum + width, 0);
    allocated[allocated.length - 1] += flexibleBudget - allocatedTotal;
  }
  flexible.forEach((field, index) => { widths[field.key] = allocated[index]; });
  return {
    selectorWidth,
    widths,
    totalWidth: selectorWidth + fields.reduce((sum, field) => sum + (widths[field.key] ?? 0), 0)
  };
};
