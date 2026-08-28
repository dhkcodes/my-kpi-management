import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recordsPage = readFileSync("src/components/content/ConsumptionPage.tsx", "utf8");
const insightsPage = readFileSync("src/components/content/UsageInsightsPage.tsx", "utf8");
const apiSource = readFileSync("src/data/consumptionApi.ts", "utf8");
const content = readFileSync("src/components/content/index.tsx", "utf8");
const navigation = readFileSync("src/data/kpiMockData.ts", "utf8");
const routes = readFileSync("src/components/navigationRoutes.ts", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

// Navigation and route ownership.
assert.match(navigation, /export const consumptionNavItems[\s\S]*id: "usage-insights"[\s\S]*label: "Usage Insights"[\s\S]*id: "usage-records"[\s\S]*label: "Usage Records"/, "approved Consumption leaf names exist");
assert.match(navigation, /id: "consumption"[\s\S]*children: consumptionNavItems/, "Consumption is the parent of the approved leaves");
assert.match(routes, /id: "usage-insights"[\s\S]*module: "consumptionInsights"[\s\S]*id: "usage-records"[\s\S]*module: "consumptionRecords"/, "Consumption leaves have independent route modules");
assert.match(routes, /normalized === "consumption"[\s\S]*usage-insights/, "/consumption remains a compatibility alias to Usage Insights");
assert.match(content, /activeRoute\.module === "consumptionInsights"[\s\S]*<UsageInsightsPage[\s\S]*fiscalYear=\{fiscalYear\}/, "Usage Insights receives the selected fiscal year");
assert.match(content, /activeRoute\.module === "consumptionRecords"[\s\S]*<ConsumptionPage[\s\S]*fiscalYear=\{fiscalYear\}/, "Usage Records renders the preserved editable workspace");
assert.match(content, /!\['profile', 'users', 'consumptionRecords'\]\.includes\(activeRoute\.module\)/, "global FY is visible for Usage Insights and hidden for Usage Records");

// Usage Insights: one FY/account server context, ACTUAL-only six-month trend and Account→Plan drilldown.
assert.match(insightsPage, /fetchConsumptionAnalysis\(\{ fiscalYear, search:[^,]+, account:[^}]+\}\)/, "Usage Insights loads one server-owned FY/account analysis context");
assert.match(insightsPage, /analysisResponse\.fiscalYear === fiscalYear[\s\S]*analysisResponse\.selectedAccount === \(selectedAccountContext \|\| null\)/, "Analysis renders only when the response FY and Account match the requested context");
assert.doesNotMatch(insightsPage, /const generation = \+\+requestGeneration\.current;\s*setAnalysis\(null\)/, "candidate refresh keeps the combobox shell mounted and focused");
assert.match(insightsPage, /role="combobox"[\s\S]*aria-autocomplete="list"[\s\S]*All Accounts Total[\s\S]*accountCandidates/, "the only analysis filter after FY is a searchable Account combobox whose first option is the portfolio total");
assert.match(insightsPage, /onCompositionStart[\s\S]*onCompositionEnd/, "the Account combobox waits for Korean IME composition completion");
assert.match(insightsPage, /ArrowDown[\s\S]*ArrowUp[\s\S]*Enter[\s\S]*Escape/, "the Account combobox supports keyboard navigation and selection");
assert.match(insightsPage, /Clear account[\s\S]*selectAccountContext\(""\)/, "the Account combobox can clear back to All Accounts Total");
assert.match(insightsPage, /FY & Quarter totals[\s\S]*Q1[\s\S]*Q2[\s\S]*Q3[\s\S]*Q4/, "FY and all four Quarter stacked totals share one section");
assert.match(insightsPage, /Quarter-over-quarter[\s\S]*qoqChangePercent/, "QoQ values render as decision cards");
assert.match(insightsPage, /Consumption Change Alerts & linked Plan Trend[\s\S]*getAlertActualTrend[\s\S]*actualTrend/, "Alert and six-month ACTUAL Plan Trend are one combined decision section");
assert.match(insightsPage, /slice\(-4\)[\s\S]*is-emphasized/, "the latest four points in the six-month ACTUAL trend are emphasized");
assert.match(insightsPage, /const trendChart = useMemo\(\(\) => chart\(trendPoints\.map\([\s\S]*value: point\.actualAmount/, "the trend DataProvider retains all six month groups");
assert.match(insightsPage, /value=\{data\.value \?\? undefined\}/, "missing ACTUAL is passed to JET as an explicit gap rather than removing the month group");
assert.doesNotMatch(insightsPage, /forecastTrend|Service Composition/, "Insights neither invents a Forecast trend nor Service Composition");
assert.match(insightsPage, /Account Contribution[\s\S]*Plan Contribution[\s\S]*consumption-insights-contribution-grid/, "Account and Plan contribution render as an approved two-column drilldown");
assert.match(insightsPage, /accounts\.slice\(0, 5\)[\s\S]*accounts\.slice\(5\)[\s\S]*>Other</, "Account contribution renders Top 5 plus an actual excluded-account Other sum");
assert.match(insightsPage, /workloads\.flatMap[\s\S]*consumption-insights-plan-list/, "selected Account plans are flattened into the direct Plan contribution column with Workload metadata");
assert.match(insightsPage, /ojs\/ojchart[\s\S]*ArrayDataProvider[\s\S]*consumption-insights-totals-chart[\s\S]*consumption-insights-actual-chart/, "approved Insights visualizations use Oracle JET chart DataProviders");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}/, "selected Alert drives an ACTUAL-only JET line chart");
assert.match(apiSource, /URLSearchParams\(\{ fiscalYear: query\.fiscalYear, search: query\.search, account: query\.account \}\)/, "Analysis client sends the FY, candidate search, and selected Account query");
assert.match(apiSource, /accountCandidates[\s\S]*workloads[\s\S]*planIds/, "Analysis candidate data has a strict searchable Account\/Workload\/Plan ID contract");

// Usage Records remains the mutable Data workspace and excludes analysis duplication.
assert.match(recordsPage, /<h1 id="consumptionTitle">Usage Records<\/h1>/, "data-management leaf uses the approved name");
assert.doesNotMatch(recordsPage, /consumption-summary-cards|Consumption Change Alerts & Trend|id="consumptionSignalInbox"/, "Usage Records does not duplicate the Insights charts");
assert.match(recordsPage, /accept="\.csv,text\/csv"/, "CSV file input remains available");
assert.match(recordsPage, /previewConsumptionImport[\s\S]*applyConsumptionImport/, "CSV preview and atomic import remain wired");
assert.match(recordsPage, /saveConsumptionForecasts[\s\S]*ConsumptionConflictError[\s\S]*Saved baseline[\s\S]*My draft[\s\S]*Current server/, "Forecast Save and HTTP 409 comparison remain intact");
assert.match(recordsPage, /onDblClick[\s\S]*beginForecastEdit/, "double click enters Forecast cell editing");
assert.match(recordsPage, /event\.key === "Enter"[\s\S]*commitForecastEdit/, "Enter commits the cell draft");
assert.match(recordsPage, /event\.key === "Escape"[\s\S]*cancelForecastEdit/, "Escape restores the cell edit entry value");
assert.match(recordsPage, /hasDraftChanges[\s\S]*isSaving \? "Saving…" : "Save"[\s\S]*>Cancel</, "Save and Cancel remain draft-scoped");
assert.match(recordsPage, /onNavigationGuardChange[\s\S]*window\.confirm\(/, "unsaved Forecast changes retain route protection");
assert.match(recordsPage, /id="consumptionFromQuarter"[\s\S]*id="consumptionToQuarter"[\s\S]*isConsumptionQuarterRangeValid[\s\S]*Apply/, "Data keeps its independent Quarter range");
assert.match(recordsPage, /applyQuarterRange[\s\S]*loadRecordsPage\(false, \{ fromQuarter, toQuarter \}\)/, "quarter changes replace only the Records data region");
assert.match(recordsPage, /fetchConsumptionRecords[\s\S]*recordsRequestGeneration[\s\S]*window\.setTimeout[\s\S]*300/, "search is debounced and guarded against stale server responses");
assert.match(recordsPage, /onCompositionStart[\s\S]*setSearchComposing\(true\)[\s\S]*onCompositionEnd/, "search waits for Korean IME composition completion");
assert.match(recordsPage, /initialConsumptionRecordsBatchSize\(window\.innerHeight\)/, "the initial records request is sized to the viewport");
assert.match(recordsPage, /if \(append && \(recordsLoadingRef\.current[\s\S]*generation !== recordsRequestGeneration\.current/, "new search or sort requests supersede in-flight replacements while stale results are ignored");
assert.match(recordsPage, /shouldRestartConsumptionRecordsPage\(append, apiEtag, page\.etag\)[\s\S]*loadRecordsPage\(false, range\)/, "ETag changes restart paging before snapshots can be mixed");
assert.match(recordsPage, /offset:\s*append \? recordsNextOffset : 0[\s\S]*sort:\s*"ACCOUNT"[\s\S]*direction:\s*"ASC"/, "records paging uses a stable server order without user-facing sort controls");
assert.match(recordsPage, /new Map[\s\S]*page\.accountGroups[\s\S]*setSavedPlans[\s\S]*setDraftPlans/, "loaded account pages append with account and plan deduplication");
assert.match(recordsPage, /id="consumptionRecordSearch"[\s\S]*disabled=\{hasDraftChanges\}/, "the stable search input remains focused while records load and is locked only for drafts");
assert.match(recordsPage, /recordsHasMore[\s\S]*loadRecordsPage\(true\)/, "near-bottom scroll and Load More request the next server page");
assert.match(recordsPage, /Showing \{loadedAccountCount\} of \{recordsTotalAccounts\} accounts/, "server total account metadata drives the loading summary");
assert.doesNotMatch(recordsPage, /Page \{[^}]*\}|page-number|rowsPerPage/, "page-number pagination is absent");
assert.match(recordsPage, /renderedRecordAccounts\.map/, "the table renders the incremental account collection");
assert.match(recordsPage, /editablePeriodIds\.has\(month\)/, "only backend-declared periods are editable");
assert.match(recordsPage, /displayQuarterOrder\.flatMap/, "Data columns follow backend display order");
assert.match(recordsPage, /const expandable = account\.plans\.length > 1[\s\S]*class="consumption-account-toggle"[\s\S]*aria-expanded=\{expanded\}[\s\S]*toggleAccount\(account\.customer\)[\s\S]*expandable && expanded && account\.plans\.map/, "Multiple keeps its disclosure and renders child Plan rows only when expanded");
assert.doesNotMatch(recordsPage, /if \(!append\) \{[\s\S]{0,240}setExpandedAccounts\(new Set\(\)\)/, "Records query replacement does not discard retained Multiple expansion state");
assert.match(recordsPage, /const expandable = account\.plans\.length > 1[\s\S]*renderQuarterCells\(singlePlan, false\)[\s\S]*renderQuarterCells\(account, true\)/, "single and multi-plan rows preserve edit/read-only behavior");
assert.match(recordsPage, /data-control-source=\{resolution\?\.source\}[\s\S]*canEditControl \? "CONTROL" : "PLAN SUM"/, "Multiple rows expose manual Control Total versus derived Plan Sum state");
assert.match(recordsPage, /setDraftPlans\(clonePlans\(savedPlans\)\)/, "Cancel restores the authoritative saved snapshot");
assert.match(recordsPage, /setDraftControlTotals\(cloneControlTotals\(savedControlTotals\)\)/, "Cancel also restores missing-versus-zero Multiple controls");
assert.match(recordsPage, /hasControlDraftChanges[\s\S]*hasDraftChanges[\s\S]*if \(!rangeInitialized[^\n]*hasDraftChanges/, "Control-only drafts block debounced Records replacement and share navigation/range guards");
assert.match(recordsPage, /const updateControlForecast[\s\S]*?recordsRequestGeneration\.current\+\+[\s\S]*?setRecordsLoading\(false\)/, "Control typing invalidates an in-flight Records replacement before it can erase the draft");
assert.match(recordsPage, /const updateForecast[\s\S]*?recordsRequestGeneration\.current\+\+[\s\S]*?setRecordsLoading\(false\)/, "Plan typing invalidates an in-flight Records replacement before it can erase the draft");
assert.match(recordsPage, /Multiple Control[\s\S]*controlValue\(error\.current\.controlTotals/, "HTTP 409 comparison includes Control-only saved, draft, and current server values");
assert.doesNotMatch(recordsPage, /MANUAL_FORECAST/, "the client uses only deployed Control Total match statuses");
assert.doesNotMatch(apiSource, /seedForecastMonths\s*\(/, "the API client never manufactures Forecast values");

// Redwood table behavior and responsive containment.
assert.doesNotMatch(recordsPage, /recordSort|recordDirection|consumption-record-controls|tableExpanded/, "sort, direction, helper controls, and table collapse are removed");
assert.match(styles, /\.consumption-page\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*clip/, "Usage Records removes page-level horizontal overflow");
assert.match(styles, /\.consumption-table-scroll\s*\{[^}]*height:\s*max\(18rem, calc\(100dvh - [^)]+\)\)[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*auto/, "the table alone owns Quarter\/Month horizontal overflow and available-height scrolling");
assert.match(styles, /\.consumption-load-more\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/, "the Records footer remains visible at the table end");
assert.doesNotMatch(styles, /\.consumption-table-scroll\s*\{[^}]*max-height:/, "200% zoom does not clamp the required 18rem minimum table viewport");
assert.match(styles, /\.consumption-table th, \.consumption-table td\s*\{[^}]*height:\s*2\.75rem[^}]*padding:\s*\.3rem \.48rem/, "compact Redwood rows preserve a 44px minimum cell height");
assert.match(styles, /\.consumption-account-column\s*\{[^}]*left:\s*0[^}]*position:\s*sticky/, "Account column remains sticky");
assert.match(styles, /\.consumption-table thead tr:first-child th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/, "first header row remains sticky");
assert.match(styles, /\.consumption-table thead tr:nth-child\(2\) th\s*\{[^}]*position:\s*sticky[^}]*top:\s*2\.6rem/, "second compact header row remains sticky");
assert.match(styles, /\.consumption-insights-page[\s\S]*\.consumption-insights-alert-trend-grid[\s\S]*\.consumption-insights-contribution-list/, "Insights styling is page-scoped");

console.log("consumptionUiContract tests passed");
