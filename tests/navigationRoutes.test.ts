import assert from "node:assert/strict";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath
} from "../src/components/navigationRoutes";

assert.equal(getNavigationRoute("accounts-workloads").module, "accountsWorkloads");
assert.equal(getNavigationRoute("kpis-overview").module, "kpiPage");
assert.equal(getNavigationRoute("kpis-overview").pageTitle, "KPI Activities Overview");
assert.equal(getNavigationRouteFromPath("/kpis-overview").id, "kpis-overview");
assert.equal(getNavigationPath(getNavigationRoute("kpis-overview")), "/kpis-overview");
assert.equal(getNavigationRoute("unknown").id, "home");
assert.equal(getNavigationRouteFromPath("/accounts-workloads").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/accounts-workloads/").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/unknown").id, "home");
assert.equal(getNavigationPath(getNavigationRoute("accounts-workloads")), "/accounts-workloads");
assert.equal(getNavigationPath(getNavigationRoute("home")), "/");

console.log("navigationRoutes tests passed");
