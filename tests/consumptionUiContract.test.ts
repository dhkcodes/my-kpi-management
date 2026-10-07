import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recordsPage = readFileSync("src/components/content/ConsumptionRecordsPage.tsx", "utf8");
const insightsPage = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const attainmentPage = readFileSync("src/components/content/AttainmentPage.tsx", "utf8");
const forecastActualPage = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const forecastActualSort = readFileSync("src/data/forecastActualSort.ts", "utf8");
const messageBanner = readFileSync("src/components/content/ConsumptionMessageBanner.tsx", "utf8");
const sharedMessageBanner = readFileSync("src/components/content/AppMessageBanner.tsx", "utf8");
const apiSource = readFileSync("src/data/consumptionApi.ts", "utf8");
const content = readFileSync("src/components/content/index.tsx", "utf8");
const spreadsheetPage = readFileSync("src/components/content/KpiSpreadsheetPage.tsx", "utf8");
const pageNavigation = readFileSync("src/components/PageNavigationToolbar.tsx", "utf8");
const homeConsumption = readFileSync("src/components/content/HomeConsumptionOverview.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");
const mtdDate = readFileSync("src/data/mtdDate.ts", "utf8");
const pageShell = readFileSync("src/components/common/PageShell.tsx", "utf8");
const doubleActivation = readFileSync("src/components/common/doubleActivation.ts", "utf8");
const appBusyOverlay = readFileSync("src/components/AppBusyOverlay.tsx", "utf8");
const app = readFileSync("src/components/app.tsx", "utf8");

assert.match(pageShell, /export function PageShell/, "the reusable page shell is exported independently from Consumption Records");
assert.match(pageShell, /breadcrumb[\s\S]*actions[\s\S]*filters[\s\S]*children/, "the common shell exposes structural slots instead of Records-specific content");
assert.doesNotMatch(recordsPage, /eyebrow="Consumption \/ Attainment"|CONSUMPTION \/ ATTAINMENT/i,
  "Records omits the redundant Consumption / Attainment eyebrow at the call site");
assert.match(pageShell, /headingSpacing\?: "default" \| "compact"/,
  "the shared shell exposes a generic compact heading-spacing contract rather than Records-specific text logic");
assert.match(recordsPage, /headingSpacing="compact"/,
  "Records opts into the common compact breadcrumb-to-title spacing");
assert.match(pageShell, /kap-page-shell__masthead[\s\S]*\{breadcrumb\}[\s\S]*kap-page-shell__heading/,
  "breadcrumb and heading share one stable masthead wrapper before, during, and after loading");
assert.match(styles, /\.kap-page-shell__masthead\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:/s);
assert.match(styles, /\.kap-page-shell__masthead\.is-compact\s*\{[^}]*gap:\s*\.1rem/s,
  "the compact spacing is a shared masthead rule without leaving an eyebrow-sized gap");
assert.match(pageShell, /oj-progress-circle/, "the common activity control exposes Oracle JET progress");
assert.match(pageShell, /refreshSlotRef[\s\S]*addEventListener\("click", handleRefreshClick\)[\s\S]*ref=\{refreshSlotRef\}[\s\S]*aria-label="Refresh"[\s\S]*title=\{refreshTitle\}[\s\S]*oj-ux-ico-refresh/,
  "the shared Refresh action binds a physical click listener and exposes the full KST timestamp as a tooltip");
assert.match(pageShell, /compactTimestampButton\?[\s\S]*formatKstTime[\s\S]*Reload[\s\S]*kap-page-activity__separator/,
  "the reusable opt-in compact Refresh control combines JET icon, Reload, separator, and HH:mm:ss");
assert.match(doubleActivation, /pointerType !== "touch"[\s\S]*elapsed[\s\S]*distance/, "double-touch activation rejects mouse input, slow taps, and scrolling gestures");
assert.match(recordsPage, /<PageShell[\s\S]*<PageFilterPanel[\s\S]*className="consumption-range-bar"/, "Records adopts the reusable shell and filter container without changing filter contents");
assert.match(recordsPage, /doubleActivationRef[\s\S]*onPointerDown[\s\S]*onPointerUp/, "editable Forecast cells support reusable mobile double-touch activation");
assert.doesNotMatch(pageShell, /consumption|records/i, "the common shell contains no Consumption Records customization");
assert.match(styles, /\.kap-page-shell__inner\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/, "the common shell keeps breadcrumb, heading, and filters top-aligned instead of stretching grid rows");
assert.match(styles, /\.kap-page-shell__body\s*\{[^}]*flex:\s*1 0 auto/, "unused shell height is assigned to the page body");
assert.match(appBusyOverlay, /data-app-busy-surface[\s\S]*MutationObserver/, "the fallback loader reacts when an inline page loading surface mounts during route entry");
assert.match(pageShell, /kap-page-activity__control-slot[\s\S]*busy \?[\s\S]*oj-progress-circle[\s\S]*:\s*<oj-button/s,
  "one reserved control slot swaps the loading circle for the original Refresh button without layout movement");
assert.match(styles, /\.kap-page-activity__control-slot\s*\{[^}]*min-width:[^}]*width:/s,
  "the circle and Refresh control share a fixed-size slot");
assert.match(appBusyOverlay, /oj-progress-bar[\s\S]*value=\{-1\}/, "route-entry fallback is a thin indeterminate JET bar rather than a floating Loading box");
assert.doesNotMatch(appBusyOverlay, /oj-progress-circle|<span>Loading<\/span>|Processing|role="dialog"|aria-modal/, "route entry has no legacy or renamed full-screen loading box");
assert.match(pageShell, /export function PageDataProgress/, "the shared shell exports the reusable data-area progress indicator");
assert.match(pageShell, /PageDataProgress[\s\S]*if \(!busy\) return null/,
  "the progress element unmounts completely after its shared busy lifecycle ends");
assert.match(pageShell, /activityPosition\?: "heading" \| "custom"/, "pages can choose a custom activity slot without Records-specific logic in the shared shell");
assert.match(recordsPage, /activityPosition="custom"[\s\S]*consumption-records-toolbar-activity[\s\S]*<PageActivity busy=\{recordsActivityBusy\}[\s\S]*onRefresh=\{refreshRecords\}/,
  "Records places the loading-circle/Refresh swap beside its completion time in the data toolbar");
assert.match(recordsPage, /<PageDataProgress busy=\{recordsActivityBusy\}/,
  "Records uses the same busy lifecycle for the non-blocking data-area progress bar");
assert.match(pageShell, /export function formatKstTimestamp[\s\S]*getUTCFullYear[\s\S]*getUTCSeconds/,
  "the shared loading element formats completion timestamps independently of the host timezone");
assert.match(pageShell, /lastCompletedAt\?: Date \| null[\s\S]*kap-page-activity__completed-at/,
  "the shared circle activity owns the reusable last-success timestamp display");
assert.match(recordsPage, /const \[lastDataLoadedAt, setLastDataLoadedAt\] = useState<Date \| null>\(null\)/,
  "Records shows no invented completion time before its first successful load");
assert.match(recordsPage, /setLastDataLoadedAt\(new Date\(\)\)[\s\S]*return page/,
  "Records updates the completion time only on a successfully decoded data response");
assert.match(recordsPage, /<PageActivity busy=\{recordsActivityBusy\}[\s\S]*lastCompletedAt=\{lastDataLoadedAt\}/,
  "the toolbar passes the last successful load time to the shared activity element");
assert.match(apiSource, /apiFetchQuiet[\s\S]*fetchConsumptionRecords[\s\S]*request\([^;]+true\)/,
  "Records queries preserve auth handling without activating the global interaction blocker");
assert.match(recordsPage, /const importActionsDisabled =[^;]+;/,
  "Import availability is derived independently from read-only search activity");
assert.match(recordsPage, /const exportActionsDisabled =[^;]+hasDraftChanges[^;]+;/,
  "exports preserve edit-conflict protection independently of read-only search activity");
assert.doesNotMatch(recordsPage, /const exportActionsDisabled =[^;]+(?:pageBusy|rangeLoading|recordsLoading|recordsReplacementLoading)[^;]+;/,
  "Forecast Export, Actual Export, and Actual Excel Export stay enabled while a search is in flight");
