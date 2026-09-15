import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import {
  ConsumptionAnalysis,
  ConsumptionAnalysisAlert,
  ConsumptionAnalysisQuarter,
  fetchConsumptionAnalysis
} from "../../data/consumptionApi";
import {
  ConsumptionAnalysisAccountCandidate,
  ConsumptionAnalysisPlan,
  ForecastCompositionCategory,
  ConsumptionPillar,
  consumptionPillarOptions,
  filterForecastCompositionAccounts,
  formatConsumptionDataCenter,
  getAlertActualTrend,
  isUnmappedConsumptionLabel
} from "../../data/consumptionData";
import "ojs/ojprogress-circle";
import "ojs/ojchart";
import type { ojChart } from "ojs/ojchart";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { ConsumptionMessageBanner } from "./ConsumptionMessageBanner";
import type { ConsumptionMessage } from "./ConsumptionMessageBanner";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const currencyK = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const toK = (amount: number): number => amount / 1_000;
const signedCurrency = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${currency.format(amount)}`;
const signedPercent = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${amount.toFixed(1)}%`;
const qoqKind = (status: ConsumptionAnalysisQuarter["status"]) => status === "ACTUAL" ? "ACTUAL"
  : status === "FORECAST" ? "FORECAST · projection" : status === "MIXED" ? "MIXED · projection" : status === "NOT_OPEN" ? "NOT OPEN" : "INCOMPLETE";
const splitLabel = (value: { actualAmount: number; forecastAmount: number }) => `ACTUAL ${currency.format(value.actualAmount)} · FORECAST ${currency.format(value.forecastAmount)}`;
const trendDataLabel = ({ value }: Readonly<{ value: number }>) => compactCurrency.format(value);
const movementDataLabel = ({ value }: Readonly<{ value: number }>) => `${currencyK.format(value)} K`;
const movementAxisConverter = {
  format: (value: string | number) => `${currencyK.format(Number(value))} K`,
  parse: (value: string) => Number(value.replace(/[^0-9.-]/g, ""))
};
const amountK = (amount: number) => `${currencyK.format(toK(amount))} K`;
const ACTUAL_COLOR = "#315f75";
const FORECAST_COLOR = "#78abc4";
const MOVEMENT_COLORS = { New: "#2f7d32", Expansion: "#2f6f9f", Reduction: "#b94a48" } as const;
const ALL_ACCOUNTS = "All Accounts Total";
const COMPOSITION_CATEGORIES: readonly ForecastCompositionCategory[] = ["All", "New", "Expansion", "Reduction"];
type InsightChartPoint = Readonly<{
  id: string;
  seriesId: string;
  groupId: string;
  value: number | null;
  color: string;
  shortDesc: string;
  pattern?: "smallDiagonalRight";
  markerSize?: number;
  dataLabel?: string;
}>;

const renderInsightChartItem = ({ data }: Readonly<{ data: InsightChartPoint }>) => <oj-chart-item
  value={data.value ?? undefined}
  seriesId={data.seriesId}
  groupId={[data.groupId]}
  color={data.color}
  pattern={data.pattern}
  markerSize={data.markerSize}
  shortDesc={data.shortDesc}>
</oj-chart-item>;

const chart = (points: readonly InsightChartPoint[]) => new ArrayDataProvider([...points], { keyAttributes: "id" });
const candidateSearchText = (candidate: ConsumptionAnalysisAccountCandidate) =>
  [candidate.account, ...candidate.workloads, ...candidate.planIds].join(" ").toLocaleLowerCase();
const matchesCandidate = (candidate: ConsumptionAnalysisAccountCandidate, search: string) =>
  candidateSearchText(candidate).includes(search.trim().toLocaleLowerCase());

const findAlertPlan = (analysis: ConsumptionAnalysis, alert: ConsumptionAnalysisAlert): ConsumptionAnalysisPlan | null =>
  analysis.accounts.find((account) => account.account === alert.account)?.workloads
    .find((workload) => workload.workload === alert.workload)?.plans
    .find((plan) => plan.serverPlanId === alert.serverPlanId) ?? null;

const statusTone = (status: string) => `consumption-insights-status is-${status.toLowerCase()}`;
const alertPresentation = (alert: ConsumptionAnalysisAlert) => ({
  typeLabel: alert.type.replaceAll("_", " "),
  typeIcon: alert.type === "ABOVE_USUAL" ? "oj-ux-ico-arrow-up" : alert.type === "BELOW_USUAL" ? "oj-ux-ico-arrow-down" : "oj-ux-ico-plus",
  typeTone: `is-${alert.type.toLowerCase().replaceAll("_", "-")}`,
  gradeTone: `is-${alert.grade.toLowerCase()}`,
  gradeIcon: alert.grade === "CRITICAL" ? "oj-ux-ico-error" : alert.grade === "HIGH" ? "oj-ux-ico-warning" : "oj-ux-ico-information-s"
});

