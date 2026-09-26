import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recordsPage = readFileSync("src/components/content/ConsumptionRecordsPage.tsx", "utf8");
const insightsPage = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const attainmentPage = readFileSync("src/components/content/AttainmentPage.tsx", "utf8");
const messageBanner = readFileSync("src/components/content/ConsumptionMessageBanner.tsx", "utf8");
const sharedMessageBanner = readFileSync("src/components/content/AppMessageBanner.tsx", "utf8");
const apiSource = readFileSync("src/data/consumptionApi.ts", "utf8");
const content = readFileSync("src/components/content/index.tsx", "utf8");
const spreadsheetPage = readFileSync("src/components/content/KpiSpreadsheetPage.tsx", "utf8");
const pageNavigation = readFileSync("src/components/PageNavigationToolbar.tsx", "utf8");
const homeConsumption = readFileSync("src/components/content/HomeConsumptionOverview.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(messageBanner, /AppMessageBanner/, "Consumption notices use the shared notification adapter");
assert.match(sharedMessageBanner, /if \(uniqueMessages\.length === 0\) return null/, "the shared banner leaves no empty layout when there are no messages");
assert.match(sharedMessageBanner, /oj-c-message-banner/, "Consumption notices use the Oracle JET message banner");
assert.match(styles, /\.app-message-region,\s*\.consumption-message-region\s*\{[^}]*position:\s*fixed[^}]*top:[^;}]+[^}]*right:[^;}]+[^}]*z-index:[^;}]+/, "Consumption notices are a top-right fixed overlay and do not shift page layout");
assert.match(recordsPage, /const \[dismissedMessageIds, setDismissedMessageIds\] = useState<Set<string>>[\s\S]*pageMessages\.filter\(\(message\) => !dismissedMessageIds\.has\(message\.id\)\)[\s\S]*setDismissedMessageIds\(\(current\) => new Set\(current\)\.add\(messageId\)\)/,
  "closing a Consumption notice only dismisses that overlay message");
assert.match(recordsPage, /if \(messageId === "records-operation-error"\) \{\s*setImportError\(""\);\s*return;/,
  "closing an operation error clears only that current message so a later failure can be shown again");
assert.doesNotMatch(recordsPage, /onClose=\{\(messageId\) => \{[\s\S]{0,260}set(?:DraftPlans|DraftControlTotals)/,
  "closing a Consumption notice does not discard draft edits");
assert.match(recordsPage, /error\.status === 403[\s\S]*Consumption Records 쓰기 권한이 없습니다[\s\S]*Records WRITE 권한/,
  "Consumption Records explains the exact permission required for a rejected save");
assert.match(recordsPage, /error\.status === 400 \|\| error\.status === 422[\s\S]*입력값을 확인/,
  "Consumption Records separates invalid input from authorization failures");
assert.match(recordsPage, /error\.status >= 500[\s\S]*서버 오류로 저장하지 못했습니다/,
  "Consumption Records distinguishes server failures from permission and input failures");
assert.match(spreadsheetPage, /const pageHeader = <header class="kpi-spreadsheet-page__header"[\s\S]*if \(pageLoading\)[\s\S]*\{pageHeader\}[\s\S]*kpi-page-loading__body[\s\S]*Loading KPI Activities data/, "KPI Activities loading retains the normal page header before the centered progress body");
assert.match(attainmentPage, /accounts-workloads-page accounts-workloads-loading[\s\S]*size="md"[\s\S]*Loading Consumption Attainment/, "Attainment loading matches Accounts & Workloads");
assert.match(recordsPage, /dataMode === "loading" \|\| blockingRecordsLoading[\s\S]*accounts-workloads-page accounts-workloads-loading[\s\S]*Loading Consumption Records/, "Records loading matches Accounts & Workloads");
assert.doesNotMatch(recordsPage, /All-account totals are unavailable|ALL Forecast is read-only|Forecast is edited once per Account/, "Records removes distributed technical guidance");
assert.match(homeConsumption, /확정 업로드 필요/, "Home guides users when a previous MTD remains unresolved");
assert.match(homeConsumption, />MTD \(잠정\)</, "Home labels current-month MTD as provisional rather than Actual");
assert.match(homeConsumption, /const showActual = quarter\.actualAmount !== 0;[\s\S]*const showMtd = !showActual && mtd\?\.amount !== null && mtd\?\.amount !== undefined;/,
  "Quarterly display treats zero Actual as absent, shows available MTD only then, and hides MTD for non-zero Actual");
assert.doesNotMatch(homeConsumption, /Separate values|Actual periods are closed results|Partial or incomplete source coverage|MTD \(잠정\) is provisional|Current-month MTD is provisional|Actual and Forecast remain separate/,
  "Home removes the requested explanatory copy and orphaned footnotes");
assert.match(homeConsumption, /home-consumption__monthly-legend-dot home-consumption__monthly-legend-dot--mtd/,
  "the MTD legend uses a point rather than a line");
assert.match(homeConsumption, /month\.kind === "ACTUAL" \? "Actual" : month\.kind === "MTD" \? "MTD \(잠정\)" : "Forecast"/,
  "the accessible monthly chart never classifies MTD as Actual");
assert.doesNotMatch(attainmentPage, /Closed months use Actual|fiscal-period completeness|unopened-period status|complete full-year outlook/i, "Attainment removes standing implementation disclaimers");

assert.match(recordsPage,
  /error instanceof ConsumptionConflictError[\s\S]*accountForecastControls\(error\.current\)[\s\S]*setConflictRows\(rows\)[\s\S]*setConflictWorkspace\(error\.current\)[\s\S]*Forecast Save conflicted with a newer server version/,
  "DP/OCI version conflicts reach the comparison UI with the selected-pillar server workspace");
assert.match(recordsPage, /변경 없음: Forecast 값과 Sales Rep 정보가 현재 데이터와 같습니다\./,
  "an accepted same-file Forecast re-upload clearly reports no data change");
assert.match(recordsPage, /result\.status === "APPLIED_NO_CONTROL_CHANGE" \|\| result\.status === "EXACT_REPLAY"/,
  "all supported no-mutation Forecast outcomes use the no-change message");
assert.match(recordsPage, /forecastApplyingRef\.current[\s\S]*setForecastImportPhase\("applying"\)[\s\S]*finally[\s\S]*forecastApplyingRef\.current = false/,
  "Forecast Apply is synchronously locked against same-render double submission");
assert.match(recordsPage, /setForecastImportPhase\("complete"\);[\s\S]*?try \{[\s\S]*?await loadRecordsPage/,
  "a post-commit records refresh cannot relabel a successful Forecast apply as failed");
assert.match(recordsPage, /반영은 완료됐지만 목록 새로고침에 실패했습니다/,
  "post-commit refresh failure preserves the apply result and gives recovery guidance");
assert.match(recordsPage, /반영 완료: 변경된 항목[\s\S]*Forecast 값과 Sales Rep 합계/,
  "changed counts use a clear applied label and disclose their Forecast-plus-Sales-Rep basis");
assert.match(recordsPage, /반영 실패:/,
  "Forecast import failures have a plain-language failure label");
assert.doesNotMatch(recordsPage, /pendingForecastImport\.preview\.exactReplay|이미 반영된 파일/,
  "historical file equality never blocks a deliberate Forecast re-upload");
assert.doesNotMatch(recordsPage, /DB mutation|Applied \$\{result\.appliedCount\} Forecast cells/,
  "internal Forecast replay, mutation, and Applied codes are not shown to users");
assert.doesNotMatch(recordsPage, /Applied: 0/, "Actual result decoding failures must not claim that zero rows were applied");
assert.match(recordsPage, /처리 결과를 확인하지 못했습니다\. 반영 여부 확인이 필요합니다\./,
  "ambiguous Actual apply results must explicitly require a data-state check");
const navigation = readFileSync("src/data/kpiMockData.ts", "utf8");
const routes = readFileSync("src/components/navigationRoutes.ts", "utf8");
const staticServer = readFileSync("scripts/spa_server.py", "utf8");

assert.match(styles,
  /\.kpi-content:has\(\.consumption-insights-page\),\s*\.kpi-content:has\(\.attainment-page\)\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*max-content;/,
  "Analysis and Attainment keep short initial loading content directly below the fiscal-year panel");
assert.match(styles, /\.kpi-page-menu oj-toolbar\s*\{[^}]*column-gap:\s*\.4rem;/,
  "all breadcrumb segments use one common left/right gap");
assert.match(styles, /\.kpi-page-menu__chevron\s*\{[^}]*padding:\s*0;/,
  "breadcrumb chevrons do not use route-specific padding");
assert.match(styles, /\.kpi-page-loading__body\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/,
  "only the loading body is centered so the page header does not move");
assert.match(pageNavigation, /kpi-page-menu__chevron[\s\S]*kpi-page-menu__item is-section[\s\S]*kpi-page-menu__chevron[\s\S]*kpi-page-menu__current-label/,
  "every breadcrumb level uses the same separator element");
assert.match(styles,
  /\.consumption-insights-page\s*\{[^}]*background:\s*#fff;[^}]*border:\s*1px solid #dedad4;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*0 1px 2px rgba\(0, 0, 0, \.06\);[^}]*padding:\s*1rem;/,
  "Consumption Analysis is one Redwood-aligned white outer panel");
assert.match(styles,
  /\.consumption-insights-page > \.kpi-panel\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-top:\s*1px solid #e7e3de;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/,
  "top-level Analysis sections use separators instead of nested cards");
assert.match(styles,
  /\.consumption-insights-page > \.consumption-insights-composition,\s*\.consumption-insights-page > \.consumption-insights-alert-trend\s*\{[^}]*background:\s*#fff;[^}]*border:\s*1px solid #d4cec6;[^}]*border-radius:\s*var\(--oj-core-border-radius-md\);[^}]*padding:\s*1rem;/,
  "Forecast composition and Alerts/Trend keep their headings and related content inside matching Analysis cards");
assert.match(styles,
  /\.consumption-insights-page \.consumption-insights-kpis \.kpi-panel\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/,
  "KPI summary cells form one continuous band without nested shadows");
assert.match(styles,
  /\.attainment-page\s*\{[^}]*background:\s*#fff;[^}]*border:\s*1px solid #dedad4;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*0 1px 2px rgba\(0, 0, 0, \.06\);[^}]*padding:\s*1rem;/,
  "Consumption Attainment is one Redwood-aligned white outer panel, including its initial state");
assert.match(styles,
  /\.attainment-fy-hero\s*\{[^}]*border-radius:\s*var\(--oj-core-border-radius-md\)[\s\S]*\.attainment-quarter-card\s*\{[^}]*border:\s*1px solid var\(--oj-core-divider-color\);[^}]*border-radius:\s*var\(--oj-core-border-radius-md\);[^}]*box-shadow:\s*none;/,
  "Attainment summary and quarter boxes use the Analysis-level corner radius without nested shadows");
assert.match(styles,
  /\.attainment-page > \.attainment-chart-card\.attainment-chart-card\s*\{[^}]*background:\s*#fff;[^}]*border:\s*1px solid #d4cec6;[^}]*border-radius:\s*var\(--oj-core-border-radius-md\);[^}]*box-shadow:\s*none;/,
  "Attainment charts use the Analysis-level corner radius and Redwood-neutral boundary without shadow");
assert.match(styles,
  /\.consumption-page\s*\{[^}]*background:\s*#fff;[^}]*border:\s*1px solid #dedad4;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*0 1px 2px rgba\(0, 0, 0, \.06\);[^}]*box-sizing:\s*border-box;[^}]*padding:\s*\.75rem;/,
  "Consumption Records follows the Accounts and Workloads single-panel workspace pattern");
assert.match(styles,
  /\.consumption-table-panel\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;[^}]*padding:\s*0;/,
  "Records absorbs the old table card while leaving the functional scroll boundary separate");
assert.match(styles,
  /\.consumption-table-scroll\s*\{[^}]*border:\s*1px solid var\(--kpi-border\);[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*auto;/,
  "Records preserves the table scroll boundary and both scroll axes");
assert.match(recordsPage, /Account \/ Plan Consumption/, "Records uses the Account / Plan Consumption title");
assert.doesNotMatch(recordsPage, /<span class="kpi-section-label">Actual \+ Forecast<\/span>/,
  "Records omits the redundant Actual + Forecast title prefix");
assert.match(styles,
  /@media \(min-width: 64rem\)[\s\S]*\.consumption-page\s*\{[^}]*padding-block:\s*\.45rem;[^}]*\}[\s\S]*\.consumption-table-panel\s*\{[^}]*padding:\s*0;/,
  "desktop Records moves the former table padding to the outer panel without reducing table space");

