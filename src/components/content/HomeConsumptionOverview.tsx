import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  fetchConsumptionAnalysis,
  fetchConsumptionRecords,
  type ConsumptionAnalysis,
  type ConsumptionRecordsTotals
} from "../../data/consumptionApi";
import type { ConsumptionPillar } from "../../data/consumptionData";
import {
  buildHomeConsumptionLineEdges,
  buildHomeConsumptionOverview,
  type HomeConsumptionOverviewData
} from "../../data/homeConsumptionOverview";
import { compareExactDecimals, divideExactDecimal, formatExactK } from "../../data/exactDecimal";

const amountK = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const formatAmountK = (amountExact: string | null) => amountExact === null ? "N/A" : formatExactK(amountExact);
const signedPercent = (valueExact: string | null) => valueExact === null ? "N/A"
  : `${compareExactDecimals(valueExact, "0") > 0 ? "+" : ""}${divideExactDecimal(valueExact, "1", 2)}%`;
const monthLabel = (period: string) => period.split("-")[1] ?? period;
const periodRange = (periods: readonly string[]) => {
  if (periods.length === 0) return "No period available";
  if (periods.length === 1) return periods[0];
  return `${periods[0]} – ${periods[periods.length - 1]}`;
};
const alertLabel = (type: string) => type.split("_").map((token) => token.charAt(0) + token.slice(1).toLowerCase()).join(" ");
const quarterForPeriod = (periodKey: string) => {
  const month = periodKey.split("-")[1];
  const index = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"].indexOf(month);
  return index < 0 ? null : `Q${Math.floor(index / 3) + 1}`;
};

const monthlyChart = Object.freeze({ width: 960, height: 240, left: 42, right: 934, top: 36, bottom: 190 });
const monthlyChartX = (index: number, count: number) => count <= 1
  ? (monthlyChart.left + monthlyChart.right) / 2
  : monthlyChart.left + (index / (count - 1)) * (monthlyChart.right - monthlyChart.left);
const monthlyChartY = (amount: number, maximum: number) => maximum <= 0
  ? monthlyChart.bottom
  : monthlyChart.bottom - (Math.max(0, amount) / maximum) * (monthlyChart.bottom - monthlyChart.top);

const emptyRecordsTotals: ConsumptionRecordsTotals = Object.freeze({
  actualByPeriod: {},
  appliedForecastByPeriod: {},
  outlookByPeriod: {},
  incompletePeriods: []
});