assert.match(recordsPage, /const snapshotAppliedExportQuery = \(\): ExportQuerySnapshot => \{\s*const appliedQuery = recordsQueryRef\.current;/,
  "export clicks snapshot the last successfully applied query instead of draft controls");
assert.match(recordsPage, /const exportActualImportCompatibleCsv = async \(requestQuery: ExportQuerySnapshot\)[\s\S]*exportConsumptionImportCompatibleCsv\(/,
  "the hidden Actual CSV path and its applied-query safety logic remain available without a rendered button");
assert.match(recordsPage, /const snapshotAppliedExportQuery = \(\): ExportQuerySnapshot => \{[\s\S]*recordsQueryRef\.current/,
  "Export clicks derive criteria from the applied records query");
assert.match(recordsPage, /recordsQueryRef\.current = \{[\s\S]*fromQuarter:\s*page\.fromQuarter[\s\S]*toQuarter:\s*page\.toQuarter/,
  "the first successful response stores its resolved quarter range as the last applied query");
assert.doesNotMatch(recordsPage, /const importActionsDisabled =[^;]+rangeLoading[^;]+;/,
  "read-only search does not disable independent import file selection");
assert.match(styles, /\.consumption-table-panel\s*\{[^}]*display:\s*flex[^}]*flex:\s*1 0 auto[^}]*flex-direction:\s*column/s,
  "the records table panel consumes remaining page height for short and empty results");
assert.match(styles, /\.consumption-table-scroll\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:/s,
  "the table viewport, not synthetic rows, absorbs remaining height");
assert.match(styles, /\.consumption-viewport-controls\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s,
  "the progress and horizontal controls are fixed to the visible root content viewport without blocking the page");
assert.match(recordsPage, /getBoundingClientRect\(\)[\s\S]*--consumption-viewport-center-y[\s\S]*data-visible/s,
  "Records computes viewport-fixed coordinates and hides controls unless the table crosses the root viewport center");
assert.match(styles, /\.consumption-scroll-controls button:first-child[^}]*right:[^}]*--consumption-viewport-right[\s\S]*\.consumption-scroll-controls button:last-child[^}]*right:[^}]*--consumption-viewport-right/s,
  "both horizontal controls stay grouped at the visible table's right edge and share its fixed vertical center");
assert.match(styles, /\.consumption-page__header h1,\s*\.kap-page-shell\.consumption-page \.kap-page-shell__heading-copy h1\s*\{[^}]*font-size:\s*1\.65rem[^}]*font-weight:\s*700[^}]*line-height:\s*1\.2/s,
  "Analysis and Records use the same responsive Consumption page-title rule on desktop and mobile");
assert.match(styles, /\.consumption-records-toolbar__left\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding-inline-start:\s*\.5rem;/s,
  "Show MTD keeps its borderless switch and aligns with the table's inner content line");
assert.doesNotMatch(recordsPage, /Account \/ Plan Consumption|consumption-table-plan-count/,
  "the old table title and plan-count summary stay removed");
assert.doesNotMatch(recordsPage, /visible Plans|Account Forecast ·/,
  "account rows omit the secondary plan-count copy");
assert.match(app, /kap-auth-checking__surface[\s\S]*<Footer \/>/,
  "the authentication frame reserves the same root and fixed-footer geometry before the page mounts");
assert.match(styles, /\.kap-auth-checking__surface\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
  "the route-entry surface fills the real content track instead of imposing an oversized viewport minimum");
assert.match(app, /const isKapPageShellRoute = \["consumptionAnalysis", "forecastActual", "consumptionRecords"\]\.includes\(activeRoute\.module\)[\s\S]*kpi-shell\$\{isKapPageShellRoute \? " is-kap-page-shell-route" : ""\}/,
  "Analysis, Forecast vs Actual, and Records share the root fixed-shell route geometry");
assert.match(content, /const isKapPageShellRoute = \["consumptionAnalysis", "forecastActual", "consumptionRecords"\]\.includes\(activeRoute\.module\)[\s\S]*kpi-content\$\{isKapPageShellRoute \? " is-kap-page-shell-route" : ""\}/,
  "all three Consumption PageShell pages share the root content geometry");
assert.match(content, /const showsFiscalYearPanel = !\['profile', 'users', 'consumptionRecords', 'consumptionAnalysis', 'accountsWorkloads', 'accountManagementOverview'\]\.includes\(activeRoute\.module\)/,
  "Analysis uses its compact title-row fiscal-year selector while Records remains exempt from the outer selector");
assert.match(insightsPage, /fiscalYears\.map[\s\S]*titleControls=\{fiscalYearControl\}/,
  "Analysis renders its selected FY beside the title");
assert.match(content, /<ConsumptionAnalysisPage fiscalYear=\{fiscalYear\} fiscalYears=\{fiscalYears\}[\s\S]*onFiscalYearChange=\{onFiscalYearChange\}/,
  "Analysis wires FY selection through the existing route state");
assert.match(content, /isKapPageShellRoute && showsFiscalYearPanel \? " has-fiscal-year-panel"/,
  "PageShell routes that preserve the Fiscal Year selector expose the two-row layout modifier");
assert.match(styles, /\.kpi-content\.is-kap-page-shell-route\.has-fiscal-year-panel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s,
  "the preserved Fiscal Year selector occupies its original row above the viewport-bound PageShell");
assert.match(styles, /\.kap-page-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/s,
  "PageShell constrains its content row so tall mobile pages scroll internally instead of expanding beneath the fixed footer");
assert.match(styles, /\.kpi-shell:has\(\.kap-page-shell\)\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;[^}]*padding-bottom:\s*0;/s,
  "shared KAP pages reserve the real footer row and keep the viewport itself from scrolling");
assert.match(styles, /\.kpi-shell:has\(\.kap-page-shell\) \.kpi-footer\s*\{[^}]*position:\s*static;[^}]*bottom:\s*auto;/s,
  "shared KAP pages keep the footer in the shell grid so its actual responsive height cannot cover page content");
assert.doesNotMatch(styles, /@media \(max-height:\s*520px\)[\s\S]*\.kpi-shell:has\(\.kap-page-shell\)[\s\S]*height:\s*auto;[\s\S]*overflow:\s*visible;/,
  "low landscape viewports retain the fixed shell and root-owned scrolling");
assert.match(styles, /@media \(max-height:\s*520px\)[\s\S]*\.kap-page-shell__heading\s*\{[^}]*flex-direction:\s*column;/,
  "low landscape viewports stack the page title above actions instead of overlapping them");

assert.match(mtdDate, /toISOString\(\)\.slice\(0, 10\)/,
  "all Consumption screens derive the displayed MTD date from the same UTC timestamp basis");
assert.match(recordsPage, /formatMtdAppliedDate\(currentMtdPeriod[^\n]+[\s\S]*MTD 반영 일자 \{currentMtdAppliedDate\}/u,
  "Records shows one compact UTC-basis MTD applied date beside the switch");
assert.match(insightsPage, /role="switch" aria-label="Show MTD"[\s\S]*As of \{mtdAppliedDate\}[\s\S]*PageActivity/u,
  "Analysis places Show MTD at the toolbar left and Reload with KST time at the right");
assert.match(insightsPage, /fetchConsumptionAnalysis\(\{ fiscalYear,[^}]*salesRep: selectedSalesRep,[^}]*pillar: selectedPillar,[^}]*includeMtd \}\)/,
  "FY, Pillar, Sales Rep, Account and MTD remain wired to the Analysis request");
assert.match(insightsPage, /id="consumptionSalesRepContext"[\s\S]*id="consumptionAccountContext"/,
  "Sales Rep and Account filters remain present after the layout move");
assert.match(insightsPage, /downloadCanvas\("png"\)[\s\S]*downloadCanvas\("pdf"\)/,
  "PNG and PDF exports remain present after the layout move");
assert.doesNotMatch(insightsPage, /useEffect\(\(\) => \{[\s\S]{0,900}setSelected(?:Pillar|SalesRep|AccountContext)[\s\S]{0,900}\}, \[fiscalYear\]\)/,
  "FY changes do not reset the current Analysis filter view before reloading the selected year");
assert.match(pageShell, /titleControls\?: ComponentChildren[\s\S]*kap-page-shell__title-row[\s\S]*kap-page-shell__title-controls/,
  "the shared PageShell exposes a backwards-compatible title control slot");
