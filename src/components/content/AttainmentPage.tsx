import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { IntlNumberConverter } from "ojs/ojconverter-number";
import type { DialogElement } from "ojs/ojdialog";
import { FiscalYear } from "../../data/kpiMockData";
import { fetchAttainment, updateAttainmentBudget } from "../../data/attainmentApi";
import {
  AttainmentBudgetUpdate,
  AttainmentDashboard,
  AttainmentQuarterRecord,
  formatAttainment,
  formatAttainmentAmount,
  formatBudget,
  formatOptionalAttainmentAmount
} from "../../data/attainmentData";
import "ojs/ojbutton";
import "ojs/ojchart";
import "ojs/ojdialog";
import "ojs/ojprogress-circle";

const quarterKeys = ["q1", "q2", "q3", "q4"] as const;
type BudgetKey = typeof quarterKeys[number];
type BudgetDraft = Record<BudgetKey, string>;
type ChartPoint = Readonly<{ id: string; seriesId: "Budget Target" | "Actual" | "Forecast" | "Total"; groupId: string; value: number; shortDesc: string }>;
type CompositionPoint = Readonly<{ id: string; seriesId: "DP Actual" | "DP Total" | "OCI Actual" | "OCI Total"; groupId: "Actual" | "Total"; value: number; shortDesc: string }>;

const amountAxisConverter = new IntlNumberConverter({ minimumFractionDigits: 0, maximumFractionDigits: 0 });
const chartDataLabel = ({ value }: Readonly<{ value: number }>) => `${value.toFixed(0)}K`;
const renderChartItem = ({ data }: Readonly<{ data: ChartPoint }>) => <oj-chart-item value={data.value} seriesId={data.seriesId} groupId={[data.groupId]} shortDesc={data.shortDesc}></oj-chart-item>;
const renderCompositionItem = ({ data }: Readonly<{ data: CompositionPoint }>) => <oj-chart-item value={data.value} seriesId={data.seriesId} groupId={[data.groupId]} shortDesc={data.shortDesc}></oj-chart-item>;

const draftFromDashboard = (dashboard: AttainmentDashboard): BudgetDraft => ({
  q1: dashboard.quarters[0].budget === null ? "" : String(dashboard.quarters[0].budget),
  q2: dashboard.quarters[1].budget === null ? "" : String(dashboard.quarters[1].budget),
  q3: dashboard.quarters[2].budget === null ? "" : String(dashboard.quarters[2].budget),
  q4: dashboard.quarters[3].budget === null ? "" : String(dashboard.quarters[3].budget)
});
const budgetPayload = (draft: BudgetDraft): AttainmentBudgetUpdate => ({
  q1: draft.q1 === "" ? null : Number(draft.q1), q2: draft.q2 === "" ? null : Number(draft.q2),
  q3: draft.q3 === "" ? null : Number(draft.q3), q4: draft.q4 === "" ? null : Number(draft.q4)
});
const draftTotal = (draft: BudgetDraft): number | null => {
  if (quarterKeys.some((key) => draft[key] === "")) return null;
  const values = quarterKeys.map((key) => Number(draft[key]));
  return values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null;
};
const signedAmount = (value: number | null): string => value === null ? "—" : `${value > 0 ? "+" : ""}${formatAttainmentAmount(value)}`;
const includedForecast = (quarter: AttainmentQuarterRecord): number | null => quarter.outlook === null
  ? null : Math.max(0, quarter.outlook - quarter.actual);
function QuarterCard({ quarter }: Readonly<{ quarter: AttainmentQuarterRecord }>) {
  return <div class="attainment-quarter-card">
    <span class="attainment-quarter-card__heading"><strong>{quarter.quarter}</strong><b>{formatAttainment(quarter.outlookAttainment)}</b></span>
    <span class="attainment-quarter-card__metric"><small>Budget</small><strong>{formatBudget(quarter.budget)}</strong></span>
    <span class="attainment-quarter-card__metric attainment-quarter-card__metric--primary"><small>Total (Actual + Forecast)</small><strong>{formatOptionalAttainmentAmount(quarter.outlook)}</strong></span>
    <span class="attainment-quarter-card__actual">Actual {formatAttainmentAmount(quarter.actual)} · Forecast {formatOptionalAttainmentAmount(includedForecast(quarter))}</span>
    <span class="attainment-quarter-card__basis">Attainment = Total / Budget</span>
    <span class="attainment-quarter-card__pillars">DP {formatOptionalAttainmentAmount(quarter.dpOutlook)} · OCI {formatOptionalAttainmentAmount(quarter.ociOutlook)}</span>
  </div>;
}

