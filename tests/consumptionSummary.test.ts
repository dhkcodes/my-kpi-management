import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchConsumptionSummary } from "../src/data/consumptionApi";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";

const unavailable = (quarter: string) => ({ quarter, mode: "NO_DATA", actualAmount: null, forecastAmount: null,
  totalAmount: null, qoqPercent: null, qoqStatus: "NO_DATA" });

const payload = {
  currentQuarter: "FY27-Q2",
  showMtd: true,
  displayQuarterOrder: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"],
  rows: [
    { label: "Total", pillar: "ALL", quarters: [
      { quarter: "FY26-Q3", mode: "FINAL_ACTUAL", actualAmount: "594120", forecastAmount: null, totalAmount: "594120", qoqPercent: "2.5", qoqStatus: "AVAILABLE" },
      unavailable("FY26-Q4"), unavailable("FY27-Q1"),
      { quarter: "FY27-Q2", mode: "MIXED", actualAmount: "280590", forecastAmount: "469299", totalAmount: "749889", qoqPercent: "7.8", qoqStatus: "AVAILABLE" }
    ] },
    { label: "OCI", pillar: "OCI", quarters: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"].map(unavailable) },
    { label: "DP", pillar: "DP", quarters: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"].map(unavailable) }
  ]
};

void (async () => {
  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records/summary?fromQuarter=FY26-Q3&toQuarter=FY27-Q2&search=acme&pillar=ALL&showMtd=true");
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const summary = await fetchConsumptionSummary({ fromQuarter: "FY26-Q3", toQuarter: "FY27-Q2", search: "acme", pillar: "ALL", showMtd: true });
  assert.deepEqual(summary.displayQuarterOrder, payload.displayQuarterOrder);
  assert.equal(summary.rows[0].label, "Total");
  assert.equal(summary.rows[0].quarters[3].totalAmountExact, "749889");
  assert.equal(summary.rows[0].quarters[3].qoqPercentExact, "7.8");

  runtime.fetch = async () => new Response(JSON.stringify({ ...payload, rows: [{ ...payload.rows[0], label: "ISV Total" }] }), { status: 200 });
  await assert.rejects(() => fetchConsumptionSummary({ fromQuarter: "FY26-Q3", toQuarter: "FY27-Q2", search: "", pillar: "ALL", showMtd: false }), /Malformed Consumption summary response/);

  const page = readFileSync(resolve(process.cwd(), "src/components/content/ConsumptionRecordsPage.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
  assert.match(page, />Summary</, "Summary title must be concise");
  assert.match(page, /consumption-summary/, "Summary must have an isolated page-local class");
  assert.doesNotMatch(page, /ISV Total|ISV IaaS Only|ISV Data Platform/, "Summary row labels must be Total, OCI, and DP");
  const recordsFetch = page.indexOf("let page = await fetchConsumptionRecords({");
  const resolvedSummaryFetch = page.indexOf("fromQuarter: page.fromQuarter", recordsFetch);
  assert.ok(recordsFetch >= 0 && resolvedSummaryFetch > recordsFetch,
    "initial Summary must use the period range resolved by the authenticated Records response");
  assert.doesNotMatch(page.slice(0, recordsFetch), /loadConsumptionSummary\(requestQuery/,
    "Summary must not start with the initial empty Records query");
  assert.match(page, /summaryK[^\n]*formatExactKFixed\(value, 2\)/,
    "Summary amounts must use one fixed two-decimal K suffix");
  assert.doesNotMatch(page, /formatExactK\(value\)\}\s*K/,
    "Summary amounts must not append a second K suffix");
  assert.match(styles, /\.consumption-summary__scroll\s*\{[^}]*overflow-x:\s*auto/s,
    "long quarter ranges must scroll inside Summary only");
  assert.match(page, /const \[summaryExpanded, setSummaryExpanded\] = useState\(false\)/,
    "Summary must be collapsed on initial page entry");
  assert.match(page, /aria-expanded=\{expanded\}/,
    "Summary disclosure must expose its state accessibly");
  assert.match(page, /summaryModeLabel\(item\?\.mode \?\? "NO_DATA"\)/,
    "each quarter amount header must identify the active Summary mode");
  assert.doesNotMatch(page, /consumption-summary__unit|Consumption \(\$K\)/,
    "the redundant Consumption ($K) label must be removed");
  assert.doesNotMatch(page, /consumption-summary__mode consumption-summary__mode--/,
    "mode labels must not be repeated inside amount cells");
  assert.match(page, /await loadConsumptionSummary\([\s\S]*if \(generation !== recordsRequestGeneration\.current\) return;/,
    "Records must await the matching Summary before exposing the completed result");
  assert.match(page, /setConsumptionSummaryError\([^;]+;\s*throw error;/,
    "a failed Summary must reject the matching Records replacement before either result is exposed");
  assert.match(page, /loadConsumptionSummary\(recordsQueryRef\.current,[\s\S]*\.catch\(\(\) => undefined\)/,
    "Show MTD must settle a failed Summary request without leaving an unhandled rejection");
  assert.match(page, /const recordsActivityBusy = rangeLoading \|\| recordsLoading \|\| consumptionSummaryLoading/,
    "Records progress must remain active until both Records and Summary are settled");
  assert.match(page, /const visibleTop = Math\.max\(rootRect\.top, 0\)/,
    "Records progress must anchor to the visible PageShell body rather than Summary or table geometry");
  assert.match(page, /const visibleBottom = Math\.min\(rootRect\.bottom, window\.innerHeight\)/,
    "Records progress must stay centered in the visible PageShell body after scroll or resize");
  assert.match(page, /\[\.\.\.summary\.displayQuarterOrder\]\.reverse\(\)/,
    "Summary quarters must display newest first without changing the API's chronological QoQ values");
  assert.doesNotMatch(page, /page\.accountGroups\.map\([\s\S]{0,300}\)\.filter\(\(group\) => group\.plans\.length/,
    "Records must not drop API account groups that only have actual totals");
  assert.match(page, /setRecordsQueryError\(message\)[\s\S]*setImportError\(""\)/,
    "a failed replacement query must expose an error instead of retaining the previous result as current");
  assert.match(page, /detail: dataMode === "fallback" \?[^\n]+: "요청한 조건의 데이터를 불러오지 못했습니다\. Retry를 선택해 다시 시도해 주세요\."/,
    "the Records query failure copy must describe the cleared result instead of claiming prior data is retained");
  assert.match(page, /if \(importError\)[^\n]+기존 데이터와 마지막 완료 시각을 유지합니다/,
    "the separate import-operation response must retain its existing preserve-data guidance");
  assert.match(styles, /\.kap-page-shell\.consumption-page \.consumption-summary__table th,[\s\S]*border-right:/,
    "Summary borders must remain local to Consumption Records");
  assert.match(styles, /\.consumption-summary__table tbody th:first-child[^}]*font-size:\s*\.9rem/s,
    "Summary row labels must match Records account-name sizing");
  assert.match(styles, /\.consumption-summary__amount[^}]*font-size:\s*\.88rem/s,
    "Summary amounts must match Records numeric sizing");
  assert.match(styles, /\.consumption-summary__amount small \{[^}]*font-weight:\s*400[^}]*white-space:\s*nowrap/s,
    "MTD composition labels and amounts must remain regular-weight on one line");
  assert.match(styles, /\.consumption-summary__qoq \{[^}]*font-weight:\s*800/s,
    "Summary QoQ values must be bold and right aligned");

  console.log("consumption summary contract passed");
})();