assert.match(styles, /\.consumption-analysis-toolbar \.consumption-records-toolbar-activity\s*\{[^}]*margin-left:\s*auto/s,
  "the Analysis data toolbar keeps Reload aligned on the right of Show MTD");
assert.doesNotMatch(insightsPage, /MTD period \{mtdPeriodLabel\} · as of \{mtdAppliedDate\}/u,
  "Analysis no longer displays the redundant MTD period prefix");
assert.match(forecastActualPage, /As of \{mtdAppliedDate\}/u,
  "Forecast vs Actual shows the same compact English applied date beside the switch without repeating MTD");
assert.doesNotMatch(forecastActualPage, /MTD 반영 일자|반영 일자/u);
assert.doesNotMatch(recordsPage, /MTD 수집 시각|MTD 입력 기준일/u,
  "Records numeric cells contain numbers only");
assert.doesNotMatch(insightsPage, /MTD 수집 시각|MTD 입력 기준일/u,
  "Analysis removes unavailable timestamp prose");

assert.match(insightsPage, /const attentionCoverageLabel = `Finalized Actual \$\{periodRange\(analysis\.periodCoverage\.actualPeriods\)\} \+ opened Forecast periods \$\{periodRange\(analysis\.periodCoverage\.forecastPeriods\)\} · MTD excluded`/,
  "Attention Accounts names the actual and forecast period ranges and keeps MTD excluded");
assert.match(insightsPage, /<strong>Actual \{formatExactKFixed\(account\.actualAmountExact\)\}<\/strong>/,
  "Attention Accounts labels finalized Actual separately");
assert.match(insightsPage, /<OpenForecastLabel \/> \{formatExactKFixed\(account\.forecastAmountExact\)\} · Covered-period expected \{formatExactKFixed\(addExactDecimals\(account\.actualAmountExact, account\.forecastAmountExact\)\)\}/,
  "entered Open Forecast and covered-period expected use separate fields without changing contribution totals");
assert.match(insightsPage, /Forecast missing · Covered-period expected unavailable/,
  "missing Forecast remains distinct and does not fabricate an expected amount");
assert.match(insightsPage, /<OpenForecastLabel \/> \{formatExactKFixed\(account\.forecastAmountExact\)\} \(entered as 0\) · Covered-period expected \{formatExactKFixed\(addExactDecimals\(account\.actualAmountExact, account\.forecastAmountExact\)\)\}/,
  "an explicit zero Open Forecast remains distinct while showing the covered-period sum");
assert.doesNotMatch(insightsPage, /FY Expected/, "partial-year coverage is never presented as a full-year expectation");
assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.consumption-sales-attention-list button\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*\}/,
  "mobile Attention Account rows stack long labels and amounts instead of overlapping");

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
assert.match(recordsPage, /formatConsumptionImportError\(error, "Actual Import", "Consumption Records", "Records"\)/,
  "Actual Import maps denied writes to the Records permission context");
assert.match(recordsPage, /formatConsumptionImportError\(error, "Forecast preview", "Consumption Attainment", "Attainment"\)/,
  "Forecast Preview maps denied writes to the Attainment permission context");
assert.match(recordsPage, /formatConsumptionImportError\(error, "Forecast apply", "Consumption Attainment", "Attainment"\)/,
  "Forecast Apply maps denied writes to the Attainment permission context");
assert.match(recordsPage, /error\.status === 403 && error\.code === "MENU_ACCESS_DENIED"[\s\S]*return `\$\{operation\}에 실패했습니다\. \$\{workspaceLabel\} 쓰기 권한이 없습니다\. 관리자에게 \$\{permissionLabel\} WRITE 권한을 요청해 주세요\.`/,
  "only MENU_ACCESS_DENIED is presented as an operation-specific write permission failure");
assert.match(recordsPage, /if \(error\.status === 403\) return "요청이 거부되었습니다\. 다시 시도한 후 계속되면 관리자에게 문의해 주세요\."/,
  "non-menu 403 responses are not mislabeled as missing Records or Attainment WRITE permission");
assert.match(recordsPage, /dialogTitle="Actual Import"/, "Actual upload dialog is not restricted to CSV wording");
assert.match(recordsPage, /Forecast Workbook Import/, "Forecast upload dialog uses a Forecast-specific title");
assert.doesNotMatch(recordsPage, /Consumption CSV import/, "the ambiguous shared import title is removed");
assert.match(apiSource, /previewConsumptionForecastWide[\s\S]*"\/consumption\/forecast-imports\/preview"/,
  "Forecast Preview calls only the Forecast Preview API");
assert.match(apiSource, /applyConsumptionForecastWide[\s\S]*"\/consumption\/forecast-imports\/apply"/,
  "Forecast Apply calls only the Forecast Apply API");
assert.match(recordsPage, /error\.status === 400 \|\| error\.status === 422[\s\S]*입력값을 확인/,
  "Consumption Records separates invalid input from authorization failures");
assert.match(recordsPage, /error\.status >= 500[\s\S]*서버 오류로 저장하지 못했습니다/,
  "Consumption Records distinguishes server failures from permission and input failures");
assert.doesNotMatch(spreadsheetPage, /kpi-page-loading__body|Loading KPI Activities data/u, "KPI Activities defers loading UI to the shared app overlay");
assert.doesNotMatch(attainmentPage, /accounts-workloads-loading|Loading Consumption Attainment/u, "Attainment defers loading UI to the shared app overlay");
assert.doesNotMatch(recordsPage, /accounts-workloads-loading|Loading Consumption Records/u, "Records defers loading UI to the shared app overlay");
assert.doesNotMatch(recordsPage, /All-account totals are unavailable|ALL Forecast is read-only|Forecast is edited once per Account/, "Records removes distributed technical guidance");
assert.match(homeConsumption, /잠정 MTD 적용/, "Home explains that available MTD remains visible while final Actual is pending");
assert.match(homeConsumption, />MTD \(잠정\)\{data\.mtdAsOf \? ` · As of \$\{data\.mtdAsOf\}` : ""\}</,
  "Home labels current-month MTD separately and preserves its basis date");
assert.match(homeConsumption, /const showActual = data\.actualPeriods\.some[\s\S]*const showMtd = mtd\?\.amountExact !== null && mtd\?\.amountExact !== undefined;/,
  "Quarterly display uses period coverage for confirmed Actual and independently renders available MTD");
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
assert.match(recordsPage, /actualApplyingRef\.current[\s\S]*setImportPhase\("applying"\)[\s\S]*finally[\s\S]*actualApplyingRef\.current = false/,
  "Actual Apply is synchronously locked against same-render double submission");
assert.match(recordsPage, /data-app-busy-surface=\{importPhase === "previewing" \|\| importPhase === "applying" \? "true" : undefined\}[\s\S]*Preparing Actual preview…/,
  "Actual Import owns its visible preview-loading surface instead of exposing a title-only dialog or duplicate global overlay");
assert.match(recordsPage, /data-app-busy-surface=\{forecastImportPhase === "previewing" \|\| forecastImportPhase === "applying" \? "true" : undefined\}[\s\S]*Preparing Forecast preview…/,
  "Forecast Import owns one truthful preview-loading surface");
assert.match(recordsPage, /\(importPhase === "preview" \|\| importPhase === "applying"\)[\s\S]*Applying…/,
  "Actual Preview remains mounted while Apply is running");
assert.match(recordsPage, /\(forecastImportPhase === "preview" \|\| forecastImportPhase === "applying"\)[\s\S]*Applying Forecast Import…/,
  "Forecast Preview remains mounted while Apply is running");
assert.match(recordsPage, /Current value[\s\S]*Imported value[\s\S]*Difference[\s\S]*Reason[\s\S]*comparison\.difference[\s\S]*comparison\?\.reason/,
  "Actual Preview distinguishes exact amount difference from FINAL/MTD metadata reasons");
assert.match(recordsPage, /Comparison safety:[\s\S]*Preview and workspace ETags match[\s\S]*normalized Account \+ Pillar \+ Period key is unique[\s\S]*Comparison unavailable/,
  "Forecast Preview discloses the safe join rules and never guesses missing values");
