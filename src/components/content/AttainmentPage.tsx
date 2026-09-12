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
  calculateAttainment,
  formatAttainment,
  formatAttainmentAmount,
  formatBudget
} from "../../data/attainmentData";
import "ojs/ojbutton";
import "ojs/ojchart";
import "ojs/ojdialog";
import "ojs/ojprogress-circle";

const quarterKeys = ["q1", "q2", "q3", "q4"] as const;
type BudgetKey = typeof quarterKeys[number];
type BudgetDraft = Record<BudgetKey, string>;
type ChartPoint = Readonly<{ id: string; seriesId: "Actual" | "Forecast"; groupId: string; value: number; shortDesc: string }>;

const amountAxisConverter = new IntlNumberConverter({ minimumFractionDigits: 0, maximumFractionDigits: 0 });

const renderChartItem = ({ data }: Readonly<{ data: ChartPoint }>) => <oj-chart-item
  value={data.value}
  seriesId={data.seriesId}
  groupId={[data.groupId]}
  shortDesc={data.shortDesc}>
</oj-chart-item>;

const draftFromDashboard = (dashboard: AttainmentDashboard): BudgetDraft => ({
  q1: dashboard.quarters[0].budget === null ? "" : String(dashboard.quarters[0].budget),
  q2: dashboard.quarters[1].budget === null ? "" : String(dashboard.quarters[1].budget),
  q3: dashboard.quarters[2].budget === null ? "" : String(dashboard.quarters[2].budget),
  q4: dashboard.quarters[3].budget === null ? "" : String(dashboard.quarters[3].budget)
});

const budgetPayload = (draft: BudgetDraft): AttainmentBudgetUpdate => ({
  q1: draft.q1 === "" ? null : Number(draft.q1),
  q2: draft.q2 === "" ? null : Number(draft.q2),
  q3: draft.q3 === "" ? null : Number(draft.q3),
  q4: draft.q4 === "" ? null : Number(draft.q4)
});

const draftTotal = (draft: BudgetDraft): number | null => {
  if (quarterKeys.some((key) => draft[key] === "")) return null;
  const values = quarterKeys.map((key) => Number(draft[key]));
  return values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null;
};

