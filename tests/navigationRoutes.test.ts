import assert from "node:assert/strict";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath
} from "../src/components/navigationRoutes";

assert.equal(getNavigationRoute("accounts-workloads").module, "accountsWorkloads");
assert.equal(getNavigationRoute("unknown").id, "home");
assert.equal(getNavigationRouteFromPath("/accounts-workloads").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/accounts-workloads/").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/unknown").id, "home");
assert.equal(getNavigationPath(getNavigationRoute("accounts-workloads")), "/accounts-workloads");
assert.equal(getNavigationPath(getNavigationRoute("home")), "/");

console.log("navigationRoutes tests passed");
