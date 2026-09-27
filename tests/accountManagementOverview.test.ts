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
assert.strictEqual(overview.exceptions.overdue, 1, "archived OPEN deals must not enter target actions");
assert.strictEqual(overview.exceptions.targetNotSet, 1);
assert.strictEqual(overview.targetDeals.length, 2);

const actual = overview.actualFor("FY27", "ALL", "");
assert.strictEqual(actual.kpis.newArr.amount, 120000);
assert.strictEqual(actual.kpis.newArr.enteredAcr, 30000);
assert.strictEqual(actual.kpis.wonDeals, 1);
assert.strictEqual(actual.quarters[0].newArr, 120000);

const target = overview.targetFor("PRIORITY", "", new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(target.deals.length, 2);
assert.strictEqual(target.pipeline.expansionArr.amount, 70000);
assert.strictEqual(target.pipeline.newArr.missing, 1);
assert.strictEqual(target.pipeline.newArr.enteredAcr, 8000);

const searched = overview.targetFor("PRIORITY", "beta", new Date("2026-09-27T00:00:00Z"));
assert.strictEqual(searched.deals.length, 2);

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
assert.match(pageSource, /item\.account\.name} \({item\.workload\.name}\)/, "open deals must lead with Account (Workload)");
assert.match(pageSource, /item\.deal\.name} \({item\.deal\.opportunityNo/, "open deals must show Opportunity (Opportunity ID) second");
assert.match(pageSource, /account-overview__bar-item/, "quarter bars must render numeric labels");
assert.match(pageSource, /account-overview__target-footer/, "open deal list must keep a footer outside the scrolling rows");
assert.match(appCss, /\.account-overview__target-scroll\s*\{[^}]*overflow:\s*auto/s, "open deal rows must scroll internally");
assert.match(appCss, /\.account-overview__hierarchy-scroll\s*\{[^}]*overflow:\s*auto/s, "account hierarchy must scroll internally");
assert.match(appCss, /\.account-overview__target-scroll\s*\{[^}]*height:\s*24rem/s, "open deal list must have a fixed desktop height");
assert.match(appCss, /\.account-overview__hierarchy-scroll\s*\{[^}]*height:\s*21rem/s, "hierarchy must have a fixed desktop height");
assert.match(appCss, /\.account-overview__latest-update\s*\{[^}]*text-overflow:\s*ellipsis/s, "latest update must stay on one line");
assert.doesNotMatch(appCss, /\.account-management-overview\s*\{[^}]*background:\s*#f7f8fa/s, "later cascade rules must not override the white overview background");
assert.doesNotMatch(appCss, /\.account-overview__metric-lines\s*\{[^}]*grid-template-columns:\s*repeat\(2/s, "ARR and ACR must remain vertically stacked on mobile");
console.log("accountManagementOverview tests passed");
