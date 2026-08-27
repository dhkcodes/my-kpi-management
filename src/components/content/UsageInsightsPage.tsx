import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import { ConsumptionAnalysis, ConsumptionAnalysisAlert, ConsumptionAnalysisQuarter, fetchConsumptionAnalysis } from "../../data/consumptionApi";
import {
  ConsumptionAnalysisAccount,
  ConsumptionAnalysisPlan,
  ConsumptionAnalysisWorkload,
  ConsumptionAccountSort,
  ConsumptionSortDirection,
  sortAndFilterConsumptionAccounts
} from "../../data/consumptionData";
import "ojs/ojprogress-circle";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signedCurrency = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${currency.format(amount)}`;
const signedPercent = (amount: number | null) => amount === null ? "N/A" : `${amount > 0 ? "+" : ""}${amount.toFixed(1)}%`;
const qoqKind = (status: ConsumptionAnalysisQuarter["status"]) =>
  status === "ACTUAL" ? "QoQ" : status === "FORECAST" ? "Forecast QoQ" : "Projected QoQ";
const splitLabel = (value: { actualAmount: number; forecastAmount: number }) =>
  `ACTUAL ${currency.format(value.actualAmount)} · FORECAST ${currency.format(value.forecastAmount)}`;

function StatusAmount({ value, label }: Readonly<{
  value: { actualAmount: number; forecastAmount: number; totalAmount: number; status: string; coveragePercent?: number };
  label: string;
}>) {
  return <div class="consumption-insights-amount">
    <span>{label}</span><strong>{currency.format(value.totalAmount)}</strong>
    <small>{splitLabel(value)}</small>
    {typeof value.coveragePercent === "number" && <small>Coverage {value.coveragePercent.toFixed(0)}%</small>}
    <span class={`consumption-insights-status is-${value.status.toLowerCase()}`}>{value.status}</span>
  </div>;
}

const findAlertPlan = (analysis: ConsumptionAnalysis, alert: ConsumptionAnalysisAlert): ConsumptionAnalysisPlan | null =>
  analysis.accounts.find((account) => account.account === alert.account)?.workloads
    .find((workload) => workload.workload === alert.workload)?.plans
    .find((plan) => plan.serverPlanId === alert.serverPlanId) ?? null;

type AccountContributionRow = ConsumptionAnalysisAccount & Readonly<{ syntheticOther?: true }>;

export function UsageInsightsPage({ fiscalYear }: Readonly<{ fiscalYear: FiscalYear }>) {
  const [analysis, setAnalysis] = useState<ConsumptionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAlertId, setSelectedAlertId] = useState("");
  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [selectedWorkloadName, setSelectedWorkloadName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [accountMode, setAccountMode] = useState<"top" | "all">("top");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountSort, setAccountSort] = useState<ConsumptionAccountSort>("amount");
  const [accountDirection, setAccountDirection] = useState<ConsumptionSortDirection>("desc");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setAnalysis(null); setSelectedAlertId("");
    setSelectedAccountName(""); setSelectedWorkloadName(""); setSelectedPlanId(null);
    void fetchConsumptionAnalysis(fiscalYear)
      .then((value) => { if (active) setAnalysis(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Usage Insights could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fiscalYear]);

  const sortedAccounts = useMemo(() => analysis
    ? sortAndFilterConsumptionAccounts(analysis.accounts, accountSearch, accountSort, accountDirection)
    : [], [accountDirection, accountSearch, accountSort, analysis]);
  const accountRows = useMemo(() => {
    if (accountMode === "all" || sortedAccounts.length <= 5) return sortedAccounts;
    const top = sortedAccounts.slice(0, 5);
    const other = sortedAccounts.slice(5);
    const statuses = new Set(other.map((row) => row.status));
    const otherStatus = statuses.size === 1 ? other[0].status : statuses.has("INCOMPLETE") ? "INCOMPLETE" : "MIXED";
    const otherRow: AccountContributionRow = {
      syntheticOther: true, account: "Other", status: otherStatus,
      actualAmount: other.reduce((sum, row) => sum + row.actualAmount, 0),
      forecastAmount: other.reduce((sum, row) => sum + row.forecastAmount, 0),
      totalAmount: other.reduce((sum, row) => sum + row.totalAmount, 0),
      percentage: other.reduce((sum, row) => sum + row.percentage, 0), workloads: []
    };
    return [...top, otherRow];
  }, [accountMode, sortedAccounts]);
  const selectedAlert = analysis?.alerts.find((alert) => alert.alertId === selectedAlertId) ?? analysis?.alerts[0] ?? null;
  const alertPlan = analysis && selectedAlert ? findAlertPlan(analysis, selectedAlert) : null;
  const selectedAccount = analysis?.accounts.find((account) => account.account === selectedAccountName) ?? null;
  const selectedWorkload = selectedAccount?.workloads.find((workload) => workload.workload === selectedWorkloadName) ?? selectedAccount?.workloads[0] ?? null;
  const selectedPlan = selectedWorkload?.plans.find((plan) => plan.serverPlanId === selectedPlanId) ?? selectedWorkload?.plans[0] ?? null;
  const selectAccount = (account: AccountContributionRow) => {
    if (account.syntheticOther) { setAccountMode("all"); return; }
    setSelectedAccountName(account.account); setSelectedWorkloadName(account.workloads[0]?.workload ?? "");
    setSelectedPlanId(account.workloads[0]?.plans[0]?.serverPlanId ?? null);
  };
  const selectWorkload = (workload: ConsumptionAnalysisWorkload) => {
    setSelectedWorkloadName(workload.workload); setSelectedPlanId(workload.plans[0]?.serverPlanId ?? null);
  };

  if (loading) return <section class="kpi-panel consumption-insights-loading" role="status" aria-busy="true"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading Usage Insights…</section>;
  if (error || !analysis) return <section class="kpi-panel" role="alert"><h1>Usage Insights</h1><p>{error || "Analysis is unavailable."}</p></section>;

  return <section class="consumption-insights-page" aria-labelledby="usageInsightsTitle" data-fiscal-year={fiscalYear}>
    <header class="consumption-page__header"><div><span class="kpi-eyebrow">Consumption</span><h1 id="usageInsightsTitle">Usage Insights</h1></div></header>

    <section class="kpi-panel" aria-labelledby="fyPortfolioTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">FY Portfolio</span><h2 id="fyPortfolioTitle">Current and Prior FY</h2></div></div>
      <div class="consumption-insights-portfolio">
        <StatusAmount label={analysis.fiscalYear} value={analysis.portfolio} />
        <StatusAmount label={`Prior FY · ${analysis.priorFiscalYear}`} value={{ actualAmount: analysis.portfolio.priorActualAmount,
          forecastAmount: analysis.portfolio.priorForecastAmount, totalAmount: analysis.portfolio.priorTotalAmount,
          status: analysis.portfolio.priorStatus, coveragePercent: analysis.portfolio.priorCoveragePercent }} />
      </div>
    </section>

    <section class="consumption-insights-quarter-grid" aria-label="Q1 Q2 Q3 Q4 quarterly consumption and QoQ status">
      {analysis.quarters.map((quarter) => <article class="kpi-panel" key={quarter.quarter}>
        <StatusAmount label={quarter.quarter} value={quarter} />
        <div class="consumption-insights-qoq"><span>{quarter.qoqChangePercent === null ? "QoQ N/A" : qoqKind(quarter.status)}</span><strong>{signedCurrency(quarter.qoqChangeAmount)}</strong><small>{signedPercent(quarter.qoqChangePercent)}</small></div>
      </article>)}
    </section>

    <section class="consumption-pulse-layout">
      <section class="kpi-panel" aria-labelledby="insightAlertsTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">ACTUAL only</span><h2 id="insightAlertsTitle">Consumption Change Alerts</h2></div><span class="consumption-count-badge">{analysis.alerts.length}</span></div>
        <div class="consumption-signal-inbox">
          {analysis.alerts.map((alert) => <button type="button" key={alert.alertId} class={selectedAlert?.alertId === alert.alertId ? "consumption-signal is-selected" : "consumption-signal"}
            aria-pressed={selectedAlert?.alertId === alert.alertId} onClick={() => setSelectedAlertId(alert.alertId)}>
            <span class="consumption-signal-main"><strong>{alert.account}</strong><span>{alert.workload}</span><small>Plan {alert.planId} · {alert.periodKey}</small></span>
            <span class="consumption-signal-metrics"><strong>{currency.format(alert.actualAmount)}</strong><small>{signedCurrency(alert.changeAmount)} · {signedPercent(alert.changePercent)}</small></span>
          </button>)}
          {analysis.alerts.length === 0 && <p class="consumption-empty-state">No ACTUAL usage change alerts for this fiscal year.</p>}
        </div>
      </section>
      <section class="kpi-panel" aria-labelledby="actualTrendTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">Selected Plan · ACTUAL Trend</span><h2 id="actualTrendTitle">Plan ACTUAL Trend</h2><p>{selectedAlert ? `${selectedAlert.account} · ${selectedAlert.workload} · ${selectedAlert.planId}` : "Select a change alert"}</p></div></div>
        <div class="consumption-insights-trend" aria-label="Selected Plan ACTUAL Trend">
          {(alertPlan?.actualTrend ?? []).map((point) => <div key={point.periodKey}><span>{point.periodKey}</span><strong>{currency.format(point.actualAmount)}</strong></div>)}
          {!alertPlan && <p>No selected Plan ACTUAL trend is available.</p>}
        </div>
      </section>
    </section>

    <section class="kpi-panel" aria-labelledby="accountContributionTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">FY contribution</span><h2 id="accountContributionTitle">Account Contribution</h2></div></div>
      <div class="consumption-insights-controls" role="toolbar" aria-label="Account contribution controls">
        <button type="button" aria-pressed={accountMode === "top"} onClick={() => setAccountMode("top")}>Top 5 + Other</button>
        <button type="button" aria-pressed={accountMode === "all"} onClick={() => setAccountMode("all")}>All accounts</button>
        <label>Search accounts<input type="search" value={accountSearch} onInput={(event) => setAccountSearch(event.currentTarget.value)} /></label>
        <label>Sort<select value={accountSort} onChange={(event) => setAccountSort(event.currentTarget.value as ConsumptionAccountSort)}><option value="amount">Amount</option><option value="account">Account</option></select></label>
        <label>Direction<select value={accountDirection} onChange={(event) => setAccountDirection(event.currentTarget.value as ConsumptionSortDirection)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      </div>
      <div class="consumption-insights-contribution-list">
        {accountRows.map((account) => <button type="button" key={account.account} aria-pressed={selectedAccount?.account === account.account} onClick={() => selectAccount(account)}><span>{account.account}</span><strong>{currency.format(account.totalAmount)}</strong><small>{account.percentage.toFixed(1)}% · {splitLabel(account)} · {account.status}</small></button>)}
      </div>
    </section>

    {selectedAccount && <section class="kpi-panel" aria-labelledby="planContributionTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">FY Account / Workload / Plan detail</span><h2 id="planContributionTitle">Plan Contribution</h2><p>{selectedAccount.account}</p></div></div>
      <div class="consumption-insights-detail">
        <aside aria-label="Workload contribution"><h3>Workload</h3>{selectedAccount.workloads.map((workload) => <button type="button" key={workload.workload} aria-pressed={selectedWorkload?.workload === workload.workload} class={selectedWorkload?.workload === workload.workload ? "is-selected" : ""} onClick={() => selectWorkload(workload)}><span>{workload.workload}</span><strong>{currency.format(workload.totalAmount)}</strong><small>{workload.percentage.toFixed(1)}% of Account · {splitLabel(workload)} · {workload.status}</small></button>)}</aside>
        <div><h3>Plan</h3>{selectedWorkload?.plans.map((plan) => <button type="button" key={plan.serverPlanId} aria-pressed={selectedPlan?.serverPlanId === plan.serverPlanId} class={selectedPlan?.serverPlanId === plan.serverPlanId ? "is-selected" : ""} onClick={() => setSelectedPlanId(plan.serverPlanId)}><span>{plan.planId} · {plan.endUser}</span><strong>{currency.format(plan.totalAmount)}</strong><small>{plan.percentage.toFixed(1)}% of Account · {plan.dataCenter} · {splitLabel(plan)} · {plan.status}</small></button>)}</div>
      </div>
    </section>}
  </section>;
}
