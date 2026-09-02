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
  getAlertActualTrend
} from "../../data/consumptionData";
import "ojs/ojprogress-circle";
import "ojs/ojchart";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const signedCurrency = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${currency.format(amount)}`;
const signedPercent = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${amount.toFixed(1)}%`;
const qoqKind = (status: ConsumptionAnalysisQuarter["status"]) => status === "ACTUAL" ? "ACTUAL"
  : status === "FORECAST" ? "FORECAST · projection" : status === "MIXED" ? "MIXED · projection" : "INCOMPLETE";
const splitLabel = (value: { actualAmount: number; forecastAmount: number }) => `ACTUAL ${currency.format(value.actualAmount)} · FORECAST ${currency.format(value.forecastAmount)}`;
const trendDataLabel = ({ value }: Readonly<{ value: number }>) => compactCurrency.format(value);
const ACTUAL_COLOR = "#315f75";
const FORECAST_COLOR = "#78abc4";
const ALL_ACCOUNTS = "All Accounts Total";

type InsightChartPoint = Readonly<{
  id: string;
  seriesId: string;
  groupId: string;
  value: number | null;
  color: string;
  shortDesc: string;
  pattern?: "smallDiagonalRight";
  markerSize?: number;
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

export function UsageInsightsPage({ fiscalYear }: Readonly<{ fiscalYear: FiscalYear }>) {
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
  const [otherSelected, setOtherSelected] = useState(false);
  const requestGeneration = useRef(0);

  useEffect(() => {
    setSelectedAccountContext("");
    setCandidateSearch("");
    setDebouncedCandidateSearch("");
    setSelectedAlertId("");
    setSelectedAccountName("");
    setOtherSelected(false);
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
    void fetchConsumptionAnalysis({ fiscalYear, search: debouncedCandidateSearch, account: selectedAccountContext })
      .then((value) => {
        if (!active || generation !== requestGeneration.current) return;
        setAnalysis(value);
        setSelectedAlertId((current) => value.alerts.some((alert) => alert.alertId === current) ? current : "");
        setSelectedAccountName((current) => current && value.accounts.some((account) => account.account === current) ? current : "");
      })
      .catch((reason) => {
        if (active && generation === requestGeneration.current) setError(reason instanceof Error ? reason.message : "Usage Insights could not be loaded.");
      })
      .finally(() => { if (active && generation === requestGeneration.current) setLoading(false); });
    return () => { active = false; };
  }, [debouncedCandidateSearch, fiscalYear, selectedAccountContext]);

  const analysis = analysisResponse
    && analysisResponse.fiscalYear === fiscalYear
    && analysisResponse.selectedAccount === (selectedAccountContext || null)
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
  const otherContribution = analysis?.otherContribution ?? null;
  const selectedPlans = otherSelected
    ? otherContribution?.plans.map((plan) => ({ account: plan.account, workload: plan.workload, plan, percentageContext: "Other Accounts" })) ?? []
    : selectedAccount?.workloads.flatMap((workload) => workload.plans.map((plan) => ({ account: selectedAccount.account, workload: workload.workload, plan, percentageContext: "selected Account" }))) ?? [];

  const selectAccountContext = (account: string) => {
    setSelectedAccountContext(account);
    setCandidateSearch("");
    setDebouncedCandidateSearch("");
    setComboboxOpen(false);
    setActiveCandidateIndex(0);
    setSelectedAlertId("");
    setSelectedAccountName("");
    setOtherSelected(false);
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
      { id: `${row.label}-actual`, seriesId: "ACTUAL", groupId: row.label, value: row.actualAmount, color: ACTUAL_COLOR, shortDesc: `${row.label} ACTUAL ${currency.format(row.actualAmount)}` },
      { id: `${row.label}-forecast`, seriesId: "FORECAST", groupId: row.label, value: row.forecastAmount, color: FORECAST_COLOR, pattern: "smallDiagonalRight" as const, shortDesc: `${row.label} FORECAST ${currency.format(row.forecastAmount)}` }
    ]));
  }, [analysis]);
  const quarterTotalsChart = useMemo(() => {
    if (!analysis) return chart([]);
    return chart(analysis.quarters.flatMap((quarter) => [
      { id: `${quarter.quarter}-actual`, seriesId: "ACTUAL", groupId: quarter.quarter, value: quarter.actualAmount, color: ACTUAL_COLOR, shortDesc: `${quarter.quarter} ACTUAL ${currency.format(quarter.actualAmount)}` },
      { id: `${quarter.quarter}-forecast`, seriesId: "FORECAST", groupId: quarter.quarter, value: quarter.forecastAmount, color: FORECAST_COLOR, pattern: "smallDiagonalRight" as const, shortDesc: `${quarter.quarter} FORECAST ${currency.format(quarter.forecastAmount)}` }
    ]));
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

  if (loading && !analysis) return <section class="kpi-panel consumption-insights-loading" role="status" aria-busy="true"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading Usage Insights…</section>;
  if (error && !analysis) return <section class="kpi-panel" role="alert"><h1>Consumption Analysis</h1><p>{error}</p></section>;
  if (!analysis) return <section class="kpi-panel" role="alert">Analysis is unavailable.</section>;

  const latestCompleteQuarter = [...analysis.quarters].reverse()
    .find((quarter) => quarter.status === "ACTUAL" && quarter.coveragePercent === 100) ?? null;
  const forecastExposure = analysis.portfolio.totalAmount === 0 ? 0 : analysis.portfolio.forecastAmount / analysis.portfolio.totalAmount * 100;
  const selectedContextLabel = selectedAccountContext || ALL_ACCOUNTS;
  const contextTrendLabel = selectedAccountContext ? `${ALL_ACCOUNTS} · ${selectedAccountContext} filter` : ALL_ACCOUNTS;

  return <section class="consumption-insights-page" aria-labelledby="usageInsightsTitle" data-fiscal-year={fiscalYear} data-account-context={selectedAccountContext || "all"}>
    <header class="consumption-page__header consumption-insights-header">
      <div><span class="kpi-eyebrow">Consumption / Analysis</span><h1 id="usageInsightsTitle">Consumption Analysis</h1></div>
      <div class="consumption-insights-context" aria-label="Usage Insights filters">
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
    </header>

    {loading && <div class="consumption-insights-refresh" role="status"><oj-progress-circle value={-1} size="sm"></oj-progress-circle> Updating analysis context…</div>}
    {error && <div class="consumption-import-error" role="alert">{error}</div>}

    <section class="consumption-insights-kpis" aria-label="Consumption KPIs">
      <article class="kpi-panel"><span>{analysis.fiscalYear} total consumption</span><strong>{compactCurrency.format(analysis.portfolio.totalAmount)}</strong><small>{splitLabel(analysis.portfolio)}</small></article>
      <article class="kpi-panel"><span>Latest complete quarter</span><strong>{latestCompleteQuarter ? compactCurrency.format(latestCompleteQuarter.totalAmount) : "N/A"}</strong><small>{latestCompleteQuarter ? `${latestCompleteQuarter.quarter} · ${signedPercent(latestCompleteQuarter.qoqChangePercent)} QoQ` : "No complete ACTUAL quarter"}</small></article>
      <article class="kpi-panel"><span>Forecast exposure</span><strong>{forecastExposure.toFixed(1)}%</strong><small>{currency.format(analysis.portfolio.forecastAmount)} of selected total</small></article>
      <article class="kpi-panel"><span>Change alerts</span><strong>{analysis.alerts.length}</strong><small>{analysis.alerts.filter((alert) => alert.grade === "CRITICAL").length} critical · {analysis.alerts.filter((alert) => alert.grade === "HIGH").length} high</small></article>
    </section>

    <section class="consumption-insights-performance-grid">
      <section class="kpi-panel" aria-labelledby="fyQuarterTotalsTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">Actual + Forecast</span><h2 id="fyQuarterTotalsTitle">FY &amp; Quarter totals</h2></div><span class="consumption-insights-legend"><i class="is-actual"></i>ACTUAL <i class="is-forecast"></i>FORECAST</span></div>
        <div class="consumption-insights-total-regions">
          <div class="consumption-insights-fy-total"><h3>Fiscal year totals</h3><oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={fiscalTotalsChart} legend={{ rendered: "off" }} aria-label="Fiscal year ACTUAL and patterned FORECAST stacked totals"><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart></div>
          <div class="consumption-insights-totals-divider" role="separator" aria-orientation="vertical"></div>
          <div class="consumption-insights-quarter-totals"><h3>{analysis.fiscalYear} Quarter totals</h3><oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={quarterTotalsChart} legend={{ rendered: "off" }} aria-label={`${analysis.fiscalYear} Q1 Q2 Q3 Q4 ACTUAL and patterned FORECAST stacked totals`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart></div>
        </div>
      </section>
      <section class="kpi-panel" aria-labelledby="qoqTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">vs previous fiscal quarter</span><h2 id="qoqTitle">Quarter-over-quarter</h2></div></div>
        <div class="consumption-insights-qoq-cards">{analysis.quarters.map((quarter) => <article key={quarter.quarter} class={(quarter.qoqChangePercent ?? 0) < 0 ? "is-negative" : "is-positive"}><span>{quarter.quarter}</span><strong>{signedPercent(quarter.qoqChangePercent)}</strong><small>{qoqKind(quarter.status)}</small></article>)}</div>
        <p class="consumption-insights-note">Completed ACTUAL quarters drive the decision metric; MIXED and FORECAST quarters remain visibly labelled projections.</p>
      </section>
    </section>

    <section class="kpi-panel consumption-insights-alert-trend" aria-labelledby="alertTrendTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Detect change → verify trend</span><h2 id="alertTrendTitle">{"Consumption Change Alerts & linked Plan Trend"}</h2></div><span class="consumption-insights-status is-actual">ACTUAL ONLY</span></div>
      <div class="consumption-insights-alert-trend-grid" data-trend-contract="getAlertActualTrend(actualTrend)">
        <div class="consumption-signal-inbox">{analysis.alerts.map((alert) => { const presentation = alertPresentation(alert); const plan = findAlertPlan(analysis, alert); return <button type="button" key={alert.alertId}
          class={selectedAlert?.alertId === alert.alertId ? "consumption-signal is-selected" : "consumption-signal"}
          aria-pressed={selectedAlert?.alertId === alert.alertId} onClick={() => setSelectedAlertId((current) => current === alert.alertId ? "" : alert.alertId)}>
          <span class="consumption-signal-main"><strong>{alert.account}</strong><span>{alert.workload} · Plan {alert.planId} · DC {plan?.dataCenter ?? "N/A"}</span><span class="consumption-signal-badges"><span class={`consumption-signal-type ${presentation.typeTone}`} aria-label={`Change type ${presentation.typeLabel}`}><i class={presentation.typeIcon} aria-hidden="true"></i>{presentation.typeLabel}</span><span class={`consumption-signal-grade ${presentation.gradeTone}`} aria-label={`Severity ${alert.grade}`}><i class={presentation.gradeIcon} aria-hidden="true"></i>{alert.grade}</span></span></span>
          <span class="consumption-signal-metrics"><strong>{currency.format(alert.actualAmount)}</strong><small>{signedCurrency(alert.changeAmount)} · {signedPercent(alert.changePercent)}</small></span>
        </button>; })}{analysis.alerts.length === 0 && <p class="consumption-empty-state">No ACTUAL usage change alerts for this context.</p>}</div>
        <div class="consumption-insights-linked-trend">
          <div><h3>ACTUAL Trend</h3><p>{selectedAlert ? `${selectedAlert.account} · ${selectedAlert.workload} · ${selectedAlert.planId}` : contextTrendLabel}</p></div>
          {trendPoints.length === 6 ? <oj-chart class="consumption-insights-actual-chart" type="line" data={trendChart} legend={{ rendered: "off" }}
            dataLabel={trendDataLabel} styleDefaults={{ dataLabelPosition: "aboveMarker", dataLabelCollision: "fitInBounds", hideOverlappingLabels: "on", markerDisplayed: "on" }}
            aria-label={`${selectedAlert ? "Selected Plan" : contextTrendLabel} six-month ACTUAL Trend`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>
            : <p class="consumption-empty-state">Six contiguous ACTUAL months ending at the alert month are unavailable.</p>}
          {selectedAlert && <p class="consumption-signal-reason"><strong>Why flagged:</strong> {selectedAlert.reason}</p>}
        </div>
      </div>
    </section>

    <section class="consumption-insights-contribution" aria-label="Account to Plan contribution">
      <span class="kpi-section-label">Account Contribution → Plan Contribution</span>
      <div class="consumption-insights-contribution-grid">
        <section class="kpi-panel" aria-labelledby="accountContributionTitle"><div class="consumption-section-heading"><div><h2 id="accountContributionTitle">Account Contribution</h2><p>{selectedContextLabel}</p></div></div>
          <div class="consumption-insights-contribution-list">{topAccounts.map((account) => <button type="button" key={account.account}
            class={!otherSelected && selectedAccount?.account === account.account ? "is-selected" : ""} aria-pressed={!otherSelected && selectedAccount?.account === account.account}
            onClick={() => { setSelectedAccountName(account.account); setOtherSelected(false); }}>
            <span>{account.account}</span><strong>{compactCurrency.format(account.totalAmount)}</strong><small>{account.percentage.toFixed(1)}% · {splitLabel(account)}</small><i><b style={`width:${Math.max(0, Math.min(100, account.percentage))}%`}></b></i>
          </button>)}
          {otherContribution && <button type="button" class="consumption-insights-account-other" aria-pressed={otherSelected}
            aria-label={`Other Accounts ${otherContribution.percentage.toFixed(1)}%; ${otherContribution.accountNames.join(", ")}`}
            onClick={() => { setOtherSelected(true); setSelectedAccountName(""); }}>
            <span>Other Accounts</span><strong>{compactCurrency.format(otherContribution.totalAmount)}</strong><small>{otherContribution.percentage.toFixed(1)}% · {splitLabel(otherContribution)}</small>
            <i><b style={`width:${Math.max(0, Math.min(100, otherContribution.percentage))}%`}></b></i>
          </button>}
          {!otherContribution && analysis?.otherContributionUnavailableReason && <div class="consumption-insights-account-unavailable" role="status" aria-label={`Other Accounts N/A. ${analysis.otherContributionUnavailableReason}`}>
            <span>Other Accounts</span><strong>N/A</strong><small>{analysis.otherContributionUnavailableReason}</small>
          </div>}</div>
        </section>
        <section class="kpi-panel" aria-labelledby="planContributionTitle"><div class="consumption-section-heading"><div><h2 id="planContributionTitle">Plan Contribution</h2><p>{otherSelected ? "Other Accounts" : selectedAccount?.account ?? "Select an Account"}</p></div></div>
          <div class="consumption-insights-plan-list">{selectedPlans.map(({ account, workload, plan, percentageContext }) => <article key={plan.serverPlanId}><div><strong>{plan.endUser}</strong><span class={statusTone(plan.status)}>{plan.status}</span></div><small>{otherSelected && <><b>{account}</b> · </>}<b>{workload}</b> · Plan {plan.planId} · {plan.dataCenter} · {plan.percentage.toFixed(1)}% of {percentageContext}</small><div class="consumption-insights-plan-track" aria-label={`${plan.percentage.toFixed(1)}% of ${percentageContext}; ${splitLabel(plan)}`}><div class="consumption-insights-split-bar" style={`width:${Math.max(0, Math.min(100, plan.percentage))}%`}><i class="is-actual" style={`width:${plan.totalAmount === 0 ? 0 : Math.max(0, plan.actualAmount / plan.totalAmount * 100)}%`}></i><i class="is-forecast" style={`width:${plan.totalAmount === 0 ? 0 : Math.max(0, plan.forecastAmount / plan.totalAmount * 100)}%`}></i></div></div><span>{splitLabel(plan)}</span></article>)}{selectedPlans.length === 0 && <p class="consumption-empty-state">No Plan contribution is available.</p>}</div>
        </section>
      </div>
    </section>
  </section>;
}
