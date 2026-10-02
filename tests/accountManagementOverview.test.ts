import assert = require("assert");
import * as fs from "fs";
import * as path from "path";
import {
  buildAccountManagementOverview,
  fiscalPeriodForDate,
  quarterEndDate,
} from "../src/data/accountManagementOverview";
import { AccountsWorkloadsHierarchy } from "../src/data/accountsWorkloadsApi";

const hierarchy: AccountsWorkloadsHierarchy = {
  fiscalYear: null,
  accounts: [
    {
      id: 1, versionNo: 1, name: "Acme", archived: true,
      workloads: [{
        id: 11, versionNo: 1, name: "Analytics", salesRep: null, lastUpdated: null,
        notes: null, highlighted: false, archived: true, plans: [],
        deals: [
          { id: 111, workloadId: 11, versionNo: 1, name: "New won", opportunityNo: "D1", revenueType: "NEW", status: "WON", targetFiscalYear: "FY29", targetQuarter: 4, actualCloseDate: "2026-06-15", contractStartDate: null, contractEndDate: null, arrUsd: 120000, arrKrw: null, acrUsd: 30000, acrKrw: null, winProbability: null, latestUpdate: "Closed", notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
          { id: 112, workloadId: 11, versionNo: 1, name: "Missing close", opportunityNo: "D2", revenueType: "RENEWAL", status: "WON", targetFiscalYear: "FY27", targetQuarter: 2, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: null, arrKrw: null, acrUsd: 50000, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
          { id: 113, workloadId: 11, versionNo: 1, name: "Archived open", opportunityNo: "D3", revenueType: "EXPANSION", status: "OPEN", targetFiscalYear: "FY27", targetQuarter: 1, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: 90000, arrKrw: null, acrUsd: null, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
        ]
      }]
    },
    {
      id: 2, versionNo: 1, name: "Beta", archived: false,
      workloads: [{
        id: 22, versionNo: 1, name: "Database", salesRep: null, lastUpdated: null,
        notes: null, highlighted: false, archived: false, plans: [],
        deals: [
          { id: 221, workloadId: 22, versionNo: 1, name: "Open overdue", opportunityNo: "D4", revenueType: "EXPANSION", status: "OPEN", targetFiscalYear: "FY26", targetQuarter: 4, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: 70000, arrKrw: null, acrUsd: 10000, acrKrw: null, winProbability: null, latestUpdate: "Customer review", notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
          { id: 222, workloadId: 22, versionNo: 1, name: "Open unset", opportunityNo: null, revenueType: "NEW", status: "OPEN", targetFiscalYear: null, targetQuarter: null, actualCloseDate: null, contractStartDate: null, contractEndDate: null, arrUsd: null, arrKrw: null, acrUsd: 8000, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
          { id: 223, workloadId: 22, versionNo: 1, name: "Deleted won", opportunityNo: "D5", revenueType: "NEW", status: "WON", targetFiscalYear: "FY27", targetQuarter: 1, actualCloseDate: "2026-07-01", contractStartDate: null, contractEndDate: null, arrUsd: 999999, arrKrw: null, acrUsd: null, acrKrw: null, winProbability: null, latestUpdate: null, notes: null, deleted: true, deletedAt: "2026-07-02", sourceCommitmentId: null },
          { id: 224, workloadId: 22, versionNo: 1, name: "Active won", opportunityNo: "D6", revenueType: "NEW", status: "WON", targetFiscalYear: "FY27", targetQuarter: 1, actualCloseDate: "2026-07-03", contractStartDate: null, contractEndDate: null, arrUsd: 120000, arrKrw: null, acrUsd: 30000, acrKrw: null, winProbability: null, latestUpdate: "Closed", notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
          { id: 225, workloadId: 22, versionNo: 1, name: "Active lost", opportunityNo: "D7", revenueType: "NEW", status: "LOST", targetFiscalYear: "FY27", targetQuarter: 1, actualCloseDate: "2026-07-04", contractStartDate: null, contractEndDate: null, arrUsd: 880000, arrKrw: null, acrUsd: 440000, acrKrw: null, winProbability: null, latestUpdate: "Lost", notes: null, deleted: false, deletedAt: null, sourceCommitmentId: null },
        ]
      }]
    }
  ]
};

assert.deepStrictEqual(fiscalPeriodForDate("2026-06-15"), { fiscalYear: "FY27", quarter: 1 });
assert.deepStrictEqual(fiscalPeriodForDate("2027-05-31"), { fiscalYear: "FY27", quarter: 4 });
assert.strictEqual(quarterEndDate("FY27", 1), "2026-08-31");
assert.strictEqual(quarterEndDate("FY27", 4), "2027-05-31");

const overview = buildAccountManagementOverview(hierarchy, new Date("2026-09-27T00:00:00Z"));
assert.deepStrictEqual(overview.fiscalYears, ["FY27"]);
assert.strictEqual(overview.actualDeals.length, 1, "Draft Deleted parents must be excluded from actuals and aggregates");
assert.strictEqual(overview.actualDeals[0].deal.id, 224);
assert.strictEqual(overview.exceptions.closeDateMissing, 0, "Draft Deleted missing-close records must not enter exceptions");
assert.deepStrictEqual(overview.closeDateMissingFor("").map((item) => item.deal.id), [],
  "the clickable exception result must share the same active-only scope as its count");
assert.strictEqual(overview.exceptions.overdue, 1, "archived OPEN deals must not enter target actions");
assert.strictEqual(overview.exceptions.targetNotSet, 1);
assert.strictEqual(overview.targetDeals.length, 2);

const archivedWorkloadOnActiveAccount = buildAccountManagementOverview({
  fiscalYear: null,
  accounts: [{
    ...hierarchy.accounts[1],
    workloads: [{ ...hierarchy.accounts[1].workloads[0], archived: true }]
  }]
}, new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(archivedWorkloadOnActiveAccount.actualDeals.length, 0,
  "active Accounts must not expose Opportunities below archived Workloads");
assert.strictEqual(archivedWorkloadOnActiveAccount.targetDeals.length, 0);
assert.strictEqual(archivedWorkloadOnActiveAccount.actualFor("FY27", "ALL", "").kpis.newArr.amount, 0);
assert.strictEqual(archivedWorkloadOnActiveAccount.actualFor("FY27", "ALL", "").quarters[0].newArr, 0);

const actual = overview.actualFor("FY27", "ALL", "");
assert.strictEqual(actual.kpis.newArr.amount, 120000);
assert.strictEqual(actual.kpis.newArr.enteredAcr, 30000);
assert.strictEqual(actual.kpis.wonDeals, 1);
assert.strictEqual(actual.quarters[0].newArr, 120000);

const activeAccount = hierarchy.accounts[1];
const activeWorkload = activeAccount.workloads[0];
const activeWon = activeWorkload.deals.find((deal) => deal.id === 224)!;
const activeMissingClose = buildAccountManagementOverview({
  fiscalYear: null,
  accounts: [{
    ...activeAccount,
    workloads: [{ ...activeWorkload, deals: [{ ...activeWon, id: 226, actualCloseDate: null }] }],
  }],
}, new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(activeMissingClose.exceptions.closeDateMissing, 1);
assert.deepStrictEqual(activeMissingClose.closeDateMissingFor("").map((item) => item.deal.id), [226],
  "clickable Close date missing rows must exactly match the displayed count");
assert.strictEqual(activeMissingClose.actualFor("FY27", "ALL", "").deals.length, 0,
  "missing-close rows must stay excluded from dated Actual KPI totals");
const overviewAfterStatus = (status: "OPEN" | "WON" | "LOST") => buildAccountManagementOverview({
  fiscalYear: null,
  accounts: [{
    ...activeAccount,
    workloads: [{ ...activeWorkload, deals: [{ ...activeWon, status }] }],
  }],
}, new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(overviewAfterStatus("WON").actualFor("FY27", "ALL", "").kpis.newArr.amount, 120000,
  "OPEN to WON must add the Opportunity amount to Overview actuals");
assert.strictEqual(overviewAfterStatus("OPEN").actualFor("FY27", "ALL", "").kpis.newArr.amount, 0,
  "WON to OPEN must remove the Opportunity amount from Overview actuals");
assert.strictEqual(overviewAfterStatus("LOST").actualFor("FY27", "ALL", "").kpis.newArr.amount, 0,
  "WON to LOST must remove the Opportunity amount from Overview actuals");

const target = overview.targetFor("PRIORITY", "", new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(target.deals.length, 2);
assert.strictEqual(target.pipeline.expansionArr.amount, 70000);
assert.strictEqual(target.pipeline.newArr.missing, 1);
assert.strictEqual(target.pipeline.newArr.enteredAcr, 8000);
assert.strictEqual(target.pipeline.acr.amount, 18000,
  "Target Actions ACR must include OPEN New, Expansion, and Renewal opportunities");

const searched = overview.targetFor("PRIORITY", "beta", new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(searched.deals.length, 2);

const collisionHierarchy: AccountsWorkloadsHierarchy = {
  ...hierarchy,
  accounts: [...hierarchy.accounts, {
    ...hierarchy.accounts[1],
    id: 3,
    name: "Gamma",
    workloads: [{
      ...hierarchy.accounts[1].workloads[0],
      id: 33,
      name: "Beta",
      deals: hierarchy.accounts[1].workloads[0].deals.map((deal) => ({
        ...deal,
        id: deal.id + 1000,
        workloadId: 33,
      })),
    }],
  }],
};
const collisionOverview = buildAccountManagementOverview(collisionHierarchy, new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(collisionOverview.targetFor("PRIORITY", "beta", new Date("2026-09-27T00:00:00Z")).deals.length, 4,
  "free-text search may intentionally match account and workload fields");
assert.strictEqual(collisionOverview.targetFor("PRIORITY", "", new Date("2026-09-27T00:00:00Z"), "", { accountId: 2, accountName: "wrong fallback" }).deals.length, 2,
  "selected-account filtering must prefer the stable account ID and exclude free-text collisions");
assert.strictEqual(collisionOverview.targetFor("PRIORITY", "", new Date("2026-09-27T00:00:00Z"), "", { accountName: "  beta  " }).deals.length, 2,
  "selected-account filtering must fall back to an exact normalized account name");

const pageSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/content/AccountManagementOverviewPage.tsx"),
  "utf8"
);
const appCss = fs.readFileSync(path.resolve(process.cwd(), "src/styles/app.css"), "utf8");
assert.match(pageSource, /role="combobox"/, "account search must use the Consumption Analysis combobox pattern");
assert.match(pageSource, /includeArchived: false/, "overview must not request Draft Deleted Account & Workload rows");
assert.match(pageSource, /role="tooltip"/, "latest updates must expose their full text through a custom immediate tooltip");
assert.match(pageSource, /onMouseEnter=.*showLatestUpdate/, "latest update tooltip must open immediately on mouse enter");
assert.match(pageSource, /Revenue measure/, "quarter controls must expose the All\/ARR\/ACR measure selector");
assert.match(pageSource, /actualMeasure === "ALL" \? \(\["ARR", "ACR"\] as const\)/, "All must keep ARR and ACR as separate measure bars");
assert.match(pageSource, /account-overview__bar-stack/, "each ARR or ACR bar must stack New, Expansion and Renewal");
assert.match(pageSource, /\[null, \.\.\.revenueKinds\]/, "actual KPI cards must include Total plus the three revenue types");
assert.match(pageSource, /item\.account\.name} \({item\.workload\.name}\)/, "open Opportunities must lead with Account (Workload)");
assert.match(pageSource, /item\.deal\.name} \({item\.deal\.opportunityNo/, "open Opportunities must show Opportunity (Opportunity ID) second");
assert.match(pageSource, /account-overview__bar-total/, "quarter bars must render bold total labels");
assert.doesNotMatch(pageSource, /account-overview__bar-values/, "quarter bars must not repeat N, E and R values below the graph");
assert.match(pageSource, /account-overview__target-footer/, "open Opportunity list must keep a footer outside the scrolling rows");
assert.match(pageSource, /account-overview__type-badge/, "Opportunity types must render as distinct badges");
assert.match(pageSource, /<span>ACR<\/span>/, "Target Actions must label the all-type ACR card as ACR");
assert.doesNotMatch(pageSource, /RENEWAL ACR PIPELINE/, "the obsolete renewal-only ACR card label must be removed");
assert.match(appCss, /\.account-overview__target-scroll\s*\{[^}]*overflow:\s*auto/s, "open deal rows must scroll internally");
assert.match(appCss, /\.account-overview__hierarchy-scroll\s*\{[^}]*overflow:\s*auto/s, "account hierarchy must scroll internally");
assert.match(appCss, /\.account-overview__target-scroll\s*\{[^}]*height:\s*24rem/s, "open deal list must have a fixed desktop height");
assert.match(appCss, /\.account-overview__actual-details > \.account-overview__panel\s*\{[^}]*height:\s*24rem/s, "quarter chart and hierarchy panels must use the compact shared height");
assert.match(appCss, /\.account-overview__hierarchy-scroll\s*\{[^}]*flex:\s*1 1 auto/s, "hierarchy rows must fit the shared panel height and scroll internally");
assert.match(appCss, /\.account-overview__latest-update\s*\{[^}]*text-overflow:\s*ellipsis/s, "latest update must stay on one line");
assert.doesNotMatch(appCss, /\.account-management-overview\s*\{[^}]*background:\s*#f7f8fa/s, "later cascade rules must not override the white overview background");
assert.doesNotMatch(appCss, /\.account-overview__metric-lines\s*\{[^}]*grid-template-columns:\s*repeat\(2/s, "ARR and ACR must remain vertically stacked on mobile");
assert.match(pageSource, /overviewSearchRef/, "overview must track the account combobox for outside-click dismissal");
assert.match(pageSource, /addEventListener\("pointerdown"/, "overview account results must close on outside pointer interaction");
assert.match(pageSource, /selectedAccount \|\| "All Accounts"/, "overview input must display All Accounts by default");
assert.match(pageSource, /actualFor\(actualFy, actualQuarter, "", selectedAccountFilter\)[\s\S]*targetFor\(targetView, "", new Date\(\), targetPeriod, selectedAccountFilter\)/,
  "selected account must use its exact filter independently from free-text search");
assert.match(pageSource, /accountId: selectedAccountId \?\? undefined/,
  "selected account must prefer its stable ID when one is available");
assert.doesNotMatch(pageSource, /`Workload:|· Plan:/, "overview account results must omit Workload and Plan prefixes");
assert.match(pageSource, /workload\.name} · \$\{workload\.plans/, "overview account results must retain workload names, plan numbers and separators");
assert.match(pageSource, /<span>NEW<small>ARR<\/small><\/span><span>EXPANSION<small>ARR<\/small><\/span><span>RENEWAL<small>ARR<\/small><\/span><span>ACR<\/span>/,
  "hierarchy columns must be NEW, EXPANSION, RENEWAL, and ACR with ARR subtitles");
assert.doesNotMatch(pageSource, /<span>WON<\/span>/, "ACR must be the final hierarchy column");
assert.match(pageSource, /const sumArrByKind =/, "hierarchy revenue-type columns must aggregate ARR for every type");
assert.match(pageSource, /sumArrByKind\(accountDeals, "RENEWAL"\)/,
  "account rows must expose Renewal ARR separately from ACR");
assert.match(pageSource, /revenueType\.toUpperCase\(\) === "RENEWAL"[\s\S]*arrUsd/,
  "Opportunity rows must render ARR in the Renewal column");
assert.match(pageSource, /const sumAcr =/, "hierarchy ACR must aggregate every revenue type");
assert.doesNotMatch(pageSource, /`ACR \$\{fmtUsd/, "deal rows must keep the ACR label in the header rather than the amount cell");
assert.match(appCss, /\.account-overview__bar-columns \.is-new,[\s\S]*background:\s*#7fb4df/, "New bars must use a pastel blue");
assert.match(appCss, /\.account-overview__bar-columns \.is-expansion,[\s\S]*background:\s*#82c7bd/, "Expansion bars must use a pastel teal");
assert.match(appCss, /\.account-overview__bar-columns \.is-renewal,[\s\S]*background:\s*#b7a6dc/, "Renewal bars must use a pastel violet");
assert.match(appCss, /\.account-overview__legend \.is-new \{ color: #7fb4df; \}/, "NEW legend text must match the bar color");
assert.match(appCss, /\.account-overview__legend \.is-expansion \{ color: #82c7bd; \}/, "EXPANSION legend text must match the bar color");
assert.match(appCss, /\.account-overview__legend \.is-renewal \{ color: #b7a6dc; \}/, "RENEWAL legend text must match the bar color");
assert.match(appCss, /\.account-overview__tree-row\.is-workload\s*>\s*span:first-child/, "workload indentation must be limited to the name cell");
assert.match(appCss, /\.account-overview__deal-row\s*>\s*span:first-child/, "deal indentation must be limited to the name cell");
assert.match(pageSource, /<b>\{overview\.exceptions\.overdue\}<\/b> Overdue<\/strong>/, "exception label casing must be exact");
assert.match(pageSource, /<b>\{overview\.exceptions\.targetNotSet\}<\/b> Target not set<\/strong>/, "exception label casing must be exact");
assert.match(pageSource, /<b>\{overview\.exceptions\.closeDateMissing\}<\/b> Close date missing<\/strong>/, "exception label casing must be exact");
assert.match(pageSource, /overview\?\.closeDateMissingFor/, "Close date missing click must use the same scoped result set as its count");
assert.match(pageSource, /actualOpportunityList/, "Close date missing click must target the filtered Opportunity list");
assert.match(pageSource, /Close date missing Opportunities/, "the filtered list must clearly identify the active exception filter");
assert.match(appCss, /\.account-overview__exceptions strong\s*\{[^}]*white-space:\s*nowrap/s, "exception labels must remain on one line");
assert.match(appCss, /\.account-overview__exceptions strong b\s*\{[^}]*font-size:\s*clamp\(1\.3rem/s, "exception counts must remain larger than their labels");
assert.doesNotMatch(pageSource, /WON deals|Open Deal action list|Account → Workload → Deal|No OPEN deals|open deals/, "visible Overview terminology must use Opportunity instead of Deal");
console.log("accountManagementOverview tests passed");
