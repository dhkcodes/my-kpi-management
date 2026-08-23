import { FiscalYear, Quarter, WorkloadStage } from "./kpiExcelParser";

export const KPI_TABS = ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"] as const;
export type KpiWorkspaceTab = typeof KPI_TABS[number];
export type SpreadsheetKpiCode = Exclude<KpiWorkspaceTab, "Overview">;
export type KpiFieldKey = "manageTimeReflected" | "quarter" | "month" | "accountWorkload" | "title" | "srNumber" | "stage" | "acrK" | "targetQuarter" | "deliveryDate";
export type KpiField = Readonly<{ key: KpiFieldKey; label: string; type?: "text" | "textarea" | "date" | "number" | "quarter" | "month" | "stage" | "activity" | "workload" | "manageTime" }>;
export type KpiToolbarAction = "save" | "cancel" | "delete";

export const getKpiToolbarActions = (draftCount: number, selectedCount: number): readonly KpiToolbarAction[] =>
  draftCount > 0 ? ["save", "cancel"] : selectedCount > 0 ? ["delete"] : [];

const field = (key: KpiFieldKey, label: string, type: KpiField["type"] = "text"): KpiField => ({ key, label, type });
const manageTime = field("manageTimeReflected", "Reflected", "manageTime");
const targetQuarter = field("quarter", "Target Quarter", "quarter");
const base = [manageTime, field("srNumber", "SR Number"), field("title", "SR Description", "textarea")];
const related = [manageTime, field("accountWorkload", "Account / Workload / Oppty.No", "workload"), field("srNumber", "SR Number"), field("title", "SR Description", "textarea")];
const delivery = field("deliveryDate", "Delivery Date", "date");

export const KPI_FIELD_CONTRACTS: Record<SpreadsheetKpiCode, readonly KpiField[]> = {
  A: [...base, delivery],
  B: [...related, targetQuarter, delivery],
  C1: [...related, targetQuarter, delivery],
  C2: [...related, targetQuarter, delivery],
  D1: [manageTime, field("accountWorkload", "Account / Workload / Oppty.No", "workload"), field("srNumber", "SR Number"), field("title", "Activity", "activity"), field("stage", "Sales Stage", "stage"), field("acrK", "ACR (K)", "number"), field("targetQuarter", "Target Quarter", "quarter"), delivery],
  F: [...base, delivery],
  H: [manageTime, field("title", "Content", "textarea"), delivery]
};

export type KpiSpreadsheetRow = {
  id: string;
  versionNo?: number;
  manageTimeReflected: boolean;
  fiscalYear: FiscalYear;
  kpiCode: SpreadsheetKpiCode;
  quarter: Quarter;
  month: string;
  accountWorkload: string;
  workloadId?: number | null;
  mappingStatus?: "VERIFIED" | "UNMATCHED" | "AMBIGUOUS" | "NOT_REQUIRED";
  title: string;
  srNumber: string;
  stage: WorkloadStage | "";
  acrK: number | null;
  targetQuarter: Quarter | "";
  deliveryDate: string;
  deliveryDateRaw?: string;
};

export type KpiWriteContext = Readonly<{ fiscalYear: FiscalYear; routeId: string; generation: number }>;
export const isKpiWriteContextCurrent = (
  context: KpiWriteContext,
  fiscalYear: FiscalYear,
  routeId: string,
  generation: number
) => context.fiscalYear === fiscalYear && context.routeId === routeId && context.generation === generation;

export const createEmptyKpiRow = (kpiCode: SpreadsheetKpiCode, fiscalYear: FiscalYear): KpiSpreadsheetRow => ({
  id: `draft-${kpiCode.toLowerCase()}-${Date.now()}`,
  manageTimeReflected: false,
  fiscalYear,
  kpiCode,
  quarter: "Q1",
  month: kpiCode === "C1" || kpiCode === "C2" ? "Jul" : "",
  accountWorkload: "",
  workloadId: null,
  mappingStatus: ["B", "C1", "C2", "D1"].includes(kpiCode) ? "UNMATCHED" : "NOT_REQUIRED",
  title: kpiCode === "D1" ? "Solution Design" : "",
  srNumber: "",
  stage: kpiCode === "D1" ? "identified" : "",
  acrK: kpiCode === "D1" ? 0 : null,
  targetQuarter: kpiCode === "D1" ? "Q1" : "",
  deliveryDate: "", deliveryDateRaw: ""
});

