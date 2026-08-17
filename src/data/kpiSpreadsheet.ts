import { FiscalYear, Quarter, WorkloadStage } from "./kpiExcelParser";

export const KPI_TABS = ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"] as const;
export type KpiWorkspaceTab = typeof KPI_TABS[number];
export type SpreadsheetKpiCode = Exclude<KpiWorkspaceTab, "Overview">;
export type KpiFieldKey = "manageTimeReflected" | "quarter" | "month" | "accountWorkload" | "title" | "srNumber" | "stage" | "acrK" | "targetQuarter" | "deliveryDate";
export type KpiField = Readonly<{ key: KpiFieldKey; label: string; type?: "text" | "date" | "number" | "quarter" | "month" | "stage" | "boolean" }>;

const field = (key: KpiFieldKey, label: string, type: KpiField["type"] = "text"): KpiField => ({ key, label, type });
const manageTime = field("manageTimeReflected", "Manage Time", "boolean");
const base = [manageTime, field("quarter", "Quarter", "quarter"), field("srNumber", "SR Number"), field("title", "SR Description")];
const related = [manageTime, field("quarter", "Quarter", "quarter"), field("accountWorkload", "Account / Workload / OPPTY"), field("srNumber", "SR Number"), field("title", "SR Description")];
const monthly = [manageTime, field("quarter", "Quarter", "quarter"), field("month", "Month", "month"), field("accountWorkload", "Account / Workload / OPPTY"), field("srNumber", "SR Number"), field("title", "SR Description")];
const delivery = field("deliveryDate", "Delivery Date", "date");

export const KPI_FIELD_CONTRACTS: Record<SpreadsheetKpiCode, readonly KpiField[]> = {
  A: [...base, delivery],
  B: [...related, delivery],
  C1: [...monthly, delivery],
  C2: [...monthly, delivery],
  D1: [manageTime, field("quarter", "Quarter", "quarter"), field("accountWorkload", "Account / Workload / OPPTY"), field("srNumber", "SR Number"), field("title", "Activity"), field("stage", "Sales Stage", "stage"), field("acrK", "ACR (K)", "number"), field("targetQuarter", "Target Quarter", "quarter"), delivery],
  F: [...base, delivery],
  H: [manageTime, field("quarter", "Quarter", "quarter"), field("title", "Content"), delivery]
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
  title: string;
  srNumber: string;
  stage: WorkloadStage | "";
  acrK: number | null;
  targetQuarter: Quarter | "";
  deliveryDate: string;
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
  title: "",
  srNumber: "",
  stage: kpiCode === "D1" ? "identified" : "",
  acrK: kpiCode === "D1" ? 0 : null,
  targetQuarter: kpiCode === "D1" ? "Q1" : "",
  deliveryDate: ""
});

const monthsByQuarter: Record<Quarter, readonly string[]> = {
  Q1: ["Jun", "Jul", "Aug"], Q2: ["Sep", "Oct", "Nov"], Q3: ["Dec", "Jan", "Feb"], Q4: ["Mar", "Apr", "May"]
};
const quarters: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];
const stages: WorkloadStage[] = ["identified", "validated", "onboarded"];

export function buildKpiSummary(rows: readonly KpiSpreadsheetRow[]) {
  const quarterly = Object.fromEntries(KPI_TABS.filter((tab): tab is SpreadsheetKpiCode => tab !== "Overview").map((code) => [code, Object.fromEntries(quarters.map((quarter) => [quarter, rows.filter((row) => row.kpiCode === code && row.quarter === quarter).length]))])) as Record<SpreadsheetKpiCode, Record<Quarter, number>>;
  const monthly = Object.fromEntries((["C1", "C2"] as const).map((code) => [code, Object.fromEntries(quarters.map((quarter) => {
    const monthCounts = Object.fromEntries(monthsByQuarter[quarter].map((month) => [month, rows.filter((row) => row.kpiCode === code && row.quarter === quarter && row.month === month).length]));
    return [quarter, { ...monthCounts, total: quarterly[code][quarter] }];
  }))])) as Record<"C1" | "C2", Record<Quarter, Record<string, number> & { total: number }>>;
  const d1 = Object.fromEntries(quarters.map((quarter) => [quarter, Object.fromEntries(stages.map((stage) => [stage, rows.filter((row) => row.kpiCode === "D1" && row.quarter === quarter && row.stage === stage).reduce((sum, row) => sum + (row.acrK ?? 0), 0)]))])) as Record<Quarter, Record<WorkloadStage, number>>;
  return { quarterly, monthly, d1 };
}

export const getMonthsForQuarter = (quarter: Quarter) => monthsByQuarter[quarter];
