import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const page = read("src/components/content/AccountsWorkloadsPage.tsx");
const api = read("src/data/accountsWorkloadsApi.ts");
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
assert.match(page, /Add Account & Workload/);
assert.match(page, /Add Oppty/);
assert.match(page, /accounts-workloads-grid/, "the restored wide editable AW table is used");
assert.match(page, /accounts-workloads-child-row/, "each AW row owns an expandable child row");
assert.match(page, /toggleWorkloadExpanded/, "AW rows can expand and collapse their opportunities");
assert.match(page, /stopPropagation/, "editing controls do not toggle the parent row");
assert.match(page, /Plan Number/);
assert.match(page, /Last Updated/);
assert.match(page, /Notes/);
assert.match(page, /<th>Account<\/th><th>Workload<\/th><th>Plan Number<\/th>/,
  "AW columns keep Account, Workload, then Plan Number order");
assert.match(page, /Oppty Name/);
assert.match(page, /Oppty No\./);
assert.match(page, /Target Quarter/);
assert.match(page, /ARR \(\$\)/);
assert.match(page, /ARR \(₩\)/);
assert.match(page, /ACR \(\$\)/);
assert.match(page, /ACR \(₩\)/);
assert.match(page, /arrUsd/);
assert.match(page, /arrKrw/);
assert.match(page, /acrUsd/);
assert.match(page, /acrKrw/);
assert.match(page, /targetFiscalYear/);
assert.match(page, /contractStartDate/);
assert.match(page, /contractEndDate/);
assert.match(page, /<th>Latest Update<\/th>/, "Latest Update is an opportunity column");
assert.match(page, /aria-label="Latest Update"[\s\S]{0,200}updateDeal\(deal\.id, "latestUpdate"/,
  "opportunity Latest Update uses the same draft input pattern as AW Last Updated");
assert.doesNotMatch(page, />Notes<input[\s\S]{0,160}updateDeal/, "Notes is not an opportunity field");
assert.doesNotMatch(page, /accounts-hierarchy__account|accounts-hierarchy__deal/, "card/form hierarchy is not rendered");
assert.match(page, /filterForecastCandidates/, "Consumption Records candidates are filtered against saved rows and current drafts");
assert.match(page, /selectedCandidateKeys/, "Consumption Records candidates support checkbox multi-selection");
assert.match(page, /미정의 — 수정 필요/, "inserted candidates use the exact required workload placeholder");
assert.match(page, /sourcePlanNumber: candidate\.planNumber/, "candidate insertion preserves the original plan number");
assert.match(page, /latestUpdate: deal\.latestUpdate/, "hidden opportunity latest-update data is preserved on save");
assert.match(page, /notes: deal\.notes/, "hidden opportunity notes are preserved on save");
assert.match(page, /accounts-workloads-draft-badge/,
  "AW and opportunity edits expose their unsaved Draft state");
assert.match(page, /accounts-workloads-parent-row is-draft|is-draft"/,
  "edited AW rows are marked as Draft before explicit save");
assert.match(page, /dirtyDeals\.has\(deal\.id\)/,
  "edited opportunities stay Draft until the explicit hierarchy save");
assert.match(page, /accounts: \[\{[\s\S]{0,120}\.\.\.current\.accounts\]/,
  "a newly added AW input row is inserted at the top of the table");
assert.match(page, /deals: \[emptyDeal\(id, workloadId\), \.\.\.workload\.deals\]/,
  "a newly added opportunity input row is inserted at the top of its expanded table");
const updateWorkloadBlock = page.slice(page.indexOf("const updateWorkload"), page.indexOf("const updateDeal"));
const updateDealBlock = page.slice(page.indexOf("const updateDeal"), page.indexOf("const updateDealTarget"));
assert.match(updateWorkloadBlock, /setDirtyWorkloads/,
  "editing an AW field changes only the local hierarchy and marks that AW Draft");
assert.doesNotMatch(updateWorkloadBlock, /saveAccountsWorkloadsHierarchy/,
  "AW cell editing does not auto-save");
assert.match(updateDealBlock, /setDirtyDeals/,
  "editing an opportunity changes only the local hierarchy and marks that opportunity Draft");
assert.doesNotMatch(updateDealBlock, /saveAccountsWorkloadsHierarchy/,
  "opportunity cell editing does not auto-save");
const explicitSave = page.indexOf("await saveAccountsWorkloadsHierarchy(request)");
const clearWorkloadDraft = page.indexOf("setDirtyWorkloads(new Set())", explicitSave);
const clearDealDraft = page.indexOf("setDirtyDeals(new Set())", explicitSave);
assert.ok(explicitSave > 0 && clearWorkloadDraft > explicitSave && clearDealDraft > explicitSave,
  "AW and opportunity Draft state clears only after the explicit save returns the stored hierarchy");
assert.match(page, /Consumption Records/);
assert.match(page, /Plan ID\(Number\)/);
assert.match(page, /candidate\.planNumber \?\? "없음"/, "candidate dialog renders 없음 for a missing plan number");
assert.match(api, /candidate\.planId !== null[^]*plan-id:[^]*account:/,
  "candidate identity uses Plan ID first and normalized Account only when Plan ID is absent");
assert.doesNotMatch(page, /candidateWorkload|Workload \(required\)|Forecast에서 추가|Forecast candidates/,
  "the former per-candidate Forecast workload flow is removed");
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
