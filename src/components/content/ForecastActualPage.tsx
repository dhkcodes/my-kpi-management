import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import { ConsumptionPillar, consumptionPillarOptions } from "../../data/consumptionData";
import { ForecastActualComparison, ForecastActualMode, ForecastActualRow, fetchForecastActualComparison } from "../../data/consumptionApi";
import { compareExactDecimals, formatExactCurrency } from "../../data/exactDecimal";
import "ojs/ojprogress-circle";

const money = (value: string | null) => value === null ? "N/A" : formatExactCurrency(value);
const monthLabel = (periodKey: string) => {
  const parts = periodKey.split("-");
  return parts[parts.length - 1] ?? periodKey;
};
type SortKey = "salesRep" | "account" | "forecast" | "projected" | "attention";

const rowValue = (row: ForecastActualRow, key: SortKey) => {
  if (key === "forecast") return row.fullPeriodForecastAmount;
  if (key === "projected") return row.projectedAmount;
  if (key === "attention") return row.attention === true ? "2" : row.attention === false ? "1" : "0";
  return row[key].toLocaleLowerCase();
};

export function ForecastActualPage({ fiscalYear, breadcrumb }: Readonly<{ fiscalYear: FiscalYear; breadcrumb?: ComponentChildren }>) {
  const [quarter, setQuarter] = useState("ALL");
  const [pillar, setPillar] = useState<ConsumptionPillar>("ALL");
  const [actualMode, setActualMode] = useState<ForecastActualMode>("FINAL");
  const [salesRep, setSalesRep] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [account, setAccount] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("salesRep");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const previousFiscalYearRef = useRef(fiscalYear);
  const [data, setData] = useState<ForecastActualComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const resetAccount = () => { setAccount(""); setAccountQuery(""); };
  const resetDependentFilters = () => { setSalesRep(""); resetAccount(); };

  useEffect(() => {
    if (previousFiscalYearRef.current !== fiscalYear) {
      previousFiscalYearRef.current = fiscalYear;
      if (salesRep || account || accountQuery) { resetDependentFilters(); return; }
    }
    let active = true;
    setLoading(true); setError("");
    fetchForecastActualComparison({ fiscalYear, quarter, pillar, actualMode, salesRep, account })
      .then((value) => { if (active) setData(value); })
      .catch((failure) => { if (active) { setData(null); setError(failure instanceof Error ? failure.message : "Forecast comparison could not be loaded."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fiscalYear, quarter, pillar, actualMode, salesRep, account]);

  const months = [...(data?.fullForecastPeriods ?? [])].reverse();
  const sortedRows = useMemo(() => [...(data?.rows ?? [])].sort((left, right) => {
    const leftValue = rowValue(left, sortKey); const rightValue = rowValue(right, sortKey);
    const result = sortKey === "forecast" || sortKey === "projected" || sortKey === "attention"
      ? (leftValue === null ? -1 : rightValue === null ? 1 : compareExactDecimals(leftValue, rightValue))
      : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? result : -result;
  }), [data, sortKey, sortDirection]);
  const sort = (key: SortKey) => { if (sortKey === key) setSortDirection(sortDirection === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("asc"); } };
  const sortable = (label: string, key: SortKey) => <button type="button" onClick={() => sort(key)}>{label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button>;

  return <section class="consumption-page forecast-actual-page" aria-labelledby="forecastActualTitle">
    <header class="consumption-page__header"><div>{breadcrumb}<span class="kpi-eyebrow">Consumption / Performance</span><h1 id="forecastActualTitle">Forecast vs Actual</h1></div></header>
    <section class="forecast-actual-filters" aria-label="Forecast vs Actual filters">
      <label>Quarter<select value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); resetDependentFilters(); }}>
        <option value="ALL">All quarters</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>
      </select></label>
      <label>Actual basis<select value={actualMode} onChange={(event) => setActualMode(event.currentTarget.value as ForecastActualMode)}><option value="FINAL">Final</option><option value="MTD">MTD</option></select></label>
      <label>Pillar<select value={pillar} onChange={(event) => { setPillar(event.currentTarget.value as ConsumptionPillar); resetDependentFilters(); }}>{consumptionPillarOptions.map((option) => <option value={option.value}>{option.label}</option>)}</select></label>
      <label>Sales Rep<select value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccount(); }}><option value="">All Sales Reps</option>{(data?.salesRepOptions ?? []).map((value) => <option value={value}>{value || "Unassigned"}</option>)}</select></label>
      <label>Account<input type="search" list="forecastActualAccounts" value={accountQuery} placeholder="Search and select account" onInput={(event) => {
        const value = event.currentTarget.value; setAccountQuery(value);
        if (!value) setAccount(""); else if ((data?.accountOptions ?? []).includes(value)) setAccount(value); else if (value !== account) setAccount("");
      }} /></label>
      <datalist id="forecastActualAccounts">{(data?.accountOptions ?? []).map((value) => <option value={value} />)}</datalist>
    </section>
    {error ? <div class="consumption-inline-error" role="alert">{error}</div> : null}
    {loading ? <div class="forecast-actual-loading"><oj-progress-circle value={-1} size="md" /><span>Loading comparison…</span></div> : null}
    {!loading && data ? <>
      <div class="forecast-actual-period-note">Actual basis: <strong>{data.actualMode}</strong><span>Months (latest first): <strong>{months.join(", ")}</strong></span></div>
      <section class="forecast-actual-summary" aria-label="Forecast and Actual totals">
        <article><span>Full-period Forecast</span><strong>{money(data.summary.fullPeriodForecastAmount)}</strong><small>{data.fullForecastPeriods.join(" · ")}</small></article>
        <article><span>{data.actualMode === "MTD" ? "Actual / MTD" : "Confirmed Actual"}</span><strong>{money(data.summary.confirmedActualAmount)}</strong><small>{data.comparisonPeriods.join(" · ") || "No available Actual"}</small></article>
        <article><span>Projected period close</span><strong>{money(data.summary.projectedAmount)}</strong><small>{data.projectionFormula}</small></article>
        <article class={data.summary.attentionAccountCount > 0 ? "is-negative" : "is-positive"}><span>Needs attention</span><strong>{data.summary.attentionAccountCount}</strong><small>Projected below Forecast</small></article>
      </section>
      <div class="forecast-actual-table-wrap"><table class="forecast-actual-table">
        <thead><tr><th>{sortable("Sales Rep", "salesRep")}</th><th>{sortable("Account", "account")}</th><th>{sortable("Forecast", "forecast")}</th><th>{sortable("Projected", "projected")}</th><th>{sortable("Attention", "attention")}</th>{months.map((month) => <th>{monthLabel(month)}<small>Forecast / Actual</small></th>)}</tr></thead>
        <tbody>{sortedRows.length ? sortedRows.map((row) => <tr key={`${row.salesRep}:${row.account}`} class={row.attention ? "forecast-actual-row is-attention" : "forecast-actual-row"}>
          <td>{row.salesRep || "Unassigned"}</td><th scope="row">{row.account}</th><td>{money(row.fullPeriodForecastAmount)}</td><td>{money(row.projectedAmount)}</td>
          <td><span class="forecast-actual-status">{row.attention === null ? "N/A" : row.attention ? "Attention" : "On track"}</span></td>
          {months.map((month) => { const value = row.months.find((item) => item.periodKey === month); const below = value?.actualAmount !== null && value !== undefined && compareExactDecimals(value.actualAmount, value.forecastAmount) < 0; return <td class={below ? "is-negative" : ""}><strong>{money(value?.forecastAmount ?? "0")}</strong><span>{money(value?.actualAmount ?? null)}</span>{value?.actualState === "MTD" && value.actualAsOf ? <small>MTD as of {value.actualAsOf}</small> : null}</td>; })}
        </tr>) : <tr><td colSpan={5 + months.length} class="forecast-actual-empty">No accounts match the selected filters.</td></tr>}</tbody>
      </table></div>
    </> : null}
  </section>;
}