const InsightsDataCenter = ({ plan, selectedPillar }: Readonly<{ plan: ConsumptionAnalysisPlan; selectedPillar: ConsumptionPillar }>) => {
  const display = formatConsumptionDataCenter(plan, selectedPillar);
  return <span class="consumption-data-center" aria-label={`Data center count ${display.primary}`}><span>DC {display.primary}</span></span>;
};

export function ConsumptionAnalysisPage({ fiscalYear }: Readonly<{ fiscalYear: FiscalYear }>) {
  const [selectedPillar, setSelectedPillar] = useState<ConsumptionPillar>("ALL");
  const [selectedSalesRep, setSelectedSalesRep] = useState("");
  const [analysisResponse, setAnalysis] = useState<ConsumptionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAccountContext, setSelectedAccountContext] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [debouncedCandidateSearch, setDebouncedCandidateSearch] = useState("");
  const [candidateComposing, setCandidateComposing] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [selectedAlertId, setSelectedAlertId] = useState("");
  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [selectedMovement, setSelectedMovement] = useState<{ quarter: string; category: ForecastCompositionCategory } | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    setSelectedAccountContext("");
    setSelectedSalesRep("");
    setCandidateSearch("");
    setDebouncedCandidateSearch("");
    setSelectedAlertId("");
    setSelectedAccountName("");
    setSelectedMovement(null);
  }, [fiscalYear]);

  useEffect(() => {
    if (candidateComposing) return;
    const timeout = window.setTimeout(() => setDebouncedCandidateSearch(candidateSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [candidateComposing, candidateSearch]);

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    void fetchConsumptionAnalysis({ fiscalYear, search: debouncedCandidateSearch, account: selectedAccountContext, salesRep: selectedSalesRep, pillar: selectedPillar })
      .then((value) => {
        if (!active || generation !== requestGeneration.current) return;
        if (!debouncedCandidateSearch && selectedAccountContext && !value.accountCandidates.some((candidate) =>
          candidate.account.toLocaleLowerCase() === selectedAccountContext.toLocaleLowerCase())) {
          setSelectedAccountContext("");
          setCandidateSearch("");
          setDebouncedCandidateSearch("");
          setSelectedAlertId("");
          setSelectedAccountName("");
                return;
        }
        setAnalysis(value);
        setSelectedAlertId((current) => value.alerts.some((alert) => alert.alertId === current) ? current : "");
        setSelectedAccountName((current) => current && value.accounts.some((account) => account.account === current) ? current : "");
      })
      .catch((reason) => {
        if (active && generation === requestGeneration.current) {
          setError(reason instanceof Error ? reason.message : "Consumption Analysis could not be loaded.");
          if (analysisResponse?.selectedPillar && analysisResponse.selectedPillar !== selectedPillar) {
            setSelectedPillar(analysisResponse.selectedPillar);
          }
        }
      })
      .finally(() => { if (active && generation === requestGeneration.current) setLoading(false); });
    return () => { active = false; };
  }, [debouncedCandidateSearch, fiscalYear, selectedAccountContext, selectedPillar, selectedSalesRep]);

  const analysis = analysisResponse
    && analysisResponse.fiscalYear === fiscalYear
    && analysisResponse.selectedPillar === selectedPillar
    && analysisResponse.selectedAccount === (selectedAccountContext || null)
    && analysisResponse.selectedSalesRep === (selectedSalesRep || null)
    ? analysisResponse : null;

  const filteredCandidates = useMemo(() => (analysis?.accountCandidates ?? [])
    .filter((candidate) => matchesCandidate(candidate, candidateSearch)), [analysis, candidateSearch]);
  const candidateOptions = useMemo<Array<ConsumptionAnalysisAccountCandidate | null>>(
    () => [null, ...filteredCandidates], [filteredCandidates]);
  const selectedAlert = analysis?.alerts.find((alert) => alert.alertId === selectedAlertId) ?? null;
  const alertPlan = analysis && selectedAlert ? findAlertPlan(analysis, selectedAlert) : null;
  const trendPoints = useMemo(() => selectedAlert && alertPlan
    ? getAlertActualTrend(alertPlan.actualTrend, selectedAlert.periodKey)
    : analysis?.contextActualTrend ?? [], [alertPlan, analysis, selectedAlert]);
  const emphasizedTrendPeriods = useMemo(() => new Set(trendPoints.slice(-4).map((point) => point.periodKey)), [trendPoints]);
  const selectedAccount = analysis?.accounts.find((account) => account.account === selectedAccountName) ?? null;
  const topAccounts = analysis?.accounts.slice(0, 5) ?? [];
  const growthAccounts = useMemo(() => [...(analysis?.accounts ?? [])]
    .filter((account): account is typeof account & { actualGrowthAmount: number } => typeof account.actualGrowthAmount === "number" && account.actualGrowthAmount > 0)
    .sort((left, right) => right.actualGrowthAmount - left.actualGrowthAmount).slice(0, 5), [analysis]);
  const declineAccounts = useMemo(() => [...(analysis?.accounts ?? [])]
    .filter((account): account is typeof account & { actualGrowthAmount: number } => typeof account.actualGrowthAmount === "number" && account.actualGrowthAmount < 0)
    .sort((left, right) => left.actualGrowthAmount - right.actualGrowthAmount).slice(0, 5), [analysis]);
  const attentionAccounts = useMemo(() => (analysis?.accounts ?? [])
    .filter((account) => account.attentionReasons.length > 0)
    .sort((left, right) => right.actualAmount - left.actualAmount), [analysis]);
  const selectedPlans = selectedAccount?.workloads.flatMap((workload) =>
    workload.plans.map((plan) => ({ workload: workload.workload, plan, percentageContext: "selected Account" }))) ?? [];

  const selectAccountContext = (account: string) => {
    setSelectedAccountContext(account);
    setCandidateSearch("");
    setDebouncedCandidateSearch("");
    setComboboxOpen(false);
    setActiveCandidateIndex(0);
    setSelectedAlertId("");
    setSelectedAccountName("");
    setSelectedMovement(null);
  };

  const selectCandidateAt = (index: number) => selectAccountContext(candidateOptions[index]?.account ?? "");
  const handleComboboxKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setComboboxOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : candidateOptions.length - 1;
      setActiveCandidateIndex((current) => (current + delta) % Math.max(1, candidateOptions.length));
    } else if (event.key === "Enter" && comboboxOpen) {
      event.preventDefault();
      selectCandidateAt(activeCandidateIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setComboboxOpen(false);
      setCandidateSearch("");
    } else if (event.key === "Tab") {
      setComboboxOpen(false);
    }
  };

  const fiscalTotalsChart = useMemo(() => {
    if (!analysis) return chart([]);
    const rows = [
      { label: analysis.fiscalYear, actualAmount: analysis.portfolio.actualAmount, forecastAmount: analysis.portfolio.forecastAmount },
      { label: analysis.priorFiscalYear, actualAmount: analysis.portfolio.priorActualAmount, forecastAmount: analysis.portfolio.priorForecastAmount }
    ];
    return chart(rows.flatMap((row) => [
      { id: `${row.label}-actual`, seriesId: "ACTUAL", groupId: row.label, value: row.actualAmount, color: ACTUAL_COLOR, dataLabel: compactCurrency.format(row.actualAmount), shortDesc: `${row.label} ACTUAL ${currency.format(row.actualAmount)}` },
      { id: `${row.label}-forecast`, seriesId: "FORECAST", groupId: row.label, value: row.forecastAmount, color: FORECAST_COLOR, dataLabel: compactCurrency.format(row.forecastAmount), pattern: "smallDiagonalRight" as const, shortDesc: `${row.label} FORECAST ${currency.format(row.forecastAmount)}` }
    ]));
  }, [analysis]);
  const quarterTotalsChart = useMemo(() => {
    if (!analysis) return chart([]);
    return chart(analysis.quarters.flatMap((quarter) => [
      { id: `${quarter.quarter}-actual`, seriesId: "ACTUAL", groupId: quarter.quarter, value: quarter.actualAmount, color: ACTUAL_COLOR, shortDesc: `${quarter.quarter} ACTUAL ${currency.format(quarter.actualAmount)}` },
      { id: `${quarter.quarter}-forecast`, seriesId: "FORECAST", groupId: quarter.quarter, value: quarter.forecastAmount, color: FORECAST_COLOR, pattern: "smallDiagonalRight" as const, shortDesc: `${quarter.quarter} FORECAST ${currency.format(quarter.forecastAmount)}` }
    ]));
  }, [analysis]);
  const movementChart = useMemo(() => {
    if (!analysis) return chart([]);
    return chart(analysis.movementBridge.flatMap((point) => {
      const all = point.totalForecastAmount === null ? null
        : { id: `${point.quarter}-All`, seriesId: "All", groupId: point.quarter, value: toK(point.totalForecastAmount), color: "#4b5563", shortDesc: `${point.quarter} All Forecast ${currencyK.format(toK(point.totalForecastAmount))} K USD · ${point.includedForecastPeriods.join(", ")}` };
      const components = [];
      if (point.newAmount !== null) components.push(
        { id: `${point.quarter}-New`, seriesId: "New", groupId: point.quarter, value: toK(point.newAmount), color: MOVEMENT_COLORS.New, shortDesc: `${point.quarter} New ${currencyK.format(toK(point.newAmount))} K USD · ${point.includedForecastPeriods.join(", ")}` }
      );
      if (point.expansionAmount !== null) components.push(
        { id: `${point.quarter}-Expansion`, seriesId: "Expansion", groupId: point.quarter, value: toK(point.expansionAmount), color: MOVEMENT_COLORS.Expansion, shortDesc: `${point.quarter} Expansion ${currencyK.format(toK(point.expansionAmount))} K USD · ${point.includedForecastPeriods.join(", ")}` }
      );
      if (point.reductionAmount !== null) components.push(
        { id: `${point.quarter}-Reduction`, seriesId: "Reduction", groupId: point.quarter, value: -toK(point.reductionAmount), color: MOVEMENT_COLORS.Reduction, shortDesc: `${point.quarter} Reduction ${currencyK.format(-toK(point.reductionAmount))} K USD · ${point.includedForecastPeriods.join(", ")}` }
      );
      return all === null ? components : [all, ...components];
    }));
  }, [analysis]);
  const trendChart = useMemo(() => chart(trendPoints.map((point) => ({
    id: point.periodKey,
    seriesId: "ACTUAL",
    groupId: point.periodKey,
    value: point.actualAmount,
    color: ACTUAL_COLOR,
    markerSize: emphasizedTrendPeriods.has(point.periodKey) ? 9 : 5,
    shortDesc: `${point.periodKey} ACTUAL ${point.actualAmount === null ? "N/A" : currency.format(point.actualAmount)}`
  }))), [emphasizedTrendPeriods, trendPoints]);
  if (loading && !analysis) return <section class="accounts-workloads-page accounts-workloads-loading" aria-busy="true" aria-label="Consumption Analysis loading">
    <oj-progress-circle value={-1} size="md" aria-label="Consumption Analysis loading"></oj-progress-circle>
    <p>Loading Consumption Analysis...</p>
  </section>;
  const messages: ConsumptionMessage[] = error
    ? [{ id: "analysis-load", severity: "error", summary: "데이터를 불러오지 못했습니다.", detail: "잠시 후 다시 시도해 주세요." }]
    : [];
  if (!analysis) return <section class="consumption-insights-page consumption-initial-state">
    <header class="consumption-page__header consumption-insights-header"><div><span class="kpi-eyebrow">Consumption / Analysis</span><h1>Consumption Analysis</h1></div></header>
    <ConsumptionMessageBanner messages={messages} />
  </section>;

  const latestCompleteQuarter = [...analysis.quarters].reverse()
    .find((quarter) => quarter.status === "ACTUAL" && quarter.coveragePercent === 100) ?? null;
  const forecastExposure = analysis.portfolio.totalAmount === 0 ? 0 : analysis.portfolio.forecastAmount / analysis.portfolio.totalAmount * 100;
  const selectedContextLabel = selectedAccountContext || ALL_ACCOUNTS;
  const contextTrendLabel = selectedAccountContext ? `${ALL_ACCOUNTS} · ${selectedAccountContext} filter` : ALL_ACCOUNTS;
  const selectedMovementPoint = selectedMovement ? analysis.movementBridge.find((point) => point.quarter === selectedMovement.quarter) ?? null : null;
  const selectedMovementAccounts = selectedMovement && selectedMovementPoint
    ? filterForecastCompositionAccounts(selectedMovementPoint.accounts, selectedMovement.category) : [];
  const movementValue = (account: ConsumptionAnalysis["movementBridge"][number]["accounts"][number]) => selectedMovement?.category === "New"
    ? account.newAmount : selectedMovement?.category === "Expansion" ? account.expansionAmount : -account.reductionAmount;
  const periodRange = (periods: readonly string[]) => periods.length === 0 ? "not provided"
    : periods.length === 1 ? periods[0] : `${periods[0]}–${periods[periods.length - 1]}`;

  const compositionTotals = selectedMovementAccounts.reduce((total, account) => ({
    totalForecastAmount: total.totalForecastAmount + account.totalForecastAmount,
    newAmount: total.newAmount + account.newAmount,
    expansionAmount: total.expansionAmount + account.expansionAmount,
    reductionAmount: total.reductionAmount + account.reductionAmount
  }), { totalForecastAmount: 0, newAmount: 0, expansionAmount: 0, reductionAmount: 0 });
  const selectMovement = (event: ojChart.ojItemDrill<string, InsightChartPoint, null>) => {
    const { detail } = event;
    const category = detail.series;
    const quarter = Array.isArray(detail.group) ? detail.group[0] : detail.group;
    if ((category === "All" || category === "New" || category === "Expansion" || category === "Reduction") && quarter) setSelectedMovement({ quarter, category });
  };

  return <section class="consumption-insights-page" aria-labelledby="consumptionAnalysisTitle" data-fiscal-year={fiscalYear} data-account-context={selectedAccountContext || "all"}>
    <header class="consumption-page__header consumption-insights-header">
      <div><span class="kpi-eyebrow">Consumption / Analysis</span><h1 id="consumptionAnalysisTitle">Consumption Analysis</h1></div>
      <div class="consumption-insights-header-actions">

        <div class="consumption-insights-pillar">
          <span>Pillar</span>
          <div class="consumption-pillar-selector" role="group" aria-label="Consumption Analysis pillar">
            {consumptionPillarOptions.map((option) => <button key={option.value} type="button" aria-pressed={selectedPillar === option.value}
              disabled={loading && !analysis}
              onClick={() => { if(option.value===selectedPillar)return; setLoading(true); setSelectedPillar(option.value); setCandidateSearch(""); setDebouncedCandidateSearch(""); setComboboxOpen(false); setActiveCandidateIndex(0); setSelectedAlertId(""); setSelectedAccountName(""); setSelectedMovement(null); }}>{option.label}</button>)}
          </div>
        </div>
        <div class="consumption-insights-context" aria-label="Consumption Analysis filters">
          <div class="consumption-insights-filter consumption-insights-filter--sales-rep">
            <label htmlFor="consumptionSalesRepContext">Sales Rep</label>
            <select id="consumptionSalesRepContext" value={selectedSalesRep}
              onChange={(event) => { setSelectedSalesRep(event.currentTarget.value); setSelectedAccountContext(""); setSelectedAccountName(""); setSelectedAlertId(""); }}>
              <option value="">All Sales Reps</option>
              {analysis.salesRepOptions.map((salesRep) => <option key={salesRep} value={salesRep}>{salesRep}</option>)}
            </select>
          </div>
          <div class="consumption-insights-filter consumption-insights-filter--account">
            <label htmlFor="consumptionAccountContext">Account</label>
            <div class="consumption-insights-combobox">
            <input id="consumptionAccountContext" type="search" role="combobox" aria-autocomplete="list"
            aria-expanded={comboboxOpen} aria-controls="consumptionAccountOptions"
            aria-activedescendant={comboboxOpen ? `consumption-account-option-${activeCandidateIndex}` : undefined}
            value={comboboxOpen ? candidateSearch : selectedContextLabel}
            placeholder="Search Account, Workload or Plan ID"
            onClick={(event) => { setComboboxOpen(true); setCandidateSearch(""); event.currentTarget.select(); }}
            onInput={(event) => { setCandidateSearch(event.currentTarget.value); setComboboxOpen(true); setActiveCandidateIndex(0); }}
            onCompositionStart={() => setCandidateComposing(true)}
            onCompositionEnd={(event) => { setCandidateSearch(event.currentTarget.value); setCandidateComposing(false); }}
            onKeyDown={handleComboboxKeyDown} />
          {selectedAccountContext && <button type="button" class="consumption-insights-clear" aria-label="Clear account" onClick={() => selectAccountContext("")}>Clear</button>}
          {comboboxOpen && <div id="consumptionAccountOptions" class="consumption-insights-options" role="listbox">
            <button id="consumption-account-option-0" type="button" role="option" aria-selected={!selectedAccountContext}
              class={activeCandidateIndex === 0 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => selectAccountContext("")}>
              <strong>All Accounts Total</strong><small>Portfolio reaggregation</small>
            </button>
            {analysis.accountCandidates.filter((candidate) => matchesCandidate(candidate, candidateSearch)).map((candidate, index) => <button
              id={`consumption-account-option-${index + 1}`} type="button" role="option" key={candidate.account}
              aria-selected={selectedAccountContext === candidate.account} class={activeCandidateIndex === index + 1 ? "is-active" : ""}
              onMouseDown={(event) => event.preventDefault()} onClick={() => selectAccountContext(candidate.account)}>
              <strong>{candidate.account}</strong><small>{[...candidate.workloads, ...candidate.planIds].join(" · ")}</small>
            </button>)}
            {filteredCandidates.length === 0 && <p>No matching Accounts.</p>}
          </div>}
          </div>
        </div>
        </div>
      </div>
    </header>

    <ConsumptionMessageBanner messages={messages} />
    {loading && <div class="consumption-insights-refresh" role="status"><oj-progress-circle value={-1} size="sm"></oj-progress-circle> 불러오는 중</div>}

    <section class="kpi-panel consumption-sales-rep-overview" aria-labelledby="salesRepOverviewTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Current ownership · K USD</span><h2 id="salesRepOverviewTitle">Sales Rep Overview</h2></div>
      </div>
      <div class="consumption-sales-rep-table"><table><thead><tr><th>Sales Rep</th><th>Actual YTD</th><th>YoY same-period Actual</th><th>Covered-period Expected</th><th>Accounts</th><th>Top 3</th><th>Attention</th></tr></thead><tbody>
        {analysis.salesRepOverview.map((row) => <tr key={row.salesRep} class={selectedSalesRep === row.salesRep ? "is-selected" : ""}>
          <th><button type="button" onClick={() => { setSelectedSalesRep(row.salesRep); setSelectedAccountContext(""); setSelectedAccountName(""); }}>{row.salesRep}</button></th>
          <td>{amountK(row.actualAmount)}</td><td class={typeof row.actualGrowthAmount !== "number" ? "" : row.actualGrowthAmount < 0 ? "is-negative" : "is-positive"}>
            {typeof row.actualGrowthAmount !== "number" ? "N/A"
              : <>{amountK(row.actualGrowthAmount)} · {row.yoyComparisonStatus === "PRIOR_PERIOD_ZERO" ? "rate N/A" : signedPercent(row.actualGrowthPercent)}</>}
          </td>
          <td>{amountK(row.fyExpectedAmount)}</td><td>{row.accountCount}</td><td>{row.topThreeConcentrationPercent.toFixed(1)}%</td><td>{row.attentionAccountCount}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section class="consumption-insights-kpis" aria-label="Consumption KPIs">
      <article class="kpi-panel"><span>{analysis.fiscalYear} covered-period consumption</span><strong>{compactCurrency.format(analysis.portfolio.totalAmount)}</strong><small>{splitLabel(analysis.portfolio)}</small></article>
      <article class="kpi-panel"><span>Latest complete quarter</span><strong>{latestCompleteQuarter ? compactCurrency.format(latestCompleteQuarter.totalAmount) : "N/A"}</strong><small>{latestCompleteQuarter ? `${latestCompleteQuarter.quarter} · ${signedPercent(latestCompleteQuarter.qoqChangePercent)} QoQ` : "No complete ACTUAL quarter"}</small></article>
      <article class="kpi-panel"><span>Forecast exposure</span><strong>{forecastExposure.toFixed(1)}%</strong><small>{currency.format(analysis.portfolio.forecastAmount)} of selected total</small></article>
      <article class="kpi-panel"><span>Change alerts</span><strong>{analysis.alerts.length}</strong><small>{analysis.alerts.filter((alert) => alert.grade === "CRITICAL").length} critical · {analysis.alerts.filter((alert) => alert.grade === "HIGH").length} high</small></article>
    </section>

    <section class="consumption-insights-performance-grid">
      <section class="kpi-panel" aria-labelledby="fyQuarterTotalsTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">Actual + Forecast</span><h2 id="fyQuarterTotalsTitle">FY &amp; Quarter totals</h2></div><span class="consumption-insights-legend"><i class="is-actual"></i>ACTUAL <i class="is-forecast"></i>FORECAST</span></div>
        <div class="consumption-insights-total-regions">
          <div class="consumption-insights-fy-total"><h3>Covered-period totals</h3><oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={fiscalTotalsChart} dataLabel={trendDataLabel} legend={{ rendered: "off" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label="Covered-period ACTUAL and FORECAST stacked totals"><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart></div>
          <div class="consumption-insights-totals-divider" role="separator" aria-orientation="vertical"></div>
          <div class="consumption-insights-quarter-totals">
            <h3>{analysis.fiscalYear} Mixed quarter consumption</h3>
            <oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={quarterTotalsChart} dataLabel={trendDataLabel} legend={{ rendered: "off" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label={`${analysis.fiscalYear} Q1 Q2 Q3 Q4 ACTUAL-first and FORECAST fallback consumption in K`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>
          </div>
        </div>
      </section>
      <section class="kpi-panel" aria-labelledby="qoqTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">vs previous fiscal quarter</span><h2 id="qoqTitle">Quarter-over-quarter</h2></div></div>
        <div class="consumption-insights-qoq-cards">{analysis.quarters.map((quarter) => <article key={quarter.quarter} class={(quarter.qoqChangePercent ?? 0) < 0 ? "is-negative" : "is-positive"}><span>{quarter.quarter}</span><strong>{signedPercent(quarter.qoqChangePercent)}</strong><small>{qoqKind(quarter.status)}</small></article>)}</div>

      </section>
    </section>

    <section class="kpi-panel consumption-insights-composition" aria-labelledby="forecastCompositionTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Stored Forecast components · K USD</span><h2 id="forecastCompositionTitle">Forecast composition by quarter</h2></div></div>
      <div class="consumption-insights-composition-grid">
        <div class="consumption-insights-composition-chart">
          <oj-chart class="consumption-insights-composition-chart__plot" type="bar" orientation="horizontal" stack="off" data={movementChart} dataLabel={movementDataLabel} xAxis={{ tickLabel: { converter: movementAxisConverter } }} drilling="on" onojItemDrill={selectMovement} legend={{ rendered: "on" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label="Quarterly All Forecast New Expansion and Reduction as separate K USD amount bars"><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>

        </div>
        <section class="consumption-insights-movement-detail" aria-live="polite" aria-label={selectedMovement ? `${selectedMovement.quarter} ${selectedMovement.category} Account detail` : "Forecast composition detail"}>
          {selectedMovement && selectedMovementPoint ? <>
            <div class="consumption-insights-movement-heading">
              <div><span class="kpi-section-label">Forecast composition detail</span><h3>{selectedMovement.quarter} · {selectedMovement.category}</h3></div>
              <div class="consumption-insights-composition-selector" role="group" aria-label={`${selectedMovement.quarter} composition category`}>
                {COMPOSITION_CATEGORIES.map((category) => <button key={category} type="button" aria-pressed={selectedMovement.category === category}
                  onClick={() => setSelectedMovement({ quarter: selectedMovement.quarter, category })}>{category}</button>)}
              </div>
            </div>
            <div class="consumption-insights-movement-list">
              {selectedMovementAccounts.length > 0 ? <table><thead><tr><th>Account</th>{selectedMovement.category === "All" ? <><th>Total (K)</th><th>New (K)</th><th>Expansion (K)</th><th>Reduction (K)</th></> : <th>{selectedMovement.category} (K)</th>}</tr></thead><tbody>
                {selectedMovementAccounts.map((account) => <tr key={account.account}><td>{account.account}</td>{selectedMovement.category === "All" ? <>
                  <td>{currencyK.format(toK(account.totalForecastAmount))} K</td><td>{currencyK.format(toK(account.newAmount))} K</td><td>{currencyK.format(toK(account.expansionAmount))} K</td><td>{currencyK.format(toK(account.reductionAmount))} K</td>
                </> : <td>{currencyK.format(toK(movementValue(account)))} K</td>}</tr>)}
              </tbody>{selectedMovement.category === "All" ? <tfoot><tr><th>Total</th><th>{currencyK.format(toK(compositionTotals.totalForecastAmount))} K</th><th>{currencyK.format(toK(compositionTotals.newAmount))} K</th><th>{currencyK.format(toK(compositionTotals.expansionAmount))} K</th><th>{currencyK.format(toK(compositionTotals.reductionAmount))} K</th></tr></tfoot>
                : <tfoot><tr><th>Total</th><th>{currencyK.format(toK(selectedMovementAccounts.reduce((sum, account) => sum + movementValue(account), 0)))} K</th></tr></tfoot>}</table>
                : <p class="consumption-empty-state">No Account has a non-zero Forecast Total for this quarter.</p>}
            </div>
          </> : <div class="consumption-insights-composition-empty"><span class="kpi-section-label">Forecast composition detail</span><h3>Select a composition bar</h3></div>}
        </section>
      </div>
    </section>

    <section class="kpi-panel consumption-insights-alert-trend" aria-labelledby="alertTrendTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Detect change → verify trend</span><h2 id="alertTrendTitle">{"Consumption Change Alerts & linked Plan Trend"}</h2></div><span class="consumption-insights-status is-actual">ACTUAL ONLY</span></div>
      <div class="consumption-insights-alert-trend-grid" data-trend-contract="getAlertActualTrend(actualTrend)">
        <div class="consumption-signal-inbox">{analysis.alerts.map((alert) => { const presentation = alertPresentation(alert); const plan = findAlertPlan(analysis, alert); return <button type="button" key={alert.alertId}
          class={selectedAlert?.alertId === alert.alertId ? "consumption-signal is-selected" : "consumption-signal"}
          aria-pressed={selectedAlert?.alertId === alert.alertId} onClick={() => setSelectedAlertId((current) => current === alert.alertId ? "" : alert.alertId)}>
          <span class="consumption-signal-main"><strong>{alert.account}</strong><span>{alert.workloadMapped && <>{alert.workload} · </>}Plan {alert.planId}{plan && <> · <InsightsDataCenter plan={plan} selectedPillar={selectedPillar} /></>}</span><span class="consumption-signal-badges"><span class={`consumption-signal-type ${presentation.typeTone}`} aria-label={`Change type ${presentation.typeLabel}`}><i class={presentation.typeIcon} aria-hidden="true"></i>{presentation.typeLabel}</span><span class={`consumption-signal-grade ${presentation.gradeTone}`} aria-label={`Severity ${alert.grade}`}><i class={presentation.gradeIcon} aria-hidden="true"></i>{alert.grade}</span></span></span>
          <span class="consumption-signal-metrics"><strong>{currency.format(alert.actualAmount)}</strong><small>{signedCurrency(alert.changeAmount)} · {signedPercent(alert.changePercent)}</small></span>
        </button>; })}{analysis.alerts.length === 0 && <p class="consumption-empty-state">No ACTUAL usage change alerts for this context.</p>}</div>
        <div class="consumption-insights-linked-trend">
          <div><h3>ACTUAL Trend</h3><p>{selectedAlert ? `${selectedAlert.account} · ${selectedAlert.workloadMapped ? `${selectedAlert.workload} · ` : ""}${selectedAlert.planId}` : contextTrendLabel}</p></div>
          {trendPoints.length === 6 ? <oj-chart class="consumption-insights-actual-chart" type="line" data={trendChart} legend={{ rendered: "off" }}
            dataLabel={trendDataLabel} styleDefaults={{ dataLabelPosition: "aboveMarker", dataLabelCollision: "fitInBounds", hideOverlappingLabels: "on", markerDisplayed: "on" }}
            aria-label={`${selectedAlert ? "Selected Plan" : contextTrendLabel} six-month ACTUAL Trend`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>
            : <p class="consumption-empty-state">Six contiguous ACTUAL months ending at the alert month are unavailable.</p>}
          {selectedAlert && <p class="consumption-signal-reason"><strong>Why flagged:</strong> {selectedAlert.reason}</p>}
        </div>
      </div>
    </section>

    <section class="consumption-sales-account-review" aria-label="Sales Account growth and attention">
      <section class="kpi-panel consumption-sales-account-card"><div class="consumption-section-heading"><div><span class="kpi-section-label">YoY same-period ACTUAL contribution · K USD</span><h2>Account Growth / Reduction</h2></div></div>
        <div class="consumption-sales-movement-columns">
          <div><h3>Growth</h3>{growthAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}><span>{account.account}</span><strong>{amountK(account.actualGrowthAmount)}</strong></button>)}{growthAccounts.length === 0 && <p class="consumption-empty-state">No growing Accounts.</p>}</div>
          <div><h3>Reduction</h3>{declineAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}><span>{account.account}</span><strong>{amountK(account.actualGrowthAmount)}</strong></button>)}{declineAccounts.length === 0 && <p class="consumption-empty-state">No Accounts with YoY reduction.</p>}</div>
        </div>
      </section>
      <section class="kpi-panel consumption-sales-account-card"><div class="consumption-section-heading"><div><span class="kpi-section-label">Reason-based review</span><h2>Attention Accounts</h2></div></div>
        <div class="consumption-sales-attention-list">{attentionAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}>
          <span><strong>{account.account}</strong><small>{account.salesRep} · {account.attentionReasons.join(" · ")}</small></span>
          <span>{amountK(account.actualAmount)}<small>{account.forecastEntryStatus === "MISSING" ? "Forecast missing" : account.forecastEntryStatus === "ZERO" ? "Forecast entered as 0" : `FY Expected ${amountK(account.totalAmount)}`}</small></span>
        </button>)}{attentionAccounts.length === 0 && <p class="consumption-empty-state">No Accounts require attention for this context.</p>}</div>
      </section>
    </section>

    <section class="consumption-insights-contribution" aria-label="Account to Plan contribution">
      <span class="kpi-section-label">Account Contribution → Plan Contribution</span>
      <div class="consumption-insights-contribution-grid">
        <section class="kpi-panel" aria-labelledby="accountContributionTitle"><div class="consumption-section-heading"><div><h2 id="accountContributionTitle">Account Contribution</h2><p>{selectedContextLabel}</p></div></div>
          <div class="consumption-insights-contribution-list">{topAccounts.map((account) => <button type="button" key={account.account}
            class={selectedAccount?.account === account.account ? "is-selected" : ""} aria-pressed={selectedAccount?.account === account.account}
            onClick={() => setSelectedAccountName(account.account)}>
            <span>{account.account} · {account.salesRep}</span><strong>{amountK(account.totalAmount)}</strong><small>{account.percentage.toFixed(1)}% · {splitLabel(account)} · {account.forecastEntryStatus === "MISSING" ? "Forecast missing" : account.forecastEntryStatus === "ZERO" ? "Forecast 0 entered" : "Forecast entered"}</small><i><b style={`width:${Math.max(0, Math.min(100, account.percentage))}%`}></b></i>
          </button>)}</div>
        </section>
        <section class="kpi-panel" aria-labelledby="planContributionTitle"><div class="consumption-section-heading"><div><h2 id="planContributionTitle">Plan Contribution</h2><p>{selectedAccount?.account ?? "Select an Account"}</p></div></div>
          <div class="consumption-insights-plan-list">{selectedPlans.map(({ workload, plan, percentageContext }) => <article key={plan.serverPlanId}><div><strong>{plan.endUser}</strong><span class={statusTone(plan.status)}>{plan.status}</span></div><small>{!isUnmappedConsumptionLabel(workload) && <><b>{workload}</b> · </>}Plan {plan.planId} · <InsightsDataCenter plan={plan} selectedPillar={selectedPillar} /> · {plan.percentage.toFixed(1)}% of {percentageContext}</small><div class="consumption-insights-plan-track" aria-label={`${plan.percentage.toFixed(1)}% of ${percentageContext}; ${splitLabel(plan)}`}><div class="consumption-insights-split-bar" style={`width:${Math.max(0, Math.min(100, plan.percentage))}%`}><i class="is-actual" style={`width:${plan.totalAmount === 0 ? 0 : Math.max(0, plan.actualAmount / plan.totalAmount * 100)}%`}></i><i class="is-forecast" style={`width:${plan.totalAmount === 0 ? 0 : Math.max(0, plan.forecastAmount / plan.totalAmount * 100)}%`}></i></div></div><span>{splitLabel(plan)}</span></article>)}{selectedPlans.length === 0 && <p class="consumption-empty-state">No Plan contribution is available.</p>}</div>
        </section>
      </div>
    </section>
  </section>;
}