export function HomeConsumptionOverview({ fiscalYear, canReadRecords }: Readonly<{
  fiscalYear: string;
  canReadRecords: boolean;
}>) {
  const [data, setData] = useState<HomeConsumptionOverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pillar, setPillar] = useState<ConsumptionPillar>("ALL");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchConsumptionAnalysis({ fiscalYear, search: "", account: "", salesRep: "", pillar }),
      canReadRecords ? fetchConsumptionRecords({
        fromQuarter: `${fiscalYear}-Q1`,
        toQuarter: `${fiscalYear}-Q4`,
        search: "",
        sort: "ACCOUNT",
        direction: "ASC",
        offset: 0,
        limit: 1,
        pillar
      }) : Promise.resolve(null)
    ]).then(([analysis, records]) => {
      if (active) setData(buildHomeConsumptionOverview(
        analysis,
        records?.totals ?? emptyRecordsTotals,
        records?.currentFiscalMonth ?? analysis.mtdSummary?.periodKey
      ));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Consumption Overview could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fiscalYear, canReadRecords, pillar]);

  const monthlyMax = useMemo(() => Math.max(0, ...(data?.months.flatMap((month) => [month.amountChartCoordinate ?? 0, month.forecastAmountChartCoordinate ?? 0]) ?? [])), [data]);
  const monthlyEdges = useMemo(() => buildHomeConsumptionLineEdges(data?.months ?? []), [data]);
  const firstForecastIndex = data?.months.findIndex((month) => month.periodKey === data.forecastStartPeriod) ?? -1;

  return (
    <section id="consumptionOverview" class="kpi-panel kpi-dashboard-section home-consumption" aria-labelledby="consumptionOverviewTitle">
      <div class="kpi-panel__header home-consumption__header">
        <div>
          <span class="kpi-eyebrow">Consumption</span>
          <h2 id="consumptionOverviewTitle">Consumption Overview</h2>
        </div>
        <div>
          <div class="home-consumption__pillar-filter" role="group" aria-label="Consumption pillar">
            {(["ALL", "DP", "OCI"] as const).map((option) => <button type="button" class={pillar === option ? "is-active" : ""}
              aria-pressed={pillar === option} onClick={() => setPillar(option)}>{option === "ALL" ? "All" : option}</button>)}
          </div>
          <span class="home-consumption__fy">{fiscalYear} · K USD</span>
        </div>
      </div>

      {loading ? (
        <div class="home-consumption__analysis-grid" aria-hidden="true"></div>
      ) : error ? (
        <div class="home-consumption__state home-consumption__state--error" role="alert">
          Consumption data is unavailable. {error}
        </div>
      ) : !data || (data.includedPeriodCount === 0 && data.finalUploadRequiredPeriods.length === 0) ? (
        <div class="home-consumption__state">No Consumption data is available for {fiscalYear}.</div>
      ) : (
        <>
          <div class="home-consumption__coverage" role="note">
            <span><i class="home-consumption__legend home-consumption__legend--actual"></i>Actual {periodRange(data.actualPeriods)}</span>
            {data.months.some((month) => month.kind === "MTD") && <span><i class="home-consumption__legend home-consumption__legend--mtd"></i>MTD (잠정){data.mtdAsOf ? ` · As of ${data.mtdAsOf}` : ""}</span>}
            <span><i class="home-consumption__legend home-consumption__legend--forecast"></i>Forecast {periodRange(data.forecastPeriods)}</span>
          </div>
          {data.finalUploadRequiredPeriods.length > 0 && (
            <p class="home-consumption__mtd-guidance" role="note">
              <strong>잠정 MTD 적용</strong> · {data.finalUploadRequiredPeriods.join(", ")}은 확정 Actual 업로드 전까지 가용한 MTD를 표시하며, 업로드 후 확정값을 우선 적용합니다.
            </p>
          )}

          <div class="home-consumption__metrics">
            <article>
              <span>Actual YTD</span>
              <strong>{formatAmountK(data.actualAmountExact)}</strong>
              <small>{periodRange(data.actualPeriods)}</small>
            </article>
            <article>
              <span>FY Expected</span>
              <strong>{formatAmountK(data.expectedAmountExact)}</strong>
              <small>Actual + Forecast</small>
            </article>
            <article>
              <span>Actual YoY</span>
              <strong class={data.actualYoYPercentExact === null ? "is-muted" : compareExactDecimals(data.actualYoYPercentExact, "0") >= 0 ? "is-positive" : "is-negative"}>
                {signedPercent(data.actualYoYPercentExact)}
              </strong>
              <small title={data.actualYoYUnavailableReason ?? undefined}>
                {data.actualYoYPercentExact === null ? "Comparable prior Actual unavailable" : "Same Actual period vs prior FY"}
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
                <div><h3>Quarterly Actual / Forecast</h3></div>
              </div>
              <div class="home-consumption__quarter-list">
                {data.quarters.map((quarter) => {
                  const mtd = data.months.find((month) => month.kind === "MTD" && quarterForPeriod(month.periodKey) === quarter.quarter);
                  const mtdAmountExact = mtd?.amountExact ?? "0";
                  const mtdAmountChartCoordinate = mtd?.amountChartCoordinate ?? 0;
                  const showActual = data.actualPeriods.some((periodKey) => quarterForPeriod(periodKey) === quarter.quarter);
                  const showMtd = mtd?.amountExact !== null && mtd?.amountExact !== undefined;
                  const scale = Math.max(showActual ? quarter.actualAmountChartCoordinate : 0, showMtd ? mtdAmountChartCoordinate : 0, quarter.forecastAmountChartCoordinate, 1);
                  const actualWidth = (quarter.actualAmountChartCoordinate / scale) * 100;
                  const mtdWidth = (mtdAmountChartCoordinate / scale) * 100;
                  const forecastWidth = (quarter.forecastAmountChartCoordinate / scale) * 100;
                  const displayedValues = [
                    ...(showActual ? [`Actual ${formatAmountK(quarter.actualAmountExact)}`] : []),
                    ...(showMtd ? [`MTD ${formatAmountK(mtdAmountExact)}`] : []),
                    `Forecast ${formatAmountK(quarter.forecastAmountExact)}`
                  ].join(", ");
                  return (
                    <div class="home-consumption__quarter" key={quarter.quarter}>
                      <div class="home-consumption__quarter-label"><strong>{quarter.quarter}</strong></div>
                      <div class="home-consumption__stack" aria-label={`${quarter.quarter}: ${displayedValues}`}>
                        {showActual && <span class="home-consumption__stack-row"><i class="home-consumption__stack-actual" style={`width:${actualWidth}%`}></i></span>}
                        {showMtd && <span class="home-consumption__stack-row"><i class="home-consumption__stack-mtd" style={`width:${mtdWidth}%`}></i></span>}
                        <span class="home-consumption__stack-row"><i class="home-consumption__stack-forecast" style={`width:${forecastWidth}%`}></i></span>
                      </div>
                      <div class="home-consumption__quarter-values">
                        {showActual && <span>Actual <strong>{formatAmountK(quarter.actualAmountExact)}</strong></span>}
                        {showMtd && <span>MTD (잠정) <strong>{formatAmountK(mtdAmountExact)}</strong></span>}
                        <span>Forecast <strong>{formatAmountK(quarter.forecastAmountExact)}</strong></span>
                      </div>
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
                      <div class="home-consumption__alert-value">
                        <strong>{formatAmountK(alert.actualAmountExact)}</strong>
                        <span class={`home-consumption__alert-status home-consumption__alert-status--${alert.type.toLowerCase().replaceAll("_", "-")}`}>
                          {alertLabel(alert.type)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          {canReadRecords && <article class="home-consumption__chart-card home-consumption__monthly">
            <div class="home-consumption__card-heading">
              <div><h3>Tentative Monthly Consumption</h3></div>
              <div class="home-consumption__monthly-legend" aria-label="Line legend">
                <span><i class="home-consumption__monthly-legend-line home-consumption__monthly-legend-line--actual"></i>Actual</span>
                {data.months.some((month) => month.kind === "MTD") && <span><i class="home-consumption__monthly-legend-dot home-consumption__monthly-legend-dot--mtd"></i>MTD (잠정)</span>}
                <span><i class="home-consumption__monthly-legend-line home-consumption__monthly-legend-line--forecast"></i>Forecast</span>
              </div>
            </div>
            <div class="home-consumption__monthly-chart" role="img" aria-label="Monthly Consumption line chart from Actual into Forecast; an accessible data table follows">
              <svg class="home-consumption__monthly-svg" viewBox={`0 0 ${monthlyChart.width} ${monthlyChart.height}`} aria-hidden="true">
                {[monthlyChart.top, (monthlyChart.top + monthlyChart.bottom) / 2, monthlyChart.bottom].map((y) => (
                  <line class="home-consumption__monthly-grid" x1={monthlyChart.left} y1={y} x2={monthlyChart.right} y2={y} key={y}></line>
                ))}
                {firstForecastIndex >= 0 && (
                  <g class="home-consumption__forecast-marker">
                    <line
                      x1={monthlyChartX(firstForecastIndex, data.months.length)}
                      y1={20}
                      x2={monthlyChartX(firstForecastIndex, data.months.length)}
                      y2={monthlyChart.bottom}
                    ></line>
                    <text x={monthlyChartX(firstForecastIndex, data.months.length) + 6} y={16}>Forecast starts</text>
                  </g>
                )}
                {monthlyEdges.map((edge) => {
                  const from = data.months[edge.fromIndex];
                  const to = data.months[edge.toIndex];
                  return (
                    <line
                      class={`home-consumption__monthly-line home-consumption__monthly-line--${edge.kind.toLowerCase()}`}
                      x1={monthlyChartX(edge.fromIndex, data.months.length)}
                      y1={monthlyChartY(edge.fromAmountChartCoordinate, monthlyMax)}
                      x2={monthlyChartX(edge.toIndex, data.months.length)}
                      y2={monthlyChartY(edge.toAmountChartCoordinate, monthlyMax)}
                      key={`${from.periodKey}-${to.periodKey}`}
                    ></line>
                  );
                })}
                {data.months.map((month, index) => {
                  const x = monthlyChartX(index, data.months.length);
                  const y = month.amountChartCoordinate === null ? null : monthlyChartY(month.amountChartCoordinate, monthlyMax);
                  const forecastY = month.forecastAmountChartCoordinate === null ? null : monthlyChartY(month.forecastAmountChartCoordinate, monthlyMax);
                  return (
                    <g class="home-consumption__monthly-point" key={month.periodKey}>
                      {y !== null && (
                        <>
                          <circle class={`home-consumption__monthly-dot home-consumption__monthly-dot--${month.kind.toLowerCase()}`} cx={x} cy={y} r={5}>
                            <title>{`${month.periodKey} ${month.kind === "ACTUAL" ? "Actual" : month.kind === "MTD" ? "MTD (잠정)" : "Forecast"}: ${formatAmountK(month.amountExact)}`}</title>
                          </circle>
                          <text class="home-consumption__monthly-value" x={x} y={Math.max(18, y - 12)}>
                            {formatAmountK(month.amountExact)}
                          </text>
                        </>
                      )}
                      {forecastY !== null && (
                        <>
                          <circle class="home-consumption__monthly-dot home-consumption__monthly-dot--forecast" cx={x} cy={forecastY} r={5}>
                            <title>{`${month.periodKey} Forecast: ${formatAmountK(month.forecastAmountExact)}`}</title>
                          </circle>
                          <text class="home-consumption__monthly-value home-consumption__monthly-value--forecast" x={x} y={Math.min(204, forecastY + 18)}>
                            {formatAmountK(month.forecastAmountExact)}
                          </text>
                        </>
                      )}
                      <text class="home-consumption__monthly-month" x={x} y={216}>{monthLabel(month.periodKey)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <table class="home-consumption__monthly-table-accessible">
              <caption>Monthly Consumption values in K USD</caption>
              <thead>
                <tr><th scope="col">Month</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Coverage</th></tr>
              </thead>
              <tbody>
                {data.months.flatMap((month) => [
                  <tr key={`${month.periodKey}-${month.kind}`}>
                    <th scope="row">{month.periodKey}</th>
                    <td>{month.kind === "ACTUAL" ? "Actual" : month.kind === "MTD" ? "MTD (잠정)" : "Forecast"}</td>
                    <td>{month.amountExact === null ? "Unavailable" : formatAmountK(month.amountExact)}</td>
                    <td>{month.incomplete ? "Partial or incomplete" : "Complete"}</td>
                  </tr>,
                  ...(month.forecastAmountExact === null ? [] : [
                    <tr key={`${month.periodKey}-FORECAST`}>
                      <th scope="row">{month.periodKey}</th>
                      <td>Forecast</td>
                      <td>{formatAmountK(month.forecastAmountExact)}</td>
                      <td>Monthly full Forecast</td>
                    </tr>
                  ])
                ])}
              </tbody>
            </table>
          </article>}
        </>
      )}
    </section>
  );
}
