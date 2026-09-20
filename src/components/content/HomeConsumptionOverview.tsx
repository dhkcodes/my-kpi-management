import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  fetchConsumptionAnalysis,
  fetchConsumptionRecords,
  type ConsumptionAnalysis
} from "../../data/consumptionApi";
import {
  buildHomeConsumptionOverview,
  type HomeConsumptionOverviewData
} from "../../data/homeConsumptionOverview";

const amountK = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const formatAmountK = (amount: number | null) => amount === null ? "N/A" : `${amountK.format(amount / 1_000)}K`;
const signedPercent = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const monthLabel = (period: string) => period.split("-")[1] ?? period;
const periodRange = (periods: readonly string[]) => {
  if (periods.length === 0) return "No period available";
  if (periods.length === 1) return periods[0];
  return `${periods[0]} – ${periods[periods.length - 1]}`;
};
const alertLabel = (type: string) => type.split("_").map((token) => token.charAt(0) + token.slice(1).toLowerCase()).join(" ");

export function HomeConsumptionOverview({ fiscalYear }: Readonly<{ fiscalYear: string }>) {
  const [data, setData] = useState<HomeConsumptionOverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchConsumptionAnalysis({ fiscalYear, search: "", account: "", salesRep: "", pillar: "ALL" }),
      fetchConsumptionRecords({
        fromQuarter: `${fiscalYear}-Q1`,
        toQuarter: `${fiscalYear}-Q4`,
        search: "",
        sort: "ACCOUNT",
        direction: "ASC",
        offset: 0,
        limit: 1,
        pillar: "ALL"
      })
    ]).then(([analysis, records]) => {
      if (active) setData(buildHomeConsumptionOverview(analysis, records.totals));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Consumption Overview could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fiscalYear]);

  const monthlyMax = useMemo(() => Math.max(0, ...(data?.months.map((month) => month.amount ?? 0) ?? [])), [data]);
  const firstForecastIndex = data?.months.findIndex((month) => month.kind === "FORECAST") ?? -1;

  return (
    <section id="consumptionOverview" class="kpi-panel kpi-dashboard-section home-consumption" aria-labelledby="consumptionOverviewTitle">
      <div class="kpi-panel__header home-consumption__header">
        <div>
          <span class="kpi-eyebrow">Consumption</span>
          <h2 id="consumptionOverviewTitle">Consumption Overview</h2>
          <p>Actual periods are closed results; Forecast begins only after the last provided Actual period.</p>
        </div>
        <span class="home-consumption__fy">{fiscalYear} · K USD</span>
      </div>

      {loading ? (
        <div class="home-consumption__state" role="status" aria-live="polite">
          <oj-progress-circle value={-1} size="sm" aria-label="Loading Consumption Overview"></oj-progress-circle>
          <span>Loading Consumption Overview…</span>
        </div>
      ) : error ? (
        <div class="home-consumption__state home-consumption__state--error" role="alert">
          Consumption data is unavailable. {error}
        </div>
      ) : !data || data.includedPeriodCount === 0 ? (
        <div class="home-consumption__state">No Consumption data is available for {fiscalYear}.</div>
      ) : (
        <>
          <div class="home-consumption__coverage" role="note">
            <span><i class="home-consumption__legend home-consumption__legend--actual"></i>Actual {periodRange(data.actualPeriods)}</span>
            <span><i class="home-consumption__legend home-consumption__legend--forecast"></i>Forecast {periodRange(data.forecastPeriods)}</span>
            {data.partialPeriod && <strong>Partial coverage · {data.includedPeriodCount}/12 months</strong>}
          </div>

          <div class="home-consumption__metrics">
            <article>
              <span>Actual YTD</span>
              <strong>{formatAmountK(data.actualAmount)}</strong>
              <small>{periodRange(data.actualPeriods)}</small>
            </article>
            <article>
              <span>FY Expected</span>
              <strong>{formatAmountK(data.expectedAmount)}</strong>
              <small>Actual + non-overlapping Forecast</small>
            </article>
            <article>
              <span>Actual YoY</span>
              <strong class={data.actualYoYPercent === null ? "is-muted" : data.actualYoYPercent >= 0 ? "is-positive" : "is-negative"}>
                {signedPercent(data.actualYoYPercent)}
              </strong>
              <small title={data.actualYoYUnavailableReason ?? undefined}>
                {data.actualYoYPercent === null ? "Comparable prior Actual unavailable" : "Same Actual period vs prior FY"}
              </small>
            </article>
            <article>
              <span>Attention Signals</span>
              <strong>{data.attentionSignalCount}</strong>
              <small>{data.attentionAccountCount} affected account{data.attentionAccountCount === 1 ? "" : "s"}</small>
            </article>
          </div>

          <div class="home-consumption__analysis-grid">
            <article class="home-consumption__chart-card">
              <div class="home-consumption__card-heading">
                <div><h3>Quarterly Actual / Forecast</h3><p>Actual and Forecast remain separate within each quarter.</p></div>
              </div>
              <div class="home-consumption__quarter-list">
                {data.quarters.map((quarter) => {
                  const total = quarter.actualAmount + quarter.forecastAmount;
                  const actualWidth = total > 0 ? (quarter.actualAmount / total) * 100 : 0;
                  const forecastWidth = total > 0 ? (quarter.forecastAmount / total) * 100 : 0;
                  return (
                    <div class="home-consumption__quarter" key={quarter.quarter}>
                      <div class="home-consumption__quarter-label"><strong>{quarter.quarter}</strong><span>{formatAmountK(total)}</span></div>
                      <div class="home-consumption__stack" aria-label={`${quarter.quarter}: Actual ${formatAmountK(quarter.actualAmount)}, Forecast ${formatAmountK(quarter.forecastAmount)}`}>
                        <span class="home-consumption__stack-actual" style={`width:${actualWidth}%`}></span>
                        <span class="home-consumption__stack-forecast" style={`width:${forecastWidth}%`}></span>
                      </div>
                      <div class="home-consumption__quarter-values"><span>Actual {formatAmountK(quarter.actualAmount)}</span><span>Forecast {formatAmountK(quarter.forecastAmount)}</span></div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article class="home-consumption__alerts">
              <div class="home-consumption__card-heading">
                <div><h3>Attention Preview</h3><p>Latest Actual signals requiring review.</p></div>
              </div>
              {data.alerts.length === 0 ? (
                <div class="home-consumption__empty">No attention signals in the available Actual period.</div>
              ) : (
                <ul>
                  {data.alerts.map((alert: ConsumptionAnalysis["alerts"][number]) => (
                    <li key={alert.alertId}>
                      <span class={`home-consumption__grade home-consumption__grade--${alert.grade.toLowerCase()}`}>{alert.grade}</span>
                      <div><strong>{alert.account}</strong><span>{alert.workloadMapped ? alert.workload : "Workload not mapped"} · {alert.periodKey}</span></div>
                      <div class="home-consumption__alert-value"><strong>{formatAmountK(alert.actualAmount)}</strong><span>{alertLabel(alert.type)}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          <article class="home-consumption__chart-card home-consumption__monthly">
            <div class="home-consumption__card-heading">
              <div><h3>Actual Continuity into Forecast</h3><p>Monthly Consumption; the divider marks the first Forecast month.</p></div>
            </div>
            <div class="home-consumption__monthly-chart" role="img" aria-label="Monthly Consumption from Actual into Forecast">
              {data.months.map((month, index) => {
                const height = monthlyMax > 0 && month.amount !== null ? Math.max(3, (month.amount / monthlyMax) * 100) : 0;
                const transition = index === firstForecastIndex;
                return (
                  <div class={`home-consumption__month${transition ? " is-transition" : ""}`} key={month.periodKey}>
                    {transition && <span class="home-consumption__transition-label">Forecast starts</span>}
                    <span class="home-consumption__month-value">{formatAmountK(month.amount)}{month.incomplete ? "*" : ""}</span>
                    <div class="home-consumption__month-track">
                      <span class={`home-consumption__month-bar home-consumption__month-bar--${month.kind.toLowerCase()}`} style={`height:${height}%`}></span>
                    </div>
                    <strong>{monthLabel(month.periodKey)}</strong>
                    <small>{month.kind === "ACTUAL" ? "A" : "F"}</small>
                  </div>
                );
              })}
            </div>
            {data.months.some((month) => month.incomplete) && <p class="home-consumption__footnote">* Partial or incomplete source coverage; value should not be treated as a complete month.</p>}
          </article>
        </>
      )}
    </section>
  );
}