export function AttainmentPage({ fiscalYear }: Readonly<{ fiscalYear: FiscalYear }>) {
  const [dashboard, setDashboard] = useState<AttainmentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState<BudgetDraft>({ q1: "", q2: "", q3: "", q4: "" });

  const dialogRef = useRef<DialogElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setDashboard(null); setLoading(true); setSaving(false); setError(""); setSaveError(""); dialogRef.current?.close();
    fetchAttainment(fiscalYear)
      .then((value) => { if (version === requestVersion.current) setDashboard(value); })
      .catch((reason) => { if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Attainment could not be loaded."); })
      .finally(() => { if (version === requestVersion.current) setLoading(false); });
    return () => { requestVersion.current += 1; };
  }, [fiscalYear]);

  const openBudgetDialog = () => {
    if (!dashboard) return;
    setDraft(draftFromDashboard(dashboard)); setSaveError(""); dialogRef.current?.open();
  };
  const saveBudget = async () => {
    const payload = budgetPayload(draft);
    if (Object.values(payload).some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setSaveError("Enter nonnegative amounts or leave a quarter blank."); return;
    }
    const version = requestVersion.current; setSaving(true); setSaveError("");
    try {
      const updated = await updateAttainmentBudget(fiscalYear, payload);
      if (version !== requestVersion.current) return;
      setDashboard(updated); dialogRef.current?.close();
    } catch (reason) {
      if (version === requestVersion.current) setSaveError(reason instanceof Error ? reason.message : "Budget could not be saved.");
    } finally { if (version === requestVersion.current) setSaving(false); }
  };

  const chartPoints = useMemo<ChartPoint[]>(() => dashboard ? dashboard.quarters.flatMap((quarter) => [
    ...(quarter.budget === null ? [] : [{ id: `${quarter.quarter}-budget`, seriesId: "Budget Target", groupId: quarter.quarter, value: quarter.budget, shortDesc: `${quarter.quarter} Budget ${formatBudget(quarter.budget)}` } as const]),
    { id: `${quarter.quarter}-actual`, seriesId: "Actual", groupId: quarter.quarter, value: quarter.actual, shortDesc: `${quarter.quarter} Actual ${formatAttainmentAmount(quarter.actual)}` } as const,
    ...(includedForecast(quarter) === null ? [] : [{ id: `${quarter.quarter}-forecast`, seriesId: "Forecast", groupId: quarter.quarter, value: includedForecast(quarter)!, shortDesc: `${quarter.quarter} selected-month Forecast ${formatOptionalAttainmentAmount(includedForecast(quarter))}` } as const]),
    ...(quarter.outlook === null ? [] : [{ id: `${quarter.quarter}-total`, seriesId: "Total", groupId: quarter.quarter, value: quarter.outlook, shortDesc: `${quarter.quarter} Total ${formatAttainmentAmount(quarter.outlook)}` } as const])
  ]) : [], [dashboard]);
  const chartData = useMemo(() => new ArrayDataProvider(chartPoints, { keyAttributes: "id" }), [chartPoints]);
  const compositionPoints = useMemo<CompositionPoint[]>(() => dashboard ? [
    { id: "dp-actual", seriesId: "DP Actual", groupId: "Actual", value: dashboard.summary.dpActual, shortDesc: `DP Actual ${formatAttainmentAmount(dashboard.summary.dpActual)}` },
    { id: "oci-actual", seriesId: "OCI Actual", groupId: "Actual", value: dashboard.summary.ociActual, shortDesc: `OCI Actual ${formatAttainmentAmount(dashboard.summary.ociActual)}` },
    ...(dashboard.summary.dpOutlook === null ? [] : [{ id: "dp-total", seriesId: "DP Total", groupId: "Total", value: dashboard.summary.dpOutlook, shortDesc: `DP Total ${formatAttainmentAmount(dashboard.summary.dpOutlook)}` } as const]),
    ...(dashboard.summary.ociOutlook === null ? [] : [{ id: "oci-total", seriesId: "OCI Total", groupId: "Total", value: dashboard.summary.ociOutlook, shortDesc: `OCI Total ${formatAttainmentAmount(dashboard.summary.ociOutlook)}` } as const])
  ] : [], [dashboard]);
  const compositionData = useMemo(() => new ArrayDataProvider(compositionPoints, { keyAttributes: "id" }), [compositionPoints]);

  if (loading && !dashboard) return <section class="kpi-panel attainment-loading" role="status" aria-busy="true"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading Attainment…</section>;
  if (error && !dashboard) return <section class="kpi-panel" role="alert"><h1>Consumption Attainment</h1><p>{error}</p></section>;
  if (!dashboard) return <section class="kpi-panel" role="alert">Attainment is unavailable.</section>;


  return <section class="attainment-page" aria-labelledby="attainmentTitle" data-fiscal-year={fiscalYear}>
    <header class="consumption-page__header attainment-header">
      <div><span class="kpi-eyebrow">Consumption / Attainment</span><h1 id="attainmentTitle">Consumption Attainment</h1><p>Closed months use Actual; available remaining months use Forecast. Each included month is counted once. Amounts in K.</p></div>
      <oj-button chroming="outlined" onojAction={openBudgetDialog}>Budget</oj-button>
    </header>
    {error && <div class="attainment-inline-error" role="alert">{error}</div>}

    <p class="attainment-inline-note" role="status">This API response does not expose fiscal-period completeness or unopened-period status. Values below are included-period results and are not asserted to be a complete full-year outlook.</p>
    <section class="attainment-fy-hero" aria-label={`${fiscalYear} included-period summary`}>
      <div class="attainment-fy-hero__title"><span>{fiscalYear}</span><strong>Included-period summary</strong></div>
      <div><small>Budget</small><strong>{formatBudget(dashboard.summary.budget)}</strong></div>
      <div><small>Actual to date</small><strong>{formatAttainmentAmount(dashboard.summary.actual)}</strong></div>
      <div class="attainment-fy-hero__primary"><small>Included Actual + Forecast</small><strong>{formatOptionalAttainmentAmount(dashboard.summary.outlook)}</strong><span>{signedAmount(dashboard.summary.outlookVarianceToBudget)} vs budget</span></div>
      <div><small>Included total / Budget</small><strong>{formatAttainment(dashboard.summary.outlookAttainment)}</strong></div>
    </section>

    <section aria-labelledby="quarterlyAttainmentTitle">
      <div class="attainment-section-heading"><div><h2 id="quarterlyAttainmentTitle">Quarterly attainment</h2><p>Quarter totals combine each month's policy-selected Actual or Forecast without duplicate counting.</p></div></div>
      <div class="attainment-quarter-grid">{dashboard.quarters.map((quarter) => <QuarterCard key={quarter.quarter} quarter={quarter} />)}</div>
    </section>

    <section class="kpi-panel attainment-chart-card" aria-labelledby="attainmentChartTitle">
      <div class="attainment-section-heading"><div><h2 id="attainmentChartTitle">Quarterly attainment against budget</h2><p>Budget, closed-month Actual, available remaining-month Forecast, and their included-period total are shown separately.</p></div></div>
      <oj-chart type="bar" data={chartData} dataLabel={chartDataLabel} yAxis={{ title: "Amount (K)", tickLabel: { converter: amountAxisConverter, scaling: "none" } }} legend={{ position: "bottom" }} styleDefaults={{ dataLabelPosition: "outsideBarEdge", dataLabelCollision: "fitInBounds" }} animationOnDisplay="auto" class="attainment-chart"><template slot="itemTemplate" render={renderChartItem}></template></oj-chart>
    </section>

    <section class="kpi-panel attainment-chart-card attainment-supporting-card" aria-labelledby="attainmentCompositionTitle">
      <div class="attainment-section-heading"><div><h2 id="attainmentCompositionTitle">Supporting detail · DP / OCI</h2><p>Included Actual and Actual + Forecast split by Pillar. Labels and values supplement color.</p></div></div>
      <oj-chart type="bar" stack="on" data={compositionData} dataLabel={chartDataLabel} yAxis={{ title: "Amount (K)", tickLabel: { converter: amountAxisConverter, scaling: "none" }, referenceObjects: dashboard.summary.budget === null ? [] : [{ value: dashboard.summary.budget, text: "Budget", color: "#8b5e00", lineWidth: 2, lineStyle: "dashed" as const, lineType: "straight" as const, type: "line" as const, displayInLegend: "on" as const }] }} legend={{ position: "bottom" }} styleDefaults={{ dataLabelPosition: "center", dataLabelCollision: "fitInBounds" }} animationOnDisplay="auto" class="attainment-chart"><template slot="itemTemplate" render={renderCompositionItem}></template></oj-chart>
    </section>

    <oj-dialog ref={dialogRef} dialogTitle={`Budget · ${fiscalYear}`} cancelBehavior={saving ? "none" : "icon"} class="attainment-budget-dialog">
      <div slot="body" class="attainment-budget-form"><p>Enter each budget in K. Values are stored as entered; blank means no budget and zero remains explicit.</p><div class="attainment-budget-fields">{quarterKeys.map((key, index) => <label key={key}><span>{`Q${index + 1} budget (K)`}</span><input type="number" min="0" step="0.0001" inputMode="decimal" value={draft[key]} disabled={saving} onInput={(event) => setDraft((current) => ({ ...current, [key]: (event.currentTarget as HTMLInputElement).value }))} /></label>)}</div><div class="attainment-budget-total"><span>FY total</span><strong>{formatBudget(draftTotal(draft))}</strong></div>{saveError && <div role="alert" class="attainment-inline-error">{saveError}</div>}</div>
      <div slot="footer"><oj-button disabled={saving} onojAction={() => dialogRef.current?.close()}>Cancel</oj-button><oj-button chroming="callToAction" disabled={saving} onojAction={() => void saveBudget()}>{saving ? "Saving…" : "Save budget"}</oj-button></div>
    </oj-dialog>
  </section>;
}
