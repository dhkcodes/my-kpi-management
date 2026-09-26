import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const content = read("src/components/content/index.tsx");
const kpi = read("src/components/content/KpiSpreadsheetPage.tsx");
const weekly = read("src/components/content/WeeklyActivitiesPage.tsx");
const accounts = read("src/components/content/AccountsWorkloadsPage.tsx");
const attainment = read("src/components/content/AttainmentPage.tsx");
const records = read("src/components/content/ConsumptionRecordsPage.tsx");
const homeConsumption = read("src/components/content/HomeConsumptionOverview.tsx");

assert.match(content, /const canWrite = canWriteRoute\(profile, activeRoute\)/,
  "the active route permission is resolved once and passed to content pages");
assert.match(content, /Read-only access\.[\s\S]*Write permission is required/,
  "read-only users receive a visible permission explanation");
assert.match(content, /\["kpiPage", "weeklyActivities", "consumptionAttainment"\]\.includes\(activeRoute\.module\)/,
  "read-only banner is omitted on Accounts & Workloads and Consumption Records");
assert.match(content, /<KpiSpreadsheetPage[\s\S]{0,180}canWrite=\{canWrite\}/);
assert.match(content, /<AccountsWorkloadsPage[\s\S]{0,180}canWrite=\{canWrite\}/);
assert.match(content, /<WeeklyActivitiesPage[^>]*canWrite=\{canWrite\}/);
assert.match(content, /<AttainmentPage[^>]*canWrite=\{canWrite\}/);
assert.match(content, /<ConsumptionRecordsPage[\s\S]{0,160}canWrite=\{canWrite\}/);
assert.match(content, /canReadHomeAccounts[\s\S]*accounts-workloads[\s\S]*canReadHomeAccounts && <AccountsWorkloadsPulseV2/,
  "home Accounts & Workloads is visible when that shared-data menu is readable");
assert.match(content, /canReadHomeKpis[\s\S]*kpis-overview[\s\S]*canReadHomeKpis && \(kpiDatasetLoading[\s\S]*canReadHomeKpis && kpiDataset && <section id="pipeline"/,
  "home KPI Overview and New Workload are gated by KPI read access");
assert.match(content, /canReadHomeConsumption = canAccessRoute\(profile, getNavigationRoute\("analysis"\)\)/,
  "home Consumption Overview follows Analysis read access without requiring Records access");
assert.match(content, /canReadHomeConsumptionRecords = canAccessRoute\(profile, getNavigationRoute\("records"\)\)[\s\S]*canReadRecords=\{canReadHomeConsumptionRecords\}/,
  "home Consumption Overview passes Records access separately instead of widening either menu permission");
assert.match(homeConsumption, /canReadRecords \? fetchConsumptionRecords[\s\S]*: Promise\.resolve\(null\)/,
  "home Consumption Overview never calls the Records API without Records read access");
assert.match(homeConsumption, /records\?\.totals \?\? emptyRecordsTotals/,
  "Analysis readers still receive Analysis-backed home consumption data without Records access");
assert.match(content, /const canEditKpiGuide = profile\.access === "Admin"/,
  "KPI Guide edit capability is restricted to Admin sessions");
assert.match(content, /saveGuideEdit[\s\S]{0,180}if \(!canEditKpiGuide\)[\s\S]{0,180}unsaved KPI Guide changes were kept/,
  "KPI Guide blocks late saves without discarding a draft");
assert.match(content, /\) : canEditKpiGuide \? \(/,
  "KPI Guide renders the edit action only for Admin sessions");
assert.match(content, /id="kpiGuideEditButton"/,
  "KPI Guide retains the Admin edit action");

for (const [name, source] of [["KPI", kpi], ["Weekly", weekly], ["Accounts", accounts], ["Attainment", attainment], ["Records", records]] as const) {
  assert.match(source, /canWrite: boolean/, `${name} accepts explicit write capability`);
  assert.match(source, /Write permission is required/, `${name} guards mutation handlers and explains denial`);
}
assert.match(kpi, /const beginEditing[\s\S]{0,180}if \(!canWrite\)/,
  "KPI double-click and keyboard editing are blocked");
assert.match(weekly, /editable=\{canWrite\}/,
  "Weekly double-click editing is removed for read-only users");
assert.match(weekly, /canWrite \? <>[\s\S]*aria-label=\{`Edit[\s\S]*aria-label=\{`Delete/,
  "Weekly row mutation icons are hidden without write permission");
assert.match(accounts, /disabled=\{!canWrite \|\| saving\}[\s\S]{0,180}onClick=\{\(\) => openActionConfirmation\("save"\)\}/,
  "Accounts save is disabled for read-only users and routes through confirmation");
assert.match(accounts, /!canWrite && <div[^>]*>Read-only access\. Write permission is required/,
  "read-only Accounts users receive a visible permission explanation");
assert.match(records, /disabled=\{!canWrite \|\| hasDraftChanges[\s\S]*handleCsvFiles/,
  "actual import file input is disabled without write permission");
assert.match(records, /applyPendingImport[\s\S]{0,180}if \(!canWrite\)/,
  "import Apply rechecks permission at the handler boundary");
assert.match(records, /saveForecasts[\s\S]{0,180}if \(!canWrite\)[\s\S]{0,180}forecast changes were kept/,
  "permission removal blocks saving while preserving forecast drafts");
assert.match(records, /Forecast Export/);
assert.match(records, /Actual Export/);

console.log("writePermissionsUiContract tests passed");
