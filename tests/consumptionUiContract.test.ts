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

// Usage Insights: FY-only summaries, ACTUAL-only alerts/trend and Account→Plan drilldown.
assert.match(insightsPage, /fetchConsumptionAnalysis\(fiscalYear\)/, "Usage Insights loads one FY analysis contract");
assert.match(insightsPage, /FY Portfolio[\s\S]*Prior FY[\s\S]*Coverage[\s\S]*Q1 Q2 Q3 Q4/, "FY portfolio and quarterly context render data coverage");
assert.match(insightsPage, /Forecast QoQ[\s\S]*Projected QoQ[\s\S]*QoQ N\/A/, "Quarter summaries distinguish forecast, projected, and unavailable QoQ");
assert.match(insightsPage, /ACTUAL only[\s\S]*Consumption Change Alerts[\s\S]*Plan ACTUAL Trend/, "Change Alerts and the linked trend are ACTUAL only");
assert.match(insightsPage, /actualTrend[\s\S]*actualAmount/, "the linked Plan trend consumes ACTUAL points only");
assert.doesNotMatch(insightsPage, /forecastTrend|Service Composition/, "Insights neither invents a Forecast trend nor Service Composition");
assert.match(insightsPage, /sortAndFilterConsumptionAccounts/, "Account Contribution applies approved search and sort logic");
assert.match(insightsPage, /Top 5 \+ Other[\s\S]*All accounts[\s\S]*Search accounts/, "Account Contribution exposes approved list and search modes");
assert.match(insightsPage, /Account Contribution[\s\S]*Plan Contribution[\s\S]*Workload[\s\S]*Plan[\s\S]*% of Account/, "Account drilldown reaches workload and plan detail with Account-relative contribution percentages");
assert.match(insightsPage, /ojs\/ojchart[\s\S]*ArrayDataProvider[\s\S]*consumption-insights-portfolio-chart[\s\S]*consumption-insights-qoq-chart[\s\S]*consumption-insights-actual-chart[\s\S]*consumption-insights-contribution-chart[\s\S]*consumption-insights-plan-chart/, "approved Insights visualizations use Oracle JET chart DataProviders");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}/, "selected Alert drives an ACTUAL-only JET line chart");
assert.match(apiSource, /request\(`\/consumption\/analysis\?\$\{new URLSearchParams\(\{ fiscalYear \}\)\}`\)/, "Analysis client sends only the FY query");

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
assert.match(styles, /\.consumption-table-scroll\s*\{[^}]*height:\s*max\(18rem, calc\(100dvh - 16rem\)\)[^}]*overflow:\s*auto/, "the table owns responsive viewport-based scrolling");
assert.doesNotMatch(styles, /\.consumption-table-scroll\s*\{[^}]*max-height:/, "200% zoom does not clamp the required 18rem minimum table viewport");
assert.match(styles, /\.consumption-table th, \.consumption-table td\s*\{[^}]*height:\s*2\.75rem[^}]*padding:\s*\.3rem \.48rem/, "compact Redwood rows preserve a 44px minimum cell height");
assert.match(styles, /\.consumption-account-column\s*\{[^}]*left:\s*0[^}]*position:\s*sticky/, "Account column remains sticky");
assert.match(styles, /\.consumption-table thead tr:first-child th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/, "first header row remains sticky");
assert.match(styles, /\.consumption-table thead tr:nth-child\(2\) th\s*\{[^}]*position:\s*sticky[^}]*top:\s*2\.6rem/, "second compact header row remains sticky");
assert.match(styles, /\.consumption-insights-page[\s\S]*\.consumption-insights-quarter-grid[\s\S]*\.consumption-insights-contribution-list/, "Insights styling is page-scoped");

console.log("consumptionUiContract tests passed");
