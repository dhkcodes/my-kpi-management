import assert from "node:assert/strict";
import { getNavigationRoute } from "../src/components/navigationRoutes";

assert.equal(getNavigationRoute("accounts-workloads").module, "accountsWorkloads");
assert.equal(getNavigationRoute("unknown").id, "home");

console.log("navigationRoutes tests passed");
