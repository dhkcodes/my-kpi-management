import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const page = read("src/components/content/AccountsWorkloadsPage.tsx");
const content = read("src/components/content/index.tsx");
const app = read("src/components/app.tsx");
const styles = read("src/styles/app.css");
const indexHtml = read("src/index.html");
const header = read("src/components/header.tsx");
const packageJson = read("package.json");

assert.match(indexHtml, /<title>My KPI &amp; Account Planner<\/title>/, "browser title uses the finalized product name");
assert.match(app, /appName = "My KPI & Account Planner"/, "app header uses the finalized product name");
assert.match(header, /aria-label=\{appName\}/, "header brand landmark uses the product name");
assert.match(packageJson, /"description": "My KPI & Account Planner — Goals, Accounts and Next Actions"/);

assert.match(page, /fetchAccountsWorkloadsHierarchy/, "page loads the FY-independent hierarchy endpoint");
assert.match(page, /saveAccountsWorkloadsHierarchy/, "page uses one atomic hierarchy save");
assert.match(page, /fetchForecastCandidates/, "page loads forecast candidates");
assert.match(page, /Add Account/);
assert.match(page, /Add Workload/);
assert.match(page, /Add Deal/);
assert.match(page, /accounts-hierarchy__plans/, "Account → Workload → Plan → Deal hierarchy is visible");
assert.match(page, /arrUsd/);
assert.match(page, /arrKrw/);
assert.match(page, /acrUsd/);
assert.match(page, /acrKrw/);
assert.match(page, /targetFiscalYear/);
assert.match(page, /contractStartDate/);
assert.match(page, /contractEndDate/);
assert.match(page, /latestUpdate/);
assert.match(page, /setSaveErrors\(saveError instanceof AccountsWorkloadsApiError \? saveError\.errors/,
  "structured validation details are presented on failed batch saves");
assert.match(page, /Keep the complete draft and queued operations/, "failed saves retain all drafts");
assert.doesNotMatch(page, /Clone Previous FY|clone-preview/, "management UI has no fiscal-year clone workflow");
assert.doesNotMatch(page, /fiscalYear=|Fiscal Year selector/, "management UI has no FY selector or query");
assert.match(content, /accountsWorkloads[\s\S]{0,120}accountManagementOverview[\s\S]{0,120}kpi-fiscal-year-panel/,
  "the Accounts/Workloads route omits the global FY selector");

assert.match(page, /<oj-button[\s\S]{0,180}Add Account/, "primary action uses Oracle JET");
assert.match(page, /<oj-progress-circle/, "loading state uses Oracle JET");
assert.doesNotMatch(styles, /\.oj-dialog|\.oj-dialog-content|\.oj-dialog-body/,
  "application styles do not override JET internal DOM");
assert.match(styles, /\.accounts-hierarchy__plans/);
assert.match(styles, /@media \(min-width: 1025px\)[\s\S]*?\.kpi-side-nav[\s\S]*?width: 16\.5rem/);
assert.match(app, /getNavigationRouteFromPath\(window\.location\.pathname\)/);
assert.match(app, /window\.history\.pushState[\s\S]*getNavigationPath\(route\)/);
assert.match(app, /addEventListener\("popstate"/);

console.log("accountsWorkloadsUiContract tests passed");
