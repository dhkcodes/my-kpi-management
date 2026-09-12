export type NavigationRouteModule =
  | "home"
  | "kpiPage"
  | "myCustomers360"
  | "accountsWorkloads"
  | "weeklyActivities"
  | "consumptionAnalysis"
  | "consumptionAttainment"
  | "consumptionRecords"
  | "profile"
  | "users";

export type NavigationRouteDefinition = Readonly<{
  id: string;
  module: NavigationRouteModule;
  pageTitle: string;
  path?: string;
}>;

export const navigationRouteDefinitions: NavigationRouteDefinition[] = [
  { id: "home", module: "home", pageTitle: "Home" },
  { id: "kpis-overview", module: "kpiPage", pageTitle: "KPI Activities Overview" },
  { id: "activity-a", module: "kpiPage", pageTitle: "[A] 1 to many market awareness" },
  { id: "activity-b", module: "kpiPage", pageTitle: "[B] Early discovery with customer" },
  { id: "activity-c1", module: "kpiPage", pageTitle: "[C1] Show and discover workshops" },
  { id: "activity-c2", module: "kpiPage", pageTitle: "[C2] POCs in customer tenancy" },
  { id: "activity-d1", module: "kpiPage", pageTitle: "[D1] New workload" },
  { id: "activity-f", module: "kpiPage", pageTitle: "[F] Customer references" },
  { id: "activity-h", module: "kpiPage", pageTitle: "[H] Technical blogs" },
  { id: "customers-overview", module: "myCustomers360", pageTitle: "Portfolio Overview" },
  { id: "accounts-workloads", module: "accountsWorkloads", pageTitle: "Accounts & Workloads" },
  { id: "weekly-activities", module: "weeklyActivities", pageTitle: "Weekly Activities" },
  { id: "analysis", module: "consumptionAnalysis", pageTitle: "Consumption Analysis", path: "/consumption/analysis" },
  { id: "attainment", module: "consumptionAttainment", pageTitle: "Consumption Attainment", path: "/consumption/attainment" },
  { id: "records", module: "consumptionRecords", pageTitle: "Consumption Records", path: "/consumption/records" },
  { id: "profile", module: "profile", pageTitle: "Profile" },
  { id: "users", module: "users", pageTitle: "Users" }
];

const navigationRoutesById = navigationRouteDefinitions.reduce((routes, route) => {
  routes[route.id] = route;
  return routes;
}, {} as Record<string, NavigationRouteDefinition>);

const legacyRouteIds: Record<string, string> = {
  "usage-insights": "analysis",
  "usage-records": "records"
};

const routeIdsByPath: Record<string, string> = {
  "consumption": "analysis",
  "consumption/analysis": "analysis",
  "consumption/attainment": "attainment",
  "consumption/records": "records",
  "consumption/usage-insights": "analysis",
  "consumption/usage-records": "records",
  "usage-insights": "analysis",
  "attainment": "attainment",
  "usage-records": "records"
};

export const getNavigationRoute = (id: string): NavigationRouteDefinition =>
  navigationRoutesById[legacyRouteIds[id] ?? id] ?? navigationRoutesById.home;

export const getNavigationPath = (route: NavigationRouteDefinition): string =>
  route.path ?? (route.id === "home" ? "/" : `/${route.id}`);

export const getNavigationRouteFromPath = (pathname: string): NavigationRouteDefinition => {
  const normalized = pathname.replace(/^\/+|\/+$/g, "");
  return getNavigationRoute(routeIdsByPath[normalized] ?? (normalized || "home"));
};

export const getCanonicalNavigationPath = (pathname: string): string =>
  getNavigationPath(getNavigationRouteFromPath(pathname));

export const isKpiActivitiesRoute = (route: NavigationRouteDefinition): boolean =>
  route.module === "kpiPage";
