export type NavigationRouteModule =
  | "home"
  | "kpiPage"
  | "myCustomers360"
  | "accountsWorkloads"
  | "weeklyActivities"
  | "consumption";

export type NavigationRouteDefinition = Readonly<{
  id: string;
  module: NavigationRouteModule;
  pageTitle: string;
}>;

export const navigationRouteDefinitions: NavigationRouteDefinition[] = [
  { id: "home", module: "home", pageTitle: "Home" },
  { id: "kpis", module: "kpiPage", pageTitle: "KPIs" },
  { id: "activity-a", module: "kpiPage", pageTitle: "[A] 1 to many market awareness" },
  { id: "activity-b", module: "kpiPage", pageTitle: "[B] Early discovery with customer" },
  { id: "activity-c1", module: "kpiPage", pageTitle: "[C1] Show and discover workshops" },
  { id: "activity-c2", module: "kpiPage", pageTitle: "[C2] POCs in customer tenancy" },
  { id: "activity-d1", module: "kpiPage", pageTitle: "[D1] New workload" },
  { id: "activity-f", module: "kpiPage", pageTitle: "[F] Customer references" },
  { id: "activity-h", module: "kpiPage", pageTitle: "[H] Technical blogs" },
  { id: "my-customers-360", module: "myCustomers360", pageTitle: "My Customers 360" },
  { id: "accounts-workloads", module: "accountsWorkloads", pageTitle: "Accounts & Workloads" },
  { id: "weekly-activities", module: "weeklyActivities", pageTitle: "Weekly Activities" },
  { id: "consumption", module: "consumption", pageTitle: "Consumption" }
];

const navigationRoutesById = navigationRouteDefinitions.reduce((routes, route) => {
  routes[route.id] = route;
  return routes;
}, {} as Record<string, NavigationRouteDefinition>);

export const getNavigationRoute = (id: string): NavigationRouteDefinition =>
  navigationRoutesById[id] ?? navigationRoutesById.home;
