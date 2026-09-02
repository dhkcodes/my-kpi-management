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
  getConsumptionPlanLabel,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths,
  initialConsumptionRecordsBatchSize,
  shouldRestartConsumptionRecordsPage,
  getQuarterMonths,
  isConsumptionQuarterRangeValid,
  parseConsumptionCsv,
  resolveConsumptionControlTotal,
  restoreForecastEntry,
  sortConsumptionMonths,
  sortConsumptionMonthsNewestFirst
} from "../../data/consumptionData";
import { consumptionSyntheticCsv } from "../../data/consumptionMockData";
import {
  ConsumptionApiControlTotal,
  ConsumptionApiWorkspace,
  ConsumptionConflictError,
  applyConsumptionImport,
  canUseConsumptionFallback,
  fetchConsumptionRecords,
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

const cloneControlTotals = (controls: readonly ConsumptionApiControlTotal[]): ConsumptionApiControlTotal[] => controls.map((control) => ({ ...control }));
const controlKey = (control: Pick<ConsumptionApiControlTotal, "account" | "periodKey">) => `${control.account}::${control.periodKey}`;
const controlValuesEqual = (left: readonly ConsumptionApiControlTotal[], right: readonly ConsumptionApiControlTotal[]) => {
  if (left.length !== right.length) return false;
  const rightByKey = new Map(right.map((control) => [controlKey(control), control.controlAmount]));
  return left.every((control) => rightByKey.get(controlKey(control)) === control.controlAmount);
};
const toApiControlTotals = (controls: readonly { customer: string; values: Readonly<Record<string, number>> }[]): ConsumptionApiControlTotal[] =>
  controls.flatMap((control) => Object.entries(control.values).map(([periodKey, controlAmount]) => ({
    account: control.customer, periodKey, controlAmount, detailAmount: null, matchStatus: "NO_DETAIL" as const
  })));

const createSeedPlans = (csv: string) => {
  const parsed = parseConsumptionCsv(csv);
  const latestActualMonth = getLatestActualMonth(parsed.plans);
  if (!latestActualMonth) throw new Error("Consumption CSV has no usable month columns.");
  return {
    plans: parsed.plans,
    controlTotals: toApiControlTotals(parsed.controlTotals),
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
const parseForecastDecimal = (raw: string): number | null => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
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

type EditCell = Readonly<{ planKey: string; month: string; control?: boolean }>;
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
  const [savedControlTotals, setSavedControlTotals] = useState<ConsumptionApiControlTotal[]>([]);
  const [draftControlTotals, setDraftControlTotals] = useState<ConsumptionApiControlTotal[]>([]);
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
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searchComposing, setSearchComposing] = useState(false);
  const [recordsTotalAccounts, setRecordsTotalAccounts] = useState(0);
  const [recordsNextOffset, setRecordsNextOffset] = useState(0);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [pulseExpanded, setPulseExpanded] = useState(true);

  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importResult, setImportResult] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importDialogRef = useRef<ojDialog | null>(null);
  const editEntryValueRef = useRef<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const recordsRequestGeneration = useRef(0);
  const recordsLoadingRef = useRef(false);
  const hasPlanDraftChanges = JSON.stringify(savedPlans) !== JSON.stringify(draftPlans);
  const hasControlDraftChanges = !controlValuesEqual(savedControlTotals, draftControlTotals);
  const hasDraftChanges = hasPlanDraftChanges || hasControlDraftChanges;

  const adoptWorkspace = (workspace: ConsumptionApiWorkspace) => {
    setSavedPlans(clonePlans(workspace.plans));
    setDraftPlans(clonePlans(workspace.plans));
    setSavedControlTotals(cloneControlTotals(workspace.controlTotals));
    setDraftControlTotals(cloneControlTotals(workspace.controlTotals));
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

  const loadRecordsPage = async (append: boolean, query = { fromQuarter, toQuarter, search: appliedSearch }) => {
    if (append && (recordsLoadingRef.current || hasDraftChanges)) return;
    recordsLoadingRef.current = true;
    setRecordsLoading(true);
    const generation = ++recordsRequestGeneration.current;
    try {
      const page = await fetchConsumptionRecords({
        fromQuarter: query.fromQuarter, toQuarter: query.toQuarter, search: query.search,
        offset: append ? recordsNextOffset : 0,
        limit: append ? 10 : initialConsumptionRecordsBatchSize(window.innerHeight),
        sort: "ACCOUNT",
        direction: "ASC"
      });
      if (generation !== recordsRequestGeneration.current) return;
      if (shouldRestartConsumptionRecordsPage(append, apiEtag, page.etag)) {
        await loadRecordsPage(false, query);
        return;
      }
      const mergePlans = (current: readonly ConsumptionPlan[]) => {
        const accountPlans = new Map<string, ConsumptionPlan[]>();
        if (append) current.forEach((plan) => accountPlans.set(plan.customer, [...(accountPlans.get(plan.customer) ?? []), plan]));
        page.accountGroups.forEach((group) => {
          const plans = new Map((accountPlans.get(group.account) ?? []).map((plan) => [plan.id, plan]));
          group.plans.forEach((plan) => plans.set(plan.id, plan));
          accountPlans.set(group.account, [...plans.values()]);
        });
        return [...accountPlans.values()].flat();
      };
      setSavedPlans((current) => clonePlans(mergePlans(current)));
      setDraftPlans((current) => clonePlans(mergePlans(current)));
      const mergeControls = (current: readonly ConsumptionApiControlTotal[]) => {
        const keyed = new Map((append ? current : []).map((control) => [`${control.account}::${control.periodKey}`, control]));
        page.controlTotals.forEach((control) => keyed.set(`${control.account}::${control.periodKey}`, control));
        return [...keyed.values()];
      };
      setSavedControlTotals((current) => cloneControlTotals(mergeControls(current)));
      setDraftControlTotals((current) => cloneControlTotals(mergeControls(current)));
      setApiEtag(page.etag);
      setFromQuarter(page.fromQuarter);
      setToQuarter(page.toQuarter);
      setEditablePeriodIds(new Set(page.editablePeriodIds));
      setDisplayQuarterOrder([...page.displayQuarterOrder]);
      setAvailableQuarterOptions((current) => [...new Set([...current, ...page.displayQuarterOrder, page.fromQuarter, page.toQuarter].filter(Boolean))].sort());
      setCurrentFiscalMonth(page.currentFiscalMonth);
      setRecordsTotalAccounts(page.totalAccounts);
      setRecordsNextOffset(page.nextOffset);
      setRecordsHasMore(page.hasMore);
      setRangeInitialized(true);
      setRangeTouched(false);
      setDataMode("backend");
      setConflictRows([]);
      setConflictWorkspace(null);
    } catch (error) {
      if (generation !== recordsRequestGeneration.current) return;
      throw error;
    } finally {
      if (generation === recordsRequestGeneration.current) {
        recordsLoadingRef.current = false;
        setRecordsLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    void loadRecordsPage(false, { fromQuarter: "", toQuarter: "", search: "" }).catch((error) => {
      if (!active) return;
      if (canUseConsumptionFallback(error)) {
        const fallbackPlans = clonePlans(initialSeed.plans);
        setSavedPlans(fallbackPlans);
        setDraftPlans(clonePlans(fallbackPlans));
        setSavedControlTotals(cloneControlTotals(initialSeed.controlTotals));
        setDraftControlTotals(cloneControlTotals(initialSeed.controlTotals));
        setServerSignals(null);
        setFromQuarter(fallbackActualQuarters[fallbackActualQuarters.length - 1] ?? fallbackForecastQuarters[0] ?? "");
        setToQuarter(fallbackForecastQuarters[fallbackForecastQuarters.length - 1] ?? fallbackActualQuarters[0] ?? "");
        setEditablePeriodIds(new Set(fallbackEditablePeriods));
        setDisplayQuarterOrder(fallbackDisplayQuarterOrder);
        setAvailableQuarterOptions([...new Set([...fallbackDisplayQuarterOrder, ...fallbackActualQuarters, ...fallbackForecastQuarters])].sort());
        setCurrentFiscalMonth(initialSeed.latestActualMonth);
        setRecordsTotalAccounts(aggregateConsumptionAccounts(fallbackPlans).length);
        setRecordsNextOffset(aggregateConsumptionAccounts(fallbackPlans).length);
        setRecordsHasMore(false);
        setRangeInitialized(true);
        setRangeTouched(false);
        setDataMode("fallback");
      } else {
        setDataMode("error");
        setImportError(error instanceof Error ? error.message : "Consumption backend could not be loaded.");
      }
    });
    return () => { active = false; recordsRequestGeneration.current++; };
  }, []);

  const visiblePlans = draftPlans;
  const accounts = useMemo(() => aggregateConsumptionAccounts(visiblePlans), [visiblePlans]);
  const renderedRecordAccounts = accounts;
  const loadedAccountCount = renderedRecordAccounts.length;
  const visibleTableRowCount = renderedRecordAccounts.reduce((count, account) => count + 1 + (expandedAccounts.has(account.customer) ? account.plans.length : 0), 0);
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

  const handleTableScroll = (event: Event) => {
    updateTableScrollState();
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget as HTMLDivElement;
    if (scrollHeight - scrollTop - clientHeight <= 96 && recordsHasMore && !recordsLoading && !hasDraftChanges) {
      void loadRecordsPage(true).catch((error) => setImportError(error instanceof Error ? error.message : "More Usage Records could not be loaded."));
    }
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

  useEffect(() => {
    updateTableScrollState();
    window.addEventListener("resize", updateTableScrollState);
    return () => window.removeEventListener("resize", updateTableScrollState);
  }, [accounts.length, displayQuarterOrder]);

  useEffect(() => {
    if (isSaving) {
      const guard: KpiNavigationGuard = () => window.alert("Consumption forecast save is in progress. Please wait for it to finish.");
      onNavigationGuardChange(guard, true);
      return () => onNavigationGuardChange(null, false);
    }
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
  }, [hasDraftChanges, isSaving, onNavigationGuardChange]);

  const selectSignal = (signal: ConsumptionSignal) => {
    const plan = signal.serverPlanId === undefined
      ? draftPlans.find((candidate) => candidate.customer === signal.customer
        && candidate.endUser === signal.endUser && candidate.planId === signal.planId)
      : draftPlans.find((candidate) => candidate.serverPlanId === signal.serverPlanId);
    setSelectedSignalId(signal.id);
    if (plan) setSelectedSeriesId(plan.id);
  };

  const submitRecordsQuery = async () => {
    if (!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || recordsLoading || hasDraftChanges || searchComposing) return;
    const query = { fromQuarter, toQuarter, search: draftSearch.trim() };
    setRangeLoading(true);
    setImportError("");
    try {
      await loadRecordsPage(false, query);
      setAppliedSearch(query.search);
      setSelectedSignalId("");
      setSelectedSeriesId("__all__");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption records could not be loaded.");
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
    recordsRequestGeneration.current++;
    setRecordsLoading(false);
    setDraftPlans((current) => current.map((plan) => plan.id === planKey
      ? { ...plan, forecasts: { ...plan.forecasts, [month]: value } }
      : plan));
  };

  const controlValue = (controls: readonly ConsumptionApiControlTotal[], account: string, month: string) =>
    controls.find((control) => control.account === account && control.periodKey === month)?.controlAmount;

  const updateControlForecast = (account: string, month: string, value: number | null) => {
    recordsRequestGeneration.current++;
    setRecordsLoading(false);
    setDraftControlTotals((current) => {
      const next = current.filter((control) => !(control.account === account && control.periodKey === month));
      if (value !== null) next.push({ account, periodKey: month, controlAmount: value, detailAmount: null, matchStatus: "NO_DETAIL" });
      return next.sort((left, right) => controlKey(left).localeCompare(controlKey(right)));
    });
  };

  const beginForecastEdit = (plan: ConsumptionPlan, month: string) => {
    if (isSaving || recordsLoading || (dataMode !== "backend" && dataMode !== "fallback")) return;
    editEntryValueRef.current = plan.forecasts[month] ?? plan.actuals[month] ?? 0;
    setEditCell({ planKey: plan.id, month });
  };

  const selectForecastEditor = (key: string) => (input: HTMLInputElement | null) => {
    if (!input || input.dataset.forecastSelection === key) return;
    input.dataset.forecastSelection = key;
    window.requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      input.select();
    });
  };

  const beginControlEdit = (account: string, month: string, value: number | null) => {
    if (isSaving || recordsLoading || (dataMode !== "backend" && dataMode !== "fallback")) return;
    editEntryValueRef.current = value;
    setEditCell({ planKey: account, month, control: true });
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
    if (editCell.control) {
      updateControlForecast(editCell.planKey, editCell.month, controlValue(savedControlTotals, editCell.planKey, editCell.month) ?? null);
      editEntryValueRef.current = null;
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
    if (isSaving || recordsLoading) return;
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
    const controlUpdates = aggregateConsumptionAccounts(draftPlans).filter((account) => account.plans.length > 1).flatMap((account) =>
      [...editablePeriodIds].flatMap((month) => {
        const savedValue = controlValue(savedControlTotals, account.customer, month);
        const draftValue = controlValue(draftControlTotals, account.customer, month);
        const resolution = resolveConsumptionControlTotal(account.plans, month, draftValue);
        const desiredValue = resolution.source === "DETAIL" ? null : (draftValue ?? null);
        if ((savedValue ?? null) === desiredValue) return [];
        return [{ account: account.customer, periodKey: month, amount: desiredValue }];
      }));
    try {
      if (dataMode === "fallback") {
        setSavedPlans(clonePlans(draftPlans));
        setSavedControlTotals(cloneControlTotals(draftControlTotals));

      } else if (dataMode !== "backend" || !apiEtag) {
        throw new Error("Authoritative Consumption workspace is not ready; Forecast was not saved.");
      } else {
        const workspace = await saveConsumptionForecasts(apiEtag, updates, controlUpdates);
        adoptWorkspace(workspace);
        try {
          await loadRecordsPage(false, { fromQuarter: workspace.fromQuarter, toQuarter: workspace.toQuarter, search: appliedSearch });
        } catch (refreshError) {
          adoptWorkspace(workspace);
          setRecordsTotalAccounts(aggregateConsumptionAccounts(workspace.plans).length);
          setRecordsNextOffset(aggregateConsumptionAccounts(workspace.plans).length);
          setRecordsHasMore(false);
          setImportError(`Forecasts were saved, but Usage Records could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
        }
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
        draftControlTotals.forEach((draft) => {
          const savedValue = controlValue(savedControlTotals, draft.account, draft.periodKey);
          if ((savedValue ?? null) === draft.controlAmount) return;
          rows.push({ plan: `${draft.account} · Multiple Control`, month: draft.periodKey,
            saved: savedValue ?? null, draft: draft.controlAmount,
            current: controlValue(error.current.controlTotals, draft.account, draft.periodKey) ?? null });
        });
        savedControlTotals.forEach((saved) => {
          if (controlValue(draftControlTotals, saved.account, saved.periodKey) !== undefined) return;
          rows.push({ plan: `${saved.account} · Multiple Control`, month: saved.periodKey,
            saved: saved.controlAmount, draft: null,
            current: controlValue(error.current.controlTotals, saved.account, saved.periodKey) ?? null });
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
    setDraftControlTotals(cloneControlTotals(savedControlTotals));
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
        try {
          await loadRecordsPage(false, { fromQuarter: result.workspace.fromQuarter, toQuarter: result.workspace.toQuarter, search: appliedSearch });
        } catch (refreshError) {
          adoptWorkspace(result.workspace);
          setRecordsTotalAccounts(aggregateConsumptionAccounts(result.workspace.plans).length);
          setRecordsNextOffset(aggregateConsumptionAccounts(result.workspace.plans).length);
          setRecordsHasMore(false);
          setImportError(`Import succeeded, but Usage Records could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
        }
      } else {
        const importedEditablePeriods = getNextQuarterMonths(pendingImport.latestActualMonth);
        const imported = pendingImport.parsed.plans;
        const importedHistoryQuarters = [...new Set(pendingImport.parsed.monthKeys.map(getFiscalQuarter))].reverse();
        const importedForecastQuarters = [...new Set(importedEditablePeriods.map(getFiscalQuarter))];
        setSavedPlans(clonePlans(imported));
        setDraftPlans(clonePlans(imported));
        const importedControls = toApiControlTotals(pendingImport.parsed.controlTotals);
        setSavedControlTotals(cloneControlTotals(importedControls));
        setDraftControlTotals(cloneControlTotals(importedControls));
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

  const renderQuarterCells = (series: ConsumptionPlan | ReturnType<typeof aggregateConsumptionAccounts>[number], readOnly: boolean) => {
    const multiple = "plans" in series && series.plans.length > 1;
    const multipleResolutions = multiple ? Object.fromEntries(allMonths.map((month) => {
      const manual = controlValue(draftControlTotals, series.customer, month);
      return [month, resolveConsumptionControlTotal(series.plans, month, manual)];
    })) : {};
    const displaySeries = multiple ? {
      ...series,
      actuals: Object.fromEntries(allMonths.flatMap((month) => {
        const resolution = multipleResolutions[month];
        return !editablePeriodIds.has(month) && resolution?.amount !== null ? [[month, resolution.amount]] : [];
      })),
      forecasts: Object.fromEntries(allMonths.flatMap((month) => {
        const resolution = multipleResolutions[month];
        return editablePeriodIds.has(month) && resolution?.amount !== null ? [[month, resolution.amount]] : [];
      }))
    } : series;
    return buildDisplayQuarterSummaries({
      ...displaySeries,
      actuals: Object.fromEntries(Object.entries(displaySeries.actuals).filter(([month]) =>
        !editablePeriodIds.has(month) || !Object.prototype.hasOwnProperty.call(displaySeries.forecasts, month)))
    }, displayQuarterOrder).flatMap((summary) => {
      const quarter = summary.quarter;
      const forecastQuarter = summary.months.some((month) => editablePeriodIds.has(month));
      return [
        ...sortConsumptionMonthsNewestFirst(summary.months).map((month) => {
          const actual = Object.prototype.hasOwnProperty.call(displaySeries.actuals, month);
          const forecast = Object.prototype.hasOwnProperty.call(displaySeries.forecasts, month);
          const editable = editablePeriodIds.has(month);
          const value = editable
            ? displaySeries.forecasts[month] ?? displaySeries.actuals[month] ?? null
            : actual ? displaySeries.actuals[month] : forecast ? displaySeries.forecasts[month] : null;
          const key = `${series.id}-${month}`;
          if (multiple) {
            const resolution = multipleResolutions[month];
            const canEditControl = editable && resolution?.editable;
            const editing = canEditControl && editCell?.control && editCell.planKey === series.customer && editCell.month === month;
            const savedValue = controlValue(savedControlTotals, series.customer, month);
            const dirty = savedValue !== controlValue(draftControlTotals, series.customer, month);
            return <td key={key} data-control-cell={`${series.customer}:${month}`}
              data-control-source={resolution?.source}
              class={`consumption-value-cell${editable ? " consumption-forecast-cell" : ""}${dirty ? " is-draft" : ""}`}
              onDblClick={() => canEditControl && beginControlEdit(series.customer, month, value)}>
              {editing ? <input class="consumption-forecast-editor" type="text" inputMode="decimal" value={value === null ? "" : `${value}`}
                data-forecast-editor={key} ref={selectForecastEditor(key)}
                aria-label={`${series.customer} ${month} Multiple Control Total`} disabled={isSaving}
                onInput={(event) => { const raw = event.currentTarget.value; const parsed = raw === "" ? null : parseForecastDecimal(raw); if (raw === "" || parsed !== null) updateControlForecast(series.customer, month, parsed); }}
                onKeyDown={editorKeyDown} autofocus />
                : <span>{value === null ? "—" : currency.format(value)}{dirty && <small>draft</small>}
                  {editable && <small>{canEditControl ? "CONTROL" : "PLAN SUM"}</small>}</span>}
            </td>;
          }
          if (!readOnly && editable && "planId" in series && series.planType !== "Aggregate") {
            const editing = editCell?.planKey === series.id && editCell.month === month;
            const savedPlan = savedPlans.find((plan) => plan.id === series.id);
            const savedValue = savedPlan?.forecasts[month] ?? savedPlan?.actuals[month];
            const dirty = savedValue !== value;
            return (
              <td key={key} data-forecast-cell={`${series.id}:${month}`}
                class={`consumption-value-cell consumption-forecast-cell${dirty ? " is-draft" : ""}`}
                onDblClick={(event) => { if (!(event.target as Element).closest("input")) beginForecastEdit(series, month); }}>
                {editing ? <input class="consumption-forecast-editor" type="text" inputMode="decimal" value={`${value ?? 0}`}
                  data-forecast-editor={key} ref={selectForecastEditor(key)}
                  aria-label={`${series.endUser} ${month} forecast`} disabled={isSaving}
                  onInput={(event) => { const raw = event.currentTarget.value; const parsed = raw === "" ? 0 : parseForecastDecimal(raw); if (parsed !== null) updateForecast(series.id, month, Math.max(0, parsed)); }}
                  onKeyDown={editorKeyDown} autofocus />
                  : <span>{value === null ? "—" : currency.format(value)}{dirty && <small>draft</small>}</span>}
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
  };

  return (
    <section class="consumption-page" aria-labelledby="consumptionTitle" data-fiscal-year={fiscalYear}>
      <header class="consumption-page__header">
        <div>
          <h1 id="consumptionTitle">Usage Records</h1>
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
          <select id="consumptionFromQuarter" value={fromQuarter} disabled={rangeLoading || recordsLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setFromQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <label htmlFor="consumptionToQuarter">To Quarter
          <select id="consumptionToQuarter" value={toQuarter} disabled={rangeLoading || recordsLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setToQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <label class="consumption-record-search" htmlFor="consumptionRecordSearch">Search
          <input id="consumptionRecordSearch" type="search" value={draftSearch} placeholder="Account, workload, end user, or Plan"
            disabled={hasDraftChanges || rangeLoading || recordsLoading}
            onCompositionStart={() => setSearchComposing(true)}
            onCompositionEnd={(event) => { setDraftSearch(event.currentTarget.value); setSearchComposing(false); }}
            onInput={(event) => setDraftSearch(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.isComposing && !searchComposing) { event.preventDefault(); void submitRecordsQuery(); } }} />
        </label>
        <oj-button chroming="callToAction" disabled={!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || recordsLoading || hasDraftChanges || searchComposing || dataMode !== "backend"} onojAction={() => void submitRecordsQuery()}>
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

      <section class="kpi-panel consumption-table-panel" aria-labelledby="consumptionTableTitle">
        <div class="consumption-section-heading consumption-table-heading">
          <div class="consumption-table-toggle">
            <span><span class="kpi-section-label">Actual + Forecast</span>
              <strong id="consumptionTableTitle" class="consumption-table-title">End User / Plan Consumption <small class="consumption-table-plan-count">{visiblePlans.length} plans</small></strong></span>
          </div>
          {hasDraftChanges && (
            <div class="consumption-draft-actions" role="toolbar" aria-label="Forecast draft actions">
              <span>Draft changes</span>
              <oj-button chroming="callToAction" disabled={isSaving} onojAction={saveForecasts}>{isSaving ? "Saving…" : "Save"}</oj-button>
              <oj-button chroming="outlined" disabled={isSaving} onojAction={cancelAllForecasts}>Cancel</oj-button>
            </div>
          )}
        </div>
        <div id="consumptionTableContent" class="consumption-table-content">
        <div class="consumption-scroll-controls" aria-label="Horizontal table navigation">
          <button type="button" aria-label="Move table left" title="Move left" disabled={tableScrollState.left <= 0} onClick={() => moveTableHorizontally(-1)}>‹</button>
          <button type="button" aria-label="Move table right" title="Move right" disabled={tableScrollState.left >= tableScrollState.max} onClick={() => moveTableHorizontally(1)}>›</button>
        </div>
        <div ref={tableScrollRef} class="consumption-table-scroll is-scrollable-y" tabIndex={0} aria-label="Scrollable Usage Records table" onScroll={handleTableScroll} onKeyDown={handleTableKeyDown}>
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
              {renderedRecordAccounts.map((account) => {
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
        <div class={`consumption-load-more${recordsHasMore ? "" : " is-placeholder"}`}>
          <span class="consumption-records-loading" role="status" aria-live="polite" aria-atomic="true">
            {(recordsLoading || rangeLoading) && <><oj-progress-circle value={-1} size="sm"></oj-progress-circle><span>Loading Usage Records…</span></>}
          </span>
          {recordsHasMore && <button type="button" disabled={recordsLoading || hasDraftChanges} onClick={() => void loadRecordsPage(true)}>{recordsLoading ? "Loading…" : "Load More"}</button>}
          <small>Showing {loadedAccountCount} of {recordsTotalAccounts} accounts</small>
        </div>
        </div>
      </section>
    </section>
  );
}
