import { ComponentChildren, h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import { ConsumptionPillar, consumptionPillarOptions } from "../../data/consumptionData";
import { ForecastActualComparison, fetchForecastActualComparison } from "../../data/consumptionApi";
import { compareExactDecimals, formatExactCurrency } from "../../data/exactDecimal";
import "ojs/ojprogress-circle";

const money = (value: string) => formatExactCurrency(value);
const signedMoney = (value: string) => `${compareExactDecimals(value, "0") > 0 ? "+" : ""}${money(value)}`;
const percent = (value: string | null) => value === null ? "N/A" : `${compareExactDecimals(value, "0") > 0 ? "+" : ""}${value}%`;
const statusLabel = (status: string) => ({
  NO_CONFIRMED_ACTUAL: "No confirmed Actual",
  NO_FORECAST: "Actual only",
  BELOW_FORECAST: "Below Forecast",
  ABOVE_FORECAST: "Above Forecast",
  ON_FORECAST: "On Forecast"
}[status] ?? status);

export function ForecastActualPage({ fiscalYear, breadcrumb }: Readonly<{ fiscalYear: FiscalYear; breadcrumb?: ComponentChildren }>) {
  const [quarter, setQuarter] = useState("ALL");
  const [pillar, setPillar] = useState<ConsumptionPillar>("ALL");
  const [salesRep, setSalesRep] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [account, setAccount] = useState("");
  const previousFiscalYearRef = useRef(fiscalYear);
  const [data, setData] = useState<ForecastActualComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previousFiscalYearRef.current !== fiscalYear) {
      previousFiscalYearRef.current = fiscalYear;
      if (salesRep || account || accountQuery) {
        resetDependentFilters();
        return;
      }
    }
    let active = true;
    setLoading(true); setError("");
    fetchForecastActualComparison({ fiscalYear, quarter, pillar, salesRep, account })
      .then((value) => { if (active) setData(value); })
      .catch((failure) => { if (active) { setData(null); setError(failure instanceof Error ? failure.message : "Forecast comparison could not be loaded."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fiscalYear, quarter, pillar, salesRep, account]);

  const confirmedPeriods = data?.confirmedComparisonPeriods ?? [];
  const fullPeriods = data?.fullForecastPeriods ?? [];
  const hasConfirmedActual = confirmedPeriods.length > 0;
  const resetAccount = () => { setAccount(""); setAccountQuery(""); };
  const resetDependentFilters = () => { setSalesRep(""); resetAccount(); };

  return <section class="consumption-page forecast-actual-page" aria-labelledby="forecastActualTitle">
    <header class="consumption-page__header">
      <div>{breadcrumb}<span class="kpi-eyebrow">Consumption / Performance</span><h1 id="forecastActualTitle">Forecast vs Actual</h1></div>
    </header>

    <section class="forecast-actual-filters" aria-label="Forecast vs Actual filters">
      <label>FY<select value={fiscalYear} disabled aria-label="Fiscal year"><option value={fiscalYear}>{fiscalYear}</option></select></label>
      <label>Quarter<select value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); resetDependentFilters(); }}>
        <option value="ALL">All quarters</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>
      </select></label>
      <label>Pillar<select value={pillar} onChange={(event) => { setPillar(event.currentTarget.value as ConsumptionPillar); resetDependentFilters(); }}>
        {consumptionPillarOptions.map((option) => <option value={option.value}>{option.label}</option>)}
      </select></label>
      <label>Sales Rep<select value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccount(); }}>
        <option value="">All Sales Reps</option>{(data?.salesRepOptions ?? []).map((value) => <option value={value}>{value || "Unassigned"}</option>)}
      </select></label>
      <label>Account<input type="search" list="forecastActualAccounts" value={accountQuery} placeholder="Search and select account"
        onInput={(event) => {
          const value = event.currentTarget.value;
          setAccountQuery(value);
          if (!value) setAccount("");
          else if ((data?.accountOptions ?? []).includes(value)) setAccount(value);
          else if (value !== account) setAccount("");
        }} /></label>
      <datalist id="forecastActualAccounts">{(data?.accountOptions ?? []).map((value) => <option value={value} />)}</datalist>
    </section>

    {error ? <div class="consumption-inline-error" role="alert">{error}</div> : null}
    {loading ? <div class="forecast-actual-loading"><oj-progress-circle value={-1} size="md" /><span>Loading comparison…</span></div> : null}

    {!loading && data ? <>
      <div class="forecast-actual-period-note">
        Comparable periods: <strong>{hasConfirmedActual ? confirmedPeriods.join(", ") : "No finalized Actual periods"}</strong>
        <span>Full-period Forecast: <strong>{fullPeriods.join(", ")}</strong></span>
      </div>
      <section class="forecast-actual-summary" aria-label="Forecast and Actual totals">
        <article><span>Confirmed Actual</span><strong>{hasConfirmedActual ? money(data.summary.confirmedActualAmount) : "N/A"}</strong><small>{confirmedPeriods.join(" · ") || "No finalized period"}</small></article>
        <article><span>Comparable Forecast</span><strong>{hasConfirmedActual ? money(data.summary.confirmedForecastAmount) : "N/A"}</strong><small>Same finalized periods only</small></article>
        <article class={compareExactDecimals(data.summary.confirmedDifferenceAmount, "0") < 0 ? "is-negative" : "is-positive"}><span>Actual − Forecast</span><strong>{hasConfirmedActual ? signedMoney(data.summary.confirmedDifferenceAmount) : "N/A"}</strong><small>{hasConfirmedActual ? percent(data.summary.confirmedDifferencePercent) : "Unconfirmed months excluded"}</small></article>
        <article><span>Full-period Forecast</span><strong>{money(data.summary.fullPeriodForecastAmount)}</strong><small>{fullPeriods.join(" · ")}</small></article>
      </section>
      {quarter !== "ALL" ? <section class="forecast-actual-fy-summary" aria-label="Fiscal year totals">
        <h2>{fiscalYear} totals for current filters</h2>
        <div><span>FY Confirmed Actual</span><strong>{money(data.fiscalYearSummary.confirmedActualAmount)}</strong></div>
        <div><span>FY Comparable Forecast</span><strong>{money(data.fiscalYearSummary.confirmedForecastAmount)}</strong></div>
        <div><span>FY Actual − Forecast</span><strong>{signedMoney(data.fiscalYearSummary.confirmedDifferenceAmount)}</strong></div>
        <div><span>FY Full Forecast</span><strong>{money(data.fiscalYearSummary.fullPeriodForecastAmount)}</strong></div>
      </section> : null}
      <div class="forecast-actual-table-wrap">
        <table class="forecast-actual-table">
          <thead><tr><th>Sales Rep</th><th>Account</th><th>Confirmed Actual</th><th>Comparable Forecast</th><th>Actual − Forecast</th><th>Difference %</th><th>Full-period Forecast</th><th>Status</th></tr></thead>
          <tbody>{data.rows.length ? data.rows.map((row) => <tr key={`${row.salesRep}:${row.account}`} class={`forecast-actual-row forecast-actual-row--${row.status.toLowerCase()}`}>
            <td data-label="Sales Rep">{row.salesRep || "Unassigned"}</td><th scope="row" data-label="Account">{row.account}</th>
            <td data-label="Confirmed Actual">{hasConfirmedActual && row.status !== "NO_CONFIRMED_ACTUAL" ? money(row.confirmedActualAmount) : "N/A"}</td>
            <td data-label="Comparable Forecast">{hasConfirmedActual && row.status !== "NO_CONFIRMED_ACTUAL" ? money(row.confirmedForecastAmount) : "N/A"}</td>
            <td data-label="Actual − Forecast" class={compareExactDecimals(row.differenceAmount, "0") < 0 ? "is-negative" : "is-positive"}>{hasConfirmedActual && row.status !== "NO_CONFIRMED_ACTUAL" ? signedMoney(row.differenceAmount) : "N/A"}</td>
            <td data-label="Difference %">{hasConfirmedActual && row.status !== "NO_CONFIRMED_ACTUAL" ? percent(row.differencePercent) : "N/A"}</td>
            <td data-label="Full-period Forecast">{money(row.fullPeriodForecastAmount)}</td><td data-label="Status"><span class="forecast-actual-status">{statusLabel(row.status)}</span></td>
          </tr>) : <tr><td colSpan={8} class="forecast-actual-empty">No accounts match the selected filters.</td></tr>}</tbody>
        </table>
      </div>
    </> : null}
  </section>;
}
