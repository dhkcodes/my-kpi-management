import { h } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import {
  ConsumptionPlan,
  ConsumptionSignal,
  aggregateConsumptionAccounts,
  aggregateConsumptionActualTotals,
  buildDisplayQuarterSummaries,
  filterActiveConsumptionPlans,
  getConsumptionPlanLabel,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths,
  getQuarterMonths,
  isConsumptionQuarterRangeValid,
  parseConsumptionCsv,
  restoreForecastEntry,
  sortConsumptionMonths,
  sortConsumptionMonthsNewestFirst
} from "../../data/consumptionData";
import { consumptionSyntheticCsv } from "../../data/consumptionMockData";
import {
  ConsumptionApiWorkspace,
  ConsumptionConflictError,
  applyConsumptionImport,
  canUseConsumptionFallback,
  fetchConsumptionWorkspace,
  previewConsumptionImport,
  saveConsumptionForecasts
} from "../../data/consumptionApi";
import { KpiNavigationGuard } from "./KpiSpreadsheetPage";
import "ojs/ojbutton";
import "ojs/ojchart";
import "ojs/ojdialog";
import "ojs/ojprogress-circle";
import { ojDialog } from "ojs/ojdialog";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

const clonePlans = (plans: readonly ConsumptionPlan[]): ConsumptionPlan[] =>
  plans.map((plan) => ({
    ...plan,
    actuals: { ...plan.actuals },
    forecasts: { ...plan.forecasts },
    versions: plan.versions ? { ...plan.versions } : undefined
  }));

const createSeedPlans = (csv: string) => {
  const parsed = parseConsumptionCsv(csv);
  const latestActualMonth = getLatestActualMonth(parsed.plans);
  if (!latestActualMonth) throw new Error("Consumption CSV has no usable month columns.");
  return {
    plans: parsed.plans,
    importedPlans: parsed.plans.length,
    controls: parsed.controlTotals.length,
    latestActualMonth
  };
};

const initialSeed = createSeedPlans(consumptionSyntheticCsv);
const fallbackActualQuarters = [...new Set(initialSeed.plans.flatMap((plan) => Object.keys(plan.actuals).map(getFiscalQuarter)))].reverse();
const fallbackEditablePeriods = getNextQuarterMonths(initialSeed.latestActualMonth);
const fallbackForecastQuarters = [...new Set(fallbackEditablePeriods.map(getFiscalQuarter))];
const fallbackDisplayQuarterOrder = [...fallbackForecastQuarters, ...fallbackActualQuarters.filter((quarter) => !fallbackForecastQuarters.includes(quarter))];
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signedCurrency = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${currency.format(value)}`;
const formatPercent = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const shortMonth = (month: string) => month.split("-")[1];
const consumptionSignalPresentation = (signal: ConsumptionSignal) => signal.type === "ABOVE_USUAL"
  ? { label: "ABOVE USUAL", tone: "is-above-usual" }
  : signal.type === "BELOW_USUAL"
    ? { label: "BELOW USUAL", tone: "is-below-usual" }
    : { label: "NEW USAGE", tone: "is-new-usage" };
const consumptionPreviousDirection = (signal: ConsumptionSignal) => signal.previousDirection === "INCREASED"
  ? { label: "Increased", icon: "oj-ux-ico-arrow-up", tone: "is-increased" }
  : signal.previousDirection === "DECREASED"
    ? { label: "Decreased", icon: "oj-ux-ico-arrow-down", tone: "is-decreased" }
    : { label: "Unchanged", icon: "oj-ux-ico-minus", tone: "is-unchanged" };
const consumptionSignalAccessibleLabel = (signal: ConsumptionSignal) => {
  const presentation = consumptionSignalPresentation(signal);
  const previousDirection = consumptionPreviousDirection(signal);
  const sparkline = signal.sparkline
    .map((point) => `${shortMonth(point.periodKey)} ${currency.format(point.actualAmount)}`)
    .join(", ");
  return `${signal.customer} Plan ${signal.planId}. ${presentation.label}. Severity ${signal.grade}. `
    + `${signal.month} actual ${currency.format(signal.latestActual)}. Previous three-month median ${currency.format(signal.baselineMedian)}. `
    + `Change ${signedCurrency(signal.changeAmount)}, ${formatPercent(signal.changePercent)}. Allowance ${currency.format(signal.allowance)}. `
    + `Previous month ${previousDirection.label}. Recent four completed months: ${sparkline}. Open this Plan's Consumption Trend.`;
};

type ConsumptionTooltipPosition = Readonly<{ left: number; top?: number; bottom?: number; maxWidth: number }>;

function ConsumptionTruncatedText({ text, className = "", focusable = true }: Readonly<{ text: string; className?: string; focusable?: boolean }>) {
  const textRef = useRef<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<ConsumptionTooltipPosition | null>(null);
  const showTooltip = () => {
    const element = textRef.current;
    if (!element) return;
    const isTruncated = element.scrollWidth > element.clientWidth;
    if (!isTruncated) {
      setTooltipPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const maxWidth = Math.max(160, Math.min(448, window.innerWidth - 16));
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - maxWidth - 8));
    setTooltipPosition(rect.bottom < window.innerHeight * .7
      ? { left, top: rect.bottom + 6, maxWidth }
      : { left, bottom: window.innerHeight - rect.top + 6, maxWidth });
  };
  const hideTooltip = () => setTooltipPosition(null);
  return <>
    <strong ref={textRef as any} class={`consumption-clipped-text ${className}`.trim()} tabIndex={focusable ? 0 : undefined}
      onMouseEnter={showTooltip} onMouseLeave={hideTooltip} onFocus={focusable ? showTooltip : undefined} onBlur={focusable ? hideTooltip : undefined}>{text}</strong>
    {tooltipPosition && createPortal(<div class="consumption-clipped-tooltip" role="tooltip"
      style={{ left: `${tooltipPosition.left}px`, top: tooltipPosition.top === undefined ? undefined : `${tooltipPosition.top}px`,
        bottom: tooltipPosition.bottom === undefined ? undefined : `${tooltipPosition.bottom}px`, maxWidth: `${tooltipPosition.maxWidth}px` }}>{text}</div>, document.body)}
  </>;
}