// Navigation and route ownership.
assert.match(navigation, /export const consumptionNavItems[\s\S]*id: "analysis"[\s\S]*label: "Analysis"[\s\S]*id: "attainment"[\s\S]*label: "Attainment"[\s\S]*id: "records"[\s\S]*label: "Records"/, "approved Consumption leaf names exist");
assert.match(navigation, /id: "consumption"[\s\S]*children: consumptionNavItems/, "Consumption is the parent of the approved leaves");
assert.match(routes, /id: "analysis"[\s\S]*module: "consumptionAnalysis"[\s\S]*id: "records"[\s\S]*module: "consumptionRecords"/, "Consumption leaves have independent route modules");
assert.match(routes, /"consumption": "analysis"/, "/consumption remains a compatibility alias to Analysis");
assert.match(content, /activeRoute\.module === "consumptionAnalysis"[\s\S]*<ConsumptionAnalysisPage[\s\S]*fiscalYear=\{fiscalYear\}/, "Consumption Analysis receives the selected fiscal year");
assert.match(content, /activeRoute\.module === "consumptionRecords"[\s\S]*<ConsumptionRecordsPage[\s\S]*fiscalYear=\{fiscalYear\}/, "Consumption Records renders the preserved editable workspace");
assert.match(content, /!\['profile', 'users', 'consumptionRecords', 'accountsWorkloads', 'accountManagementOverview'\]\.includes\(activeRoute\.module\)/, "global FY is visible for Consumption Analysis and hidden for FY-independent Account Management and Consumption Records");

// Consumption Analysis: one FY/account server context, ACTUAL-only six-month trend and Account→Plan drilldown.
assert.match(insightsPage, /fetchConsumptionAnalysis\(\{ fiscalYear, search:[^,]+, account:[^}]+\}\)/, "Consumption Analysis loads one server-owned FY/account analysis context");
assert.match(insightsPage, /analysisResponse\?\.fiscalYear === fiscalYear \? analysisResponse : null/, "Analysis keeps the last same-FY response mounted while filters refresh");
assert.doesNotMatch(insightsPage, /analysisResponse\.selectedAccount === \(selectedAccountContext \|\| null\)/, "same-FY filter changes do not unmount the Analysis header and controls");
assert.match(insightsPage, /aria-busy=\{loading \? "true" : "false"\}/, "Analysis exposes refresh state without replacing its mounted page shell");
assert.match(insightsPage, /const hasStaleFiscalYearResponse = analysisResponse !== null && analysisResponse\.fiscalYear !== fiscalYear/, "Analysis recognizes a previous-FY response before the next request effect runs");
const analysisBlockingLoadingStart = insightsPage.indexOf("if (!analysis && (loading || hasStaleFiscalYearResponse))");
const analysisBlockingLoadingEnd = insightsPage.indexOf("const messages:", analysisBlockingLoadingStart);
const analysisBlockingLoadingBranch = insightsPage.slice(analysisBlockingLoadingStart, analysisBlockingLoadingEnd);
assert.ok(analysisBlockingLoadingStart >= 0 && analysisBlockingLoadingEnd > analysisBlockingLoadingStart, "Analysis has an isolated initial/FY-transition loading branch");
assert.match(analysisBlockingLoadingBranch, /class="accounts-workloads-page accounts-workloads-loading"[\s\S]*Loading Consumption Analysis\.\.\./, "Analysis blocking loading uses the Attainment loading presentation");
assert.doesNotMatch(analysisBlockingLoadingBranch, /consumption-page__header|Consumption \/ Analysis|<h1>/, "Analysis title and breadcrumb stay hidden during initial and FY-transition loading");
assert.match(insightsPage, /else if \(analysisResponse\) \{\s*setAnalysis\(null\);\s*\}/, "a failed FY transition discards the previous-FY response before rendering the current error state");
assert.match(insightsPage, /if \(analysisResponse\?\.fiscalYear === fiscalYear\)[\s\S]*setSelectedPillar\(analysisResponse\.selectedPillar\)[\s\S]*setSelectedSalesRep\(analysisResponse\.selectedSalesRep \?\? ""\)[\s\S]*setSelectedAccountContext\(analysisResponse\.selectedAccount \?\? ""\)/, "failed refreshes restore the filter context of the still-displayed response");
assert.doesNotMatch(insightsPage, /const generation = \+\+requestGeneration\.current;\s*setAnalysis\(null\)/, "candidate refresh keeps the combobox shell mounted and focused");
assert.match(insightsPage, /role="combobox"[\s\S]*aria-autocomplete="list"[\s\S]*All Accounts Total[\s\S]*accountCandidates/, "the only analysis filter after FY is a searchable Account combobox whose first option is the portfolio total");
assert.match(insightsPage, /onCompositionStart[\s\S]*onCompositionEnd/, "the Account combobox waits for Korean IME composition completion");
assert.match(insightsPage, /ArrowDown[\s\S]*ArrowUp[\s\S]*Enter[\s\S]*Escape/, "the Account combobox supports keyboard navigation and selection");
assert.match(insightsPage, /Clear account[\s\S]*selectAccountContext\(""\)/, "the Account combobox can clear back to All Accounts Total");
assert.doesNotMatch(insightsPage, /shouldRefreshConsumptionAnalysisContext\(selectedAccountContext, account, debouncedCandidateSearch\)[\s\S]*if \(!refreshRequired\) setLoading\(false\)/,
  "selecting the current All Accounts context does not end a different request's active loading state");
assert.match(insightsPage, /\{analysis\.fiscalYear\} Mixed quarter consumption/, "FY fact-cell quarter totals use the selected fiscal-year title");
assert.doesNotMatch(insightsPage, /FINAL \+ \{mtdAsOfPeriod\} MTD|Growth, YoY, anomaly signals, and FY Outlook remain FINAL-based/,
  "Analysis removes the long MTD implementation notice");
assert.doesNotMatch(insightsPage, /Forecast \{account\.forecastEntryStatus\.toLowerCase\(\)\}/,
  "Account Contribution omits the redundant Forecast entered message");
