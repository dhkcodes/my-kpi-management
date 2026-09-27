import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
assert.equal(canAccessRoute(user, getNavigationRoute("account-management-overview")), false);
assert.equal(canAccessRoute(user, getNavigationRoute("accounts-workloads")), false);
assert.equal(canWriteRoute(user, getNavigationRoute("analysis")), true, "WRITE implies READ");
assert.equal(canAccessRoute(user, getNavigationRoute("users")), false);
assert.equal(canAccessRoute(user, getNavigationRoute("profile")), true);

const visibleIds = filterNavigationItems(navItems, user).flatMap((item) => [item.id, ...(item.children ?? []).map((child) => child.id)]);
for (const visible of ["home", "kpis-overview", "weekly-activities", "analysis", "attainment"]) assert.ok(visibleIds.includes(visible), `${visible} should be visible`);
for (const hidden of ["customers-overview", "account-management-overview", "accounts-workloads", "records"]) assert.ok(!visibleIds.includes(hidden), `${hidden} should be hidden`);

const accountReadOnly = parseAuthProfile({ ...base, menuPermissions: { ...allRead, "accounts-workloads": "READ" } });
assert.equal(canAccessRoute(accountReadOnly, getNavigationRoute("account-management-overview")), true);
assert.equal(canAccessRoute(accountReadOnly, getNavigationRoute("accounts-workloads")), true);
assert.equal(canWriteRoute(accountReadOnly, getNavigationRoute("account-management-overview")), false);
assert.equal(canWriteRoute(accountReadOnly, getNavigationRoute("accounts-workloads")), false);

const admin: AuthSession = { ...base, access: "Admin", menuPermissions: {}, status: "ACTIVE" };
for (const routeId of ["activity-a", "weekly-activities", "customers-overview", "account-management-overview", "accounts-workloads", "analysis", "attainment", "records", "users"]) {
  assert.equal(canWriteRoute(admin, getNavigationRoute(routeId)), true, `Admin can write ${routeId}`);
}
assert.equal(getRoutePermission(admin, getNavigationRoute("activity-a")), "OWN", "KPI backend remains owner-scoped");
assert.equal(getRoutePermission(admin, getNavigationRoute("weekly-activities")), "OWN", "Weekly backend remains owner-scoped");

const noGrants: AuthSession = { ...base, menuPermissions: Object.fromEntries(Object.keys(allRead).map((id) => [id, "NONE"])) as MenuPermissionMap, status: "ACTIVE" };
for (const routeId of Object.keys(allRead)) assert.equal(canAccessRoute(noGrants, getNavigationRoute(routeId)), false);
assert.equal(canAccessRoute(noGrants, getNavigationRoute("home")), true);

const appSource = readFileSync("src/components/app.tsx", "utf8");
assert.match(appSource, /const handleNavigate =[\s\S]*?if \(!canAccessRoute\(profile, route\)\) return;[\s\S]*?window\.history\.pushState/,
  "internal navigation must reject routes without menu read permission");
assert.match(appSource, /const route = getNavigationRouteFromPath\(window\.location\.pathname\);[\s\S]*?if \(!canAccessRoute\(profile, route\)\)[\s\S]*?window\.history\.replaceState/,
  "browser history navigation must replace unauthorized routes");
assert.match(appSource, /requestedInitialRoute[\s\S]*?canAccessRoute\(profile, requestedInitialRoute\)[\s\S]*?getNavigationRoute\("home"\)/,
  "direct URL initialization must fall back from unauthorized routes");
console.log("menu permission tests passed");