const signedAmount = (value: number | null): string => value === null ? "—" : `${value > 0 ? "+" : ""}${formatAttainmentAmount(value)}`;

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
    setDashboard(null);
    setLoading(true);
    setSaving(false);
    setError("");
    setSaveError("");
    dialogRef.current?.close();
    fetchAttainment(fiscalYear)
      .then((value) => { if (version === requestVersion.current) setDashboard(value); })
      .catch((reason) => {
        if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Attainment could not be loaded.");
      })
      .finally(() => { if (version === requestVersion.current) setLoading(false); });
    return () => { requestVersion.current += 1; };
  }, [fiscalYear]);

  const openBudgetDialog = () => {
    if (!dashboard) return;
    setDraft(draftFromDashboard(dashboard));
    setSaveError("");
    dialogRef.current?.open();
  };

  const saveBudget = async () => {
    const payload = budgetPayload(draft);
    if (Object.values(payload).some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setSaveError("Enter nonnegative amounts or leave a quarter blank.");
      return;
    }
    const version = requestVersion.current;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateAttainmentBudget(fiscalYear, payload);
      if (version !== requestVersion.current) return;
      setDashboard(updated);
      dialogRef.current?.close();
    } catch (reason) {
      if (version === requestVersion.current) {
        setSaveError(reason instanceof Error ? reason.message : "Budget could not be saved.");
      }
    } finally {
      if (version === requestVersion.current) setSaving(false);
    }
  };

  const chartPoints = useMemo<ChartPoint[]>(() => dashboard ? dashboard.quarters.flatMap((quarter) => [
    { id: `${quarter.quarter}-actual`, seriesId: "Actual", groupId: quarter.quarter, value: quarter.actual, shortDesc: `${quarter.quarter} Actual ${formatAttainmentAmount(quarter.actual)}` } as const,
    { id: `${quarter.quarter}-forecast`, seriesId: "Forecast", groupId: quarter.quarter, value: quarter.forecast, shortDesc: `${quarter.quarter} Forecast ${formatAttainmentAmount(quarter.forecast)}` } as const
  ]) : [], [dashboard]);
  const chartData = useMemo(() => new ArrayDataProvider(chartPoints, { keyAttributes: "id" }), [chartPoints]);
  const budgetReference = useMemo(() => dashboard ? [{
    id: "quarter-budget-target",
    type: "line" as const,
    text: "Budget target",
    color: "#6f695f",
    lineStyle: "dashed" as const,
    lineWidth: 2,
    displayInLegend: "on" as const,
    items: dashboard.quarters.flatMap((quarter) => quarter.budget === null ? [] : [{ x: quarter.quarter, value: quarter.budget,
      shortDesc: `${quarter.quarter} Budget ${formatBudget(quarter.budget)}` }])
  }] : [], [dashboard]);

  if (loading && !dashboard) return <section class="kpi-panel attainment-loading" role="status" aria-busy="true"><oj-progress-circle value={-1} size="md"></oj-progress-circle> Loading Attainment…</section>;
  if (error && !dashboard) return <section class="kpi-panel" role="alert"><h1>Attainment</h1><p>{error}</p></section>;
  if (!dashboard) return <section class="kpi-panel" role="alert">Attainment is unavailable.</section>;

  const values = [...dashboard.quarters, dashboard.summary];
  const metricRows = [
    { label: "Budget", values: values.map((value) => formatBudget(value.budget)) },
    { label: "Actual", values: values.map((value) => formatAttainmentAmount(value.actual)) },
    { label: "Forecast", values: values.map((value) => formatAttainmentAmount(value.forecast)) },
    { label: "Actual Attainment", values: values.map((value) => formatAttainment(calculateAttainment(value.actual, value.budget))) },
    { label: "Forecast Attainment", values: values.map((value) => formatAttainment(calculateAttainment(value.forecast, value.budget))) }
  ];
  const detailRows = [
    { label: "DP Actual", values: values.map((value) => formatAttainmentAmount(value.dpActual)) },
    { label: "DP Forecast", values: values.map((value) => formatAttainmentAmount(value.dpForecast)) },
    { label: "OCI Actual", values: values.map((value) => formatAttainmentAmount(value.ociActual)) },
    { label: "OCI Forecast", values: values.map((value) => formatAttainmentAmount(value.ociForecast)) }
  ];

  return <section class="attainment-page" aria-labelledby="attainmentTitle" data-fiscal-year={fiscalYear}>
    <header class="consumption-page__header attainment-header">
      <div><span class="kpi-eyebrow">Consumption / Attainment</span><h1 id="attainmentTitle">Attainment</h1><p>Fiscal-year performance against quarterly budget. Amounts in K.</p></div>
      <oj-button chroming="outlined" onojAction={openBudgetDialog}>Budget</oj-button>
    </header>

    {error && <div class="attainment-inline-error" role="alert">{error}</div>}
    <section class="attainment-summary" aria-label={`${fiscalYear} summary`}>
      <article><span>FY Budget</span><strong>{formatBudget(dashboard.summary.budget)}</strong></article>
      <article><span>Actual variance to budget</span><strong>{signedAmount(dashboard.summary.actualVarianceToBudget)}</strong></article>
      <article><span>Forecast variance to budget</span><strong>{signedAmount(dashboard.summary.forecastVarianceToBudget)}</strong></article>
    </section>

    <section class="kpi-panel attainment-table-card" aria-labelledby="attainmentTableTitle">
      <div class="attainment-section-heading"><h2 id="attainmentTableTitle">Quarterly attainment</h2><span>{fiscalYear}</span></div>
      <div class="attainment-table-scroll">
        <table class="attainment-table">
          <thead><tr><th scope="col">Metric</th>{dashboard.quarters.map((quarter) => <th key={quarter.quarter} scope="col">{quarter.quarter}</th>)}<th scope="col">FY Total</th></tr></thead>
          <tbody>
            {metricRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`}>{value}</td>)}</tr>)}
            <tr class="attainment-detail-divider"><th colSpan={6} scope="rowgroup">Detail · amounts only</th></tr>
            {detailRows.map((row) => <tr key={row.label} class="attainment-detail-row"><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`}>{value}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="kpi-panel attainment-chart-card" aria-labelledby="attainmentChartTitle">
      <div class="attainment-section-heading"><div><h2 id="attainmentChartTitle">Actual and forecast by quarter</h2><p>Budget target is shown as a reference line. Amounts in K.</p></div></div>
      <oj-chart type="bar" data={chartData} yAxis={{ title: "Amount (K)", referenceObjects: budgetReference,
        tickLabel: { converter: amountAxisConverter, scaling: "none" } }} legend={{ position: "bottom" }} animationOnDisplay="auto" class="attainment-chart">
        <template slot="itemTemplate" render={renderChartItem}></template>
      </oj-chart>
    </section>

    <oj-dialog ref={dialogRef} dialogTitle={`Budget · ${fiscalYear}`} cancelBehavior={saving ? "none" : "icon"} class="attainment-budget-dialog">
      <div slot="body" class="attainment-budget-form">
        <p>Enter each budget in K. Values are stored as entered; blank means no budget and zero remains an explicit zero budget.</p>
        <div class="attainment-budget-fields">
          {quarterKeys.map((key, index) => <label key={key}><span>{`Q${index + 1} budget (K)`}</span><input type="number" min="0" step="0.0001" inputMode="decimal" value={draft[key]} disabled={saving}
            onInput={(event) => setDraft((current) => ({ ...current, [key]: (event.currentTarget as HTMLInputElement).value }))} /></label>)}
        </div>
        <div class="attainment-budget-total"><span>FY total</span><strong>{formatBudget(draftTotal(draft))}</strong></div>
        {saveError && <div role="alert" class="attainment-inline-error">{saveError}</div>}
      </div>
      <div slot="footer">
        <oj-button disabled={saving} onojAction={() => dialogRef.current?.close()}>Cancel</oj-button>
        <oj-button chroming="callToAction" disabled={saving} onojAction={() => void saveBudget()}>{saving ? "Saving…" : "Save budget"}</oj-button>
      </div>
    </oj-dialog>
  </section>;
}
