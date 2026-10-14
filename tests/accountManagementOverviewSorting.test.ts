import assert = require("assert");
import * as data from "../src/data/accountManagementOverview";
import type { OverviewDeal } from "../src/data/accountManagementOverview";

const item = (id: number, close: string | null, amount: number | null, account = "Account", type = "NEW"): OverviewDeal => ({
  account: { id, name: account, archived: false, versionNo: 1, workloads: [] },
  workload: { id, name: `Workload ${id}`, archived: false, versionNo: 1, salesRep: null, lastUpdated: null, notes: null, highlighted: false, plans: [], deals: [] },
  deal: { id, workloadId: id, versionNo: 1, name: `Opportunity ${id}`, opportunityNo: null, revenueType: type, status: "OPEN", targetFiscalYear: "FY27", targetQuarter: 2, actualCloseDate: close, contractStartDate: null, contractEndDate: null, arrUsd: type === "RENEWAL" ? 99999 : amount, acrUsd: type === "RENEWAL" ? amount : 0, arrKrw: null, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
  actualPeriod: null,
});
const rows = [item(1, null, 900), item(2, "2026-10-15", 900), item(3, "2026-10-13", 20, "Zeta"), item(4, "2026-10-13", 30, "Beta"), item(5, "2026-10-13", 30, "Alpha"), item(6, "2026-10-12", 1), item(7, "2026-10-13", null), item(8, "invalid", 100)];
const sort = (data as unknown as { sortOverviewDeals?: (rows: readonly OverviewDeal[], sort?: { column: string; direction: string } | null, today?: Date) => OverviewDeal[] }).sortOverviewDeals;
assert.strictEqual(typeof sort, "function", "Overview must provide a real sorting helper");
assert.deepStrictEqual(sort!(rows).map(row => row.deal.id), [6, 5, 4, 3, 7, 2, 1, 8], "oldest past Close Date first, Amount DESC then Account ASC, missing/invalid dates last");
assert.deepStrictEqual(rows.map(row => row.deal.id), [1, 2, 3, 4, 5, 6, 7, 8], "sorting never mutates API rows");
assert.deepStrictEqual(sort!(rows, { column: "closeDate", direction: "descending" }).map(row => row.deal.id), [2, 5, 4, 3, 7, 6, 1, 8], "descending dates still leave missing dates last");
assert.deepStrictEqual(sort!([item(1, null, 100), item(2, null, 20, "Account", "RENEWAL"), item(3, null, null)], { column: "amount", direction: "ascending" }).map(row => row.deal.id), [2, 1, 3], "sort the displayed primary amount, not hidden Renewal ARR; null last");
console.log("accountManagementOverviewSorting tests passed");