assert.match(recordsPage, /buildForecastImportComparisons\([\s\S]*preview\.etag[\s\S]*comparisonWorkspace\?\.etag[\s\S]*preview\.changes[\s\S]*comparisonWorkspace\?\.accountForecasts/,
  "Forecast current/input/difference comparison uses the read API with Preview ETag and full unique join keys");
assert.match(recordsPage, /confirmedPreCommitImportStatuses = new Set\(\[400, 401, 403, 404, 405, 409, 412, 413, 415, 422\]\)/,
  "only known pre-commit HTTP rejections allow Apply retry; timeout and ambiguous failures require state verification");
assert.match(recordsPage, /consumption-import-footer-summary[\s\S]*new ·[\s\S]*updates ·[\s\S]*deletes[\s\S]*consumption-import-footer-actions[\s\S]*>Cancel<[\s\S]*: "Apply"/,
  "Actual counts are separated from compact Cancel and Apply actions");
assert.match(styles, /#consumptionImportDialog,[\s\S]*#consumptionForecastImportDialog \{[^}]*width: min\(68rem, calc\(100vw - 3rem\)\)/,
  "Import dialog host owns the desktop width so JET centers the full comparison surface");
assert.match(styles, /\.consumption-import-dialog-body \{[^}]*min-block-size:[^}]*width: 100%/,
  "Import dialog body fills the host and keeps stable dimensions while phases change");
assert.match(styles, /@media[^]*#consumptionImportDialog,[\s\S]*#consumptionForecastImportDialog \{[^}]*width: calc\(100vw - 2rem\)/,
  "Import dialog host fits the mobile viewport");
assert.match(styles, /@media[^]*#consumptionImportDialog,[\s\S]*#consumptionForecastImportDialog \{[^}]*left: 50% !important;[^}]*position: fixed !important;[^}]*top: 50% !important;[^}]*transform: translate\(-50%, -50%\) !important;/,
  "Import dialog hosts stay centered in the mobile viewport instead of inheriting document offsets");
assert.match(styles, /\.consumption-import-footer \{[^}]*display: flex;[^}]*width: 100%[\s\S]*\.consumption-import-footer-actions \{[^}]*display: flex;[^}]*flex-wrap: wrap;/,
  "Actual footer and action group own flex geometry before the mobile column override");
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.consumption-import-footer \{[^}]*flex-direction: column;[\s\S]*\.consumption-import-footer-actions \{[^}]*justify-content: flex-end;[^}]*width: 100%/,
  "mobile Actual counts occupy their own row while both action buttons stay inside the dialog");
assert.match(styles, /\.consumption-import-preview-scroll \{[^}]*overflow: auto/,
  "dense Preview comparisons scroll inside the dialog");
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
assert.match(content, /!\['profile', 'users', 'consumptionRecords', 'consumptionAnalysis', 'accountsWorkloads', 'accountManagementOverview'\]\.includes\(activeRoute\.module\)/, "global FY is replaced by the compact Analysis title selector and remains hidden for FY-independent pages");

