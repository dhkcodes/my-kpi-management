import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const content = read("src/components/content/index.tsx");
const pulse = read("src/components/content/AccountsWorkloadsPulseV2.tsx");
const accounts = read("src/components/content/AccountsWorkloadsPage.tsx");
const portfolio = read("src/components/content/MyCustomers360Page.tsx");
const weekly = read("src/components/content/WeeklyActivitiesPage.tsx");
const kpi = read("src/components/content/KpiSpreadsheetPage.tsx");
const calculations = read("src/data/kpiCalculations.ts");
const live = read("src/data/kpiLiveDashboard.ts");
const workspace = read("src/data/kpiWorkspaceDefinition.ts");
const styles = read("src/styles/app.css");
const all = [content, pulse, accounts, portfolio, weekly, kpi, calculations, live, workspace].join("\n");

for (const obsolete of [
  "FY27 portfolio pulse · proactive renewal and commit management",
  "Concept 01 · Executive Pulse V2",
  "KPI Overview summarizes quarterly achievement status across each KPI so progress and gaps are visible at a glance.",
  "Workshops and POCs are consolidated in one overview row with the combined target of 6 qualified activities.",
  "New Workload tracks how identified opportunities progress into validated pipeline and onboarded revenue against quarterly targets.",
  "FY27 account totals use the same saved Accounts & Workloads rows as Home and the detail grid.",
  "Manage FY27 accounts and workloads from Deal Status.",
  "Use fixed arrows, Shift + mouse wheel, or ← / → while the grid is focused.",
  "Review completed work and plan next-week actions in one weekly row.",
  "FY-scoped KPI activity workspace",
  "Live API connected",
  "Quarter status from reflected Delivery Date activity",
  "Use KPI Guide to understand each KPI target, required evidence, and how each activity is measured before updating details.",
  "C1 + C2 combined",
  "Workshops / POCs"
]) assert.ok(!all.includes(obsolete), `obsolete UAT copy returned: ${obsolete}`);

assert.match(pulse, /Start or End Date Needed/i);
assert.match(pulse, /Commit End Date/i);
assert.match(pulse, /aria-expanded=\{expandedUrgency === key\}/);
assert.match(pulse, /items\.map/);
assert.match(content, /statusToneClassName\(quarter\.status\)/,
  "New Workload uses semantic KPI status, not best-rate warning tone");
assert.match(content, /onNavigate\("accounts-workloads"\)[\s\S]*onAccountsWorkloadsQueryChange\(\{ \.\.\.accountsWorkloadsQuery, search: account, includeDeleted: false \}\)/,
  "Account navigation invalidates old requests before starting the automatic filter request");
assert.match(accounts, /accounts-workloads-table-meta/);
assert.doesNotMatch(accounts, /Loaded rows:/);
assert.match(kpi, /Data through/);
assert.match(all, /Show and discover workshops/);
assert.match(styles, /\.accounts-pulse-v2-workload-count/);
assert.match(styles, /\.my-customers-360-account-link/);

console.log("first-round UAT regression contract tests passed");