const monthsByQuarter: Record<Quarter, readonly string[]> = {
  Q1: ["Jun", "Jul", "Aug"], Q2: ["Sep", "Oct", "Nov"], Q3: ["Dec", "Jan", "Feb"], Q4: ["Mar", "Apr", "May"]
};
const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];

export const fiscalQuarterFromDeliveryDate = (deliveryDate: string): Quarter | "" => {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(deliveryDate);
  if (!match) return "";
  const month = Number(match[1]);
  if (month >= 6 && month <= 8) return "Q1";
  if (month >= 9 && month <= 11) return "Q2";
  if (month === 12 || month <= 2) return "Q3";
  if (month >= 3 && month <= 5) return "Q4";
  return "";
};

export const formatKpiWorkloadOption = (option: Readonly<{
  workloadId?: number;
  accountName: string;
  workloadName: string;
  opptyNo: string | null;
}>) => `${option.accountName} - ${option.workloadName}${option.opptyNo ? ` (${option.opptyNo})` : ""}`;

export const isKpiFieldChanged = (
  saved: KpiSpreadsheetRow,
  draft: KpiSpreadsheetRow,
  key: KpiFieldKey
) => (saved[key] ?? "") !== (draft[key] ?? "");

export const isKpiRowChanged = (
  saved: KpiSpreadsheetRow,
  draft: KpiSpreadsheetRow,
  fields: readonly KpiField[]
) => {
  const usesWorkloadIdentity = ["B", "C1", "C2", "D1"].includes(saved.kpiCode);
  const workloadIdentityChanged = usesWorkloadIdentity && (
    (saved.workloadId ?? null) !== (draft.workloadId ?? null)
    || (saved.mappingStatus ?? null) !== (draft.mappingStatus ?? null)
  );
  return workloadIdentityChanged || fields.some((item) => isKpiFieldChanged(saved, draft, item.key));
};

export const applyManagedToSelection = (
  savedRows: readonly KpiSpreadsheetRow[],
  currentDrafts: readonly KpiSpreadsheetRow[],
  selectedIds: readonly string[],
  managed: boolean
): KpiSpreadsheetRow[] => {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return [...currentDrafts];
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const handled = new Set<string>();
  const next: KpiSpreadsheetRow[] = [];
  for (const draft of currentDrafts) {
    const updated = selected.has(draft.id) ? { ...draft, manageTimeReflected: managed } : draft;
    handled.add(draft.id);
    const saved = savedById.get(draft.id);
    if (!saved || isKpiRowChanged(saved, updated, KPI_FIELD_CONTRACTS[updated.kpiCode])) next.push(updated);
  }
  for (const id of selected) {
    if (handled.has(id)) continue;
    const saved = savedById.get(id);
    if (!saved) continue;
    const updated = { ...saved, manageTimeReflected: managed };
    if (isKpiRowChanged(saved, updated, KPI_FIELD_CONTRACTS[updated.kpiCode])) next.push(updated);
  }
  return next;
};

export const getReflectedSelectionAction = (selectedRows: readonly KpiSpreadsheetRow[]) => {
  if (selectedRows.length === 0) return null;
  const managed = !selectedRows.every((row) => row.manageTimeReflected);
  return { managed, label: managed ? "Mark reflected" : "Mark not reflected" } as const;
};

type JetRowKeySet = Readonly<{
  isAddAll: () => boolean;
  values: () => Set<string>;
  deletedValues: () => Set<string>;
}>;

export const getSelectedKpiRowIds = (keySet: JetRowKeySet, availableIds: readonly string[]) => {
  if (!keySet.isAddAll()) return Array.from(keySet.values());
  const deleted = keySet.deletedValues();
  return availableIds.filter((id) => !deleted.has(id));
};

export const isKpiDraftInvalid = (draft: KpiSpreadsheetRow, saved?: KpiSpreadsheetRow) => {
  if (draft.manageTimeReflected && (!draft.deliveryDate || (draft.kpiCode !== "H" && !draft.srNumber.trim()))) return true;
  if (!draft.deliveryDate && Boolean(saved?.deliveryDate)) return true;
  if (["B", "C1", "C2", "D1"].includes(draft.kpiCode)
    && draft.workloadId == null && saved?.workloadId != null) return true;
  if (draft.kpiCode === "D1") {
    const missingDimension = !draft.stage || draft.acrK === null || !draft.targetQuarter;
    const savedHadDimension = Boolean(saved?.stage) || saved?.acrK !== null || Boolean(saved?.targetQuarter);
    if (missingDimension && savedHadDimension) return true;
  }
  return false;
};

