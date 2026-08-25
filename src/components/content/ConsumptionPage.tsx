import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import {
  ConsumptionPlan,
  ConsumptionQuarterSummary,
  aggregateConsumptionAccounts,
  buildQuarterSummary,
  detectConsumptionSignals,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths,
  parseConsumptionCsv,
  seedForecastMonths,
  sortConsumptionMonths
} from "../../data/consumptionData";
import { consumptionSyntheticCsv } from "../../data/consumptionMockData";
import { KpiNavigationGuard } from "./KpiSpreadsheetPage";
import "ojs/ojbutton";
import "ojs/ojchart";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

const clonePlans = (plans: readonly ConsumptionPlan[]): ConsumptionPlan[] =>
  plans.map((plan) => ({
    ...plan,
    actuals: { ...plan.actuals },
    forecasts: { ...plan.forecasts }
  }));

const createSeedPlans = (csv: string) => {
  const parsed = parseConsumptionCsv(csv);
  const latestActualMonth = getLatestActualMonth(parsed.plans);
  if (!latestActualMonth) throw new Error("Consumption CSV has no usable month columns.");
  return {
    plans: seedForecastMonths(parsed.plans, getNextQuarterMonths(latestActualMonth)),
    importedPlans: parsed.plans.length,
    controls: parsed.controlTotals.length,
    latestActualMonth
  };
};