const SignalSparkline = ({ signal }: Readonly<{ signal: ConsumptionSignal }>) => {
  const width = 92;
  const height = 30;
  const padding = 3;
  const values = signal.sparkline.map((point) => point.actualAmount);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const points = values.map((value, index) => {
    const x = padding + index * ((width - padding * 2) / Math.max(1, values.length - 1));
    const y = range === 0 ? height / 2 : padding + (maximum - value) / range * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg class="consumption-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <polyline points={points}></polyline>
    </svg>
  );
};

type EditCell = Readonly<{ planKey: string; month: string }>;
type ConflictRow = Readonly<{ plan: string; month: string; saved: number | null; draft: number | null; current: number | null }>;
type ImportPhase = "idle" | "previewing" | "preview" | "applying" | "complete" | "error";
type PendingImport = Readonly<{
  csv: string;
  fileName: string;
  latestActualMonth: string;
  parsed: ReturnType<typeof parseConsumptionCsv>;
  useFallback: boolean;
  planCount: number;
  controlTotalCount: number;
  sourceRowCount: number;
}>;
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
  const [savedPlans, setSavedPlans] = useState<ConsumptionPlan[]>([]);
  const [draftPlans, setDraftPlans] = useState<ConsumptionPlan[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState("__all__");
  const [planSearch, setPlanSearch] = useState("");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => new Set());
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [importError, setImportError] = useState("");
  const [apiEtag, setApiEtag] = useState("");
  const [dataMode, setDataMode] = useState<"loading" | "backend" | "fallback" | "error">("loading");
  const [isSaving, setIsSaving] = useState(false);
  const [serverSignals, setServerSignals] = useState<ConsumptionSignal[] | null>(null);
  const [conflictRows, setConflictRows] = useState<ConflictRow[]>([]);
  const [conflictWorkspace, setConflictWorkspace] = useState<ConsumptionApiWorkspace | null>(null);
  const [fromQuarter, setFromQuarter] = useState("");
  const [toQuarter, setToQuarter] = useState("");
  const [displayQuarterOrder, setDisplayQuarterOrder] = useState<string[]>([]);
  const [availableQuarterOptions, setAvailableQuarterOptions] = useState<string[]>([]);
  const [editablePeriodIds, setEditablePeriodIds] = useState<Set<string>>(() => new Set());
  const [currentFiscalMonth, setCurrentFiscalMonth] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeInitialized, setRangeInitialized] = useState(false);
  const [rangeTouched, setRangeTouched] = useState(false);
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [tableScrollState, setTableScrollState] = useState({ left: 0, max: 0 });
  const [pulseExpanded, setPulseExpanded] = useState(true);
  const [tableExpanded, setTableExpanded] = useState(true);
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importResult, setImportResult] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importDialogRef = useRef<ojDialog | null>(null);
  const editEntryValueRef = useRef<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const adoptWorkspace = (workspace: ConsumptionApiWorkspace) => {
    setSavedPlans(clonePlans(workspace.plans));
    setDraftPlans(clonePlans(workspace.plans));
    setServerSignals(workspace.signals);
    setApiEtag(workspace.etag);
    setFromQuarter(workspace.fromQuarter);
    setToQuarter(workspace.toQuarter);
    setEditablePeriodIds(new Set(workspace.editablePeriodIds));
    setDisplayQuarterOrder([...workspace.displayQuarterOrder]);
    setAvailableQuarterOptions((current) => [...new Set([...current, ...workspace.displayQuarterOrder, workspace.fromQuarter, workspace.toQuarter].filter(Boolean))].sort());
    setCurrentFiscalMonth(workspace.currentFiscalMonth);
    setRangeInitialized(true);
    setRangeTouched(false);
    setDataMode("backend");
    setConflictRows([]);
    setConflictWorkspace(null);
  };

  useEffect(() => {
    let active = true;
    void fetchConsumptionWorkspace().then((workspace) => {
      if (active) adoptWorkspace(workspace);
    }).catch((error) => {
      if (!active) return;
      if (canUseConsumptionFallback(error)) {
        const fallbackPlans = clonePlans(initialSeed.plans);
        setSavedPlans(fallbackPlans);
        setDraftPlans(clonePlans(fallbackPlans));
        setServerSignals(null);
        setFromQuarter(fallbackActualQuarters[fallbackActualQuarters.length - 1] ?? fallbackForecastQuarters[0] ?? "");
        setToQuarter(fallbackForecastQuarters[fallbackForecastQuarters.length - 1] ?? fallbackActualQuarters[0] ?? "");
        setEditablePeriodIds(new Set(fallbackEditablePeriods));
        setDisplayQuarterOrder(fallbackDisplayQuarterOrder);
        setAvailableQuarterOptions([...new Set([...fallbackDisplayQuarterOrder, ...fallbackActualQuarters, ...fallbackForecastQuarters])].sort());
        setCurrentFiscalMonth(initialSeed.latestActualMonth);
        setRangeInitialized(true);
        setRangeTouched(false);
        setDataMode("fallback");

      } else {
        setDataMode("error");
        setImportError(error instanceof Error ? error.message : "Consumption backend could not be loaded.");
      }
    });
    return () => { active = false; };
  }, []);

  const visiblePlans = useMemo(() => filterActiveConsumptionPlans(draftPlans, currentFiscalMonth), [currentFiscalMonth, draftPlans]);
  const accounts = useMemo(() => aggregateConsumptionAccounts(visiblePlans), [visiblePlans]);
  const visibleTableRowCount = accounts.reduce((count, account) => count + 1 + (expandedAccounts.has(account.customer) ? account.plans.length : 0), 0);
  const signals = useMemo(() => serverSignals ?? [], [serverSignals]);
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? null;
  const allAccountsTotal = useMemo(() => aggregateConsumptionActualTotals(draftPlans), [draftPlans]);
  const selectedPlan = selectedSeriesId === "__all__"
    ? allAccountsTotal
    : draftPlans.find((plan) => plan.id === selectedSeriesId) ?? allAccountsTotal;
  const selectedPlanLabel = selectedSeriesId === "__all__" || !("planId" in (selectedPlan ?? {}))
    ? "All accounts · Total"
    : getConsumptionPlanLabel(selectedPlan as ConsumptionPlan);
  const filteredPlans = draftPlans.filter((plan) => getConsumptionPlanLabel(plan).toLowerCase().includes(planSearch.trim().toLowerCase()));
  const selectTrendPlan = (plan: ConsumptionPlan | null) => {
    setSelectedSeriesId(plan?.id ?? "__all__");
    setSelectedSignalId("");
    setPlanSearch("");
    setAccountSelectorOpen(false);
  };
  const handlePlanSelectorKeyDown = (event: KeyboardEvent) => {
    const optionCount = filteredPlans.length + 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setAccountSelectorOpen(true);
      setActivePlanIndex((current) => (current + (event.key === "ArrowDown" ? 1 : optionCount - 1)) % optionCount);
    } else if (event.key === "Enter" && accountSelectorOpen) {
      event.preventDefault();
      selectTrendPlan(activePlanIndex === 0 ? null : filteredPlans[activePlanIndex - 1] ?? null);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAccountSelectorOpen(false);
    } else if (event.key === "Tab") {
      setAccountSelectorOpen(false);
    }
  };

  const updateTableScrollState = () => {
    const table = tableScrollRef.current;
    if (!table) return;
    setTableScrollState({
      left: Math.round(table.scrollLeft),
      max: Math.max(0, Math.round(table.scrollWidth - table.clientWidth))
    });
  };

  const moveTableHorizontally = (direction: -1 | 1) => {
    const table = tableScrollRef.current;
    if (!table) return;
    const step = Math.max(320, Math.round(table.clientWidth * 0.72));
    table.scrollTo({ left: table.scrollLeft + direction * step, behavior: "smooth" });
    window.setTimeout(updateTableScrollState, 240);
  };

  const handleTableKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTableHorizontally(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTableHorizontally(1);
    }
  };

  const allMonths = useMemo(() => sortConsumptionMonths([
    ...new Set(displayQuarterOrder.flatMap((quarter) => getQuarterMonths(quarter)))
  ]), [displayQuarterOrder]);
  const quarters = displayQuarterOrder;
  const quarterOptions = availableQuarterOptions;
  const rangeValid = isConsumptionQuarterRangeValid(fromQuarter, toQuarter);
  const trendPoints = useMemo<ConsumptionChartPoint[]>(() => selectedPlan
    ? allMonths.flatMap((month) => {
      const value = selectedPlan.actuals[month];
      return value === undefined ? [] : [{
        id: `${selectedPlan.id}-${month}`,
        seriesId: selectedPlanLabel,
        groupId: month,
        value,
        shortDesc: `${month}: ${currency.format(value)}`
      }];
    })
    : [], [allMonths, selectedPlan, selectedPlanLabel]);
  const trendDataProvider = useMemo(() => new ArrayDataProvider(trendPoints, { keyAttributes: "id" }), [trendPoints]);
  const rangeSummaries = useMemo(() => selectedPlan ? buildDisplayQuarterSummaries(selectedPlan, displayQuarterOrder) : [], [displayQuarterOrder, selectedPlan]);
  const rangeTotal = rangeSummaries.reduce((sum, summary) => sum + (summary.total ?? 0), 0);
  const latestSummary = rangeSummaries[0] ?? null;
  const forecastTotal = rangeSummaries.filter((summary) => summary.status === "FORECAST" || summary.status === "MIXED")
    .reduce((sum, summary) => sum + (summary.total ?? 0), 0);
  const hasDraftChanges = JSON.stringify(savedPlans) !== JSON.stringify(draftPlans);

  useEffect(() => {
    updateTableScrollState();
    window.addEventListener("resize", updateTableScrollState);
    return () => window.removeEventListener("resize", updateTableScrollState);
  }, [accounts.length, displayQuarterOrder]);

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

  const selectSignal = (signal: ConsumptionSignal) => {
    const plan = signal.serverPlanId === undefined
      ? draftPlans.find((candidate) => candidate.customer === signal.customer
        && candidate.endUser === signal.endUser && candidate.planId === signal.planId)
      : draftPlans.find((candidate) => candidate.serverPlanId === signal.serverPlanId);
    setSelectedSignalId(signal.id);
    if (plan) setSelectedSeriesId(plan.id);
  };

  const applyQuarterRange = async () => {
    if (!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || hasDraftChanges) return;
    setRangeLoading(true);
    setImportError("");
    try {
      const workspace = await fetchConsumptionWorkspace({ fromQuarter, toQuarter });
      adoptWorkspace(workspace);
      setSelectedSignalId("");
      setSelectedSeriesId("__all__");
      setExpandedAccounts(new Set());
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption range could not be loaded.");
    } finally {
      setRangeLoading(false);
    }
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
    if (isSaving || (dataMode !== "backend" && dataMode !== "fallback")) return;
    editEntryValueRef.current = plan.forecasts[month] ?? plan.actuals[month] ?? 0;
    setEditCell({ planKey: plan.id, month });
  };

  const commitForecastEdit = () => {
    editEntryValueRef.current = null;
    setEditCell(null);
  };

  const cancelForecastEdit = () => {
    if (!editCell) {
      setEditCell(null);
      return;
    }
    setDraftPlans((current) => current.map((plan) => {
      if (plan.id !== editCell.planKey) return plan;
      const saved = savedPlans.find((candidate) => candidate.id === plan.id);
      return saved ? restoreForecastEntry(plan, saved, editCell.month) : plan;
    }));
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

  const saveForecasts = async () => {
    if (isSaving) return;
    setEditCell(null);
    editEntryValueRef.current = null;
    setIsSaving(true);
    setImportError("");
    setConflictRows([]);
    const updates = draftPlans.flatMap((draft) => {
      const saved = savedPlans.find((plan) => plan.id === draft.id);
      if (!saved || draft.serverPlanId === undefined) return [];
      return Object.keys(draft.forecasts).filter((month) => editablePeriodIds.has(month)).flatMap((month) => saved.forecasts[month] === draft.forecasts[month] ? [] : [{
        planId: draft.serverPlanId as number,
        periodKey: month,
        amount: draft.forecasts[month],
        versionNo: saved.versions?.[month] ?? 0
      }]);
    });
    try {
      if (dataMode === "fallback") {
        setSavedPlans(clonePlans(draftPlans));

      } else if (dataMode !== "backend" || !apiEtag) {
        throw new Error("Authoritative Consumption workspace is not ready; Forecast was not saved.");
      } else {
        const workspace = await saveConsumptionForecasts(apiEtag, updates);
        adoptWorkspace(workspace);
      }
      setEditCell(null);
      editEntryValueRef.current = null;
    } catch (error) {
      if (error instanceof ConsumptionConflictError) {
        const rows: ConflictRow[] = [];
        draftPlans.forEach((draft) => {
          const saved = savedPlans.find((plan) => plan.id === draft.id);
          const current = error.current.plans.find((plan) => plan.serverPlanId === draft.serverPlanId);
          Object.keys(draft.forecasts).forEach((month) => {
            if (saved?.forecasts[month] === draft.forecasts[month]) return;
            rows.push({ plan: `${draft.endUser} · ${draft.planId}`, month,
              saved: saved?.forecasts[month] ?? null, draft: draft.forecasts[month] ?? null,
              current: current?.forecasts[month] ?? current?.actuals[month] ?? null });
          });
        });
        setConflictRows(rows);
        setConflictWorkspace(error.current);
        setImportError("Forecast Save conflicted with a newer server version. Compare values below.");
      } else {
        setImportError(error instanceof Error ? error.message : "Consumption Forecast could not be saved.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAllForecasts = () => {
    setDraftPlans(clonePlans(savedPlans));
    setEditCell(null);
    editEntryValueRef.current = null;
  };

  useEffect(() => {
    if (importPhase !== "idle") importDialogRef.current?.open();
  }, [importPhase]);

  const handleCsvFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || dataMode === "loading" || isSaving || importPhase === "previewing" || importPhase === "applying") return;
    setImportError("");
    setImportResult("");
    setPendingImport(null);
    setImportPhase("previewing");
    try {
      const csv = await file.text();
      const parsed = parseConsumptionCsv(csv);
      const latestActualMonth = getLatestActualMonth(parsed.plans);
      if (!latestActualMonth) throw new Error("The imported CSV has no populated fiscal Actual values.");
      try {
        const preview = await previewConsumptionImport(csv);
        setPendingImport({ csv, fileName: file.name, latestActualMonth, parsed, useFallback: false,
          planCount: preview.planCount, controlTotalCount: preview.controlTotalCount, sourceRowCount: preview.sourceRowCount });
      } catch (error) {
        if (!canUseConsumptionFallback(error)) throw error;
        setPendingImport({ csv, fileName: file.name, latestActualMonth, parsed, useFallback: true,
          planCount: parsed.plans.length, controlTotalCount: parsed.controlTotals.length,
          sourceRowCount: parsed.plans.length + parsed.controlTotals.length });
      }
      setImportPhase("preview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Consumption CSV could not be previewed.";
      setImportError(message);
      setImportResult(message);
      setImportPhase("error");
    }
  };

  const applyPendingImport = async () => {
    if (!pendingImport || importPhase !== "preview") return;
    setImportPhase("applying");
    setImportError("");
    try {
      let loadedPlans = pendingImport.planCount;
      let loadedControls = pendingImport.controlTotalCount;
      let importCountDetail = "";
      if (!pendingImport.useFallback) {
        const result = await applyConsumptionImport(pendingImport.csv);
        loadedPlans = result.planCount;
        loadedControls = result.controlTotalCount;
        importCountDetail = ` · New plans: ${result.insertedCount} · Overwritten plans: ${result.updatedCount}`;
        adoptWorkspace(result.workspace);
      } else {
        const importedEditablePeriods = getNextQuarterMonths(pendingImport.latestActualMonth);
        const imported = pendingImport.parsed.plans;
        const importedHistoryQuarters = [...new Set(pendingImport.parsed.monthKeys.map(getFiscalQuarter))].reverse();
        const importedForecastQuarters = [...new Set(importedEditablePeriods.map(getFiscalQuarter))];
        setSavedPlans(clonePlans(imported));
        setDraftPlans(clonePlans(imported));
        setServerSignals(null);
        setFromQuarter(importedHistoryQuarters[importedHistoryQuarters.length - 1] ?? importedForecastQuarters[0] ?? "");
        setToQuarter(importedForecastQuarters[importedForecastQuarters.length - 1] ?? importedHistoryQuarters[0] ?? "");
        setEditablePeriodIds(new Set(importedEditablePeriods));
        setDisplayQuarterOrder([...importedForecastQuarters, ...importedHistoryQuarters.filter((quarter) => !importedForecastQuarters.includes(quarter))]);
        setAvailableQuarterOptions([...new Set([...importedHistoryQuarters, ...importedForecastQuarters])].sort());
        setCurrentFiscalMonth(pendingImport.latestActualMonth);
        setRangeInitialized(true);
        setRangeTouched(false);
        setApiEtag("");
        setDataMode("fallback");
        setConflictRows([]);
        setConflictWorkspace(null);

      }
      setSelectedSignalId("");
      setExpandedAccounts(new Set());
      setEditCell(null);
      setImportResult(`Successful rows: ${loadedPlans + loadedControls} · Failed rows: 0 · Applied plans: ${loadedPlans}${importCountDetail} · Control totals: ${loadedControls}`);
      setImportPhase("complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Consumption CSV could not be imported.";
      setImportError(message);
      setImportResult(`Successful rows: 0 · Failed rows: 1 · Loaded plans: 0 · ${message}`);
      setImportPhase("error");
    }
  };

  const closeImportDialog = () => importDialogRef.current?.close();

  const renderQuarterCells = (series: ConsumptionPlan | ReturnType<typeof aggregateConsumptionAccounts>[number], readOnly: boolean) =>
    buildDisplayQuarterSummaries({
      ...series,
      actuals: Object.fromEntries(Object.entries(series.actuals).filter(([month]) =>
        !editablePeriodIds.has(month) || !Object.prototype.hasOwnProperty.call(series.forecasts, month)))
    }, displayQuarterOrder).flatMap((summary) => {
      const quarter = summary.quarter;
      const forecastQuarter = summary.months.some((month) => editablePeriodIds.has(month));
      return [
        ...sortConsumptionMonthsNewestFirst(summary.months).map((month) => {
          const actual = Object.prototype.hasOwnProperty.call(series.actuals, month);
          const forecast = Object.prototype.hasOwnProperty.call(series.forecasts, month);
          const editable = editablePeriodIds.has(month);
          const value = editable
            ? series.forecasts[month] ?? series.actuals[month] ?? null
            : actual ? series.actuals[month] : forecast ? series.forecasts[month] : null;
          const key = `${series.id}-${month}`;
          if (!readOnly && editable && "planId" in series && series.planType !== "Aggregate") {
            const editing = editCell?.planKey === series.id && editCell.month === month;
            const savedPlan = savedPlans.find((plan) => plan.id === series.id);
            const savedValue = savedPlan?.forecasts[month] ?? savedPlan?.actuals[month];
            const dirty = savedValue !== value;
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
                    disabled={isSaving}
                    onFocus={(event) => (event.currentTarget as HTMLInputElement).select()}
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
          return <td key={key} class={`consumption-value-cell${editable ? " consumption-forecast-cell" : ""}`} data-readonly={!editable && actual ? "actual" : readOnly ? "account" : undefined}>{value === null ? "—" : currency.format(value)}</td>;
        }),
        <td key={`${series.id}-${quarter}-total`} class={`consumption-value-cell consumption-quarter-total${forecastQuarter ? " is-forecast" : ""}`}>
          {summary.total === null ? "N/A" : currency.format(summary.total)}
          <small class={`is-${summary.status.toLowerCase()}`}>{summary.status}</small>
        </td>,
        <td key={`${series.id}-${quarter}-gap`} class={`consumption-value-cell consumption-preq-gap${forecastQuarter ? " is-forecast" : ""}`}>
          {signedCurrency(summary.preQGap)}
        </td>
      ];
    });

  return (
    <section class="consumption-page" aria-labelledby="consumptionTitle" data-fiscal-year={fiscalYear}>
      <header class="consumption-page__header">
        <div>
          <span class="kpi-eyebrow">Signal-integrated Pulse</span>
          <h1 id="consumptionTitle">Consumption</h1>
        </div>
        <div class="consumption-import-actions">
          <input ref={fileInputRef} class="consumption-file-input" type="file" accept=".csv,text/csv" disabled={dataMode === "loading" || isSaving || importPhase === "previewing" || importPhase === "applying"} onChange={(event) => void handleCsvFile(event)} />
          <oj-button chroming="outlined" disabled={dataMode === "loading" || isSaving || importPhase === "previewing" || importPhase === "applying"} onojAction={() => fileInputRef.current?.click()}>
            <span slot="startIcon" class="oj-ux-ico-upload"></span>
            Import CSV
          </oj-button>
        </div>
      </header>

      <section class="consumption-range-bar" aria-label="Consumption quarter range">
        <label htmlFor="consumptionFromQuarter">From Quarter
          <select id="consumptionFromQuarter" value={fromQuarter} disabled={rangeLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setFromQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <label htmlFor="consumptionToQuarter">To Quarter
          <select id="consumptionToQuarter" value={toQuarter} disabled={rangeLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setToQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <oj-button chroming="callToAction" disabled={!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || hasDraftChanges || dataMode !== "backend"} onojAction={() => void applyQuarterRange()}>
          {rangeLoading ? "Applying…" : "Apply"}
        </oj-button>
        {rangeInitialized && rangeTouched && !rangeValid && <span class="consumption-range-error" role="alert">From Quarter must not be after To Quarter.</span>}
        {hasDraftChanges && <span class="consumption-range-note">Save or cancel Forecast changes before changing range.</span>}
      </section>

      {importError && <div class="consumption-import-error" role="alert">{importError}</div>}
      <oj-dialog
        id="consumptionImportDialog"
        ref={importDialogRef}
        dialogTitle="Consumption CSV import"
        cancelBehavior={importPhase === "previewing" || importPhase === "applying" ? "none" : "icon"}
        onojClose={() => {
          if (importPhase === "previewing" || importPhase === "applying") return;
          setImportPhase("idle");
          setPendingImport(null);
          setImportResult("");
        }}>
        <div slot="body" class="consumption-import-dialog-body" aria-live="polite">
          {(importPhase === "previewing" || importPhase === "applying") && (
            <div class="consumption-import-progress" role="status">
              <oj-progress-circle value={-1} size="md"></oj-progress-circle>
              <div><strong>{importPhase === "previewing" ? "Validating CSV…" : "Importing Consumption CSV…"}</strong><p>Keep this dialog open while the atomic import completes.</p></div>
            </div>
          )}
          {importPhase === "preview" && pendingImport && (
            <div class="consumption-import-preview">
              <p><strong>{pendingImport.fileName}</strong> passed validation.</p>
              <dl><div><dt>Source rows</dt><dd>{pendingImport.sourceRowCount}</dd></div><div><dt>Plans</dt><dd>{pendingImport.planCount}</dd></div><div><dt>Control totals</dt><dd>{pendingImport.controlTotalCount}</dd></div></dl>
              <p>{pendingImport.useFallback ? "Local preview mode will replace the current synthetic workspace." : "Apply will replace the authoritative Consumption workspace atomically."}</p>
            </div>
          )}
          {(importPhase === "complete" || importPhase === "error") && (
            <div class={importPhase === "complete" ? "consumption-import-result is-success" : "consumption-import-result is-error"} role={importPhase === "error" ? "alert" : "status"}>
              <span class={importPhase === "complete" ? "oj-ux-ico-check-circle" : "oj-ux-ico-error"} aria-hidden="true"></span>
              <strong>{importPhase === "complete" ? "Import completed" : "Import failed"}</strong>
              <p>{importResult}</p>
            </div>
          )}
        </div>
        <div slot="footer">
          {importPhase === "preview" && <><oj-button chroming="outlined" onojAction={closeImportDialog}>Cancel</oj-button><oj-button chroming="callToAction" onojAction={() => void applyPendingImport()}>Import</oj-button></>}
          {(importPhase === "complete" || importPhase === "error") && <oj-button chroming="callToAction" onojAction={closeImportDialog}>Close</oj-button>}
        </div>
      </oj-dialog>
      {conflictRows.length > 0 && (
        <section class="kpi-panel consumption-conflict-panel" aria-labelledby="consumptionConflictTitle">
          <div class="consumption-section-heading"><div><span class="kpi-section-label">HTTP 409 comparison</span><h2 id="consumptionConflictTitle">Forecast version conflict</h2></div></div>
          <table><thead><tr><th>Plan / Month</th><th>Saved baseline</th><th>My draft</th><th>Current server</th></tr></thead>
            <tbody>{conflictRows.map((row) => <tr key={`${row.plan}-${row.month}`}><th>{row.plan} · {row.month}</th><td>{row.saved === null ? "—" : currency.format(row.saved)}</td><td>{row.draft === null ? "—" : currency.format(row.draft)}</td><td>{row.current === null ? "—" : currency.format(row.current)}</td></tr>)}</tbody>
          </table>
          <oj-button chroming="outlined" onojAction={() => conflictWorkspace && adoptWorkspace(conflictWorkspace)}>Use current server</oj-button>
        </section>
      )}

      <section class="consumption-summary-cards" aria-label="Consumption range summary">
        <article class="kpi-panel"><span>Range Total</span><strong>{currency.format(rangeTotal)}</strong><small>{fromQuarter} → {toQuarter}</small></article>
        <article class="kpi-panel"><span>Latest Quarter</span><strong>{latestSummary?.total === null || !latestSummary ? "N/A" : currency.format(latestSummary.total)}</strong><small>{latestSummary?.quarter ?? "—"} · {latestSummary?.status ?? "—"}</small></article>
        <article class="kpi-panel"><span>PreQ Change</span><strong>{signedCurrency(latestSummary?.preQGap ?? null)}</strong><small>Chronological predecessor</small></article>
        <article class="kpi-panel"><span>Change Alerts</span><strong>{signals.length}</strong><small>Previous 3 completed months · Median + MAD</small></article>
        <article class="kpi-panel"><span>Forecast / Mixed</span><strong>{currency.format(forecastTotal)}</strong><small>Editable after {currentFiscalMonth || "current month"}</small></article>
      </section>

      <section class="consumption-pulse-group" aria-labelledby="consumptionPulseGroupTitle">
        <button type="button" class="consumption-disclosure consumption-pulse-toggle" aria-expanded={pulseExpanded}
          aria-controls="consumptionPulseContent" onClick={() => setPulseExpanded((expanded) => !expanded)}>
          <span class={pulseExpanded ? "oj-ux-ico-chevron-down" : "oj-ux-ico-chevron-right"} aria-hidden="true"></span>
          <span id="consumptionPulseGroupTitle">Consumption Change Alerts & Trend</span>
        </button>
      {pulseExpanded && <div id="consumptionPulseContent" class="consumption-pulse-layout">
        <section class="kpi-panel consumption-signal-panel" aria-labelledby="consumptionSignalTitle">
          <div class="consumption-section-heading">
            <div>
              <span class="kpi-section-label">Usual-level comparison</span>
              <h2 id="consumptionSignalTitle">Consumption Change Alerts</h2>
              <p>Previous 3 completed months · <span class="consumption-metric-help consumption-fast-tooltip" tabIndex={0}
                data-tooltip="Median is the middle of the previous three completed monthly ACTUAL values, so one unusually high or low month has less influence.">Median</span> · MAX($50, 5%, <span
                class="consumption-metric-help consumption-fast-tooltip" tabIndex={0}
                data-tooltip="MAD is the median absolute deviation from the Median. It measures the Plan's usual month-to-month spread and helps avoid noisy alerts.">MAD</span> × 3)</p>
            </div>
            <span class="consumption-count-badge">{signals.length}</span>
          </div>
          <div id="consumptionSignalInbox" class="consumption-signal-inbox">
            {signals.map((signal) => {
              const presentation = consumptionSignalPresentation(signal);
              const linkedPlan = draftPlans.find((plan) => signal.serverPlanId !== undefined
                ? plan.serverPlanId === signal.serverPlanId
                : plan.customer === signal.customer && plan.planId === signal.planId);
              return (
              <button
                type="button"
                class={selectedSignal?.id === signal.id ? "consumption-signal is-selected" : "consumption-signal"}
                aria-pressed={selectedSignal?.id === signal.id}
                aria-label={consumptionSignalAccessibleLabel(signal)}
                onClick={() => selectSignal(signal)}>
                <span class="consumption-signal-main"><strong>{signal.customer}</strong>
                  <span>Workload: {linkedPlan?.workload || "Not mapped"}</span>
                  <small>{signal.endUser} · Plan {signal.planId}</small></span>
                <span class="consumption-signal-metrics"><strong>{shortMonth(signal.month)} Actual</strong><span>{currency.format(signal.latestActual)}</span></span>
                <span class="consumption-signal-status"><span class={`consumption-signal-type ${presentation.tone}`}>{presentation.label}</span>
                  <span class={`consumption-signal-grade is-${signal.grade.toLowerCase()}`}>{signal.grade}</span></span>
              </button>
              );
            })}
            {signals.length === 0 && <p class="consumption-empty-state">No Plans exceeded the three-month median and MAD allowance.</p>}
          </div>
        </section>

        <section class="kpi-panel consumption-trend-panel" aria-labelledby="consumptionTrendTitle">
          <div class="consumption-section-heading">
            <div>
              <span class="kpi-section-label">Linked context</span>
              <h2 id="consumptionTrendTitle">Consumption Trend</h2>
              <p>{selectedPlanLabel}</p>
            </div>
            <div class="consumption-account-selector">
              <label htmlFor="consumptionAccountSelector">Plan</label>
              <input id="consumptionAccountSelector" type="search" role="combobox" aria-label="Search or select trend plan"
                aria-expanded={accountSelectorOpen} aria-controls="consumptionAccountOptions" autocomplete="off"
                aria-activedescendant={accountSelectorOpen ? `consumptionPlanOption-${activePlanIndex}` : undefined}
                placeholder={selectedPlanLabel}
                value={planSearch}
                onFocus={() => { setAccountSelectorOpen(true); setActivePlanIndex(0); }}
                onClick={() => { setAccountSelectorOpen(true); setActivePlanIndex(0); }}
                onBlur={() => setAccountSelectorOpen(false)}
                onKeyDown={handlePlanSelectorKeyDown}
                onInput={(event) => { setPlanSearch((event.currentTarget as HTMLInputElement).value); setActivePlanIndex(0); setAccountSelectorOpen(true); }} />
              {accountSelectorOpen && (
                <div id="consumptionAccountOptions" class="consumption-account-options" role="listbox" aria-label="Trend plan options">
                  <button id="consumptionPlanOption-0" type="button" role="option" aria-selected={selectedSeriesId === "__all__"} onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectTrendPlan(null)}>All accounts · Total</button>
                  {filteredPlans.map((plan, index) => <button id={`consumptionPlanOption-${index + 1}`} key={plan.id} type="button" role="option" aria-selected={selectedSeriesId === plan.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectTrendPlan(plan)}>{getConsumptionPlanLabel(plan)}</button>)}
                </div>
              )}
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
          {selectedSignal && (() => {
            const presentation = consumptionSignalPresentation(selectedSignal);
            const previousDirection = consumptionPreviousDirection(selectedSignal);
            return (
            <div class="consumption-signal-reason" role="note">
              <span class={`consumption-signal-type ${presentation.tone}`}>{presentation.label}</span>
              <div><strong>{selectedSignal.month} · Previous month: {previousDirection.label}</strong><p>{selectedSignal.reason} Allowance: {currency.format(selectedSignal.allowance)}. Plan ID: {selectedSignal.planId}.</p></div>
            </div>
            );
          })()}
        </section>
      </div>}
      </section>

      <section class="kpi-panel consumption-table-panel" aria-labelledby="consumptionTableTitle">
        <div class="consumption-section-heading consumption-table-heading">
          <button type="button" class="consumption-disclosure consumption-table-toggle" aria-expanded={tableExpanded}
            aria-controls="consumptionTableContent" onClick={() => setTableExpanded((expanded) => !expanded)}>
            <span class={tableExpanded ? "oj-ux-ico-chevron-down" : "oj-ux-ico-chevron-right"} aria-hidden="true"></span>
            <span><span class="kpi-section-label">Actual + Forecast</span>
              <strong id="consumptionTableTitle" class="consumption-table-title">End User / Plan Consumption <small class="consumption-table-plan-count">{visiblePlans.length} plans</small></strong></span>
          </button>
          {hasDraftChanges && (
            <div class="consumption-draft-actions" role="toolbar" aria-label="Forecast draft actions">
              <span>Draft changes</span>
              <oj-button chroming="callToAction" disabled={isSaving} onojAction={saveForecasts}>{isSaving ? "Saving…" : "Save"}</oj-button>
              <oj-button chroming="outlined" disabled={isSaving} onojAction={cancelAllForecasts}>Cancel</oj-button>
            </div>
          )}
        </div>
        {tableExpanded && <div id="consumptionTableContent" class="consumption-table-content">
        <div class="consumption-scroll-controls" aria-label="Horizontal table navigation">
          <button type="button" aria-label="Move table left" title="Move left" disabled={tableScrollState.left <= 0} onClick={() => moveTableHorizontally(-1)}>‹</button>
          <button type="button" aria-label="Move table right" title="Move right" disabled={tableScrollState.left >= tableScrollState.max} onClick={() => moveTableHorizontally(1)}>›</button>
        </div>
        <div ref={tableScrollRef} class={visibleTableRowCount > 10 ? "consumption-table-scroll is-scrollable-y" : "consumption-table-scroll"} tabIndex={0} aria-label="Scrollable Consumption table" onScroll={updateTableScrollState} onKeyDown={handleTableKeyDown}>
          <table class="consumption-table">
            <thead>
              <tr>
                <th class="consumption-account-column" rowSpan={2}>Account / End User</th>
                {quarters.map((quarter) => {
                  const forecastQuarter = getQuarterMonths(quarter).some((month) => editablePeriodIds.has(month));
                  return <th key={quarter} colSpan={5} class={`consumption-quarter-heading${forecastQuarter ? " is-forecast" : ""}`}>{quarter}</th>;
                })}
              </tr>
              <tr>
                {displayQuarterOrder.flatMap((quarter) => [
                  ...sortConsumptionMonthsNewestFirst(getQuarterMonths(quarter)).map((month) => {
                    const status = editablePeriodIds.has(month) ? "FORECAST" : "ACTUAL";
                    return <th key={`${quarter}-${month}`} class={`consumption-month-heading is-${status.toLowerCase()}`}>{shortMonth(month)}<small class={`consumption-month-status is-${status.toLowerCase()}`}>{status}</small></th>;
                  }),
                  <th key={`${quarter}-total`} class={getQuarterMonths(quarter).some((month) => editablePeriodIds.has(month)) ? "consumption-quarter-total is-forecast" : "consumption-quarter-total"}>Quarter Total</th>,
                  <th key={`${quarter}-gap`} class={getQuarterMonths(quarter).some((month) => editablePeriodIds.has(month)) ? "consumption-preq-gap is-forecast" : "consumption-preq-gap"}>PreQ Gap</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const expandable = account.plans.length > 1;
                const expanded = expandable && expandedAccounts.has(account.customer);
                const singlePlan = account.plans[0];
                return (
                  <>
                    <tr key={account.id} class={selectedSignal?.customer === account.customer ? "consumption-account-row is-context" : "consumption-account-row"} data-readonly={expandable ? "account" : undefined}>
                      <th class="consumption-account-column" scope="row">
                        {expandable ? (
                          <button type="button" class="consumption-account-toggle" aria-expanded={expanded}
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${account.customer} Plans`}
                            onClick={() => toggleAccount(account.customer)}>
                            <span class="consumption-leading">
                              <span class="consumption-disclosure-slot"><span class={expanded ? "oj-ux-ico-chevron-down" : "oj-ux-ico-chevron-right"} aria-hidden="true"></span></span>
                              <span class="consumption-leading-copy"><ConsumptionTruncatedText text={account.customer} focusable={false} /><small>Multiple · {account.plans.length} Plans</small></span>
                            </span>
                          </button>
                        ) : (
                          <span class="consumption-leading consumption-account-single">
                            <span class="consumption-disclosure-slot" aria-hidden="true"></span>
                            <span class="consumption-leading-copy"><ConsumptionTruncatedText text={`${singlePlan?.customer ?? ""}${singlePlan?.workload ? ` (${singlePlan.workload})` : ""}`} />
                            <small>{singlePlan?.endUser} · Plan {singlePlan?.planId} · DC {singlePlan?.dataCenter}</small></span>
                          </span>
                        )}
                      </th>
                      {expandable ? renderQuarterCells(account, true) : singlePlan ? renderQuarterCells(singlePlan, false) : renderQuarterCells(account, true)}
                    </tr>
                    {expandable && expanded && account.plans.map((plan) => (
                      <tr key={plan.id} class={selectedSignal?.planId === plan.planId ? "consumption-plan-row is-context" : "consumption-plan-row"}>
                        <th class="consumption-account-column" scope="row">
                          <span class="consumption-leading">
                            <span class="consumption-disclosure-slot" aria-hidden="true"></span>
                            <span class="consumption-leading-copy"><ConsumptionTruncatedText className="consumption-end-user" text={`${plan.customer}${plan.workload ? ` (${plan.workload})` : ""}`} />
                            <small>{plan.endUser} · Plan {plan.planId} · DC {plan.dataCenter}</small></span>
                          </span>
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
        </div>}
      </section>
    </section>
  );
}