const monthFromDeliveryDate = (deliveryDate: string) => {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(deliveryDate);
  if (!match) return "";
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[1]) - 1] ?? "";
};

export function buildKpiSummary(rows: readonly KpiSpreadsheetRow[]) {
  const reflectedRows = rows.filter((row) => row.manageTimeReflected);
  const quarterly = Object.fromEntries(KPI_TABS.filter((tab): tab is SpreadsheetKpiCode => tab !== "Overview").map((code) => [code, Object.fromEntries(quarters.map((quarter) => [quarter, reflectedRows.filter((row) => row.kpiCode === code && fiscalQuarterFromDeliveryDate(row.deliveryDate) === quarter).length]))])) as Record<SpreadsheetKpiCode, Record<Quarter, number>>;
  const monthly = Object.fromEntries((["C1", "C2"] as const).map((code) => [code, Object.fromEntries(quarters.map((quarter) => {
    const monthCounts = Object.fromEntries(monthsByQuarter[quarter].map((month) => [month, reflectedRows.filter((row) => row.kpiCode === code && fiscalQuarterFromDeliveryDate(row.deliveryDate) === quarter && monthFromDeliveryDate(row.deliveryDate) === month).length]));
    return [quarter, { ...monthCounts, total: quarterly[code][quarter] }];
  }))])) as Record<"C1" | "C2", Record<Quarter, Record<string, number> & { total: number }>>;
  const c1c2Combined = Object.fromEntries(quarters.map((quarter) => [quarter, {
    actual: quarterly.C1[quarter] + quarterly.C2[quarter],
    target: 6
  }])) as Record<Quarter, { actual: number; target: number }>;
  const d1 = Object.fromEntries(quarters.map((quarter) => [quarter, Object.fromEntries(stages.map((stage) => [stage, reflectedRows.filter((row) => row.kpiCode === "D1" && fiscalQuarterFromDeliveryDate(row.deliveryDate) === quarter && row.stage === stage).reduce((sum, row) => sum + (row.acrK ?? 0), 0)]))])) as Record<Quarter, Record<WorkloadStage, number>>;
  return { quarterly, monthly, c1c2Combined, d1 };
}

export const getMonthsForQuarter = (quarter: Quarter) => monthsByQuarter[quarter];

export const getRowsForQuarter = (rows: readonly KpiSpreadsheetRow[], quarter: Quarter | null) =>
  quarter ? rows.filter((row) => row.id.startsWith("draft-") || fiscalQuarterFromDeliveryDate(row.deliveryDate) === quarter) : [...rows];

export type KpiQuarterStatus = "Achieved" | "In Progress" | "Not Achieved" | "Not Started";

const fiscalQuarterRange = (fiscalYear: FiscalYear, quarter: Quarter): readonly [string, string] => {
  const endYear = 2000 + Number(fiscalYear.slice(2));
  const startYear = endYear - 1;
  return ({
    Q1: [`${startYear}-06-01`, `${startYear}-08-31`],
    Q2: [`${startYear}-09-01`, `${startYear}-11-30`],
    Q3: [`${startYear}-12-01`, `${endYear}-02-${endYear % 4 === 0 ? "29" : "28"}`],
    Q4: [`${endYear}-03-01`, `${endYear}-05-31`]
  } as const)[quarter];
};

export const getQuarterStatus = (
  fiscalYear: FiscalYear,
  quarter: Quarter,
  actual: number,
  target: number,
  asOf: string
): KpiQuarterStatus => {
  const [start, end] = fiscalQuarterRange(fiscalYear, quarter);
  if (asOf < start) return "Not Started";
  if (actual >= target) return "Achieved";
  return asOf > end ? "Not Achieved" : "In Progress";
};

export const isD1QuarterAchieved = (actual: Readonly<Record<WorkloadStage, number>>) =>
  actual.identified >= 2000 || actual.validated >= 1000 || actual.onboarded >= 500;
