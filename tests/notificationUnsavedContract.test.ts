import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const banner = read("src/components/content/AppMessageBanner.tsx");
assert.match(banner, /app-message-region/);
assert.match(banner, /severity === "error"/);
assert.match(banner, /persistence === "sticky"/);
assert.match(banner, /window\.setTimeout/);
assert.match(banner, /ono[jJ]Close/);

const accounts = read("src/components/content/AccountsWorkloadsPage.tsx");
assert.match(accounts, /onNavigationGuardChange/);
assert.match(accounts, /Save changes before moving to/);
assert.match(accounts, /Save and Continue/);
assert.match(accounts, /Discard and Continue/);
assert.match(accounts, /Stay/);
assert.match(accounts, /Save changes\?/);
assert.match(accounts, /Discard changes\?/);
assert.match(accounts, /AppMessageBanner/);
assert.match(read("src\/components\/app.tsx"), /beforeunload/);

const consumption = read("src/components/content/ConsumptionMessageBanner.tsx");
assert.match(consumption, /AppMessageBanner/);

const weekly = read("src/components/content/WeeklyActivitiesPage.tsx");
assert.match(weekly, /AppMessageBanner/);

const kpi = read("src/components/content/KpiSpreadsheetPage.tsx");
assert.match(kpi, /AppMessageBanner/);

const css = read("src/styles/app.css");
assert.match(css, /\.app-message-region/);
assert.match(css, /top:/);
assert.match(css, /right:/);
assert.match(css, /@media[^]*max-width/);

console.log("notification and Accounts & Workloads unsaved-change contracts passed");