assert.match(insightsPage, /Quarter-over-quarter[\s\S]*qoqChangePercent/, "QoQ values render as decision cards");
assert.match(insightsPage, /const selectedAlert = analysis\?\.alerts\.find[^\n]+\?\? null/, "alerts start and remain unselected without falling back to the first alert");
assert.match(insightsPage, /const trendPoints[\s\S]*selectedAlert[\s\S]*getAlertActualTrend[\s\S]*analysis\?\.contextActualTrend/, "unselected Trend uses the backend current-context ACTUAL trend");
assert.match(insightsPage, /const contextTrendLabel[\s\S]*selectedAlert \?[^:]+: contextTrendLabel/, "unselected Trend displays All Accounts Total in the current filter context");
assert.match(insightsPage, /setSelectedAlertId\(\(current\) => current === alert\.alertId \? "" : alert\.alertId\)/, "clicking a selected alert toggles it off");
assert.match(insightsPage, /type="button"[\s\S]*aria-pressed=\{selectedAlert\?\.alertId === alert\.alertId\}/, "native alert buttons expose pressed state for mouse, Enter, and Space activation");
assert.match(insightsPage, /aria-label=\{`Severity \$\{alert\.grade\}`\}[\s\S]*\{alert\.grade\}/, "grade badges retain Severity accessibility while showing only the grade");
assert.match(insightsPage, /<strong>\{alert\.account\}<\/strong>/, "alerts always show the actual account name");
assert.match(insightsPage, /\{alert\.workloadMapped && <>\{alert\.workload\} · <\/?>\}Plan \{alert\.planId\}/, "mapped workload names remain separate from Plan ID");
assert.doesNotMatch(insightsPage, /selectedAlert\.workloadMapped\s*\?[^:]+:\s*"UNMAPPED"|Workload mapping Unmapped/, "alerts and the linked Plan Trend omit visible unmapped fallback copy");
assert.doesNotMatch(insightsPage, /!alert\.workloadMapped/, "alerts do not render any unmapped-only badge or copy");
assert.doesNotMatch(insightsPage, />Severity \{alert\.grade\}</, "the visible word Severity is removed");
assert.doesNotMatch(insightsPage, /\{alert\.workload\} · \{alert\.periodKey\}/, "alert rows omit the period");
assert.match(insightsPage, /slice\(-4\)[\s\S]*markerSize:\s*emphasizedTrendPeriods\.has\(point\.periodKey\) \? 9 : 5/, "the latest four points in the six-month ACTUAL trend retain emphasized chart markers");
assert.match(insightsPage, /const trendChart = useMemo\(\(\) => chart\(trendPoints\.map\([\s\S]*value: point\.actualAmount/, "the trend DataProvider retains all six month groups");
assert.match(insightsPage, /value=\{data\.value \?\? undefined\}/, "missing ACTUAL is passed to JET as an explicit gap rather than removing the month group");
assert.doesNotMatch(insightsPage, /forecastTrend|Service Composition/, "Insights neither invents a Forecast trend nor Service Composition");
assert.match(insightsPage, /Account Contribution[\s\S]*Plan Contribution[\s\S]*consumption-insights-contribution-grid/, "Account and Plan contribution render as an approved two-column drilldown");
assert.match(insightsPage, /const selectedAccount = analysis\?\.accounts\.find[^\n]+\?\? null/, "account contribution starts unselected without falling back to the first account");
assert.match(insightsPage, /const rows = \[[\s\S]*analysis\.fiscalYear[\s\S]*analysis\.priorFiscalYear/, "fiscal chart places the current FY first and prior FY below");
assert.match(insightsPage, /id="fyQuarterTotalsTitle">FY &amp; Quarter totals[\s\S]*<h3>\{analysis\.fiscalYear\} Mixed quarter consumption<\/h3>/, "the card keeps its FY and Quarter title while the Quarter region names its Actual-first Forecast-fallback meaning");
assert.doesNotMatch(insightsPage, /otherContribution|otherSelected|Other Accounts|consumption-insights-account-other/, "Consumption Analysis removes the aggregate Other Accounts contract and UI");
assert.match(insightsPage, /percentageContext: "selected Account"[\s\S]*plan\.percentage\.toFixed\(1\)\}% of \{percentageContext\}/, "normal Account plans retain the selected Account percentage label");
assert.match(insightsPage, /\{!isUnmappedConsumptionLabel\(workload\) && <>\s*<b>\{workload\}<\/b> · <\/?>\}Plan \{plan\.planId\}/, "Plan Contribution keeps actual workload names while omitting unmapped labels regardless of case or surrounding whitespace");
assert.doesNotMatch(insightsPage, /<b>\{workload\}<\/b> · Plan \{plan\.planId\}/, "Plan Contribution does not render the workload label unconditionally");
assert.doesNotMatch(apiSource, /otherContribution|ConsumptionOtherContribution/, "the Consumption API excludes the removed Other Accounts response fields");
assert.match(insightsPage, /ojs\/ojchart[\s\S]*ArrayDataProvider[\s\S]*consumption-insights-totals-chart[\s\S]*consumption-insights-actual-chart/, "approved Insights visualizations use Oracle JET chart DataProviders");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}/, "selected Alert drives an ACTUAL-only JET line chart");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}[\s\S]*dataLabel=\{trendDataLabel\}[\s\S]*dataLabelPosition:\s*"aboveMarker"[\s\S]*hideOverlappingLabels:\s*"on"/, "the ACTUAL Trend uses Oracle JET native collision-aware point labels");
assert.match(insightsPage, /const trendDataLabel[\s\S]*compactCurrency\.format\(value\)/, "Chart value labels use the approved compact USD format");
assert.match(insightsPage, /fiscalTotalsChart\} dataLabel=\{trendDataLabel\}[\s\S]*quarterTotalsChart\} dataLabel=\{trendDataLabel\}/, "FY and Quarter totals expose each value through the official JET chart dataLabel callback");
assert.doesNotMatch(insightsPage, /Organic Consumption Growth Proxy|organicGrowthChart/, "the UI does not relabel Forecast movement composition as an organic-growth proxy");
assert.doesNotMatch(insightsPage, /consumption-insights-trend-periods/, "the redundant six-month period and amount tile list below the chart is removed");
assert.match(insightsPage, /trendPoints\.length === 6[\s\S]*consumption-insights-actual-chart[\s\S]*Why flagged:/, "the six-month chart and selected-alert Why flagged explanation remain without the duplicate list");
assert.doesNotMatch(styles, /\.consumption-insights-trend-periods/, "obsolete duplicate-list styling is removed");
assert.match(apiSource, /URLSearchParams\(\{ fiscalYear: query\.fiscalYear, search: query\.search, account: query\.account, salesRep: query\.salesRep \?\? "" \}\)/, "Analysis client sends the FY, candidate search, selected Account, and Sales Rep query");
assert.match(apiSource, /accountCandidates[\s\S]*workloads[\s\S]*planIds/, "Analysis candidate data has a strict searchable Account\/Workload\/Plan ID contract");
assert.doesNotMatch(insightsPage, /포함기간|FY\d+-[A-Z]{3}–FY\d+-[A-Z]{3} Actual \+ Forecast/, "Analysis removes visible period guidance without changing calculations");
assert.doesNotMatch(insightsPage, /About current ownership and unavailable comparisons|Why YoY is unavailable|Why the YoY rate is unavailable/, "Analysis removes standing explanatory disclosures");
assert.match(insightsPage, /PRIOR_PERIOD_ZERO[\s\S]*rate N\/A/, "explicit prior zero preserves the amount and presents the unavailable rate concisely");
assert.doesNotMatch(insightsPage, /rate N\/A \(prior Actual 0\)|<small>\{row\.yoyUnavailableReason/, "long N/A reasons are not rendered inline in Sales Rep cells");
assert.match(insightsPage, /selectedMovement\.category === "All" \? <tfoot><tr><th>Total<\/th>/, "Forecast Composition All uses the concise Total label");
assert.match(recordsPage, /serverActualTotals === null[\s\S]*전체 합계를 확인할 수 없습니다/, "Records sends missing server totals to the shared action-oriented banner");
assert.equal(insightsPage.includes("const [includeMtd, setIncludeMtd] = useState(false)"), true, "Include MTD is default OFF");
assert.equal(insightsPage.includes("includeMtd"), true, "Analysis request includes the MTD mode");
assert.equal(insightsPage.includes("Include MTD"), true, "Analysis exposes the Include MTD toggle");
assert.equal(recordsPage.includes("const [showMtd, setShowMtd] = useState(false)"), true, "Show MTD is default OFF");
assert.equal(recordsPage.includes("Show MTD"), true, "Records exposes the Show MTD toggle");
assert.match(recordsPage, /showMtd && month === currentMtdPeriod \? "MTD"/, "Current-period MTD is labelled explicitly");
assert.equal(recordsPage.includes('data-readonly="mtd"'), true, "MTD cells are read-only");
assert.match(recordsPage, /actuals: showMtd && currentMtdPeriod[\s\S]*hasCurrentMtd \? \{ \[currentMtdPeriod\]: serverMtdTotals\[currentMtdPeriod\] \}[\s\S]*forecasts: showMtd && currentMtdPeriod[\s\S]*filter\(\(\[period\]\) => period !== currentMtdPeriod\)/,
  "portfolio MTD is represented separately from Forecast and never falls back to the current-period Forecast");
assert.match(recordsPage, /const currentMtd = accountLevel[\s\S]*serverAccountMtdTotals[\s\S]*series\.mtds[\s\S]*actuals: \{[\s\S]*baseDisplaySeries\.actuals[\s\S]*hasCurrentMtd \? \{ \[currentMtdPeriod\]: currentMtd\[currentMtdPeriod\] \}[\s\S]*forecasts: Object\.fromEntries\(Object\.entries\(baseDisplaySeries\.forecasts\)\.filter\(\(\[period\]\) => period !== currentMtdPeriod\)\)/,
  "account and plan MTD participate in current mode without being stored or classified as Forecast");
assert.match(insightsPage, /role="switch"[\s\S]*?aria-checked=\{includeMtd\}[\s\S]*?class="consumption-mtd-switch"/, "Analysis uses an accessible ON\/OFF switch instead of a checkbox");
assert.match(recordsPage, /Account \/ Plan Consumption[\s\S]*?role="switch" aria-checked=\{showMtd\} class="consumption-mtd-switch"/, "Records places Show MTD at the right side of the table heading");
assert.doesNotMatch(recordsPage, /oj-ux-ico-information-s/, "Forecast composition no longer depends on an information icon");
assert.match(recordsPage, /ForecastCompositionTooltip composition=\{displayedComposition\}>[\s\S]*currency\.format\(value\)/, "hovering the amount area owns the composition tooltip");
assert.match(styles, /\.consumption-forecast-tooltip\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/, "the composition hover target fills the amount cell");
assert.doesNotMatch(attainmentPage, /included-period results|not asserted to be a complete full-year outlook/, "Attainment removes the standing technical completeness disclaimer");
// PILLAR is an explicit, accessible page context on both Consumption leaves.
assert.match(recordsPage, /consumptionPillarOptions\.map[\s\S]*aria-pressed=\{selectedPillar === option\.value\}[\s\S]*selectPillar\(option\.value\)/, "Consumption Records exposes the shared compact All, DP, OCI selector");
assert.match(insightsPage, /consumptionPillarOptions\.map[\s\S]*aria-pressed=\{selectedPillar === option\.value\}[\s\S]*setSelectedPillar\(option\.value\)/, "Consumption Analysis exposes the shared compact All, DP, OCI selector");
assert.match(insightsPage, /consumption-insights-header-actions[\s\S]*consumption-insights-pillar[\s\S]*>Pillar<[\s\S]*consumption-pillar-selector[\s\S]*consumption-insights-context[\s\S]*>Account</, "Analysis places labelled Pillar before Account inside one filter row");
assert.match(styles, /\.consumption-insights-header-actions\s*\{[^}]*align-items:\s*end[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*gap:\s*\.75rem/, "Analysis filter row aligns Pillar and Account with Redwood spacing and natural wrapping");
assert.match(styles, /\.consumption-insights-pillar\s*\{[^}]*display:\s*grid[^}]*gap:\s*\.25rem/, "Pillar uses the same labelled filter rhythm as Account");
assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.consumption-insights-filter--account \{[^}]*flex:\s*0 0 auto;[^}]*\}/, "mobile Account filter clears the desktop 18rem flex basis so it cannot create vertical space before Overview");
assert.doesNotMatch(insightsPage, /setSelectedPillar\(option\.value\);\s*setSelectedAccountContext\(""\)/, "Pillar changes preserve a still-valid selected Account for cross filtering");
assert.match(insightsPage, /!debouncedCandidateSearch && selectedAccountContext[\s\S]*value\.accountCandidates\.some[\s\S]*selectedAccountContext\.toLocaleLowerCase\(\)[\s\S]*setSelectedAccountContext\(""\)/, "an unfiltered Pillar response clears the selected Account only when it is absent from scoped candidates, while candidate search does not clear context");
assert.match(recordsPage, /fetchConsumptionRecords\(\{[\s\S]*pillar:/, "Consumption Records sends the selected pillar with every records request");
assert.match(insightsPage, /fetchConsumptionAnalysis\(\{[^}]*pillar: selectedPillar/, "Consumption Analysis sends the selected pillar with every analysis request");
assert.match(recordsPage, /exportConsumptionImportCompatibleCsv\(selectedPillar, fromQuarter, toQuarter\)/, "Consumption Records exports Actual for the selected pillar and currently displayed quarter range");
assert.match(recordsPage, /exportConsumptionForecastCsv\("ALL"\)/, "Consumption Records exports Forecast for every Account across DP and OCI regardless of the screen filter");
assert.match(recordsPage, /formatConsumptionDataCenter\(plan, selectedPillar\)[\s\S]*aria-label=\{`Data center count \$\{display\.primary\}`\}[\s\S]*DC \{display\.primary\}/, "all Plan presentations keep one scoped Data Center total for the current query");
assert.doesNotMatch(recordsPage, /display\.detail|consumption-data-center__detail/, "Plan rows never split the All Data Center total into DP and OCI copy");
assert.doesNotMatch(recordsPage, /display\.duplicateWarning|Duplicate possible across pillars|consumption-data-center__warning/, "Plan rows do not imply a confirmed conflict from DP and OCI count coexistence alone");
assert.match(insightsPage, /formatConsumptionDataCenter\(plan, selectedPillar\)/, "Insights uses the same All-versus-typed DC presentation");
assert.match(insightsPage, /Plan Contribution[\s\S]*Plan \{plan\.planId\} · <InsightsDataCenter plan=\{plan\} selectedPillar=\{analysis\.selectedPillar\}/, "Plan Contribution uses the completed response's scoped DC total during refresh");
assert.doesNotMatch(insightsPage, /display\.detail|display\.duplicateWarning|consumption-data-center__warning/, "Consumption Analysis omits DP + OCI breakdown and duplicate warnings");

// Consumption Records remains the mutable Data workspace and excludes analysis duplication.
assert.match(recordsPage, /<h1 id="consumptionTitle">Consumption Records<\/h1>/, "data-management leaf uses the approved name");
assert.match(recordsPage, /<span class="kpi-eyebrow">Consumption \/ Attainment<\/span>[\s\S]*<h1 id="consumptionTitle">Consumption Records<\/h1>/, "Consumption Records uses the shared Consumption / Attainment eyebrow");
assert.doesNotMatch(recordsPage, /consumption-summary-cards|Consumption Change Alerts & Trend|id="consumptionSignalInbox"/, "Consumption Records does not duplicate the Insights charts");
assert.match(recordsPage, /accept="\.csv,text\/csv"/, "CSV file input remains available");
assert.match(recordsPage, /type="file"[\s\S]*multiple[\s\S]*handleCsvFiles/, "Import accepts multiple CSV files");
assert.match(recordsPage, /const files = Array\.from\(input\.files \?\? \[\]\)[\s\S]*files\.length > 8/, "Import retains and validates one to eight selected File objects");
assert.match(recordsPage, /previewConsumptionImport\(files, "ALL"\)[\s\S]*files, preview/, "multipart preview retains the exact selected File objects and lets filenames own pillar detection");
assert.match(recordsPage, /applyConsumptionImport\(pendingImport\.files, "ALL", pendingImport\.preview\)/, "multipart apply reuses the retained files and validated preview mapping as one cross-pillar atomic set");
assert.match(recordsPage, /pendingImport\.preview\.files\.map[\s\S]*detectedPillar[\s\S]*owner[\s\S]*fromPeriod[\s\S]*toPeriod[\s\S]*sourceRowCount/, "preview lists pillar, owner, range, and counts per file");
assert.match(recordsPage, /sameValueDuplicateCount[\s\S]*conflictCount[\s\S]*pendingImport\.preview\.conflicts/, "preview summarizes same-value duplicates and conflicting keys");
assert.match(recordsPage, /existingSameValueCount[\s\S]*overwriteCount[\s\S]*pendingImport\.preview\.overwrites/, "preview separates existing same-value rows from scoped Actual overwrites");
assert.match(recordsPage, />New<[\s\S]*>Updates<[\s\S]*>No change<[\s\S]*>Errors</, "Preview presents the approved four decision states in order");
assert.match(recordsPage, /<details class="consumption-import-technical-details"[\s\S]*Upload duplicates[\s\S]*Exact replay skipped[\s\S]*Existing Actuals to delete/, "technical counters including Delete stay collapsed by default");
assert.match(recordsPage, /<details class="consumption-import-update-details"[\s\S]*Updates detail/, "old-to-new overwrite rows are collapsed until requested");
assert.match(recordsPage, /consumption-import-hard-conflict[\s\S]*Import blocked[\s\S]*conflict\.reason[\s\S]*conflict\.rows\[0\][\s\S]*conflict\.values\[0\][\s\S]*conflict\.rows\[1\][\s\S]*conflict\.values\[1\]/, "Hard Conflict is a dedicated blocking banner with rows, key, values, and reason");
assert.match(recordsPage, /pendingImport\.preview\.hasConflicts \? "Resolve errors"[\s\S]*isExactReplayPreview[\s\S]*"Already imported"[\s\S]*"Apply metadata refresh"[\s\S]*`Apply \$\{pendingImport\.preview\.insertFactCount\} new · \$\{pendingImport\.preview\.overwriteCount\} updates`/, "CTA distinguishes errors, exact replay, metadata-only refresh, and fact changes");
assert.match(recordsPage, /Existing Actuals to overwrite[\s\S]*existingValue[\s\S]*newValue/, "overwrite preview discloses old and new values for scoped Plan-period keys");
assert.match(recordsPage, /disabled=\{!canWrite \|\| pendingImport\.preview\.hasConflicts \|\| isExactReplayPreview\(pendingImport\.preview\)\}/, "write denial, conflicts, and exact replay previews disable atomic Import without blocking metadata-only refresh");
assert.match(recordsPage, /formatConflictCurrency[\s\S]*#\{conflict\.fileOrdinals\[0\]\}[\s\S]*formatConflictCurrency\(conflict\.values\[0\]\)/, "Hard Conflict rows preserve decimal strings and distinguish equal source filenames by upload ordinal");
assert.match(apiSource, /overwriteKeys\.size!==overwrites\.length[\s\S]*uploadedNames\.has\(overwrite\.fileName\)[\s\S]*raw\.insertedFactCount\+raw\.unchangedFactCount\+raw\.skippedFactCount\+overwrites\.length!==raw\.physicalFactCount/, "preview decoder rejects duplicate/foreign overwrite rows and inconsistent impact totals");
assert.match(recordsPage, /Incoming physical facts:[\s\S]*result\.insertedFactCount[\s\S]*result\.overwrittenFactCount[\s\S]*result\.unchangedFactCount[\s\S]*result\.deletedFactCount/, "completion reports transaction-time apply counts rather than stale preview counts");
assert.match(recordsPage, /previewConsumptionImport[\s\S]*applyConsumptionImport/, "CSV preview and atomic import remain wired");
assert.match(recordsPage, /renderSalesRepPreview\(pendingImport\.preview\.salesRepChanges/, "Actual preview renders Sales Rep changes before Apply");
assert.match(recordsPage, /renderSalesRepPreview\(pendingForecastImport\.preview\.salesRepChanges/, "Forecast preview renders Sales Rep changes before Apply");
assert.match(recordsPage, /Account[\s\S]*Sales Rep \(before → after\)[\s\S]*Changed[\s\S]*Unchanged/, "Sales Rep preview exposes account, before-to-after, and changed/unchanged semantics");
assert.match(recordsPage, /Blank or missing Sales Rep values are ignored[\s\S]*No Sales Rep values to apply/, "Sales Rep preview explains blank no-op and legacy empty-response behavior");
assert.match(recordsPage, /exportConsumptionImportCompatibleCsv[\s\S]*exportConsumptionForecastCsv[\s\S]*URL\.createObjectURL[\s\S]*download = exported\.fileName[\s\S]*URL\.revokeObjectURL/, "Consumption Records downloads both server-owned Export files and releases object URLs");
assert.match(insightsPage, /useState<\{ quarter: string; category: ForecastCompositionCategory \} \| null>/, "Forecast composition supports All and each classified drill category");
assert.match(insightsPage, /COMPOSITION_CATEGORIES\.map[\s\S]*aria-pressed=\{selectedMovement\.category === category\}/, "detail exposes persistent All, New, Expansion, and Reduction selectors for the selected quarter");
assert.match(insightsPage, /selectedMovement\.category === "All"[\s\S]*<th>Total<\/th><th>New<\/th><th>Expansion<\/th><th>Reduction<\/th>/, "All detail distinguishes every stored composition amount without duplicating the K unit in headers");
assert.doesNotMatch(insightsPage, /FORECAST · projection|MIXED · projection/, "Forecast status does not repeat its meaning with the redundant projection label");
assert.match(insightsPage, /consumption-insights-export[\s\S]*<span>Export<\/span>[\s\S]*downloadCanvas\("png"\)[\s\S]*downloadCanvas\("pdf"\)/, "PNG and PDF controls have one aligned Export field label");
assert.match(insightsPage, /class="consumption-metric is-actual"[\s\S]*class="consumption-metric is-forecast"[\s\S]*class="consumption-metric is-quarter"/, "Analysis retains text labels while applying semantic highlight classes");
assert.match(insightsPage, /legend=\{\{ rendered: "off"/, "Forecast composition disables the Oracle JET default legend palette");
assert.match(insightsPage, /consumption-insights-composition-legend[\s\S]*Object\.entries\(MOVEMENT_COLORS\)/, "Forecast composition custom legend is bound to the exact chart category colors");
assert.doesNotMatch(insightsPage, /미분류 포함|consumption-insights-composition-warning/, "Forecast composition does not warn about normal natural movement");
assert.doesNotMatch(insightsPage, /All is Total Forecast|not a full breakdown of Total/, "Forecast chart does not render replacement explanatory copy or its spacing");
assert.match(insightsPage, /Forecast signals by quarter<\/h2><\/div><\/div>/, "Forecast heading ends after the title without an explanatory paragraph");
assert.doesNotMatch(insightsPage, /Some quarters include unclassified Forecast|Confirmed New, Expansion, and Reduction amounts are shown|Total Forecast remains unchanged/, "the long explanatory composition message is removed from the chart surface");
assert.match(attainmentPage, /attainment-quarter-card__actual[\s\S]*consumption-metric is-actual[\s\S]*consumption-metric is-forecast/, "Attainment uses the same semantic Actual and Forecast emphasis");
assert.match(styles, /\.consumption-sales-rep-overview \.consumption-sales-rep-table thead th \{[\s\S]*font-size: \.82rem;[\s\S]*background: #e9eef2|\.consumption-sales-rep-overview \.consumption-sales-rep-table thead th \{[\s\S]*background: #e9eef2;[\s\S]*font-size: \.82rem;/, "Sales Rep Overview header uses a larger readable Redwood-compatible treatment");
assert.match(insightsPage, /consumption-insights-movement-list[\s\S]*<thead>[\s\S]*<th>Account<\/th>/, "the account table is isolated in its own scroll region with a retained header");
assert.doesNotMatch(insightsPage, />Close<\/button>/, "composition detail no longer has a Close button");
assert.match(styles, /\.consumption-insights-movement-detail \{[^}]*height: 100%;[^}]*overflow: hidden;[\s\S]*\.consumption-insights-movement-list \{[^}]*overflow: auto;[\s\S]*\.consumption-insights-movement-detail thead th \{[^}]*position: sticky;/, "detail matches the chart height and scrolls only the list while keeping the header");
assert.match(insightsPage, /seriesId: "All"[\s\S]*value: toK\(point\.totalForecastAmount\)/, "All displays total Forecast in explicit K units rather than Renewal or net movement");
assert.doesNotMatch(insightsPage, /compositionStatus !== "CLASSIFIED"/, "partially classified quarters do not suppress every stored Forecast component");
assert.match(insightsPage, /point\.newAmount !== null[\s\S]*seriesId: "New"[\s\S]*point\.expansionAmount !== null[\s\S]*seriesId: "Expansion"[\s\S]*point\.reductionAmount !== null[\s\S]*seriesId: "Reduction"/, "each stored Forecast component is charted independently when available");
assert.doesNotMatch(insightsPage, /if \(point\.totalForecastAmount === null\) return \[\]/, "a missing total Forecast never suppresses stored component series");
assert.match(insightsPage, /const all = point\.totalForecastAmount === null \? null[\s\S]*return all === null \? components : \[all, \.\.\.components\]/, "All is omitted independently when unavailable while New, Expansion, and Reduction remain chartable");
assert.match(insightsPage, /filterForecastCompositionAccounts\(\s*selectedMovementPoint\.accounts, selectedMovement\.category\)/, "composition detail applies Forecast Total for All and component criteria for category tabs");
assert.match(insightsPage, /consumption-insights-composition-grid[\s\S]*consumption-insights-composition-chart__plot[\s\S]*consumption-insights-movement-detail/, "Forecast composition chart and detail share an independent responsive section");
assert.match(styles, /\.consumption-insights-composition-grid \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*@media \(max-width: 1100px\)[\s\S]*\.consumption-insights-composition-grid[^}]*grid-template-columns: minmax\(0, 1fr\)/, "composition uses balanced columns on desktop and one column on narrower screens");
assert.match(insightsPage, /consumption-insights-composition-chart" data-quarter-count=\{analysis\.movementBridge\.length\}/, "mobile chart receives the displayed quarter count for content-sized height");
assert.match(insightsPage, /consumption-insights-composition-grid" data-quarter-count=\{analysis\.movementBridge\.length\}/, "desktop chart and detail share the displayed quarter count");
assert.match(styles, /@media \(min-width: 1101px\)[\s\S]*composition-grid \{[^}]*align-items: start;[^}]*height: auto;[\s\S]*composition-chart \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*height: 18\.5rem;[\s\S]*data-quarter-count="1"[\s\S]*height: 12\.5rem;[\s\S]*data-quarter-count="3"[\s\S]*height: 16\.5rem;/, "wide Forecast composition aligns to the top and sizes both chart and detail by quarter count");
assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.consumption-insights-composition-chart \{[^}]*grid-template-rows: auto minmax\(0, 1fr\)[^}]*height: 18\.5rem[^}]*[\s\S]*data-quarter-count="1"[^}]*height: 13rem[^}]*[\s\S]*data-quarter-count="2"[^}]*height: 14\.5rem[^}]*[\s\S]*data-quarter-count="3"[^}]*height: 16\.5rem/, "mobile Forecast legend precedes a quarter-count-sized plot without the inherited fixed 24rem gap");
assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.consumption-insights-composition-legend \{[^}]*justify-content: flex-start[^}]*padding-top: 0/, "mobile Forecast legend wraps compactly above the plot");
assert.match(insightsPage, /Forecast signals by quarter/);
assert.doesNotMatch(insightsPage, /Renewal/i, "Forecast composition does not invent a Renewal category");
assert.match(recordsPage, /oj-ux-ico-upload[\s\S]*Forecast Import[\s\S]*oj-ux-ico-download[\s\S]*Forecast Export[\s\S]*oj-ux-ico-upload[\s\S]*Actual Import[\s\S]*oj-ux-ico-download[\s\S]*Actual Export/, "actions are ordered Forecast Import, Forecast Export, Actual Import, Actual Export with matching upload/download icons");
assert.match(recordsPage, /onojAction=\{\(\) => forecastFileInputRef\.current\?\.click\(\)\}[\s\S]*oj-ux-ico-upload[\s\S]*Forecast Import[\s\S]*onojAction=\{\(\) => void exportForecastCsv\(\)\}[\s\S]*oj-ux-ico-download[\s\S]*Forecast Export[\s\S]*onojAction=\{\(\) => fileInputRef\.current\?\.click\(\)\}[\s\S]*oj-ux-ico-upload[\s\S]*Actual Import[\s\S]*onojAction=\{\(\) => void exportImportCompatibleCsv\(\)\}[\s\S]*oj-ux-ico-download[\s\S]*Actual Export/, "each ordered action remains connected to its matching Forecast/Actual import/export handler");
assert.match(recordsPage, /Import \$\{forecastFileName\}/, "Forecast Import names the current editable FY-quarter template without enforcing it as an upload restriction");
assert.match(recordsPage, /previewConsumptionForecastWide\(file\)[\s\S]*applyConsumptionForecastWide\(pendingForecastImport\.file, pendingForecastImport\.preview\.etag\)/, "Forecast Import enforces Preview then ETag-guarded Apply with the retained file");
assert.match(recordsPage, /Blank no-op[\s\S]*Explicit zero/, "Forecast preview exposes blank no-op and explicit-zero semantics");
assert.match(recordsPage, /Exact Plan[\s\S]*Forecast-only \/ Plan unassigned/, "Forecast preview keeps plan assignment semantics without historical replay blocking");
assert.match(styles, /\.consumption-pillar-selector button \{[^}]*height: 2\.25rem;[^}]*min-height: 2\.25rem;[\s\S]*\.consumption-range-bar select[^}]*height: 2\.25rem;[^}]*min-height: 2\.25rem;/, "Pillar buttons and adjacent quarter controls share an exact responsive height");
assert.match(recordsPage, /consumption-record-search__submit[\s\S]*aria-label="Apply filters and search"[\s\S]*onClick=\{\(\) => void submitRecordsQuery\(\)\}/, "filter-and-search uses an input-adjacent native icon button");
assert.doesNotMatch(recordsPage, /class=\{?`?consumption-range-apply/,
  "Consumption removes the standalone Apply button");
assert.match(styles, /\.consumption-import-actions \{[^}]*display: flex;/, "Export and Import keep Redwood spacing and wrap instead of touching or overflowing");
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.consumption-import-actions \{[^}]*align-self: stretch;[^}]*justify-content: flex-start;[^}]*width: 100%;/, "narrow Consumption Records layouts keep the action group visible and naturally wrapped");
assert.match(recordsPage, /saveConsumptionForecasts[\s\S]*ConsumptionConflictError[\s\S]*Saved baseline[\s\S]*My draft[\s\S]*Current server/, "Forecast Save and HTTP 409 comparison remain intact");
assert.doesNotMatch(recordsPage, /\b(?:beginForecastEdit|updateForecast)\b/, "Consumption Records expose no Plan-level Forecast editor");
assert.match(recordsPage, /onDblClick[\s\S]*beginControlEdit/, "double click enters Account-level Forecast editing");
assert.match(recordsPage, /selectForecastEditor[\s\S]*requestAnimationFrame[\s\S]*\.focus\(\)[\s\S]*\.select\(\)/, "double-click Forecast editing focuses the mounted input and selects its complete numeric value after pointer default handling");
assert.match(recordsPage, /ref=\{selectForecastEditor\(`\$\{forecastEditor\.account\}:\$\{forecastEditor\.month\}`\)\}/, "each editable Forecast input binds whole-value selection to its stable Account-period key");
assert.match(recordsPage, /<label><span>Total<\/span><input type="text" inputMode="decimal" value=\{forecastEditor\.total\}[\s\S]*ref=\{selectForecastEditor\(`\$\{forecastEditor\.account\}:\$\{forecastEditor\.month\}`\)\}/, "Forecast composition editor exposes a measurable whole-text selection range on its Total input");
assert.match(recordsPage, /const validForecastKInput[\s\S]*\\d\{1,2\}[\s\S]*value\.trim/, "Forecast composition inputs accept non-negative K values with at most two decimals");
assert.match(recordsPage, /applyForecastComposition[\s\S]*parseForecastCompositionK[\s\S]*updateControlForecast/, "Forecast composition apply validates the full composition before updating the Account control total");
assert.match(recordsPage, /<form onSubmit=\{\(event\) => \{ event\.preventDefault\(\); applyForecastComposition\(\); \}\}[\s\S]*event\.key === "Escape"[\s\S]*cancelForecastComposition/, "submit applies and Escape cancels the Forecast composition popover");
assert.match(recordsPage, /hasDraftChanges[\s\S]*isSaving \? "Saving…" : "Save"[\s\S]*>Cancel</, "Save and Cancel remain draft-scoped");
assert.match(recordsPage, /onNavigationGuardChange[\s\S]*window\.confirm\(/, "unsaved Forecast changes retain route protection");
assert.match(recordsPage, /id="consumptionFromQuarter"[\s\S]*id="consumptionToQuarter"[\s\S]*isConsumptionQuarterRangeValid/, "Data keeps its independent Quarter range");
assert.match(recordsPage, /expandConsumptionQuarterOptions[\s\S]*setAvailableQuarterOptions/, "every represented Fiscal Year exposes Q1 through Q4 in the mobile-compatible native selects");
assert.match(recordsPage, /selectPillar[\s\S]*runRecordsQuery\(\{ fromQuarter, toQuarter, search: appliedSearch \}, pillar\)/, "pillar changes immediately retain the applied From and To range");
assert.match(recordsPage, /selectQuarterRange[\s\S]*setFromQuarter\(nextFromQuarter\)[\s\S]*setToQuarter\(nextToQuarter\)[\s\S]*isConsumptionQuarterRangeValid[\s\S]*runRecordsQuery/,
  "each valid From or To selection applies immediately while invalid ranges remain local for validation");
assert.match(recordsPage, /consumption-range-bar[\s\S]*consumption-range-pillar[\s\S]*consumption-pillar-selector[\s\S]*consumptionFromQuarter/, "Pillar is immediately before the From Quarter control in the compact range bar");
assert.match(recordsPage, /filterVisibleConsumptionPlans\(group\.plans, page\.fromQuarter, page\.toQuarter\)/, "the client defensively applies the same selected-range nonzero Actual or Forecast-presence rule as the backend");
assert.match(recordsPage, /submitRecordsQuery[\s\S]*runRecordsQuery\(\{ fromQuarter, toQuarter, search: draftSearch\.trim\(\) \}\)/, "search icon submits the current quarter and search query atomically");
assert.match(recordsPage, /const \[draftSearch, setDraftSearch\][\s\S]*const \[appliedSearch, setAppliedSearch\]/, "Consumption Records separates draft and applied search state");
assert.match(recordsPage, /fetchConsumptionRecords\(\{[\s\S]*search:\s*requestQuery\.search/, "only the captured applied query reaches the records API");
assert.doesNotMatch(recordsPage, /debouncedRecordSearch|setTimeout[\s\S]*recordSearch/, "typing does not debounce into a records fetch");
assert.match(recordsPage, /onCompositionStart[\s\S]*searchComposingRef\.current = true[\s\S]*onCompositionEnd[\s\S]*searchComposingRef\.current = false/, "search tracks Korean IME composition synchronously");
assert.match(recordsPage, /submitRecordsQuery[\s\S]*fromQuarter[\s\S]*toQuarter[\s\S]*draftSearch\.trim\(\)[\s\S]*runRecordsQuery\(/, "search icon submits quarter and search atomically");
assert.match(recordsPage, /event\.key === "Enter"[\s\S]*!event\.isComposing[\s\S]*!searchComposingRef\.current[\s\S]*submitRecordsQuery/, "Enter submits the same atomic records query after IME composition, including same-render-tick composition end");
assert.match(recordsPage, /activeRecordsQueryRef\.current\?\.key === requestKey[\s\S]*activeRecordsQueryRef\.current = \{ key: requestKey, generation: actionGeneration, search: requestQuery\.search \}/,
  "a synchronous active-query key prevents duplicate same-render-tick requests");
assert.match(recordsPage, /const clearingSearch = requestQuery\.search === ""[\s\S]*appliedSearchRef\.current !== "" \|\| Boolean\(activeRecordsQueryRef\.current\?\.search\)[\s\S]*\(!clearingSearch && \(hasDraftChanges \|\| forecastEditor \|\| searchComposingRef\.current\)\)/,
  "native clear bypasses dirty and composition UI state without weakening ordinary query guards");
assert.match(recordsPage, /onInput=\{\(event\) => \{[\s\S]*if \(!value && \(appliedSearchRef\.current \|\| activeRecordsQueryRef\.current\?\.search\)\)[\s\S]*runRecordsQuery\(\{ fromQuarter, toQuarter, search: "" \}, selectedPillar\)/,
  "native clear immediately reapplies the current quarter and pillar, including while the first search is in flight");
assert.match(recordsPage, /activeRecordsQueryRef\.current = \{ key: requestKey, generation: actionGeneration, search: requestQuery\.search \}[\s\S]*loadRecordsPage\(false, requestQuery, pillar, "query", clearingSearch\)/,
  "Consumption records the in-flight search synchronously and marks clear refreshes for draft preservation");
assert.match(recordsPage, /mergeRefreshedControlsWithDrafts\(refreshedControls, savedControlTotalsRef\.current, draftControlTotalsRef\.current\)/,
  "Consumption clear refresh merges refreshed results without wiping unsaved Forecast controls");
assert.match(recordsPage, /initialConsumptionRecordsBatchSize\(window\.innerHeight\)/, "the initial records request is sized to the viewport");
assert.match(recordsPage, /type RecordsLoadingPhase = "idle" \| "initial" \| "query" \| "append"[\s\S]*blockingRecordsLoading = recordsLoadingPhase === "initial"/, "only initial records loading replaces the page shell");
assert.match(recordsPage, /recordsLoadingPhase === "query"[\s\S]*consumption-results-refresh[\s\S]*Refreshing results/, "replacement queries retain the Records header and controls while the results region refreshes");
assert.match(recordsPage, /if \(append && \(recordsLoadingRef\.current[\s\S]*generation !== recordsRequestGeneration\.current/, "new search or sort requests supersede in-flight replacements while stale results are ignored");
assert.match(recordsPage, /const requestQuery(?:: RecordsQuery)? = append \? recordsQueryRef\.current[\s\S]*offset: append \? recordsNextOffset : 0/, "append requests retain the last applied filter snapshot instead of unsubmitted draft controls");
const recordsFetchIndex = recordsPage.indexOf("const page = await fetchConsumptionRecords");
const recordsFreshnessIndex = recordsPage.indexOf("if (generation !== recordsRequestGeneration.current)");
const recordsQueryCommitIndex = recordsPage.indexOf("recordsQueryRef.current = requestQuery");
assert.ok(recordsFetchIndex >= 0 && recordsFreshnessIndex > recordsFetchIndex && recordsQueryCommitIndex > recordsFreshnessIndex, "a replacement query becomes append-authoritative only after its response succeeds and remains current");
assert.match(recordsPage, /if \(!append\) \{\s*recordsQueryRef\.current = requestQuery;\s*setFromQuarter\(page\.fromQuarter\);\s*setToQuarter\(page\.toQuarter\);\s*setRangeInitialized\(true\);\s*setRangeTouched\(false\);\s*\}/, "append responses never overwrite query controls that remain editable during background loading");
assert.match(recordsPage, /shouldRestartConsumptionRecordsPage\(append, apiEtag, page\.etag\)[\s\S]*loadRecordsPage\(false, requestQuery, requestQuery\.pillar, loadingPhase, preserveDrafts\)/, "ETag changes restart paging with the same applied query and draft-preservation mode before snapshots can be mixed");
assert.match(recordsPage, /offset:\s*append \? recordsNextOffset : 0[\s\S]*sort:\s*"ACCOUNT"[\s\S]*direction:\s*"ASC"/, "records paging uses a stable server order without user-facing sort controls");
assert.match(recordsPage, /new Map[\s\S]*page\.accountGroups[\s\S]*setSavedPlans[\s\S]*setDraftPlans/, "loaded account pages append with account and plan deduplication");
assert.match(recordsPage, /id="consumptionRecordSearch"[\s\S]*value=\{draftSearch\}[\s\S]*disabled=\{blockingRecordsLoading\}/, "search stays available for native clear during dirty or background-query states and blocks only initial replacement loading");
assert.match(recordsPage, /id="consumptionFromQuarter"[\s\S]*disabled=\{rangeLoading \|\| blockingRecordsLoading \|\| hasDraftChanges\}[\s\S]*id="consumptionToQuarter"[\s\S]*disabled=\{rangeLoading \|\| blockingRecordsLoading \|\| hasDraftChanges\}/, "From and To controls do not change enabled state during background append loading");
assert.match(recordsPage, /consumption-record-search__submit[\s\S]*disabled=\{!isConsumptionQuarterRangeValid\(fromQuarter, toQuarter\) \|\| rangeLoading \|\| blockingRecordsLoading/, "search icon does not change enabled or opacity state during background append loading");
assert.match(recordsPage, /useEffect\(\(\) => \{[\s\S]*new IntersectionObserver[\s\S]*\}, \{ root:[\s\S]*\}, \[recordsHasMore, hasDraftChanges\]\);/, "pagination observer is not recreated for offsets, loading transitions, ETags, or draft filter changes");
assert.match(recordsPage, /recordsHasMore[\s\S]*loadRecordsPage\(true\)/, "near-bottom scroll and Load More request the next server page");
assert.match(recordsPage, /IntersectionObserver[\s\S]*loadMoreRecordsRef\.current\(\)[\s\S]*root:\s*tableScrollRef\.current/, "the actual table scroll root observes a paging sentinel through the latest append callback");
assert.match(recordsPage, /data-records-sentinel/, "the table scroll region owns the paging sentinel");
assert.match(recordsPage, /Showing \{loadedAccountCount\} of \{recordsTotalAccounts\} accounts/, "server total account metadata drives the loading summary");
assert.match(recordsPage, /Showing \{loadedAccountCount\} of \{recordsTotalAccounts\} accounts · \{visiblePlans\.length\} plans/, "the footer distinguishes account pages from visible CSV Detail plans");
assert.match(recordsPage, /Loading Consumption Records…[\s\S]*Load More[\s\S]*All accounts loaded\./, "loading, manual fallback, and final-page states remain explicit");
assert.match(recordsPage, /No Consumption Records match the selected range and filters\./, "empty filtered results remain explicit");
assert.match(recordsPage, /group\.plans\.length > 0[\s\S]*page\.accountForecasts\.some[\s\S]*pageForecastControls\.some/, "forecast-only Plan-unassigned accounts survive pagination without requiring Plan rows");
assert.doesNotMatch(recordsPage, /Page \{[^}]*\}|page-number|rowsPerPage/, "page-number pagination is absent");
assert.match(recordsPage, /renderedRecordAccounts\.map/, "the table renders the incremental account collection");
assert.doesNotMatch(recordsPage, /defaultExpandedRecordAccounts/, "initial and appended Account groups are never expanded merely because they have child Plans");
assert.match(recordsPage, /searchExpandedRecordAccounts[\s\S]*!query[\s\S]*countUniqueConsumptionPlans\(group\.plans\) > 1[\s\S]*!group\.account\.toLowerCase\(\)\.includes\(query\)[\s\S]*group\.plans\.some/, "only a Plan-level search match auto-expands the necessary multi-Plan Account");
assert.match(recordsPage, /if \(!append\) return searchExpanded[\s\S]*const next = new Set\(current\)[\s\S]*searchExpanded\.forEach/, "new queries reset expansion while appended pages preserve user toggles and expand only required Plan-search matches");
assert.match(recordsPage, /editablePeriodIds\.has\(month\)/, "only backend-declared periods are editable");
assert.match(recordsPage, /displayQuarterOrder\.flatMap/, "Data columns follow backend display order");
assert.match(recordsPage, /const visiblePlanCount = countUniqueConsumptionPlans\(account\.plans\)[\s\S]*const singlePlan = visiblePlanCount === 1 \? account\.plans\[0\] : null[\s\S]*const expandable = visiblePlanCount > 1[\s\S]*class="consumption-account-toggle"[\s\S]*aria-expanded=\{expanded\}[\s\S]*toggleAccount\(account\.customer\)[\s\S]*singlePlan \?[\s\S]*ConsumptionDataCenter plan=\{singlePlan\}[\s\S]*Forecast-only \/ Plan unassigned[\s\S]*expandable && expanded && account\.plans\.map/, "zero, one, and multiple unique visible Plans render as Forecast-only, inline identity, and disclosure detail respectively");
assert.match(recordsPage, /renderQuarterCells\(account, true\)[\s\S]*renderQuarterCells\(plan, false\)/, "all Account rows own Forecast editing while Plan rows remain read-only Actual detail");
assert.doesNotMatch(recordsPage, /· Actual ·/, "Plan metadata omits the redundant Actual label while month headers retain Actual and Forecast status");
assert.match(recordsPage, /renderedRecordAccounts\.length === 0[\s\S]*consumption-empty-state[\s\S]*No Consumption Records match/, "a fully filtered or unmatched query uses the existing Consumption empty-state treatment");
assert.match(recordsPage, /const adoptWorkspace[\s\S]*filterVisibleConsumptionPlans\(workspace\.plans, workspace\.fromQuarter, workspace\.toQuarter\)[\s\S]*recordGroupMatchesSearch[\s\S]*setRecordAccountNames\(adoptedAccountNames\)[\s\S]*setRecordsTotalAccounts\(adoptedAccountNames\.length\)[\s\S]*setRecordsHasMore\(false\)/, "workspace adoption rebuilds filtered Account names and Footer metadata instead of retaining stale paged rows");
assert.match(recordsPage, /const controlUpdates = accounts\.flatMap/, "manual Forecast save includes every Account, including one or zero visible Plans");
assert.match(recordsPage, /saveConsumptionForecasts\(apiEtag, controlUpdates, selectedPillar\)/, "Forecast API integration sends Account-level updates and validates the selected-pillar response");
assert.match(recordsPage, /const editable = selectedPillar !== "ALL" && editablePeriodIds\.has\(month\) && !mtd;[\s\S]*const canEditControl = canWrite && editable/, "every backend-declared DP or OCI Forecast cell is editable outside MTD for authorized writers regardless of an existing value while ALL remains read-only");
assert.match(recordsPage, /const editable = selectedPillar !== "ALL"/, "ALL is derived from entered pillar values and never directly entered without a standing helper note");
assert.doesNotMatch(recordsPage, /ALL Forecast is read-only and sums entered Pillar values; missing values count as zero/, "derived ALL guidance is not repeated in the main content");
assert.doesNotMatch(recordsPage, /incomplete \? "INCOMPLETE"/, "Forecast status words are not rendered as currency values");
assert.doesNotMatch(recordsPage, />\{summary\.status\}<\//, "quarter status words are not rendered inside money cells");
assert.doesNotMatch(recordsPage, /missingForecastLabel|Forecast membership unavailable|consumption-fast-tooltip|data-tooltip=\{missingForecastLabel\}/, "Forecast membership warnings and their icons are removed");
assert.doesNotMatch(recordsPage, /<small>ACCOUNT · \{selectedPillar === "DP" \? "DP" : "OCI-OTHER"\}<\/small>/, "Account Forecast cells omit redundant Pillar helper text");
assert.match(recordsPage, /currency\.format\(summary\.total \?\? 0\)[\s\S]*summary\.preQGap === null \? "—"/, "quarter totals render zero for missing values while a missing prior quarter keeps Pre-Q Gap unavailable");
assert.match(recordsPage, /Actual values are read-only and are never imported by Forecast Import[\s\S]*referenceNotice \?\? ""/, "Forecast preview always labels Actual reference columns as read-only even without a backend notice");
assert.match(recordsPage, /Reduction \$\{composition\.reductionStatus === "UNAVAILABLE_PREVIOUS_PERIOD" \? "비교 기준 없음"[\s\S]*composition\.reductionAmount[\s\S]*previous Total minus current Total[\s\S]*Previous source/, "Consumption Records Forecast tooltip distinguishes a missing comparison basis from a calculated zero Reduction");
assert.doesNotMatch(recordsPage, /this legacy scalar Forecast does not include movement components/, "normal legacy scalar Forecasts do not emit a repeated Consumption Records warning");
assert.match(recordsPage, /composition\.compositionStatus === "UNCLASSIFIED"[\s\S]*return null/, "legacy scalar Forecast composition is intentionally omitted from Consumption Records");
assert.match(recordsPage, /compositionStatus === "UNAVAILABLE"[\s\S]*Forecast composition unavailable/, "actual missing Forecast composition still has an explicit unavailable message");
assert.match(recordsPage, /Raw[\s\S]*Canonical T \| N \| E[\s\S]*Reduction[\s\S]*Previous source[\s\S]*Status/, "Forecast Import Preview keeps the remaining derivation status auditable");
assert.doesNotMatch(recordsPage, /`Base \$\{composition\.baseAmount|<dt>Base<\/dt>|<th>Base<\/th>|change\.baseAmount/, "Base stays in the internal API model but is hidden from the Forecast tooltip and Import Preview");
assert.match(recordsPage, /preview\.canonicalPeriods/, "Forecast Preview renders backend-provided canonical periods instead of deriving an allowed window from the browser clock");
assert.match(recordsPage, /setDraftPlans\(clonePlans\(savedPlans\)\)/, "Cancel restores the authoritative saved snapshot");
assert.match(recordsPage, /setDraftControlTotals\(cloneControlTotals\(savedControlTotals\)\)/, "Cancel also restores missing-versus-zero Multiple controls");
assert.match(recordsPage, /hasControlDraftChanges[\s\S]*hasDraftChanges[\s\S]*submitRecordsQuery[\s\S]*hasDraftChanges/, "Control-only drafts share navigation and explicit query submission guards");
assert.match(recordsPage, /const updateControlForecast[\s\S]*?recordsRequestGeneration\.current\+\+[\s\S]*?setRecordsLoadingPhase\("idle"\)/, "Control typing invalidates an in-flight Records replacement before it can erase the draft");
assert.match(recordsPage, /const updateControlForecast[\s\S]*?recordsLoadingRef\.current = false/, "Control typing releases a stale append loading latch");
assert.match(recordsPage, /Account Forecast[\s\S]*accountForecastControls\(error\.current\)/, "HTTP 409 comparison includes Account Forecast saved, draft, and current server values");
assert.match(recordsPage, /<th>Account \/ Month<\/th>/, "Forecast conflict comparison is labelled at Account scope");
assert.doesNotMatch(recordsPage, /<th>Plan \/ Month<\/th>/, "Forecast conflict comparison no longer implies Plan-level editing");
assert.match(apiSource, /accountForecasts[\s\S]*forecastVariances/, "the client decodes Account Forecast and Final Forecast variance DTOs");
assert.doesNotMatch(apiSource, /seedForecastMonths\s*\(/, "the API client never manufactures Forecast values");

// Redwood table behavior and responsive containment.
assert.doesNotMatch(recordsPage, /recordSort|recordDirection|consumption-record-controls|tableExpanded/, "sort, direction, helper controls, and table collapse are removed");
assert.match(styles, /\.consumption-page\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*clip/, "Consumption Records removes page-level horizontal overflow");
assert.match(styles, /\.consumption-table-content\s*\{[^}]*grid-template-rows:\s*minmax\(18rem, 1fr\) 3\.75rem[\s\S]*\.consumption-table-scroll\s*\{[^}]*height:\s*auto[^}]*min-height:\s*18rem[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*auto/, "the table fills the card while owning Quarter\/Month overflow and preserving the 18rem accessibility minimum");
assert.match(styles, /@media \(min-width:\s*64rem\)[\s\S]*\.kpi-shell:has\(\.consumption-page\)[^}]*height:\s*100dvh[^}]*overflow:\s*hidden[\s\S]*\.kpi-shell__body:has\(\.consumption-page\)[^}]*min-height:\s*0[^}]*overflow:\s*hidden[\s\S]*\.kpi-content:has\(\.consumption-page\)[^}]*min-height:\s*0[^}]*overflow:\s*hidden/, "every desktop-height viewport confines Consumption Records while narrower mobile/high-zoom layouts retain document scrolling");
assert.match(styles, /\/\* The popup replaces the former rail[^\n]*\*\/[\s\S]*\.kpi-shell__body,[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/, "popup navigation preserves the shell grid so Consumption Records keeps an internally scrollable viewport and can trigger incremental loading");
assert.match(styles, /\.consumption-page[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)[^}]*min-height:\s*0[\s\S]*\.consumption-table-panel[^}]*min-height:\s*0[^}]*overflow:\s*hidden[\s\S]*\.consumption-table-scroll[^}]*min-height:\s*0[^}]*min-width:\s*0[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*auto/, "desktop card, table, and Footer share remaining height while only the table data region owns scrolling");
assert.match(styles, /\.consumption-load-more\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/, "the Records footer remains visible at the table end");
assert.match(staticServer, /bundle\.js[\s\S]*Cache-Control[\s\S]*no-cache, max-age=0, must-revalidate/, "SPA routes and the unversioned production bundle revalidate after deployment");
assert.doesNotMatch(recordsPage + staticServer, /serviceWorker|navigator\.serviceWorker/, "the production path has no Service Worker that can retain an obsolete Records bundle");
assert.doesNotMatch(styles, /\.consumption-table-scroll\s*\{[^}]*max-height:/, "200% zoom does not clamp the required 18rem minimum table viewport");
assert.match(styles, /\.consumption-table th, \.consumption-table td\s*\{[^}]*height:\s*2\.75rem[^}]*padding:\s*\.3rem \.48rem/, "compact Redwood rows preserve a 44px minimum cell height");
assert.match(styles, /\.consumption-account-column\s*\{[^}]*left:\s*0[^}]*position:\s*sticky/, "Account column remains sticky");
assert.match(styles, /\.consumption-table thead tr:first-child th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/, "first header row remains sticky");
assert.match(styles, /\.consumption-table thead tr:nth-child\(2\) th\s*\{[^}]*position:\s*sticky[^}]*top:\s*2\.6rem/, "second compact header row remains sticky");
assert.match(styles, /\.consumption-insights-page[\s\S]*\.consumption-insights-alert-trend-grid[\s\S]*\.consumption-insights-contribution-list/, "Insights styling is page-scoped");

