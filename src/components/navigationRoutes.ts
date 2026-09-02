export type NavigationRouteModule =
  | "home"
  | "kpiPage"
  | "myCustomers360"
  | "accountsWorkloads"
  | "weeklyActivities"
  | "consumptionInsights"
  | "consumptionRecords"
  | "profile"
  | "users";

export type NavigationRouteDefinition = Readonly<{
  id: string;
  module: NavigationRouteModule;
  pageTitle: string;
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
  { id: "usage-insights", module: "consumptionInsights", pageTitle: "Usage Insights" },
  { id: "usage-records", module: "consumptionRecords", pageTitle: "Usage Records" },
  { id: "profile", module: "profile", pageTitle: "Profile" },
  { id: "users", module: "users", pageTitle: "Users" }
];

const navigationRoutesById = navigationRouteDefinitions.reduce((routes, route) => {
  routes[route.id] = route;
  return routes;
}, {} as Record<string, NavigationRouteDefinition>);

export const getNavigationRoute = (id: string): NavigationRouteDefinition =>
  navigationRoutesById[id] ?? navigationRoutesById.home;

export const getNavigationPath = (route: NavigationRouteDefinition): string =>
  route.id === "home" ? "/" : `/${route.id}`;

export const getNavigationRouteFromPath = (pathname: string): NavigationRouteDefinition => {
  const normalized = pathname.replace(/^\/+|\/+$/g, "");
  if (normalized === "consumption") return getNavigationRoute("usage-insights");
  return getNavigationRoute(normalized || "home");
};

export const isKpiActivitiesRoute = (route: NavigationRouteDefinition): boolean =>
  route.module === "kpiPage";
