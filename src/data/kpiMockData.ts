import { calculateFiscalYearDataset, FiscalYearDataset } from "./kpiCalculations";
import { FiscalYear, parseWorkbookSeed, ParsedKpiActivityRow, Quarter, WorkbookSeed } from "./kpiExcelParser";
import { KpiSpreadsheetRow, SpreadsheetKpiCode } from "./kpiSpreadsheet";

export type { FiscalYear, ParsedKpiActivityRow, Quarter, WorkloadStage } from "./kpiExcelParser";
export type { FiscalYearDataset, GuideSection, KpiOverviewRow, KpiStatus, NewWorkloadQuarter } from "./kpiCalculations";

export type NavigationItem = {
  id: string;
  label: string;
  icon?: string;
  code?: string;
  codePlacement?: "before" | "after";
  children?: NavigationItem[];
};

const names: Record<SpreadsheetKpiCode, string> = {
  A: "Market Awareness", B: "Early Discovery with Customers", C1: "Workshops", C2: "POCs",
  D1: "New Workload", F: "Customer References", H: "Technical Blogs / Articles"
};

/** Public, deterministic fixtures only. No workbook/customer identifiers are stored in Git. */
export const kpiSpreadsheetSyntheticRows: KpiSpreadsheetRow[] = [
  { manageTimeReflected: false, id: "syn-fy26-a-1", fiscalYear: "FY26", kpiCode: "A", quarter: "Q1", month: "", accountWorkload: "", title: "Regional cloud awareness session", srNumber: "SYN-2601", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2025-07-18" },
  { manageTimeReflected: false, id: "syn-fy26-b-1", fiscalYear: "FY26", kpiCode: "B", quarter: "Q2", month: "", accountWorkload: "Acme North / Data Platform", title: "Architecture discovery", srNumber: "SYN-2602", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2025-10-09" },
  { manageTimeReflected: false, id: "syn-fy26-c1-1", fiscalYear: "FY26", kpiCode: "C1", quarter: "Q2", month: "Oct", accountWorkload: "Cedar Labs / Analytics", title: "Analytics workshop", srNumber: "SYN-2603", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2025-10-21" },
  { manageTimeReflected: false, id: "syn-fy26-c2-1", fiscalYear: "FY26", kpiCode: "C2", quarter: "Q2", month: "Nov", accountWorkload: "Blue River / Database", title: "Database proof of concept", srNumber: "SYN-2604", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2025-11-19" },
  { manageTimeReflected: false, id: "syn-fy26-d1-i", fiscalYear: "FY26", kpiCode: "D1", quarter: "Q3", month: "", accountWorkload: "Northstar / AI Services", title: "AI workload identified", srNumber: "SYN-2605", stage: "identified", acrK: 720, targetQuarter: "Q4", deliveryDate: "2026-01-12" },
  { manageTimeReflected: false, id: "syn-fy26-d1-v", fiscalYear: "FY26", kpiCode: "D1", quarter: "Q3", month: "", accountWorkload: "Northstar / AI Services", title: "AI workload validated", srNumber: "SYN-2606", stage: "validated", acrK: 420, targetQuarter: "Q4", deliveryDate: "2026-02-06" },
  { manageTimeReflected: false, id: "syn-fy26-f-1", fiscalYear: "FY26", kpiCode: "F", quarter: "Q4", month: "", accountWorkload: "", title: "Synthetic customer success brief", srNumber: "SYN-2607", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-04-16" },
  { manageTimeReflected: false, id: "syn-fy26-h-1", fiscalYear: "FY26", kpiCode: "H", quarter: "Q4", month: "", accountWorkload: "", title: "Resilient cloud architecture article", srNumber: "SYN-2608", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-05-08" },
  { manageTimeReflected: false, id: "syn-fy27-a-1", fiscalYear: "FY27", kpiCode: "A", quarter: "Q1", month: "", accountWorkload: "", title: "Cloud engineering community session", srNumber: "SYN-2701", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-07-22" },
  { manageTimeReflected: false, id: "syn-fy27-b-1", fiscalYear: "FY27", kpiCode: "B", quarter: "Q1", month: "", accountWorkload: "Maple Works / Integration", title: "Integration discovery", srNumber: "SYN-2702", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-08-04" },
  { manageTimeReflected: false, id: "syn-fy27-c1-1", fiscalYear: "FY27", kpiCode: "C1", quarter: "Q1", month: "Aug", accountWorkload: "Summit Retail / AI", title: "AI discovery workshop", srNumber: "SYN-2703", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-08-19" },
  { manageTimeReflected: false, id: "syn-fy27-c2-1", fiscalYear: "FY27", kpiCode: "C2", quarter: "Q2", month: "Sep", accountWorkload: "Harbor Media / Search", title: "Vector search proof of concept", srNumber: "SYN-2704", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-09-14" },
  { manageTimeReflected: false, id: "syn-fy27-d1-o", fiscalYear: "FY27", kpiCode: "D1", quarter: "Q2", month: "", accountWorkload: "Pioneer Health / Data Lake", title: "Data lake onboarding", srNumber: "SYN-2705", stage: "onboarded", acrK: 510, targetQuarter: "Q1", deliveryDate: "2026-09-25" },
  { manageTimeReflected: false, id: "syn-fy27-f-1", fiscalYear: "FY27", kpiCode: "F", quarter: "Q2", month: "", accountWorkload: "", title: "Synthetic adoption story", srNumber: "SYN-2706", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-11-11" },
  { manageTimeReflected: false, id: "syn-fy27-h-1", fiscalYear: "FY27", kpiCode: "H", quarter: "Q3", month: "", accountWorkload: "", title: "Practical observability article", srNumber: "SYN-2707", stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-12-03" }
];

const toParsed = (row: KpiSpreadsheetRow): ParsedKpiActivityRow => ({
  id: row.id, fiscalYear: row.fiscalYear, quarter: row.quarter, kpiCode: row.kpiCode, kpiName: names[row.kpiCode],
  description: row.title, workload: row.accountWorkload || undefined, srNumber: row.srNumber || undefined,
  deliveryDate: row.deliveryDate || undefined, stage: row.stage || undefined, amountK: row.acrK ?? undefined
});
const workbookSeeds: WorkbookSeed[] = (["FY26", "FY27"] as FiscalYear[]).map((fiscalYear) => ({
  fiscalYear, sourceWorkbook: "synthetic-kpi-fixtures", rows: kpiSpreadsheetSyntheticRows.filter((row) => row.fiscalYear === fiscalYear).map(toParsed)
}));
export const fiscalYears: FiscalYear[] = workbookSeeds.map((seed) => seed.fiscalYear);
export const fiscalYearData: Record<FiscalYear, FiscalYearDataset> = workbookSeeds.reduce((result, seed) => {
  result[seed.fiscalYear] = calculateFiscalYearDataset(parseWorkbookSeed(seed)); return result;
}, {} as Record<FiscalYear, FiscalYearDataset>);
export const getLatestFiscalYear = (): FiscalYear => fiscalYears[fiscalYears.length - 1];

export const kpiNavItems: NavigationItem[] = [
  { id: "kpis-overview", label: "Overview", icon: "oj-ux-ico-dashboard" },
  { id: "activity-a", label: "1 to many market awareness", code: "A", codePlacement: "before" },
  { id: "activity-b", label: "Early discovery with customer", code: "B", codePlacement: "before" },
  { id: "activity-c1", label: "Show and discover workshops", code: "C1", codePlacement: "before" },
  { id: "activity-c2", label: "POCs in customer tenancy", code: "C2", codePlacement: "before" },
  { id: "activity-d1", label: "New workload", code: "D1", codePlacement: "before" },
  { id: "activity-f", label: "Customer references", code: "F", codePlacement: "before" },
  { id: "activity-h", label: "Technical blogs", code: "H", codePlacement: "before" }
];
export const customerNavItems: NavigationItem[] = [
  { id: "customers-overview", label: "Portfolio Overview", icon: "oj-ux-ico-contact-group" },
  { id: "accounts-workloads", label: "Accounts & Workloads", icon: "oj-ux-ico-cloud" },
  { id: "weekly-activities", label: "Weekly Activities", icon: "oj-ux-ico-calendar-clock" }
];
export const navItems: NavigationItem[] = [
  { id: "home", label: "Home", icon: "oj-ux-ico-home" },
  { id: "my-customers", label: "My Customers", icon: "oj-ux-ico-contact-group", children: customerNavItems },
  { id: "kpis", label: "KPI Activities", icon: "oj-ux-ico-book", children: kpiNavItems },
  { id: "consumption", label: "Consumption", icon: "oj-ux-ico-chart-line" }
];