// Approved Consumption follow-up: clearer visual regions, accessible alerts, stable records and zoom-safe navigation.
assert.match(insightsPage, /consumption-insights-fy-total[\s\S]*data=\{fiscalTotalsChart\}[\s\S]*consumption-insights-totals-divider[\s\S]*consumption-insights-quarter-totals[\s\S]*data=\{quarterTotalsChart\}/, "FY and Quarter totals use distinct stacked visual regions separated by a divider");
assert.match(insightsPage, /analysis\.quarters\.flatMap/, "mixed quarter consumption remains sourced from effective fact-cell quarter totals");
assert.match(insightsPage, /analysis\.movementBridge\.flatMap/, "Forecast movement composition remains a separate data source");
assert.match(insightsPage, /seriesId: "New"/);
assert.match(insightsPage, /seriesId: "Expansion"/);
assert.match(insightsPage, /seriesId: "Reduction"/);
assert.match(insightsPage, /value: -toK\(point\.reductionAmount\)/, "Reduction is converted to K and rendered below zero exactly once at the visual boundary");
assert.doesNotMatch(insightsPage, /compositionStatus !== "CLASSIFIED"/, "quarter-level classification status does not suppress independently stored Forecast components");
assert.match(insightsPage, /point\.includedForecastPeriods\.join/, "movement labels expose only included Forecast periods");
assert.doesNotMatch(insightsPage, /run[- ]?rate/i, "movement labels do not invent run-rate periods");
assert.match(insightsPage, /onojItemDrill=\{selectMovement\}/, "movement bars drill to Account detail");
assert.match(insightsPage, /Array\.isArray\(detail\.group\)/, "JET item drill accepts the public string or string-array group contract");
assert.match(insightsPage, /consumption-signal-badges[\s\S]*consumption-signal-type[\s\S]*aria-hidden="true"[\s\S]*consumption-signal-grade/, "alert type and grade are separate accessible icon and text badges");
assert.match(styles, /\.consumption-insights-alert-trend-grid[^}]*align-items:\s*stretch[\s\S]*\.consumption-insights-alert-trend \.consumption-signal-inbox[^}]*height:\s*24rem[^}]*overflow-y:\s*auto[\s\S]*\.consumption-insights-linked-trend[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto[^}]*height:\s*24rem[\s\S]*\.consumption-insights-actual-chart[^}]*height:\s*100%[^}]*min-height:\s*15rem/, "alert and trend panels compact naturally after duplicate-list removal while preserving equal height and chart space");
assert.match(styles, /\.consumption-insights-alert-trend \.consumption-signal-metrics > strong[^}]*font-size:\s*1\.2rem[\s\S]*\.consumption-insights-alert-trend \.consumption-signal-metrics > small[^}]*font-size:\s*\.82rem/, "alert amount, delta, and ratio are visually prominent");
assert.match(insightsPage, /aria-label=\{`Change type[^`]+`\}[\s\S]*aria-label=\{`Severity[^`]+`\}/, "Alert type and severity badges expose explicit accessible labels");
assert.match(styles, /\.consumption-signal-type\.is-above-usual[^}]*#fde6df[\s\S]*\.consumption-signal-type\.is-below-usual[^}]*#e4f0f8[\s\S]*\.consumption-signal-type\.is-new-usage[^}]*#eee7f6/, "Alert type tones follow above, below, and new usage semantics");
assert.match(insightsPage, /plan\.percentage\.toFixed\(1\)\}% of \{percentageContext\}[\s\S]*consumption-insights-plan-track[\s\S]*width:\$\{Math\.max\(0, Math\.min\(100, plan\.percentage\)\)\}%/, "Plan Contribution uses each Plan percentage on a common group-wide 0–100 track");
assert.match(styles, /\.consumption-insights-contribution-list, \.consumption-insights-plan-list[^}]*max-height:\s*25rem[^}]*overflow-y:\s*auto/, "Account and Plan Contribution use equal internal scrolling regions");
assert.match(recordsPage, /class="consumption-records-loading" role="status" aria-live="polite"[\s\S]*Loading Consumption Records/, "Records footer exposes a visible polite loading status");
assert.match(recordsPage, /<div class=\{`consumption-load-more[^>]*>[\s\S]*Showing \{loadedAccountCount\} of \{recordsTotalAccounts\} accounts/, "Records always reserves its Load More and Showing footer");
assert.match(styles, /\.consumption-range-bar select, \.consumption-range-bar input[^}]*height:\s*2\.25rem[^}]*padding:[^;}]+[\s\S]*\.consumption-range-apply[^}]*height:\s*2\.25rem/, "range, search, and stable native Apply controls share height and padding rhythm");
assert.doesNotMatch(recordsPage, /consumption-range-apply--initializing/, "Records uses the full Accounts & Workloads loader instead of flashing an initializing Apply control");
assert.match(styles, /\.consumption-range-apply:hover,\s*\.consumption-range-apply:active,\s*\.consumption-range-apply:focus-visible,\s*\.consumption-range-apply:disabled\s*\{[^}]*background:\s*var\(--kpi-brand\)[^}]*border-color:\s*var\(--kpi-brand\)/, "Apply keeps one brand color through hover, touch, focus, disabled, and completion transitions");
assert.match(styles, /\.consumption-range-apply:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--oj-core-focus-border-color, #0572ce\)[^}]*outline-offset:\s*2px/, "Apply retains a distinct accessible focus ring without replacing its fill color");
assert.doesNotMatch(styles, /\.consumption-range-apply[^\n]*#194f63/, "Apply never changes permanently to the legacy teal interaction color");
assert.match(recordsPage, /if\(viewPillar==="ALL"\)[\s\S]*else\{[\s\S]*setSavedPlans\(\[\]\)[\s\S]*setRecordsTotalAccounts\(0\)[\s\S]*setDataMode\("error"\)/, "a committed import followed by typed refresh failure clears stale rows and marks the view unavailable");
assert.match(styles, /\.consumption-load-more[^}]*(?:^|;)\s*height:\s*3\.75rem/m, "Records footer has a fixed placeholder height during replacement loading");
assert.match(styles, /\.consumption-table-panel\s*\{[^}]*display:\s*flex[^}]*min-height:\s*max\(24rem, calc\(100dvh - 15rem\)\)[\s\S]*\.consumption-load-more[^}]*align-self:\s*end[^}]*height:\s*3\.75rem/, "the Records table card fills the remaining viewport and keeps its 60px footer against the card bottom");
assert.match(styles, /\.consumption-range-bar\s*\{[^}]*padding:\s*\.5rem \.75rem[^}]*row-gap:\s*\.5rem/, "the compact Records range bar has equal vertical padding and row spacing");
assert.match(styles, /\.consumption-insights-alert-trend \.consumption-signal-main > span:not\(\.consumption-signal-badges\)[^}]*font-size:\s*\.88rem[\s\S]*\.consumption-insights-linked-trend > div > p[^}]*font-size:\s*1rem[\s\S]*\.consumption-insights-contribution-list button > span[^}]*font-size:\s*1rem[\s\S]*\.consumption-insights-plan-list article small b[^}]*font-size:\s*\.9rem/, "alert workload, trend context, Account, Workload, and Plan labels use prominent typography");
assert.match(styles, /\.kpi-side-nav,[\s\S]*\.kpi-side-nav\.is-open[^}]*height:\s*calc\(100dvh[^}]*env\(safe-area-inset-bottom\)[^}]*top:\s*calc\(5rem \+ env\(safe-area-inset-top\)\)/, "mobile side navigation starts below the header and remains reachable with safe-area-aware dynamic height");

// Export follow-up: modern CSS colors must be handled inside the capture engine and progress is explicit.
assert.match(insightsPage, /import html2canvasPro = require\("html2canvas-pro"\)/, "the export-only renderer supports modern CSS color() values without changing the live design");
assert.match(insightsPage, /html2canvasModule\.default \?\? html2canvasModule\.html2canvas/, "the renderer is resolved from its AMD module shape");
assert.match(insightsPage, /<oj-progress-circle[^>]*size="sm"[^>]*><\/oj-progress-circle>[\s\S]*PNG 생성 중…/, "PNG export shows an immediate spinner and progress label");
assert.match(insightsPage, /<oj-progress-circle[^>]*size="sm"[^>]*><\/oj-progress-circle>[\s\S]*PDF 생성 중…/, "PDF export shows an immediate spinner and progress label");
assert.match(insightsPage, /disabled=\{loading \|\| !!exporting\}/, "both export buttons reject duplicate clicks while either export is active");
assert.match(insightsPage, /finally\s*\{[\s\S]*setExporting\(""\)/, "export controls recover after both success and failure");
assert.match(styles, /\.consumption-insights-linked-trend h3\s*\{[^}]*font-size:\s*1rem[^}]*font-weight:\s*700/, "ACTUAL Trend matches the card-heading hierarchy rather than inheriting an oversized title");

console.log("consumptionUiContract tests passed");
