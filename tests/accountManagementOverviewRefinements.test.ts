import assert = require("assert");
import * as fs from "fs";
import * as path from "path";
import { buildAccountManagementOverview, daysToClose, formatDaysToClose, targetStatus } from "../src/data/accountManagementOverview";
import type { AccountsWorkloadsHierarchy, AccountWorkloadDeal } from "../src/data/accountsWorkloadsApi";

const today = new Date("2026-10-14T23:59:59Z");
const base: AccountWorkloadDeal = {
  id: 1, workloadId: 1, versionNo: 1, name: "Opportunity", opportunityNo: null,
  revenueType: "NEW", status: "OPEN", targetFiscalYear: "FY27", targetQuarter: 2,
  actualCloseDate: null, contractStartDate: null, contractEndDate: null,
  arrUsd: 100, arrKrw: null, acrUsd: 20, acrKrw: null, winProbability: null,
  latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null,
};
const deals = [
  { ...base, id: 1, actualCloseDate: "2026-10-13" }, // overdue inside current target quarter
  { ...base, id: 2, actualCloseDate: "2026-10-14" },
  { ...base, id: 3, actualCloseDate: "2026-10-15", targetFiscalYear: "FY26", targetQuarter: 4 }, // past target, future close
  { ...base, id: 4, targetFiscalYear: "FY26", targetQuarter: 4 }, // past target, no close
  { ...base, id: 5, actualCloseDate: "2026-10-13", targetFiscalYear: null, targetQuarter: null },
  { ...base, id: 6, targetFiscalYear: null, targetQuarter: null },
  { ...base, id: 7, targetQuarter: 3 },
  { ...base, id: 8, actualCloseDate: "2026-10-13", status: "WON" as const },
  { ...base, id: 9, actualCloseDate: "2026-10-13", deleted: true },
];
const hierarchy: AccountsWorkloadsHierarchy = { fiscalYear: null, accounts: [{
  id: 1, versionNo: 1, name: "Account", archived: false, workloads: [{
    id: 1, versionNo: 1, name: "Workload", salesRep: null, lastUpdated: null, notes: null,
    highlighted: false, archived: false, plans: [], deals,
  }],
}] };
const overview = buildAccountManagementOverview(hierarchy, today);
assert.strictEqual(overview.exceptions.overdue, 2);
assert.deepStrictEqual(overview.targetFor("OVERDUE", "").deals.map(item => item.deal.id), [1, 5]);
assert.strictEqual(targetStatus(overview.targetDeals[0], today), "OVERDUE");
assert.strictEqual(targetStatus(overview.targetDeals[1], today), "THIS_QUARTER");
assert.strictEqual(targetStatus(overview.targetDeals[4], today), "OVERDUE", "missing target does not hide a past Close Date");
assert.deepStrictEqual(overview.targetFor("TARGET_NOT_SET", "").deals.map(item => item.deal.id), [5, 6], "retain independent target-not-set filtering");
assert.deepStrictEqual(overview.targetFor("THIS_QUARTER", "").deals.map(item => item.deal.id), [1, 2]);
assert.deepStrictEqual(overview.targetFor("NEXT_QUARTER", "").deals.map(item => item.deal.id), [7]);
assert.deepStrictEqual(overview.targetFor("CHOOSE_PERIOD", "", today, "FY26 Q4").deals.map(item => item.deal.id), [3, 4]);
assert.deepStrictEqual(overview.targetFor("OVERDUE", "", today, "", { accountId: 99 }).deals, []);
for (const date of [null, "", "invalid", "2026-02-30", "2026-10-14T12:00:00Z"]) {
  assert.strictEqual(daysToClose(date, today), null);
  assert.strictEqual(formatDaysToClose(date, today), "—");
}
assert.strictEqual(daysToClose("2026-10-14", today), 0);
assert.strictEqual(formatDaysToClose("2026-10-14", today), "0 days");
assert.strictEqual(formatDaysToClose("2026-10-13", today), "1 day overdue");
assert.strictEqual(formatDaysToClose("2026-10-15", today), "1 day");
assert.strictEqual(formatDaysToClose("2026-10-17", today), "3 days");
assert.strictEqual(daysToClose("2028-03-01", new Date("2028-02-28T22:00:00Z")), 2);
assert.strictEqual(daysToClose("2026-03-09", new Date("2026-03-08T23:00:00Z")), 1, "calendar days do not depend on daylight saving hours");
assert.strictEqual(daysToClose("2027-01-01", new Date("2026-12-31T23:59:59Z")), 1);

const page = fs.readFileSync(path.resolve("src/components/content/AccountManagementOverviewPage.tsx"), "utf8");
const css = fs.readFileSync(path.resolve("src/components/content/AccountManagementOverviewPage.css"), "utf8");
assert.match(page, /\["type", "Type"\][\s\S]*\["amount", "Amount"\][\s\S]*\["target", "Target FY\/Q"\][\s\S]*\["status", "Status"\][\s\S]*\["closeDate", "Close Date"\][\s\S]*\["daysToClose", "Days to Close"\]/, "sortable headers preserve column order");
assert.match(page, /formatDaysToClose\(item\.deal\.actualCloseDate\)/);
assert.doesNotMatch(page, /daysToTargetEnd|To Quarter End|Target quarter ended|pendingFilterRef/);
assert.match(page, /if \(queryControlsLockRef\.current\) return;[\s\S]*queryControlsLockRef\.current = true;[\s\S]*\+\+requestGeneration\.current;[\s\S]*applyFilter\?\.\(\)/, "lock and invalidate requests synchronously before applying filters");
assert.match(page, /onSelect=\{\(year\) => refresh\(\(\) => \{ fySelectedRef\.current = true; setActualFy\(year\); \}\)\}/);
assert.match(page, /if \(!active \|\| generation !== requestGeneration\.current\) return;/, "stale reads cannot publish hierarchy or completion state");
assert.match(page, /if \(active && generation === requestGeneration\.current\)/, "stale failures/finalizers cannot unlock or alter the active transition");
assert.doesNotMatch(page, /\[overview, actualFy\]/, "no post-render auto-FY effect may revert a user selection");
assert.match(css, /--account-overview-section-gap:\s*\.75rem/);
assert.match(css, /exceptions \+ \.account-overview__section \{ margin-top: var\(--account-overview-section-gap\)/);
assert.match(css, /section \+ \.account-overview__section \{ margin-top: var\(--account-overview-section-gap\)/);
assert.match(css, /\.account-overview__vertical-chart\s*\{[^}]*box-sizing:\s*border-box[^}]*min-width:\s*0[^}]*padding:\s*\.75rem/s);
assert.match(css, /\.account-overview__plot\s*\{[^}]*min-width:\s*0/s);
assert.match(css, /\.account-overview__bar-item \.account-overview__bar-total\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s);
console.log("accountManagementOverviewRefinements tests passed");
