import assert from "node:assert/strict";
import {
  KPI_ACTIVITY_TABS,
  KPI_OVERVIEW_ROWS,
  KPI_PORTFOLIO_ROWS,
  getKpiTabForRoute,
  getRouteForKpiTab
} from "../src/data/kpiWorkspaceDefinition";

assert.deepEqual(KPI_ACTIVITY_TABS.map((tab) => tab.tab), ["Overview", "A", "B", "C1", "C2", "D1", "F", "H"]);
assert.equal(getKpiTabForRoute("kpis-overview"), "Overview");
assert.equal(getKpiTabForRoute("activity-d1"), "D1");
assert.equal(getRouteForKpiTab("Overview"), "kpis-overview");
assert.equal(getRouteForKpiTab("H"), "activity-h");
assert.equal(KPI_OVERVIEW_ROWS.length, 7, "all KPI detail tabs retain definitions");
assert.equal(KPI_PORTFOLIO_ROWS.length, 6, "C1+C2 is represented once in Overview");
assert.equal(KPI_PORTFOLIO_ROWS.filter((row) => row.code === "C1" || row.code === "C2").length, 1);
assert.equal(KPI_OVERVIEW_ROWS.find((row) => row.code === "D1")?.summaryModel, "Delivery Quarter × Sales Stage ACR matrix");
assert.equal(KPI_OVERVIEW_ROWS.find((row) => row.code === "F")?.summaryModel, "Delivery Quarter count", "KPI F must not expose Target Quarter terminology");

console.log("kpiWorkspaceNavigation tests passed");
