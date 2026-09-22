import assert from "node:assert/strict";
import { parseAuthProfile, type AuthSession, type MenuPermissionMap } from "../src/auth/authSession";
import { canAccessRoute, canWriteRoute, filterNavigationItems, getRoutePermission } from "../src/auth/menuPermissions";
import { navItems } from "../src/data/kpiMockData";
import { getNavigationRoute } from "../src/components/navigationRoutes";

const allRead: MenuPermissionMap = {
  "kpis-overview": "READ",
  "weekly-activities": "READ",
  "customers-overview": "READ",
  "accounts-workloads": "READ",
  analysis: "READ",
  attainment: "READ",
  records: "READ"
};
const base = { userKey: "user-1", displayName: "KPI User", loginId: "user@example.com", access: "User" as const, status: "ACTIVE" as const };
const user = parseAuthProfile({ ...base, menuPermissions: { ...allRead, "accounts-workloads": "NONE", analysis: "WRITE", records: "NONE" } });
assert.deepEqual(user.menuPermissions, { ...allRead, "accounts-workloads": "NONE", analysis: "WRITE", records: "NONE" });
assert.throws(() => parseAuthProfile({ ...base, menuPermissions: { ...allRead, analysis: "OWN" } }), /Invalid authentication response/);
assert.throws(() => parseAuthProfile({ ...base, menuPermissions: { ...allRead, unknown: "READ" } }), /Invalid authentication response/);
assert.throws(() => parseAuthProfile({ ...base, menuPermissions: { analysis: "READ" } }), /Invalid authentication response/);

assert.equal(getRoutePermission(user, getNavigationRoute("activity-a")), "READ", "all KPI routes share the KPI permission");
assert.equal(getRoutePermission(user, getNavigationRoute("weekly-activities")), "READ");
assert.equal(canWriteRoute(user, getNavigationRoute("activity-a")), false);
assert.equal(canAccessRoute(user, getNavigationRoute("accounts-workloads")), false);
assert.equal(canWriteRoute(user, getNavigationRoute("analysis")), true, "WRITE implies READ");
assert.equal(canAccessRoute(user, getNavigationRoute("users")), false);
assert.equal(canAccessRoute(user, getNavigationRoute("profile")), true);

const visibleIds = filterNavigationItems(navItems, user).flatMap((item) => [item.id, ...(item.children ?? []).map((child) => child.id)]);
for (const visible of ["home", "customers-overview", "kpis-overview", "weekly-activities", "analysis", "attainment"]) assert.ok(visibleIds.includes(visible), `${visible} should be visible`);
for (const hidden of ["accounts-workloads", "records"]) assert.ok(!visibleIds.includes(hidden), `${hidden} should be hidden`);

const admin: AuthSession = { ...base, access: "Admin", menuPermissions: {}, status: "ACTIVE" };
for (const routeId of ["activity-a", "weekly-activities", "customers-overview", "accounts-workloads", "analysis", "attainment", "records", "users"]) {
  assert.equal(canWriteRoute(admin, getNavigationRoute(routeId)), true, `Admin can write ${routeId}`);
}
assert.equal(getRoutePermission(admin, getNavigationRoute("activity-a")), "OWN", "KPI backend remains owner-scoped");
assert.equal(getRoutePermission(admin, getNavigationRoute("weekly-activities")), "OWN", "Weekly backend remains owner-scoped");

const noGrants: AuthSession = { ...base, menuPermissions: Object.fromEntries(Object.keys(allRead).map((id) => [id, "NONE"])) as MenuPermissionMap, status: "ACTIVE" };
for (const routeId of Object.keys(allRead)) assert.equal(canAccessRoute(noGrants, getNavigationRoute(routeId)), false);
assert.equal(canAccessRoute(noGrants, getNavigationRoute("home")), true);
console.log("menu permission tests passed");
