import assert = require("assert");
import * as fs from "fs";
import * as path from "path";
import { buildAccountManagementOverview } from "../src/data/accountManagementOverview";
import type { AccountsWorkloadsHierarchy, AccountWorkloadDeal } from "../src/data/accountsWorkloadsApi";
const base: AccountWorkloadDeal = { id: 1, workloadId: 1, versionNo: 1, name: "Opportunity", opportunityNo: null, revenueType: "NEW", status: "OPEN", targetFiscalYear: "FY27", targetQuarter: 2, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: 100, arrKrw: null, acrUsd: 20, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null };
const workload = { id: 1, versionNo: 1, name: "Workload", salesRep: null, lastUpdated: null, notes: null, highlighted: false, archived: false, plans: [], deals: [] as AccountWorkloadDeal[] };
const hierarchy: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [
  { id: 1, versionNo: 1, name: "Alpha", archived: false, workloads: [
    { ...workload, deals: [base, { ...base, id: 2, targetQuarter: 3 }, { ...base, id: 3, targetQuarter: 4 }, { ...base, id: 4, targetFiscalYear: null, targetQuarter: null }, { ...base, id: 5, actualCloseDate: "2026-01-01", targetQuarter: 4 }, { ...base, id: 6, status: "WON" }, { ...base, id: 7, status: "LOST" }, { ...base, id: 8, deleted: true }] },
    { ...workload, id: 2, archived: true, deals: [{ ...base, id: 9 }] },
  ] },
  { id: 2, versionNo: 1, name: "Beta", archived: false, workloads: [{ ...workload, deals: [{ ...base, id: 10 }] }] },
  { id: 3, versionNo: 1, name: "Archived", archived: true, workloads: [{ ...workload, deals: [{ ...base, id: 11 }] }] },
] };
const overview = buildAccountManagementOverview(hierarchy, new Date("2026-10-14T00:00:00Z"));
const openFor = (overview as unknown as { openFor?: (search: string, account?: { accountId: number }) => readonly { deal: AccountWorkloadDeal }[] }).openFor;
assert.strictEqual(typeof openFor, "function", "Open card needs a scope-only helper, not a Priority/period subset");
assert.deepStrictEqual(openFor!("").map(item => item.deal.id), [1, 2, 3, 4, 5, 10], "only exact OPEN, non-deleted, active accounts/workloads; all FY/quarters");
assert.deepStrictEqual(openFor!("", { accountId: 1 }).map(item => item.deal.id), [1, 2, 3, 4, 5]);
assert.deepStrictEqual(overview.targetFor("PRIORITY", "").deals.map(item => item.deal.id), [1, 2, 4, 5, 10], "Priority meaning must remain unchanged and exclude non-overdue future Q4");
const page = fs.readFileSync(path.resolve("src/components/content/AccountManagementOverviewPage.tsx"), "utf8");
const css = fs.readFileSync(path.resolve("src/components/content/AccountManagementOverviewPage.css"), "utf8");
assert.match(page, /Open Opportunity/);
assert.match(page, /Active Workloads/);
assert.match(page, /activeWorkloadCount/);
assert.doesNotMatch(page, /Active Workloads<\/strong><small>/);
assert.doesNotMatch(page, /\["TARGET_NOT_SET", "Target not set"/);
assert.match(page, /sortOverviewDeals\(target\?\.deals \?\? \[\], targetSort\)/);
assert.match(page, /aria-sort=\{/);
assert.match(page, /account-overview__bar-track/);
assert.match(css, /--account-overview-new:\s*#0072b2/);
assert.match(css, /--account-overview-expansion:\s*#d55e00/);
assert.match(css, /--account-overview-renewal:\s*#8b4caf/);
assert.match(css, /account-overview__bar-item\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+1rem/s);
console.log("accountManagementOverviewPresentation tests passed");