// Consumption Analysis: one FY/account server context, ACTUAL-only six-month trend and Account→Plan drilldown.
assert.match(insightsPage, /fetchConsumptionAnalysis\(\{ fiscalYear, search:[^,]+, account:[^}]+\}\)/, "Consumption Analysis loads one server-owned FY/account analysis context");
assert.match(insightsPage, /analysisResponse\?\.fiscalYear === fiscalYear \? analysisResponse : null/, "Analysis keeps the last same-FY response mounted while filters refresh");
assert.doesNotMatch(insightsPage, /analysisResponse\.selectedAccount === \(selectedAccountContext \|\| null\)/, "same-FY filter changes do not unmount the Analysis header and controls");
assert.match(insightsPage, /<PageShell[\s\S]*<PageActivity busy=\{loading\}[\s\S]*<PageDataProgress busy=\{loading\}/, "Analysis exposes refresh state without replacing its mounted page shell");
assert.doesNotMatch(insightsPage, /hasStaleFiscalYearResponse|accounts-workloads-loading/u, "Analysis uses the shared page shell instead of a replacing loading surface");
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
assert.match(insightsPage, /ACTUAL ONLY[\s\S]*account\.actualAmountExact[\s\S]*plan\.actualAmountExact/, "both Contribution cards render exact Actual-only amounts");
assert.match(insightsPage, /contributionPercentText\(account\.percentageExact\)[\s\S]*contributionPercentText\(plan\.percentageExact\)/, "both Contribution cards render nullable exact Actual-only percentages");
assert.match(insightsPage, /Finalized Actual periods:[^`]+actualPeriods\.join/, "Contribution discloses the exact finalized Actual periods");
assert.match(insightsPage, /Actual not entered[\s\S]*Actual 0 entered/, "Contribution distinguishes missing Actual from an entered zero");
assert.doesNotMatch(insightsPage.slice(insightsPage.indexOf('aria-label="Account to Plan contribution"')), /splitLabel\(account\)|planSplitLabel\(plan\)|is-forecast/, "Contribution amount, label, and bars do not use Forecast");
assert.match(insightsPage, /const selectedAccount = analysis\?\.accounts\.find[^\n]+\?\? null/, "account contribution starts unselected without falling back to the first account");
assert.match(insightsPage, /const rows = \[[\s\S]*analysis\.fiscalYear[\s\S]*analysis\.priorFiscalYear/, "fiscal chart places the current FY first and prior FY below");
assert.match(insightsPage, /id="fyQuarterTotalsTitle">FY &amp; Quarter totals[\s\S]*<h3>\{analysis\.fiscalYear\} Mixed quarter consumption<\/h3>/, "the card keeps its FY and Quarter title while the Quarter region names its Actual-first Forecast-fallback meaning");
assert.doesNotMatch(insightsPage, /otherContribution|otherSelected|Other Accounts|consumption-insights-account-other/, "Consumption Analysis removes the aggregate Other Accounts contract and UI");
assert.match(insightsPage, /percentageContext: "selected Account"[\s\S]*contributionPercentText\(plan\.percentageExact\)\} of \{percentageContext\}/, "normal Account plans retain the selected Account exact-percentage label");
assert.match(insightsPage, /\{!isUnmappedConsumptionLabel\(workload\) && <>\s*<b>\{workload\}<\/b> · <\/?>\}Plan \{plan\.planId\}/, "Plan Contribution keeps actual workload names while omitting unmapped labels regardless of case or surrounding whitespace");
assert.doesNotMatch(insightsPage, /<b>\{workload\}<\/b> · Plan \{plan\.planId\}/, "Plan Contribution does not render the workload label unconditionally");
assert.doesNotMatch(apiSource, /otherContribution|ConsumptionOtherContribution/, "the Consumption API excludes the removed Other Accounts response fields");
assert.match(insightsPage, /ojs\/ojchart[\s\S]*ArrayDataProvider[\s\S]*consumption-insights-totals-chart[\s\S]*consumption-insights-actual-chart/, "approved Insights visualizations use Oracle JET chart DataProviders");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}/, "selected Alert drives an ACTUAL-only JET line chart");
assert.match(insightsPage, /type="line"[\s\S]*data=\{trendChart\}[\s\S]*dataLabel=\{trendChartCoordinateLabel\}[\s\S]*dataLabelPosition:\s*"aboveMarker"[\s\S]*hideOverlappingLabels:\s*"on"/, "the ACTUAL Trend uses Oracle JET native collision-aware point labels");
assert.match(insightsPage, /const trendChartCoordinateLabel[\s\S]*chartCurrencyK\.format\(value \/ 1000\)[\s\S]*K/, "Chart-coordinate monetary labels use K with two decimals");
assert.match(insightsPage, /fiscalTotalsChart\} dataLabel=\{trendChartCoordinateLabel\}[\s\S]*quarterTotalsChart\} dataLabel=\{trendChartCoordinateLabel\}/, "FY and Quarter totals expose each chart coordinate through the official JET chart dataLabel callback");
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
assert.equal(insightsPage.includes("Show MTD"), true, "Analysis exposes the Show MTD toolbar toggle");
assert.equal(recordsPage.includes("const [showMtd, setShowMtd] = useState(false)"), true, "Show MTD is default OFF");
assert.equal(recordsPage.includes("Show MTD"), true, "Records exposes the Show MTD toggle");
assert.match(recordsPage, /showMtd && month === currentMtdPeriod \? "MTD"/, "Current-period MTD is labelled explicitly");
assert.equal(recordsPage.includes('data-readonly="mtd"'), true, "MTD cells are read-only");
assert.match(recordsPage, /const displayedActualsExact = showMtd && currentMtdPeriod[\s\S]*serverMtdTotals\[currentMtdPeriod\][\s\S]*actualsExact: \{ \.\.\.displayedActualsExact \}[\s\S]*forecastsExact: showMtd && currentMtdPeriod[\s\S]*filter\(\(\[period\]\) => period !== currentMtdPeriod\)/,
  "portfolio MTD is represented separately from Forecast and never falls back to the current-period Forecast");
assert.match(recordsPage, /const currentMtdExact = accountLevel[\s\S]*serverAccountMtdTotals[\s\S]*series\.mtdsExact[\s\S]*applyConsumptionMtdDisplayOverride\(\s*baseDisplaySeries,\s*currentMtdPeriod,\s*currentMtdExact,\s*showMtd\s*\)/,
  "account and plan MTD use the tested exact-decimal override without being stored or classified as Forecast");
assert.match(insightsPage, /role="switch"[\s\S]*?aria-checked=\{includeMtd\}[\s\S]*?class="consumption-mtd-switch"/, "Analysis uses an accessible ON\/OFF switch instead of a checkbox");
assert.match(recordsPage, /consumption-records-toolbar__left[\s\S]*?role="switch" aria-checked=\{showMtd\} class="consumption-mtd-switch"[\s\S]*?consumption-records-toolbar-activity[\s\S]*?<PageActivity/,
  "Records places Show MTD at the far left and the stable loading/Refresh slot at the far right");
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
assert.match(recordsPage, /exportConsumptionForecastXlsx\("ALL"\)/, "Consumption Records exports Forecast for every Account across DP and OCI regardless of the screen filter");
assert.match(recordsPage, /formatConsumptionDataCenter\(plan, selectedPillar\)[\s\S]*aria-label=\{`Data center count \$\{display\.primary\}`\}[\s\S]*DC \{display\.primary\}/, "all Plan presentations keep one scoped Data Center total for the current query");
assert.doesNotMatch(recordsPage, /display\.detail|consumption-data-center__detail/, "Plan rows never split the All Data Center total into DP and OCI copy");
assert.doesNotMatch(recordsPage, /display\.duplicateWarning|Duplicate possible across pillars|consumption-data-center__warning/, "Plan rows do not imply a confirmed conflict from DP and OCI count coexistence alone");
assert.match(insightsPage, /formatConsumptionDataCenter\(plan, selectedPillar\)/, "Insights uses the same All-versus-typed DC presentation");
assert.match(insightsPage, /Plan Contribution[\s\S]*Plan \{plan\.planId\} · <InsightsDataCenter plan=\{plan\} selectedPillar=\{analysis\.selectedPillar\}/, "Plan Contribution uses the completed response's scoped DC total during refresh");
assert.doesNotMatch(insightsPage, /display\.detail|display\.duplicateWarning|consumption-data-center__warning/, "Consumption Analysis omits DP + OCI breakdown and duplicate warnings");

// Consumption Records remains the mutable Data workspace and excludes analysis duplication.
assert.match(recordsPage, /ariaLabelledBy="consumptionTitle"[\s\S]*title="Consumption Records"/, "data-management leaf uses the approved name through the common shell");
assert.match(recordsPage, /breadcrumb={breadcrumb}[\s\S]*title="Consumption Records"[\s\S]*headingSpacing="compact"/, "Consumption Records supplies its breadcrumb and title through the compact shared masthead without a redundant eyebrow");
assert.doesNotMatch(recordsPage, /consumption-summary-cards|Consumption Change Alerts & Trend|id="consumptionSignalInbox"/, "Consumption Records does not duplicate the Insights charts");
assert.match(recordsPage, /accept="\.csv,\.xlsx,text\/csv,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/, "Actual Import accepts CSV and XLSX files");
assert.match(recordsPage, /type="file"[\s\S]*multiple[\s\S]*handleActualFiles/, "Actual Import accepts multiple CSV or XLSX files");
assert.match(recordsPage, /const files = Array\.from\(input\.files \?\? \[\]\)[\s\S]*files\.length > 8/, "Import retains and validates one to eight selected File objects");
assert.match(recordsPage, /previewConsumptionImport\(files, "ALL"\)[\s\S]*files, preview/, "multipart preview retains the exact selected File objects and lets filenames own pillar detection");
assert.match(recordsPage, /applyConsumptionImport\(pendingImport\.files, "ALL", pendingImport\.preview\)/, "multipart apply reuses the retained files and validated preview mapping as one cross-pillar atomic set");
assert.match(recordsPage, /pendingImport\.preview\.files\.map[\s\S]*detectedPillar[\s\S]*owner[\s\S]*fromPeriod[\s\S]*toPeriod[\s\S]*sourceRowCount/, "preview lists pillar, owner, range, and counts per file");
assert.match(recordsPage, /sameValueDuplicateCount[\s\S]*conflictCount[\s\S]*pendingImport\.preview\.conflicts/, "preview summarizes same-value duplicates and conflicting keys");
assert.match(recordsPage, /existingSameValueCount[\s\S]*overwriteCount[\s\S]*pendingImport\.preview\.overwrites/, "preview separates existing same-value rows from scoped Actual overwrites");
assert.match(recordsPage, />New<[\s\S]*>Changed<[\s\S]*>No change<[\s\S]*>Errors</, "Preview presents the approved four decision states in order");
assert.match(recordsPage, /<details class="consumption-import-technical-details"[\s\S]*Upload duplicates[\s\S]*Exact replay skipped[\s\S]*Existing Actuals to delete/, "technical counters including Delete stay collapsed by default");
assert.match(recordsPage, /<details class="consumption-import-update-details" open>[\s\S]*Changed values/, "old-to-new overwrite rows are prioritized in Preview");
assert.match(recordsPage, /consumption-import-hard-conflict[\s\S]*Import blocked[\s\S]*conflict\.reason[\s\S]*conflict\.rows\[0\][\s\S]*conflict\.values\[0\][\s\S]*conflict\.rows\[1\][\s\S]*conflict\.values\[1\]/, "Hard Conflict is a dedicated blocking banner with rows, key, values, and reason");
assert.match(recordsPage, /pendingImport\.preview\.hasConflicts \? "Resolve errors"[\s\S]*isExactReplayPreview[\s\S]*"Already imported" : "Apply"/, "CTA blocks errors and exact replay while compact Apply uses the separate count summary");
assert.match(recordsPage, /Existing Actuals to overwrite[\s\S]*existingValue[\s\S]*newValue/, "overwrite preview discloses old and new values for scoped Plan-period keys");
assert.match(recordsPage, /disabled=\{importPhase === "applying" \|\| !canWrite \|\| pendingImport\.preview\.hasConflicts \|\| isExactReplayPreview\(pendingImport\.preview\)\}/, "applying, write denial, conflicts, and exact replay previews disable atomic Import without blocking metadata-only refresh");
assert.match(recordsPage, /formatConflictCurrency[\s\S]*#\{conflict\.fileOrdinals\[0\]\}[\s\S]*formatConflictCurrency\(conflict\.values\[0\]\)/, "Hard Conflict rows preserve decimal strings and distinguish equal source filenames by upload ordinal");
assert.match(apiSource, /overwriteKeys\.size!==overwrites\.length[\s\S]*uploadedNames\.has\(overwrite\.fileName\)[\s\S]*raw\.insertedFactCount\+raw\.unchangedFactCount\+raw\.skippedFactCount\+overwrites\.length!==raw\.physicalFactCount/, "preview decoder rejects duplicate/foreign overwrite rows and inconsistent impact totals");
assert.match(recordsPage, /Incoming physical facts:[\s\S]*result\.insertedFactCount[\s\S]*result\.overwrittenFactCount[\s\S]*result\.unchangedFactCount[\s\S]*result\.deletedFactCount/, "completion reports transaction-time apply counts rather than stale preview counts");
assert.match(recordsPage, /previewConsumptionImport[\s\S]*applyConsumptionImport/, "Actual file preview and atomic import remain wired");
assert.match(recordsPage, /renderSalesRepPreview\(pendingImport\.preview\.salesRepChanges/, "Actual preview renders Sales Rep changes before Apply");
assert.match(recordsPage, /renderSalesRepPreview\(pendingForecastImport\.preview\.salesRepChanges/, "Forecast preview renders Sales Rep changes before Apply");
assert.match(recordsPage, /Account[\s\S]*Sales Rep \(before → after\)[\s\S]*Changed[\s\S]*Unchanged/, "Sales Rep preview exposes account, before-to-after, and changed/unchanged semantics");
assert.match(recordsPage, /Blank or missing Sales Rep values are ignored[\s\S]*No Sales Rep values to apply/, "Sales Rep preview explains blank no-op and legacy empty-response behavior");
assert.match(recordsPage, /exportConsumptionForecastXlsx[\s\S]*exportConsumptionImportCompatibleCsv[\s\S]*URL\.createObjectURL[\s\S]*download = exported\.fileName[\s\S]*URL\.revokeObjectURL/, "Consumption Records downloads both server-owned Export files and releases object URLs");
assert.doesNotMatch(recordsPage, /title="Export ACTUAL data in the Consumption Import CSV format"/, "Actual CSV Export is hidden from the toolbar without deleting its helper");
assert.match(recordsPage, /title="Export ACTUAL data in Excel format"[\s\S]*\{isExporting \? "Exporting…" : "Actual Export"\}/, "the visible Actual Export is the XLSX control");
assert.match(recordsPage, /exportConsumptionActualXlsx\(\)/, "Actual Export remains wired to the XLSX API helper");
assert.match(insightsPage, /useState<\{ quarter: string; category: ForecastCompositionCategory \} \| null>/, "Forecast composition supports All and each classified drill category");
assert.match(insightsPage, /COMPOSITION_CATEGORIES\.map[\s\S]*aria-pressed=\{selectedMovement\.category === category\}/, "detail exposes persistent All, New, Expansion, and Reduction selectors for the selected quarter");
assert.match(insightsPage, /selectedMovement\.category === "All"[\s\S]*<th>Total<\/th><th>New<\/th><th>Expansion<\/th><th>Reduction<\/th>/, "All detail distinguishes every stored composition amount without duplicating the K unit in headers");
assert.doesNotMatch(insightsPage, /FORECAST · projection|MIXED · projection/, "Forecast status does not repeat its meaning with the redundant projection label");
assert.match(insightsPage, /actions=\{<div class="consumption-import-actions is-compact"[\s\S]*class="oj-button-sm"[\s\S]*downloadCanvas\("png"\)[\s\S]*class="oj-button-sm"[\s\S]*downloadCanvas\("pdf"\)/, "PNG and PDF controls use the shared compact heading-action alignment");
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
assert.match(insightsPage, /point\.totalForecastAmountExact !== null[\s\S]*chartPoint\("All", point\.totalForecastAmountExact/, "All displays total Forecast in explicit K units rather than Renewal or net movement");
assert.doesNotMatch(insightsPage, /compositionStatus !== "CLASSIFIED"/, "partially classified quarters do not suppress every stored Forecast component");
assert.match(insightsPage, /point\.newAmountExact !== null[\s\S]*chartPoint\("New", point\.newAmountExact[\s\S]*point\.expansionAmountExact !== null[\s\S]*chartPoint\("Expansion", point\.expansionAmountExact[\s\S]*point\.reductionAmountExact !== null[\s\S]*chartPoint\("Reduction", point\.reductionAmountExact/, "each stored Forecast component is charted independently when available");
assert.doesNotMatch(insightsPage, /if \(point\.totalForecastAmountExact === null\) return \[\]/, "a missing total Forecast never suppresses stored component series");
assert.match(insightsPage, /const points: InsightChartPoint\[\] = \[\][\s\S]*if \(point\.totalForecastAmountExact !== null\) points\.push[\s\S]*if \(point\.newAmountExact !== null\) points\.push[\s\S]*return points;/, "All is omitted independently when unavailable while New, Expansion, and Reduction remain chartable");
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
assert.match(recordsPage, />\s*Forecast Import\s*</, "Forecast import button omits file-format wording");
assert.match(recordsPage, /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/,
  "Forecast file picker accepts Excel workbooks only");
assert.match(recordsPage, /validateForecastWorkbookFile\(file\)[\s\S]*previewConsumptionForecastWide\(file\)/,
  "Forecast validates extension, MIME, and XLSX signature before preview upload");
assert.match(content, /canWriteForecast = canWriteRoute\(profile, getNavigationRoute\("attainment"\)\)/,
  "Forecast import capability follows the backend Attainment WRITE permission");
assert.match(recordsPage, /canWriteForecast[\s\S]*handleForecastWorkbookFile[\s\S]*Forecast write permission is required/,
  "Forecast preview and apply use their dedicated write capability");
assert.match(recordsPage, /forecastImportPhase === "preview" \|\| forecastImportPhase === "applying"[\s\S]*disabled=\{forecastImportPhase === "applying" \|\| !canWriteForecast \|\| pendingForecastImport\.preview\.hasBlockedErrors\}[\s\S]*title=\{!canWriteForecast \? "Forecast write permission is required\." : undefined\}/,
  "Forecast Apply button uses Attainment WRITE rather than Records WRITE");
assert.doesNotMatch(recordsPage, /Forecast CSV Export|exportForecastCsv|exportConsumptionForecastCsv/, "Forecast CSV entry point is absent from the UI");
assert.match(recordsPage, /Forecast Export/, "Forecast export button omits file-format wording");
assert.match(recordsPage, /onojAction=\{\(\) => void exportForecastXlsx\(\)\}/, "Forecast export remains connected to XLSX");
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
assert.match(recordsPage, /const validForecastKInput[\s\S]*\\d\{1,2\}[\s\S]*value\.trim/, "Forecast composition inputs enforce the two-decimal K contract before save");
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
assert.match(recordsPage, /type RecordsLoadingPhase = "idle" \| "initial" \| "query" \| "append"[\s\S]*blockingRecordsLoading = recordsLoadingPhase === "initial"/, "Records retains explicit loading phases while the shared overlay handles presentation");
assert.doesNotMatch(recordsPage, /consumption-results-refresh|Refreshing results/u, "replacement queries retain the Records shell and use the shared overlay");
assert.match(recordsPage, /if \(append && \(recordsLoadingRef\.current[\s\S]*generation !== recordsRequestGeneration\.current/, "new search or sort requests supersede in-flight replacements while stale results are ignored");
assert.match(recordsPage, /const requestQuery(?:: RecordsQuery)? = append \? recordsQueryRef\.current[\s\S]*offset: append \? recordsNextOffset : 0/, "append requests retain the last applied filter snapshot instead of unsubmitted draft controls");
const recordsFetchIndex = recordsPage.indexOf("const page = await fetchConsumptionRecords");
const recordsFreshnessIndex = recordsPage.indexOf("if (generation !== recordsRequestGeneration.current)");
const recordsQueryCommitIndex = recordsPage.indexOf("recordsQueryRef.current = {");
assert.ok(recordsFetchIndex >= 0 && recordsFreshnessIndex > recordsFetchIndex && recordsQueryCommitIndex > recordsFreshnessIndex, "a replacement query becomes append-authoritative only after its response succeeds and remains current");
assert.match(recordsPage, /if \(!append\) \{\s*recordsQueryRef\.current = \{\s*\.\.\.requestQuery,\s*fromQuarter: page\.fromQuarter,\s*toQuarter: page\.toQuarter,\s*\};\s*setFromQuarter\(page\.fromQuarter\);\s*setToQuarter\(page\.toQuarter\);\s*setRangeInitialized\(true\);\s*setRangeTouched\(false\);\s*\}/, "append responses never overwrite query controls that remain editable during background loading");
assert.match(recordsPage, /shouldRestartConsumptionRecordsPage\(append, apiEtag, page\.etag\)[\s\S]*loadRecordsPage\(false, requestQuery, requestQuery\.pillar, loadingPhase, preserveDrafts\)/, "ETag changes restart paging with the same applied query and draft-preservation mode before snapshots can be mixed");
assert.match(recordsPage, /offset:\s*append \? recordsNextOffset : 0[\s\S]*sort:\s*"ACCOUNT"[\s\S]*direction:\s*"ASC"/, "records paging uses a stable server order without user-facing sort controls");
assert.match(recordsPage, /new Map[\s\S]*page\.accountGroups[\s\S]*setSavedPlans[\s\S]*setDraftPlans/, "loaded account pages append with account and plan deduplication");
assert.match(recordsPage, /id="consumptionRecordSearch"[\s\S]*value=\{draftSearch\}[\s\S]*disabled=\{blockingRecordsLoading\}/, "search stays available for native clear during dirty or background-query states and blocks only initial replacement loading");
assert.match(recordsPage, /id="consumptionFromQuarter"[\s\S]*disabled=\{rangeLoading \|\| blockingRecordsLoading \|\| hasDraftChanges\}[\s\S]*id="consumptionToQuarter"[\s\S]*disabled=\{rangeLoading \|\| blockingRecordsLoading \|\| hasDraftChanges\}/, "From and To controls do not change enabled state during background append loading");
assert.match(recordsPage, /consumption-record-search__submit[\s\S]*disabled=\{!isConsumptionQuarterRangeValid\(fromQuarter, toQuarter\) \|\| rangeLoading \|\| blockingRecordsLoading/, "search icon does not change enabled or opacity state during background append loading");
assert.match(recordsPage, /useEffect\(\(\) => \{[\s\S]*const root = pageScrollRef\.current[\s\S]*new IntersectionObserver[\s\S]*\[recordsHasMore, hasDraftChanges\]\);/, "pagination observer is not recreated for offsets, loading transitions, ETags, or draft filter changes");
assert.match(recordsPage, /recordsHasMore[\s\S]*loadRecordsPage\(true\)/, "near-bottom scroll and Load More request the next server page");
assert.match(recordsPage, /IntersectionObserver[\s\S]*loadMoreRecordsRef\.current\(\)[\s\S]*\{ root, rootMargin/, "the common page scroll root observes a paging sentinel through the latest append callback");
assert.match(recordsPage, /data-records-sentinel/, "the table scroll region owns the paging sentinel");
assert.match(recordsPage, /Showing\s*<strong class="consumption-records-count-value">\{loadedAccountCount\}<\/strong>\s*of\s*<strong class="consumption-records-count-value">\{recordsTotalAccounts\}<\/strong>\s*accounts/,
  "server total account metadata drives the highlighted loading summary");
assert.doesNotMatch(recordsPage, /visiblePlans\.length\} plans/, "the plan-count display is removed rather than hiding a specific value");
assert.match(recordsPage, /Load More[\s\S]*All accounts loaded\./, "manual fallback and final-page states remain explicit while loading uses the shared overlay");
assert.match(recordsPage, /No Consumption Records match the selected range and filters\./, "empty filtered results remain explicit");
assert.match(recordsPage, /recordsReplacementLoading = recordsLoadingPhase === "initial" \|\| recordsLoadingPhase === "query"/, "initial and replacement queries share an explicit non-table loading gate");
assert.match(recordsPage, /recordsViewState = resolveConsumptionRecordsViewState\([\s\S]*recordsReplacementLoading, dataMode, recordsQueryError, renderedRecordAccounts\.length\)/, "Records distinguishes loading, error, empty, and ready states from completed request data");
assert.match(recordsPage, /consumption-table-panel[\s\S]*consumption-table-content[\s\S]*recordsViewState === "error"[\s\S]*Unable to load Consumption Records/,
  "the table panel remains mounted through replacement loading and renders errors inside the stable data region");
assert.match(recordsPage, /recordsViewState === "empty" &&[\s\S]*No Consumption Records match the selected range and filters\./, "the empty copy is reachable only from the completed empty state");
assert.match(recordsPage, /setRecordsQueryError\(""\)[\s\S]*loadRecordsPage\(false, requestQuery[\s\S]*setRecordsQueryError\(message\)/, "replacement queries clear and set their own request error state without presenting stale counts");
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
assert.match(recordsPage, /recordsViewState === "empty"[\s\S]*consumption-empty-state[\s\S]*No Consumption Records match/, "a fully filtered or unmatched completed query uses the existing Consumption empty-state treatment");
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
assert.match(styles, /\.consumption-table thead tr:first-child \.consumption-account-column\s*\{[^}]*background:\s*#efebe7[^}]*z-index:\s*9/, "sticky header intersection stays opaque and above scrolling month and quarter headers with a selector that outranks the first-row header rule");
assert.match(styles, /\.consumption-table thead tr:first-child th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/, "first header row remains sticky");
assert.match(styles, /\.consumption-table thead tr:nth-child\(2\) th\s*\{[^}]*position:\s*sticky[^}]*top:\s*2\.6rem/, "second compact header row remains sticky");
assert.match(styles, /\.consumption-insights-page[\s\S]*\.consumption-insights-alert-trend-grid[\s\S]*\.consumption-insights-contribution-list/, "Insights styling is page-scoped");

// Approved Consumption follow-up: clearer visual regions, accessible alerts, stable records and zoom-safe navigation.
assert.match(insightsPage, /consumption-insights-fy-total[\s\S]*data=\{fiscalTotalsChart\}[\s\S]*consumption-insights-totals-divider[\s\S]*consumption-insights-quarter-totals[\s\S]*data=\{quarterTotalsChart\}/, "FY and Quarter totals use distinct stacked visual regions separated by a divider");
assert.match(insightsPage, /analysis\.quarters\.flatMap/, "mixed quarter consumption remains sourced from effective fact-cell quarter totals");
assert.match(insightsPage, /analysis\.movementBridge\.flatMap/, "Forecast movement composition remains a separate data source");
assert.match(insightsPage, /chartPoint\("New", point\.newAmountExact/);
assert.match(insightsPage, /chartPoint\("Expansion", point\.expansionAmountExact/);
assert.match(insightsPage, /chartPoint\("Reduction", point\.reductionAmountExact/);
assert.match(insightsPage, /const signedAmountExact = category === "Reduction" \? negateExactDecimal\(amountExact\) : amountExact[\s\S]*value: amountExactToKChartCoordinate\(signedAmountExact\)/, "Reduction is converted to K and rendered below zero exactly once at the visual boundary");
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
assert.match(insightsPage, /contributionPercentText\(plan\.percentageExact\)\} of \{percentageContext\}[\s\S]*consumption-insights-plan-track[\s\S]*width:\$\{contributionBarWidthChartCoordinate\(plan\.percentageExact\)\}%/, "Plan Contribution uses each exact Plan percentage and projects only the visual track width");
assert.match(styles, /\.consumption-insights-contribution-list, \.consumption-insights-plan-list[^}]*max-height:\s*25rem[^}]*overflow-y:\s*auto/, "Account and Plan Contribution use equal internal scrolling regions");
assert.doesNotMatch(recordsPage, /consumption-records-loading|Loading Consumption Records/u, "Records footer uses the shared app loading overlay instead of a local status");
assert.match(recordsPage, /<div class=\{`consumption-load-more[^>]*>[\s\S]*Showing\s*<strong class="consumption-records-count-value">\{loadedAccountCount\}<\/strong>\s*of\s*<strong class="consumption-records-count-value">\{recordsTotalAccounts\}<\/strong>\s*accounts/,
  "Records always reserves its Load More and highlighted Showing footer");
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
assert.doesNotMatch(insightsPage, /PNG 생성 중|PDF 생성 중|oj-progress-circle/u, "exports use the shared app loading overlay instead of local progress UI");
assert.match(insightsPage, /const finishBusy = beginAppBusy\(\)[\s\S]*finally[\s\S]*finishBusy\(\)/, "export loading always releases the shared busy counter");
assert.match(insightsPage, /disabled=\{loading \|\| !!exporting\}/, "both export buttons reject duplicate clicks while either export is active");
assert.match(insightsPage, /finally\s*\{[\s\S]*setExporting\(""\)/, "export controls recover after both success and failure");
assert.match(styles, /\.consumption-insights-linked-trend h3\s*\{[^}]*font-size:\s*1rem[^}]*font-weight:\s*700/, "ACTUAL Trend matches the card-heading hierarchy rather than inheriting an oversized title");

assert.match(
  insightsPage,
  /consumptionComboboxRef/,
  "Consumption Analysis must track the account combobox for outside-click dismissal",
);
assert.match(
  insightsPage,
  /addEventListener\("pointerdown"/,
  "Consumption Analysis account results must close on pointer interaction outside the combobox",
);

assert.match(recordsPage, /page\.controlTotals/, "the records page must retain actual control rows returned by the API");
assert.match(recordsPage, /actualControlRefreshState === "ready"[\s\S]*matchStatus !== "MATCH"/, "only a completed latest query can produce a Control mismatch warning from screen state");
assert.match(recordsPage, /actualControlsRequiringConfirmation[\s\S]*actualControlRefreshState === "ready"[\s\S]*actualControlTotals\.filter/,
  "inline Actual cells must not reuse stale Control warnings while a replacement query is loading or failed");
assert.match(recordsPage, /actualControlRefreshState === "failed"[\s\S]*Actual Control 최신 조회 실패[\s\S]*금액 불일치로 판정하지 않았습니다[\s\S]*서버에서 최신 Control과 Detail을 다시 검증/,
  "a failed latest-Control query is distinct from a monetary mismatch and leaves server export validation authoritative");
assert.match(recordsPage, /control\.account[\s\S]*control\.periodKey[\s\S]*control\.pillar[\s\S]*control\.actualState[\s\S]*Control[\s\S]*Detail[\s\S]*reason/,
  "Control warnings identify Account, month, Pillar, Actual state, amounts, and reason");
assert.match(recordsPage, /Control[\s\S]*Detail[\s\S]*확인 필요/, "a stale control must show both amounts and the confirmation-required state");
assert.doesNotMatch(recordsPage, /Account Actual minus preserved Final Forecast|Actual \{exactCurrency\(variance\.actualAmountExact\)\} · Final/,
  "Consumption Records does not render Actual-versus-Final comparison copy inside amount cells");

assert.match(forecastActualPage, /Quarter[\s\S]*Pillar[\s\S]*Sales Rep[\s\S]*Account/, "Forecast vs Actual exposes the required filter cascade");
assert.match(forecastActualPage, /aria-label="Include MTD"[\s\S]*aria-checked=\{actualMode === "MTD"\}/,
  "Forecast vs Actual exposes the shared MTD switch");
assert.match(forecastActualPage, /Final shortfall[\s\S]*Projected MTD shortfall[\s\S]*Accounts/,
  "summary cards show deduplicated problem-account counts and the current account scope");
assert.doesNotMatch(forecastActualPage, /Full-period summary|FINAL periods only/,
  "misleading mixed-period summary columns are removed from the monthly matrix");
assert.match(forecastActualPage, /Unconfirmed[\s\S]*Not comparable/, "missing Actual and impossible comparisons stay distinct");
assert.match(apiSource, /confirmedActualAmount: string \| null/, "summary preserves unavailable finalized Actual instead of coercing it to zero");
assert.match(apiSource, /projectedAmount: string \| null/, "summary preserves unavailable projection instead of coercing it to zero");
assert.match(forecastActualPage, /actualState === "MTD"[\s\S]*actualAsOf[\s\S]*formatMtdAppliedDate/, "Forecast vs Actual derives one header date from actual MTD import timestamps");
assert.match(forecastActualPage, /assessForecastActualMonth\(month\)[\s\S]*assessment\.label/,
  "monthly Difference and status use the explicit FINAL/MTD assessment contract");
assert.doesNotMatch(forecastActualPage, /actualState === "MTD"[^\n]*subtractExactDecimals/,
  "raw MTD cumulative variance is not presented as a month-end projection Difference");
assert.match(forecastActualPage, /visibleForecastActualPeriods/, "monthly values remain latest-first and stop at the latest period with Forecast data");
assert.match(recordsPage, /mtdAsOfByPeriod/, "Forecast Records consumes account-level MTD import timestamps");
assert.match(insightsPage, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/,
  "Consumption Analysis displays authoritative MTD metadata even when MTD amounts are excluded");
assert.doesNotMatch(forecastActualPage, /monthScrollRef|handleMonthScrollKeyDown|scrollMonths|consumption-scroll-controls/,
  "Forecast vs Actual delegates scrolling to the shared root PageShell");
assert.match(forecastActualPage, /forecast-actual-matrix-layout/,
  "Forecast vs Actual keeps a non-clipping matrix layout inside the root scroller");
assert.match(styles, /\.forecast-actual-matrix tbody \.is-account,[\s\S]*\.forecast-actual-matrix tbody \.is-rep[^{]*\{[^}]*position:\s*sticky/,
  "Forecast vs Actual keeps Account and Sales Rep fixed while grouped months scroll");
assert.match(forecastActualSort, /compareNullableDecimal[\s\S]*compareExactDecimals[\s\S]*key === "forecast"[\s\S]*key === "actual"[\s\S]*key === "projected"[\s\S]*key\.slice\("month:"\.length\)/, "Forecast vs Actual numeric sort keys use exact-decimal comparison");
assert.match(forecastActualPage, /setQuarter\(event\.currentTarget\.value\); setResultFilter\(null\)/, "Quarter changes clear the stale quarter-result drilldown while retaining independent Account and Sales Rep filters");
assert.match(forecastActualPage, /useEffect\(\(\) => \{[\s\S]*setSalesRep\(""\)[\s\S]*setAccount\(""\)[\s\S]*\}, \[fiscalYear\]\)/,
  "Fiscal Year changes from the shared page context clear stale Sales Rep and Account filters before requesting the new scope");
assert.match(forecastActualPage, /onInput[\s\S]*setAccount\(""\)/, "typing away from a selected Account clears the hidden applied filter");
assert.doesNotMatch(forecastActualPage, /Plan|Opportunity/, "the Account-level comparison does not mix Plan or Opportunity data into Forecast and Actual");
assert.match(apiSource, /forecast-vs-actual/, "the Forecast comparison page uses the dedicated read API");
assert.match(content, /activeRoute\.module === "forecastActual"/, "the new menu route is connected to content dispatch");

assert.match(app, /\["consumptionAnalysis", "forecastActual", "consumptionRecords"\]\.includes\(activeRoute\.module\)[\s\S]*is-kap-page-shell-route/,
  "the authenticated shell opts into the shared viewport layout before the child surface mounts");
assert.match(content, /\["consumptionAnalysis", "forecastActual", "consumptionRecords"\]\.includes\(activeRoute\.module\)[\s\S]*is-kap-page-shell-route/,
  "the content layout is route-stable for all shared PageShell routes without relying only on :has timing");
assert.match(recordsPage, /<PageActivity[\s\S]*compactTimestampButton/,
  "Records opts into the reusable compound Reload and HH:mm:ss control");
assert.doesNotMatch(recordsPage, /Export ACTUAL data in the Consumption Import CSV format/,
  "the legacy Actual CSV export action is hidden without deleting its underlying export function");
assert.match(recordsPage, /title="Export ACTUAL data in Excel format"[\s\S]*Actual Export/,
  "the visible Actual Export remains the XLSX download");
assert.match(recordsPage, /const exportActionsDisabled = hasDraftChanges \|\| isSaving[\s\S]*disabled=\{exportActionsDisabled\}/,
  "exports preserve draft and mutation conflict protection");
assert.doesNotMatch(recordsPage, /const exportActionsDisabled =[^;]+(?:dataMode|rangeLoading|recordsLoading|recordsReplacementLoading|isExporting)[^;]+;/,
  "initial loading, search, refresh, and a sibling export render do not bulk-disable valid XLSX actions");
assert.doesNotMatch(recordsPage, /const export(?:ActualXlsx|ForecastXlsx) = async \(\) => \{[^}]*dataMode/s,
  "valid XLSX export endpoints remain callable before the Records query settles");
assert.match(recordsPage, /consumption-quarter-label[\s\S]*consumption-month-label[\s\S]*consumption-data-kind/,
  "quarter, month, Forecast, and Actual headers expose distinct semantic styling hooks");
assert.match(recordsPage, /consumption-records-count-value[^>]*>\{loadedAccountCount\}[\s\S]*consumption-records-count-value[^>]*>\{recordsTotalAccounts\}/,
  "both live account counts are individually highlighted");
assert.match(styles, /\.consumption-records-toolbar\s*\{[^}]*gap:\s*0[^}]*margin:\s*0/s,
  "the Records toolbar removes outer vertical gaps between filters and the table");
assert.match(styles, /\.consumption-import-actions\.is-compact[\s\S]*min-height:\s*2\.25rem/s,
  "Records action buttons are compact while retaining the mobile minimum touch size override");

console.log("consumptionUiContract tests passed");
