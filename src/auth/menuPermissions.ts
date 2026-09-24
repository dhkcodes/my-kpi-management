import type { AuthSession, MenuPermission, MenuPermissionId } from "./authSession";
import type { NavigationItem } from "../data/kpiMockData";
import { getNavigationRoute, type NavigationRouteDefinition } from "../components/navigationRoutes";

export type RoutePermission = MenuPermission | "OWN";

export function getRouteMenuId(route: NavigationRouteDefinition): MenuPermissionId | null {
  if (route.module === "kpiPage") return "kpis-overview";
  if (route.module === "weeklyActivities") return "weekly-activities";
  if (route.module === "myCustomers360") return "customers-overview";
  if (route.module === "accountManagementOverview") return "accounts-workloads";
  if (route.module === "accountsWorkloads") return "accounts-workloads";
  if (route.module === "consumptionAnalysis") return "analysis";
  if (route.module === "consumptionAttainment") return "attainment";
  if (route.module === "consumptionRecords") return "records";
  return null;
}

export function getRoutePermission(profile: AuthSession, route: NavigationRouteDefinition): RoutePermission {
  if (route.module === "users") return profile.access === "Admin" ? "WRITE" : "NONE";
  if (route.module === "profile" || route.module === "home") return "OWN";
  const menuId = getRouteMenuId(route);
  if (!menuId) return "NONE";
  if (profile.access === "Admin") {
    return menuId === "kpis-overview" || menuId === "weekly-activities" ? "OWN" : "WRITE";
  }
  return profile.menuPermissions[menuId] ?? "NONE";
}
export const canAccessRoute = (profile: AuthSession, route: NavigationRouteDefinition): boolean => getRoutePermission(profile, route) !== "NONE";
export const canWriteRoute = (profile: AuthSession, route: NavigationRouteDefinition): boolean => ["OWN", "WRITE"].includes(getRoutePermission(profile, route));

/** Removes inaccessible leaf routes and then removes empty menu groups. */
export function filterNavigationItems(items: NavigationItem[], profile: AuthSession): NavigationItem[] {
  return items.flatMap((item) => {
    if (!item.children) return item.id === "home" ? [{ ...item }] : [];
    const children = item.children.filter((child) => canAccessRoute(profile, getNavigationRoute(child.id)));
    return children.length ? [{ ...item, children }] : [];
  });
}
