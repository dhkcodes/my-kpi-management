export const KPI_ACTIVITY_TABS = [
  { tab: "Overview", routeId: "kpis-overview", label: "Overview" },
  { tab: "A", routeId: "activity-a", label: "1 to many" },
  { tab: "B", routeId: "activity-b", label: "Early discovery" },
  { tab: "C1", routeId: "activity-c1", label: "Show and discover workshops" },
  { tab: "C2", routeId: "activity-c2", label: "POCs" },
  { tab: "D1", routeId: "activity-d1", label: "New Workload" },
  { tab: "F", routeId: "activity-f", label: "References" },
  { tab: "H", routeId: "activity-h", label: "Blogs" }
] as const;

export type KpiActivityTab = typeof KPI_ACTIVITY_TABS[number]["tab"];

export type KpiOverviewRow = Readonly<{
  code: Exclude<KpiActivityTab, "Overview">;
  name: string;
  summaryModel: string;
}>;

export const KPI_OVERVIEW_ROWS: readonly KpiOverviewRow[] = [
  { code: "A", name: "1 to many market awareness", summaryModel: "Delivery Quarter count" },
  { code: "B", name: "Early discovery with customer", summaryModel: "Delivery Quarter count" },
  { code: "C1", name: "Show and discover workshops", summaryModel: "Combined Delivery Quarter count" },
  { code: "C2", name: "POCs in customer tenancy", summaryModel: "Combined Delivery Quarter count" },
  { code: "D1", name: "New workload", summaryModel: "Delivery Quarter × Sales Stage ACR matrix" },
  { code: "F", name: "Customer references", summaryModel: "Delivery Quarter count" },
  { code: "H", name: "Technical blogs", summaryModel: "Delivery Quarter count" }
];

export const KPI_PORTFOLIO_ROWS = KPI_OVERVIEW_ROWS.filter((row) => row.code !== "C2");

export const getKpiTabForRoute = (routeId: string): KpiActivityTab =>
  KPI_ACTIVITY_TABS.find((item) => item.routeId === routeId)?.tab ?? "Overview";

export const getRouteForKpiTab = (tab: KpiActivityTab): string =>
  KPI_ACTIVITY_TABS.find((item) => item.tab === tab)?.routeId ?? "kpis-overview";
