export const KPI_ACTIVITY_TABS = [
  { tab: "Overview", routeId: "kpis-overview", label: "Overview" },
  { tab: "A", routeId: "activity-a", label: "1 to many" },
  { tab: "B", routeId: "activity-b", label: "Early discovery" },
  { tab: "C1", routeId: "activity-c1", label: "Workshops" },
  { tab: "C2", routeId: "activity-c2", label: "POCs" },
  { tab: "D1", routeId: "activity-d1", label: "New Workload" },
  { tab: "F", routeId: "activity-f", label: "References" },
  { tab: "H", routeId: "activity-h", label: "Blogs" }
] as const;

export type KpiActivityTab = typeof KPI_ACTIVITY_TABS[number]["tab"];

export type KpiOverviewRow = Readonly<{
  code: Exclude<KpiActivityTab, "Overview">;
  name: string;
  target: string;
  summaryModel: string;
}>;

export const KPI_OVERVIEW_ROWS: readonly KpiOverviewRow[] = [
  { code: "A", name: "1 to many market awareness", target: "1 / Quarter", summaryModel: "Target Quarter count" },
  { code: "B", name: "Early discovery with customer", target: "12 / Quarter", summaryModel: "Target Quarter count" },
  { code: "C1", name: "Show and discover workshops", target: "C1 + C2 combined · 6 / Quarter", summaryModel: "Fiscal Month → combined Target Quarter roll-up" },
  { code: "C2", name: "POCs in customer tenancy", target: "C1 + C2 combined · 6 / Quarter", summaryModel: "Fiscal Month → combined Target Quarter roll-up" },
  { code: "D1", name: "New workload", target: "Onboarded 500K · Validated 1,000K · Identified 2,000K / Quarter", summaryModel: "Target Quarter × Sales Stage ACR matrix" },
  { code: "F", name: "Customer references", target: "1 / Quarter", summaryModel: "Target Quarter count" },
  { code: "H", name: "Technical blogs", target: "1 / Quarter", summaryModel: "Target Quarter count" }
];

export const getKpiTabForRoute = (routeId: string): KpiActivityTab =>
  KPI_ACTIVITY_TABS.find((item) => item.routeId === routeId)?.tab ?? "Overview";

export const getRouteForKpiTab = (tab: KpiActivityTab): string =>
  KPI_ACTIVITY_TABS.find((item) => item.tab === tab)?.routeId ?? "kpis-overview";