const initialSeed = createSeedPlans(consumptionSyntheticCsv);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signedCurrency = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${currency.format(value)}`;
const formatPercent = (value: number | null) => value === null ? "New baseline" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const shortMonth = (month: string) => month.split("-")[1];

type EditCell = Readonly<{ planKey: string; month: string }>;
type ConsumptionChartPoint = Readonly<{
  id: string;
  seriesId: string;
  groupId: string;
  value: number;
  shortDesc: string;
}>;

const renderConsumptionChartItem = (context: Readonly<{ data: ConsumptionChartPoint }>) => (
  <oj-chart-item
    value={context.data.value}
    seriesId={context.data.seriesId}
    groupId={[context.data.groupId]}
    shortDesc={context.data.shortDesc}>
  </oj-chart-item>
);

type Props = Readonly<{
  fiscalYear: FiscalYear;
  onNavigationGuardChange: (guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => void;
}>;

export function ConsumptionPage({ fiscalYear, onNavigationGuardChange }: Props) {
  const [savedPlans, setSavedPlans] = useState<ConsumptionPlan[]>(() => clonePlans(initialSeed.plans));
  const [draftPlans, setDraftPlans] = useState<ConsumptionPlan[]>(() => clonePlans(initialSeed.plans));
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => new Set());
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [importStatus, setImportStatus] = useState(
    `Synthetic fallback · ${initialSeed.importedPlans} plans · ${initialSeed.controls} control total excluded`
  );
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editEntryValueRef = useRef<number | null>(null);

  const accounts = useMemo(() => aggregateConsumptionAccounts(draftPlans), [draftPlans]);
  const signals = useMemo(() => detectConsumptionSignals(draftPlans), [draftPlans]);
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? signals[0] ?? null;
  const selectedPlan = selectedSignal
    ? draftPlans.find((plan) => plan.customer === selectedSignal.customer && plan.planId === selectedSignal.planId) ?? null
    : draftPlans[0] ?? null;

  useEffect(() => {
    if (!selectedSignal) return;
    setExpandedAccounts((current) => {
      if (current.has(selectedSignal.customer)) return current;
      const next = new Set(current);
      next.add(selectedSignal.customer);
      return next;
    });
  }, [selectedSignal?.customer]);

  const allMonths = useMemo(() => sortConsumptionMonths([
    ...new Set(draftPlans.flatMap((plan) => [...Object.keys(plan.actuals), ...Object.keys(plan.forecasts)]))
  ]), [draftPlans]);
  const quarters = useMemo(() => [...new Set(allMonths.map(getFiscalQuarter))], [allMonths]);
  const trendPoints = useMemo<ConsumptionChartPoint[]>(() => selectedPlan
    ? allMonths.flatMap((month) => {
      const value = Object.prototype.hasOwnProperty.call(selectedPlan.actuals, month)
        ? selectedPlan.actuals[month]
        : Object.prototype.hasOwnProperty.call(selectedPlan.forecasts, month)
          ? selectedPlan.forecasts[month]
          : null;
      return value === null ? [] : [{
        id: `${selectedPlan.id}-${month}`,
        seriesId: `${selectedPlan.endUser} · ${selectedPlan.planId}`,
        groupId: month,
        value,
        shortDesc: `${month}: ${currency.format(value)}`
      }];
    })
    : [], [allMonths, selectedPlan]);
  const trendDataProvider = useMemo(() => new ArrayDataProvider(trendPoints, { keyAttributes: "id" }), [trendPoints]);
  const hasDraftChanges = JSON.stringify(savedPlans) !== JSON.stringify(draftPlans);

  useEffect(() => {
    if (!hasDraftChanges) {
      onNavigationGuardChange(null, false);
      return;
    }
    const guard: KpiNavigationGuard = (_destinationLabel, retry) => {
      if (!window.confirm("Unsaved Consumption forecast changes will be discarded. Leave this page?")) return;
      onNavigationGuardChange(null, false);
      retry();
    };
    onNavigationGuardChange(guard, true);
    return () => onNavigationGuardChange(null, false);
  }, [hasDraftChanges, onNavigationGuardChange]);

  const selectSignal = (signalId: string, customer: string) => {
    setSelectedSignalId(signalId);
    setExpandedAccounts((current) => new Set([...current, customer]));
  };

  const toggleAccount = (customer: string) => {
    setExpandedAccounts((current) => {
      const next = new Set(current);
      if (next.has(customer)) next.delete(customer);
      else next.add(customer);
      return next;
    });
  };

  const updateForecast = (planKey: string, month: string, value: number) => {
    setDraftPlans((current) => current.map((plan) => plan.id === planKey
      ? { ...plan, forecasts: { ...plan.forecasts, [month]: value } }
      : plan));
  };

  const beginForecastEdit = (plan: ConsumptionPlan, month: string) => {
    editEntryValueRef.current = plan.forecasts[month] ?? 0;
    setEditCell({ planKey: plan.id, month });
  };

  const commitForecastEdit = () => {
    editEntryValueRef.current = null;
    setEditCell(null);
  };

  const cancelForecastEdit = () => {
    if (!editCell || editEntryValueRef.current === null) {
      setEditCell(null);
      return;
    }
    updateForecast(editCell.planKey, editCell.month, editEntryValueRef.current);
    editEntryValueRef.current = null;
    setEditCell(null);
  };

  const editorKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commitForecastEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelForecastEdit();
    }
  };

  const saveForecasts = () => {
    setSavedPlans(clonePlans(draftPlans));
    setEditCell(null);
    editEntryValueRef.current = null;
    setImportStatus((current) => `${current.split(" · Saved")[0]} · Saved locally`);
  };

  const cancelAllForecasts = () => {
    setDraftPlans(clonePlans(savedPlans));
    setEditCell(null);
    editEntryValueRef.current = null;
  };

  const handleCsvFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setImportError("");
    try {
      const parsed = parseConsumptionCsv(await file.text());
      const latestActualMonth = getLatestActualMonth(parsed.plans);
      if (!latestActualMonth) throw new Error("The imported CSV has no populated fiscal Actual values.");
      const imported = seedForecastMonths(parsed.plans, getNextQuarterMonths(latestActualMonth));
      setSavedPlans(clonePlans(imported));
      setDraftPlans(clonePlans(imported));
      setSelectedSignalId("");
      setExpandedAccounts(new Set());
      setEditCell(null);
      setImportStatus(`${file.name} · ${imported.length} plans · ${parsed.controlTotals.length} control total excluded · through ${latestActualMonth}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption CSV could not be imported.");
    }
  };

  const renderQuarterCells = (series: ConsumptionPlan | ReturnType<typeof aggregateConsumptionAccounts>[number], readOnly: boolean) => {
    let previous: ConsumptionQuarterSummary | null = null;
    return quarters.flatMap((quarter) => {
      const summary = buildQuarterSummary(series, quarter, previous);
      previous = summary;
      return [
        ...summary.months.map((month) => {
          const actual = Object.prototype.hasOwnProperty.call(series.actuals, month);
          const forecast = Object.prototype.hasOwnProperty.call(series.forecasts, month);
          const value = actual ? series.actuals[month] : forecast ? series.forecasts[month] : null;
          const key = `${series.id}-${month}`;
          if (!readOnly && forecast && "planId" in series && series.planType !== "Aggregate") {
            const editing = editCell?.planKey === series.id && editCell.month === month;
            const savedPlan = savedPlans.find((plan) => plan.id === series.id);
            const dirty = savedPlan?.forecasts[month] !== value;
            return (
              <td
                key={key}
                data-forecast-cell={`${series.id}:${month}`}
                class={`consumption-value-cell consumption-forecast-cell${dirty ? " is-draft" : ""}`}
                onDblClick={(event) => {
                  if ((event.target as Element).closest("input")) return;
                  beginForecastEdit(series, month);
                }}>
                {editing ? (
                  <input
                    class="consumption-forecast-editor"
                    type="number"
                    min="0"
                    value={`${value ?? 0}`}
                    aria-label={`${series.endUser} ${month} forecast`}
                    onInput={(event) => updateForecast(series.id, month, Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0))}
                    onKeyDown={editorKeyDown}
                    autofocus
                  />
                ) : (
                  <span>{value === null ? "—" : currency.format(value)}{dirty && <small>draft</small>}</span>
                )}
              </td>
            );
          }
          return <td key={key} class="consumption-value-cell" data-readonly={actual ? "actual" : readOnly ? "account" : undefined}>{value === null ? "—" : currency.format(value)}</td>;
        }),
        <td key={`${series.id}-${quarter}-total`} class="consumption-value-cell consumption-quarter-total">
          {summary.total === null ? "N/A" : currency.format(summary.total)}
          <small>{summary.status}</small>
        </td>,
        <td key={`${series.id}-${quarter}-gap`} class="consumption-value-cell consumption-preq-gap">
          {signedCurrency(summary.preQGap)}
        </td>
      ];
    });
  };

  return (
    <section class="consumption-page" aria-labelledby="consumptionTitle" data-fiscal-year={fiscalYear}>
      <header class="consumption-page__header">
        <div>
          <span class="kpi-eyebrow">Signal-integrated Pulse</span>
          <h1 id="consumptionTitle">Consumption</h1>
          <p>Detect unusual monthly change, inspect its Plan context, and manage the next-quarter Forecast.</p>
        </div>
        <div class="consumption-import-actions">
          <input ref={fileInputRef} class="consumption-file-input" type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvFile(event)} />
          <oj-button chroming="outlined" onojAction={() => fileInputRef.current?.click()}>
            <span slot="startIcon" class="oj-ux-ico-upload"></span>
            Import CSV
          </oj-button>
        </div>
      </header>

      <div class="consumption-import-status" role="status">{importStatus}</div>
      {importError && <div class="consumption-import-error" role="alert">{importError}</div>}

      <div class="consumption-pulse-layout">
        <section class="kpi-panel consumption-signal-panel" aria-labelledby="consumptionSignalTitle">
          <div class="consumption-section-heading">
            <div><span class="kpi-section-label">Prioritized detection</span><h2 id="consumptionSignalTitle">Change Signal Inbox</h2></div>
            <span class="consumption-count-badge">{signals.length}</span>
          </div>
          <div id="consumptionSignalInbox" class="consumption-signal-inbox" role="list">
            {signals.map((signal) => (
              <button
                type="button"
                role="listitem"
                class={selectedSignal?.id === signal.id ? "consumption-signal is-selected" : "consumption-signal"}
                aria-pressed={selectedSignal?.id === signal.id}
                onClick={() => selectSignal(signal.id, signal.customer)}>
                <span class={`consumption-signal-grade is-${signal.grade.toLowerCase()}`}>{signal.grade}</span>
                <span class="consumption-signal-main"><strong>{signal.customer}</strong><span>{signal.endUser} · {signal.planId}</span></span>
                <span class="consumption-signal-type">{signal.type}</span>
                <span class="consumption-signal-change"><strong>{signedCurrency(signal.changeAmount)}</strong><span>{formatPercent(signal.changePercent)}</span></span>
                <span class="consumption-signal-month">{signal.month}</span>
              </button>
            ))}
            {signals.length === 0 && <p class="consumption-empty-state">No material changes were detected in the latest complete month.</p>}
          </div>
        </section>

        <section class="kpi-panel consumption-trend-panel" aria-labelledby="consumptionTrendTitle">
          <div class="consumption-section-heading">
            <div>
              <span class="kpi-section-label">Linked context</span>
              <h2 id="consumptionTrendTitle">Consumption Trend</h2>
              <p>{selectedPlan ? `${selectedPlan.customer} · ${selectedPlan.endUser} · ${selectedPlan.planId}` : "Select a Signal"}</p>
            </div>
          </div>
          <oj-chart
            id="consumptionTrendChart"
            type="line"
            data={trendDataProvider}
            animationOnDisplay="auto"
            animationOnDataChange="auto"
            legend={{ rendered: "off" }}
            aria-label="Linked monthly consumption trend">
            <template slot="itemTemplate" render={renderConsumptionChartItem}></template>
          </oj-chart>
          {selectedSignal && (
            <div class="consumption-signal-reason" role="note">
              <span class={`consumption-signal-grade is-${selectedSignal.grade.toLowerCase()}`}>{selectedSignal.grade}</span>
              <div><strong>{selectedSignal.type} · {selectedSignal.month}</strong><p>{selectedSignal.reason} Top contributing Plan: {selectedSignal.topContributingPlan}.</p></div>
            </div>
          )}
        </section>
      </div>

      <section class="kpi-panel consumption-table-panel" aria-labelledby="consumptionTableTitle">
        <div class="consumption-section-heading consumption-table-heading">
          <div>
            <span class="kpi-section-label">Actual + Forecast</span>
            <h2 id="consumptionTableTitle">End User / Plan Consumption</h2>
            <p>Double-click a Forecast cell. Enter keeps the page draft; Esc restores the edit-entry value.</p>
          </div>
          {hasDraftChanges && (
            <div class="consumption-draft-actions" role="toolbar" aria-label="Forecast draft actions">
              <span>Draft changes</span>
              <oj-button chroming="callToAction" onojAction={saveForecasts}>Save</oj-button>
              <oj-button chroming="outlined" onojAction={cancelAllForecasts}>Cancel</oj-button>
            </div>
          )}
        </div>
        <div class="consumption-table-scroll" tabIndex={0} aria-label="Horizontally scrollable Consumption table">
          <table class="consumption-table">
            <thead>
              <tr>
                <th class="consumption-account-column" rowSpan={2}>Account / End User</th>
                {quarters.map((quarter) => <th key={quarter} colSpan={5}>{quarter}</th>)}
              </tr>
              <tr>
                {quarters.flatMap((quarter) => [
                  ...buildQuarterSummary(accounts[0] ?? draftPlans[0], quarter, null).months.map((month) => <th key={`${quarter}-${month}`}>{shortMonth(month)}</th>),
                  <th key={`${quarter}-total`}>Quarter Total</th>,
                  <th key={`${quarter}-gap`}>PreQ Gap</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const expanded = expandedAccounts.has(account.customer);
                return (
                  <>
                    <tr key={account.id} class={selectedSignal?.customer === account.customer ? "consumption-account-row is-context" : "consumption-account-row"} data-readonly="account">
                      <th class="consumption-account-column" scope="row">
                        <button type="button" class="consumption-account-toggle" aria-expanded={expanded} onClick={() => toggleAccount(account.customer)}>
                          <span class={expanded ? "oj-ux-ico-chevron-down" : "oj-ux-ico-chevron-right"} aria-hidden="true"></span>
                          <strong>{account.customer}</strong>
                          <small>{account.plans.length} Plan{account.plans.length === 1 ? "" : "s"}</small>
                        </button>
                      </th>
                      {renderQuarterCells(account, true)}
                    </tr>
                    {expanded && account.plans.map((plan) => (
                      <tr key={plan.id} class={selectedSignal?.planId === plan.planId ? "consumption-plan-row is-context" : "consumption-plan-row"}>
                        <th class="consumption-account-column" scope="row">
                          <span class="consumption-end-user">{plan.endUser}</span>
                          <small>Plan {plan.planId} · DC {plan.dataCenter}</small>
                        </th>
                        {renderQuarterCells(plan, false)}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
