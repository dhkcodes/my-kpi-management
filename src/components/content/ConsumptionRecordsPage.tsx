import { ComponentChildren, h } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import {
  ConsumptionPlan,
  ConsumptionPillar,
  ConsumptionSignal,
  aggregateConsumptionAccounts,
  aggregateConsumptionActualTotals,
  buildDisplayQuarterSummaries,
  countUniqueConsumptionPlans,
  consumptionPillarOptions,
  expandConsumptionQuarterOptions,
  filterVisibleConsumptionPlans,
  formatConsumptionDataCenter,
  getConsumptionPlanLabel,
  getFiscalQuarter,
  getLatestActualMonth,
  getNextQuarterMonths,
  initialConsumptionRecordsBatchSize,
  isConsumptionPeriodInQuarterRange,
  shouldRestartConsumptionRecordsPage,
  getQuarterMonths,
  isConsumptionQuarterRangeValid,
  parseConsumptionCsv,
  resolveConsumptionControlTotal,
  sortConsumptionMonths,
  sortConsumptionMonthsNewestFirst
} from "../../data/consumptionData";
import { consumptionSyntheticCsv } from "../../data/consumptionMockData";
import { ForecastCompositionDraft, parseForecastCompositionK } from "../../data/forecastComposition";
import {
  ConsumptionAccountForecast,
  ConsumptionApiControlTotal,
  ConsumptionApiWorkspace,
  ConsumptionRecordsPage,
  ConsumptionApiError,
  ConsumptionConflictError,
  ConsumptionImportPreview,
  ConsumptionForecastVariance,
  ConsumptionForecastWidePreview,
  ConsumptionSalesRepChange,
  applyConsumptionImport,
  applyConsumptionForecastWide,
  canUseConsumptionFallback,
  exportConsumptionForecastCsv,
  exportConsumptionImportCompatibleCsv,
  fetchConsumptionRecords,
  fetchConsumptionWorkspace,
  previewConsumptionImport,
  previewConsumptionForecastWide,
  saveConsumptionForecasts
} from "../../data/consumptionApi";
import { KpiNavigationGuard } from "./KpiSpreadsheetPage";
import { ConsumptionMessageBanner } from "./ConsumptionMessageBanner";
import type { ConsumptionMessage } from "./ConsumptionMessageBanner";
import "ojs/ojbutton";
import "ojs/ojchart";
import "ojs/ojdialog";
import "ojs/ojprogress-circle";
import { ojDialog } from "ojs/ojdialog";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

const koreaBusinessDate = (): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

export const consumptionRecordsOperationError = (error: unknown, fallback: string): string => {
  if (!(error instanceof ConsumptionApiError)) return error instanceof Error ? error.message : fallback;
  if (error.status === 401) return "로그인 세션이 만료되었습니다. 다시 로그인한 후 저장해 주세요.";
  if (error.status === 403) return "Consumption Records 쓰기 권한이 없습니다. 관리자에게 Records WRITE 권한을 요청해 주세요.";
  if (error.status === 400 || error.status === 422) return `저장할 데이터가 유효하지 않습니다. 입력값을 확인해 주세요. (${error.message})`;
  if (error.status >= 500) return "서버 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return error.message || fallback;
};

const clonePlans = (plans: readonly ConsumptionPlan[]): ConsumptionPlan[] =>
  plans.map((plan) => ({
    ...plan,
    actuals: { ...plan.actuals },
    forecasts: { ...plan.forecasts },
    versions: plan.versions ? { ...plan.versions } : undefined
  }));

const cloneControlTotals = (controls: readonly ConsumptionApiControlTotal[]): ConsumptionApiControlTotal[] => controls.map((control) => ({ ...control }));
const accountForecastControls = (workspace: Pick<ConsumptionApiWorkspace, "selectedPillar" | "accountForecasts" | "forecastVariances">): ConsumptionApiControlTotal[] =>
  workspace.selectedPillar === "ALL"
    ? workspace.forecastVariances.filter((item) => item.pillar === "ALL" && item.forecastAmount !== null).map((item) => ({ account: item.account, periodKey: item.periodKey,
      controlAmount: item.forecastAmount as number, detailAmount: item.actualAmount, matchStatus: "MANUAL_FORECAST" as const }))
    : workspace.accountForecasts.filter((item) => item.pillar === workspace.selectedPillar).map((item) => ({ account: item.account, periodKey: item.periodKey,
      controlAmount: item.amount, detailAmount: workspace.forecastVariances.find((variance) => variance.account === item.account && variance.periodKey === item.periodKey && variance.pillar === item.pillar)?.actualAmount ?? null,
      matchStatus: "MANUAL_FORECAST" as const }));
const controlKey = (control: Pick<ConsumptionApiControlTotal, "account" | "periodKey">) => `${control.account}::${control.periodKey}`;
const controlValuesEqual = (left: readonly ConsumptionApiControlTotal[], right: readonly ConsumptionApiControlTotal[]) => {
  if (left.length !== right.length) return false;
  const rightByKey = new Map(right.map((control) => [controlKey(control), control.controlAmount]));
  return left.every((control) => rightByKey.get(controlKey(control)) === control.controlAmount);
};
const isExactReplayPreview = (preview: ConsumptionImportPreview) =>
  preview.files.length > 0 && preview.exactReplayFileCount === preview.files.length;
const forecastCompositionUnavailable = (composition: ConsumptionAccountForecast) =>
  composition.compositionStatus === "UNAVAILABLE"
    ? "Forecast composition unavailable for this period."
    : null;
const ForecastCompositionTooltip = ({ composition, children }: Readonly<{
  composition: ConsumptionAccountForecast;
  children: ComponentChildren;
}>) => {
  if (composition.compositionStatus === "UNCLASSIFIED") return <>{children}</>;
  const unavailable = forecastCompositionUnavailable(composition);
  const accessibleText = unavailable ?? [
    `Total ${currency.format(composition.totalAmount)}`,
    `New ${composition.newAmount === null ? "N/A" : currency.format(composition.newAmount)}`,
    `Expansion ${composition.expansionAmount === null ? "N/A" : currency.format(composition.expansionAmount)}`,
    `Reduction ${composition.reductionStatus === "UNAVAILABLE_PREVIOUS_PERIOD" ? "비교 기준 없음" : composition.reductionAmount === null ? "N/A" : currency.format(composition.reductionAmount)} (previous Total minus current Total, floored at zero)`,
    `Previous source ${composition.previousSource}${composition.previousAmount === null ? "" : ` ${currency.format(composition.previousAmount)}`}`
  ].join("; ");
  return <span class="consumption-forecast-tooltip" tabIndex={0} aria-label={accessibleText}>
    {children}
    <span class="consumption-forecast-tooltip__content" role="tooltip">
      {unavailable ? <>{unavailable}</> : <dl>
        <div><dt>Total</dt><dd>{currency.format(composition.totalAmount)}</dd></div>
        <div><dt>New</dt><dd>{composition.newAmount === null ? "N/A" : currency.format(composition.newAmount)}</dd></div>
        <div><dt>Expansion</dt><dd>{composition.expansionAmount === null ? "N/A" : currency.format(composition.expansionAmount)}</dd></div>
        <div><dt>Reduction</dt><dd>{composition.reductionStatus === "UNAVAILABLE_PREVIOUS_PERIOD" ? "비교 기준 없음" : composition.reductionAmount === null ? "N/A" : currency.format(composition.reductionAmount)}<small>Previous Total − current Total, minimum 0</small></dd></div>
        <div><dt>Previous source</dt><dd>{composition.previousSource}{composition.previousAmount === null ? "" : ` · ${currency.format(composition.previousAmount)}`}</dd></div>
      </dl>}
    </span>
  </span>;
};
const toApiControlTotals = (controls: readonly { customer: string; values: Readonly<Record<string, number>> }[]): ConsumptionApiControlTotal[] =>
  controls.flatMap((control) => Object.entries(control.values).map(([periodKey, controlAmount]) => ({
    account: control.customer, periodKey, controlAmount, detailAmount: null, matchStatus: "NO_DETAIL" as const
  })));
const planMatchesRecordSearch = (plan: ConsumptionPlan, query: string) =>
  [plan.customer, plan.workload, plan.endUser, plan.planId]
    .some((value) => value?.toLowerCase().includes(query));
const recordGroupMatchesSearch = (group: Readonly<{ account: string; plans: readonly ConsumptionPlan[] }>, search: string) => {
  const query = search.trim().toLowerCase();
  return !query || group.account.toLowerCase().includes(query) || group.plans.some((plan) => planMatchesRecordSearch(plan, query));
};
const searchExpandedRecordAccounts = (
  groups: readonly Readonly<{ account: string; plans: readonly ConsumptionPlan[] }>[],
  search: string
) => {
  const query = search.trim().toLowerCase();
  if (!query) return new Set<string>();
  return new Set(groups.filter((group) => countUniqueConsumptionPlans(group.plans) > 1
    && !group.account.toLowerCase().includes(query)
    && group.plans.some((plan) => planMatchesRecordSearch(plan, query)))
    .map((group) => group.account));
};

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
const formatForecastK = (amount: number | null) => amount === null ? "" : (amount / 1000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
const renderSalesRepPreview = (changes: readonly ConsumptionSalesRepChange[]) => (
  <section class="consumption-sales-rep-preview" aria-label="Sales Rep preview">
    <div class="consumption-sales-rep-heading">
      <strong>Sales Rep assignments</strong>
      <span>{changes.filter((change) => change.changed).length} changed · {changes.filter((change) => !change.changed).length} unchanged</span>
    </div>
    <p>Blank or missing Sales Rep values are ignored and leave the current assignment unchanged.</p>
    {changes.length === 0 ? <p class="consumption-sales-rep-empty">No Sales Rep values to apply.</p> : (
      <div class="consumption-sales-rep-table-wrap">
        <table class="consumption-sales-rep-table">
          <thead><tr><th>Account</th><th>Sales Rep (before → after)</th><th>Status</th></tr></thead>
          <tbody>{changes.map((change) => <tr key={change.normalizedAccount} class={change.changed ? "is-changed" : "is-unchanged"}>
            <th scope="row">{change.account}</th>
            <td><span>{change.beforeSalesRep ?? "Unassigned"}</span><span class="consumption-sales-rep-arrow" aria-hidden="true">→</span><strong>{change.afterSalesRep}</strong></td>
            <td><span class="consumption-sales-rep-status">{change.changed ? "Changed" : "Unchanged"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </section>
);
const formatConflictCurrency = (value: string) => {
  const [, sign, integer, fraction = "", exponent = ""] = /^(-?)(\d+)(\.\d+)?([eE][+-]?\d+)?$/.exec(value)!;
  return `${sign === "-" ? "-$" : "$"}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}${exponent}`;
};
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
type ImportPhase = "idle" | "previewing" | "preview" | "applying" | "complete" | "warning" | "error";
type RecordsLoadingPhase = "idle" | "initial" | "query" | "append";
type RecordsQuery = Readonly<{ fromQuarter: string; toQuarter: string; search: string; pillar: ConsumptionPillar }>;
type PendingImport = Readonly<{
  files: readonly File[];
  preview: ConsumptionImportPreview;
}>;
type PendingForecastImport = Readonly<{
  file: File;
  preview: ConsumptionForecastWidePreview;
}>;
type ConsumptionChartPoint = Readonly<{
  id: string;
  seriesId: string;
  groupId: string;
  value: number;
  shortDesc: string;
}>;

type ForecastCompositionEditor = Readonly<{
  account: string;
  month: string;
  pillar: Exclude<ConsumptionPillar, "ALL">;
  anchor: HTMLElement;
  total: string;
  newValue: string;
  expansion: string;
  error: string;
}>;
const forecastDraftKey = (account: string, month: string) => `${account}::${month}`;
const toKInput = (amount: number | null | undefined) => amount === null || amount === undefined ? "" : `${amount / 1000}`;
const validForecastKInput = (value: string) => /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim());

const renderConsumptionChartItem = (context: Readonly<{ data: ConsumptionChartPoint }>) => (
  <oj-chart-item
    value={context.data.value}
    seriesId={context.data.seriesId}
    groupId={[context.data.groupId]}
    shortDesc={context.data.shortDesc}>
  </oj-chart-item>
);

const ConsumptionDataCenter = ({ plan, selectedPillar }: Readonly<{ plan: ConsumptionPlan; selectedPillar: ConsumptionPillar }>) => {
  const display = formatConsumptionDataCenter(plan, selectedPillar);
  return <span class="consumption-data-center" aria-label={`Data center count ${display.primary}`}>
    <span>DC {display.primary}</span>
  </span>;
};

type Props = Readonly<{
  fiscalYear: FiscalYear;
  canWrite: boolean;
  onNavigationGuardChange: (guard: KpiNavigationGuard | null, hasUnsavedChanges: boolean) => void;
  breadcrumb?: ComponentChildren;
}>;

export function ConsumptionRecordsPage({ fiscalYear, canWrite, onNavigationGuardChange, breadcrumb }: Props) {
  const [selectedPillar, setSelectedPillar] = useState<ConsumptionPillar>("ALL");
  const [savedPlans, setSavedPlans] = useState<ConsumptionPlan[]>([]);
  const [draftPlans, setDraftPlans] = useState<ConsumptionPlan[]>([]);
  const [savedControlTotals, setSavedControlTotals] = useState<ConsumptionApiControlTotal[]>([]);
  const [draftControlTotals, setDraftControlTotals] = useState<ConsumptionApiControlTotal[]>([]);
  const [forecastVariances, setForecastVariances] = useState<ConsumptionForecastVariance[]>([]);
  const [accountForecasts, setAccountForecasts] = useState<ConsumptionAccountForecast[]>([]);
  const [draftForecastCompositions, setDraftForecastCompositions] = useState<Map<string, ForecastCompositionDraft>>(() => new Map());
  const [forecastEditor, setForecastEditor] = useState<ForecastCompositionEditor | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState("__all__");
  const [planSearch, setPlanSearch] = useState("");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => new Set());
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [importError, setImportError] = useState("");
  const [dismissedMessageIds, setDismissedMessageIds] = useState<Set<string>>(() => new Set());
  const [apiEtag, setApiEtag] = useState("");
  const [dataMode, setDataMode] = useState<"loading" | "backend" | "fallback" | "error">("loading");
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [serverSignals, setServerSignals] = useState<ConsumptionSignal[] | null>(null);
  const [conflictRows, setConflictRows] = useState<ConflictRow[]>([]);
  const [conflictWorkspace, setConflictWorkspace] = useState<ConsumptionApiWorkspace | null>(null);
  const [fromQuarter, setFromQuarter] = useState("");
  const [toQuarter, setToQuarter] = useState("");
  const [displayQuarterOrder, setDisplayQuarterOrder] = useState<string[]>([]);
  const [availableQuarterOptions, setAvailableQuarterOptions] = useState<string[]>([]);
  const [editablePeriodIds, setEditablePeriodIds] = useState<Set<string>>(() => new Set());
  const [currentFiscalMonth, setCurrentFiscalMonth] = useState("");
  const forecastFileName = currentFiscalMonth
    ? `OCI Consumption Forecast - ${getFiscalQuarter(currentFiscalMonth)}.csv`
    : "OCI Consumption Forecast - FYxx-Qx.csv";
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
  const [serverActualTotals, setServerActualTotals] = useState<Record<string, number> | null>(null);
  const [serverAccountActualTotals, setServerAccountActualTotals] = useState<Record<string, Record<string, number>>>({});
  const [serverMtdTotals, setServerMtdTotals] = useState<Record<string, number>>({});
  const [serverMtdStatuses, setServerMtdStatuses] = useState<Record<string, "PROVISIONAL" | "FINAL_UPLOAD_REQUIRED">>({});
  const [serverAccountMtdTotals, setServerAccountMtdTotals] = useState<Record<string, Record<string, number>>>({});
  const [showMtd, setShowMtd] = useState(false);
  const [recordsNextOffset, setRecordsNextOffset] = useState(0);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [recordsLoadingPhase, setRecordsLoadingPhase] = useState<RecordsLoadingPhase>("idle");
  const businessDateRef = useRef(koreaBusinessDate());
  const recordsLoading = recordsLoadingPhase !== "idle";
  const blockingRecordsLoading = recordsLoadingPhase === "initial";
  const [recordAccountNames, setRecordAccountNames] = useState<string[]>([]);
  const [pulseExpanded, setPulseExpanded] = useState(true);

  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importResult, setImportResult] = useState("");
  const [forecastImportPhase, setForecastImportPhase] = useState<ImportPhase>("idle");
  const [pendingForecastImport, setPendingForecastImport] = useState<PendingForecastImport | null>(null);
  const [forecastImportResult, setForecastImportResult] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const forecastFileInputRef = useRef<HTMLInputElement | null>(null);
  const importDialogRef = useRef<ojDialog | null>(null);
  const forecastImportDialogRef = useRef<ojDialog | null>(null);
  const forecastEditorPopoverRef = useRef<HTMLDivElement | null>(null);
  const editEntryValueRef = useRef<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const recordsSentinelRef = useRef<HTMLDivElement | null>(null);
  const exportingRef = useRef(false);
  const forecastApplyingRef = useRef(false);
  const recordsRequestGeneration = useRef(0);
  const recordsLoadingRef = useRef(false);
  const recordsQueryRef = useRef<RecordsQuery>({ fromQuarter: "", toQuarter: "", search: "", pillar: "ALL" });
  const loadMoreRecordsRef = useRef<() => Promise<ConsumptionRecordsPage | undefined>>(async () => undefined);
  const hasControlDraftChanges = !controlValuesEqual(savedControlTotals, draftControlTotals) || draftForecastCompositions.size > 0;
  const hasDraftChanges = hasControlDraftChanges;

  useEffect(() => {
    if (hasDraftChanges || !dismissedMessageIds.has("records-draft")) return;
    setDismissedMessageIds((current) => {
      if (!current.has("records-draft")) return current;
      const next = new Set(current);
      next.delete("records-draft");
      return next;
    });
  }, [hasDraftChanges, dismissedMessageIds]);

  const adoptWorkspace = (workspace: ConsumptionApiWorkspace) => {
    const visiblePlans = filterVisibleConsumptionPlans(workspace.plans, workspace.fromQuarter, workspace.toQuarter);
    const forecastControls = accountForecastControls(workspace);
    const accountNames = [...new Set([
      ...visiblePlans.map((plan) => plan.customer),
      ...workspace.accountForecasts.filter((forecast) => isConsumptionPeriodInQuarterRange(forecast.periodKey, workspace.fromQuarter, workspace.toQuarter)).map((forecast) => forecast.account),
      ...forecastControls.filter((control) => isConsumptionPeriodInQuarterRange(control.periodKey, workspace.fromQuarter, workspace.toQuarter))
        .map((control) => control.account)
    ])];
    const visibleGroups = accountNames.map((account) => ({
      account,
      plans: visiblePlans.filter((plan) => plan.customer === account)
    })).filter((group) => recordGroupMatchesSearch(group, appliedSearch));
    const adoptedPlans = visibleGroups.flatMap((group) => group.plans);
    const adoptedAccountNames = visibleGroups.map((group) => group.account);
    setSelectedPillar(workspace.selectedPillar);
    setSavedPlans(clonePlans(adoptedPlans));
    setDraftPlans(clonePlans(adoptedPlans));
    setRecordAccountNames(adoptedAccountNames);
    setSavedControlTotals(cloneControlTotals(forecastControls));
    setDraftControlTotals(cloneControlTotals(forecastControls));
    setForecastVariances([...workspace.forecastVariances]);
    setAccountForecasts([...workspace.accountForecasts]);
    setDraftForecastCompositions(new Map());
    setServerSignals(workspace.signals);
    setApiEtag(workspace.etag);
    setFromQuarter(workspace.fromQuarter);
    setToQuarter(workspace.toQuarter);
    setEditablePeriodIds(new Set(workspace.editablePeriodIds));
    setDisplayQuarterOrder([...workspace.displayQuarterOrder]);
    setAvailableQuarterOptions((current) => expandConsumptionQuarterOptions([...current, ...workspace.displayQuarterOrder, workspace.fromQuarter, workspace.toQuarter].filter(Boolean)));
    setCurrentFiscalMonth(workspace.currentFiscalMonth);
    setRangeInitialized(true);
    setRangeTouched(false);
    setDataMode("backend");
    setRecordsTotalAccounts(adoptedAccountNames.length);
    setRecordsNextOffset(adoptedAccountNames.length);
    setRecordsHasMore(false);
    setExpandedAccounts(searchExpandedRecordAccounts(visibleGroups, appliedSearch));
    setConflictRows([]);
    setConflictWorkspace(null);
  };

  const loadRecordsPage = async (
    append: boolean,
    query = { fromQuarter, toQuarter, search: appliedSearch },
    pillar: ConsumptionPillar = selectedPillar,
    loadingPhase: RecordsLoadingPhase = append ? "append" : "query"
  ): Promise<ConsumptionRecordsPage | undefined> => {
    if (append && (recordsLoadingRef.current || hasDraftChanges)) return;
    const requestQuery: RecordsQuery = append ? recordsQueryRef.current : { ...query, pillar };
    recordsLoadingRef.current = true;
    setRecordsLoadingPhase(loadingPhase);
    const generation = ++recordsRequestGeneration.current;
    try {
      const page = await fetchConsumptionRecords({
        fromQuarter: requestQuery.fromQuarter, toQuarter: requestQuery.toQuarter, search: requestQuery.search,
        offset: append ? recordsNextOffset : 0,
        limit: append ? 10 : initialConsumptionRecordsBatchSize(window.innerHeight),
        sort: "ACCOUNT",
        direction: "ASC",
        pillar: requestQuery.pillar
      });
      if (generation !== recordsRequestGeneration.current) return;
      if (shouldRestartConsumptionRecordsPage(append, apiEtag, page.etag)) {
        return loadRecordsPage(false, requestQuery, requestQuery.pillar, loadingPhase);
      }
      const pageForecastControls = accountForecastControls(page);
      const visibleGroups = page.accountGroups.map((group) => ({
        ...group,
        plans: filterVisibleConsumptionPlans(group.plans, page.fromQuarter, page.toQuarter)
      })).filter((group) => group.plans.length > 0
        || page.accountForecasts.some((forecast) => forecast.account === group.account
          && isConsumptionPeriodInQuarterRange(forecast.periodKey, page.fromQuarter, page.toQuarter))
        || pageForecastControls.some((control) => control.account === group.account
          && isConsumptionPeriodInQuarterRange(control.periodKey, page.fromQuarter, page.toQuarter)));
      const mergePlans = (current: readonly ConsumptionPlan[]) => {
        const accountPlans = new Map<string, ConsumptionPlan[]>();
        if (append) current.forEach((plan) => accountPlans.set(plan.customer, [...(accountPlans.get(plan.customer) ?? []), plan]));
        visibleGroups.forEach((group) => {
          const plans = new Map((accountPlans.get(group.account) ?? []).map((plan) => [plan.id, plan]));
          group.plans.forEach((plan) => plans.set(plan.id, plan));
          accountPlans.set(group.account, [...plans.values()]);
        });
        return [...accountPlans.values()].flat();
      };
      setSelectedPillar(page.selectedPillar);
      setSavedPlans((current) => clonePlans(mergePlans(current)));
      setDraftPlans((current) => clonePlans(mergePlans(current)));
      setRecordAccountNames((current) => append
        ? [...new Set([...current, ...visibleGroups.map((group) => group.account)])]
        : visibleGroups.map((group) => group.account));
      const mergeControls = (current: readonly ConsumptionApiControlTotal[]) => {
        const keyed = new Map((append ? current : []).map((control) => [`${control.account}::${control.periodKey}`, control]));
        pageForecastControls.forEach((control) => keyed.set(`${control.account}::${control.periodKey}`, control));
        return [...keyed.values()];
      };
      setSavedControlTotals((current) => cloneControlTotals(mergeControls(current)));
      setDraftControlTotals((current) => cloneControlTotals(mergeControls(current)));
      setForecastVariances((current) => append ? [...current, ...page.forecastVariances] : [...page.forecastVariances]);
      setAccountForecasts((current) => {
        const keyed = new Map((append ? current : []).map((forecast) => [`${forecast.account}::${forecast.periodKey}::${forecast.pillar}`, forecast]));
        page.accountForecasts.forEach((forecast) => keyed.set(`${forecast.account}::${forecast.periodKey}::${forecast.pillar}`, forecast));
        return [...keyed.values()];
      });
      setApiEtag(page.etag);
      if (!append) {
        recordsQueryRef.current = requestQuery;
        setFromQuarter(page.fromQuarter);
        setToQuarter(page.toQuarter);
        setRangeInitialized(true);
        setRangeTouched(false);
      }
      setEditablePeriodIds(new Set(page.editablePeriodIds));
      setDisplayQuarterOrder([...page.displayQuarterOrder]);
      setAvailableQuarterOptions((current) => expandConsumptionQuarterOptions([...current, ...page.displayQuarterOrder, page.fromQuarter, page.toQuarter].filter(Boolean)));
      setCurrentFiscalMonth(page.currentFiscalMonth);
      setRecordsTotalAccounts(page.totalAccounts);
      setServerActualTotals({ ...page.totals.actualByPeriod });
      setServerMtdTotals({ ...(page.totals.mtdByPeriod ?? {}) });
      setServerMtdStatuses({ ...(page.totals.mtdStatusByPeriod ?? {}) });
      setServerAccountActualTotals((current) => {
        const next = append ? { ...current } : {};
        page.accountGroups.forEach((group) => { next[group.account] = { ...group.totals.actualByPeriod }; });
        return next;
      });
      setServerAccountMtdTotals((current) => {
        const next = append ? { ...current } : {};
        page.accountGroups.forEach((group) => { next[group.account] = { ...(group.totals.mtdByPeriod ?? {}) }; });
        return next;
      });
      setRecordsNextOffset(page.nextOffset);
      setRecordsHasMore(page.hasMore);
      setDataMode("backend");
      setConflictRows([]);
      setConflictWorkspace(null);
      const searchExpanded = searchExpandedRecordAccounts(visibleGroups, requestQuery.search);
      setExpandedAccounts((current) => {
        if (!append) return searchExpanded;
        const next = new Set(current);
        searchExpanded.forEach((account) => next.add(account));
        return next;
      });
      return page;
    } catch (error) {
      if (generation !== recordsRequestGeneration.current) return;
      throw error;
    } finally {
      if (generation === recordsRequestGeneration.current) {
        recordsLoadingRef.current = false;
        setRecordsLoadingPhase("idle");
      }
    }
  };
  loadMoreRecordsRef.current = () => loadRecordsPage(true);

  useEffect(() => {
    let active = true;
    void loadRecordsPage(false, { fromQuarter: "", toQuarter: "", search: "" }, "ALL", "initial")
      .then(() => undefined)
      .catch((error) => {
      if (!active) return;
      if (canUseConsumptionFallback(error)) {
        const fallbackFrom = fallbackActualQuarters[fallbackActualQuarters.length - 1] ?? fallbackForecastQuarters[0] ?? "";
        const fallbackTo = fallbackForecastQuarters[fallbackForecastQuarters.length - 1] ?? fallbackActualQuarters[0] ?? "";
        const fallbackPlans = clonePlans(filterVisibleConsumptionPlans(initialSeed.plans, fallbackFrom, fallbackTo));
        setSavedPlans(fallbackPlans);
        setDraftPlans(clonePlans(fallbackPlans));
        setSavedControlTotals(cloneControlTotals(initialSeed.controlTotals));
        setDraftControlTotals(cloneControlTotals(initialSeed.controlTotals));
        setServerSignals(null);
        setFromQuarter(fallbackFrom);
        setToQuarter(fallbackTo);
        setEditablePeriodIds(new Set(fallbackEditablePeriods));
        setDisplayQuarterOrder(fallbackDisplayQuarterOrder);
        setAvailableQuarterOptions(expandConsumptionQuarterOptions([...fallbackDisplayQuarterOrder, ...fallbackActualQuarters, ...fallbackForecastQuarters]));
        setCurrentFiscalMonth(initialSeed.latestActualMonth);
        setRecordsTotalAccounts(aggregateConsumptionAccounts(fallbackPlans).length);
        setServerActualTotals(null);
        setServerAccountActualTotals({});
        setServerMtdTotals({});
        setServerMtdStatuses({});
        setServerAccountMtdTotals({});
        setRecordAccountNames(aggregateConsumptionAccounts(fallbackPlans).map((account) => account.customer));
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

  useEffect(() => {
    const refreshAtBusinessDateChange = () => {
      const nextDate = koreaBusinessDate();
      if (nextDate === businessDateRef.current || hasDraftChanges || dataMode !== "backend" || recordsLoadingRef.current) return;
      businessDateRef.current = nextDate;
      void loadRecordsPage(false, { fromQuarter, toQuarter, search: appliedSearch }, selectedPillar, "query")
        .catch((error) => setImportError(error instanceof Error ? error.message : "Consumption periods could not be refreshed."));
    };
    const timer = window.setInterval(refreshAtBusinessDateChange, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") refreshAtBusinessDateChange(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hasDraftChanges, dataMode, fromQuarter, toQuarter, appliedSearch, selectedPillar]);

  const visiblePlans = draftPlans;
  const accounts = useMemo(() => {
    const grouped = new Map(aggregateConsumptionAccounts(visiblePlans).map((account) => [account.customer, {
      ...account, actuals: serverAccountActualTotals[account.customer] ?? account.actuals
    }]));
    return recordAccountNames.map((customer) => grouped.get(customer) ?? ({
      id: `account::${customer}`, customer, endUser: "", planId: "", dataCenter: "", planType: "Aggregate" as const,
      actuals: {}, forecasts: Object.fromEntries(draftControlTotals.filter((control) =>
        control.account === customer && control.matchStatus === "MANUAL_FORECAST")
        .map((control) => [control.periodKey, control.controlAmount])), plans: []
    }));
  }, [visiblePlans, recordAccountNames, draftControlTotals, serverAccountActualTotals]);
  const renderedRecordAccounts = accounts;
  const sortedMtdPeriods = Object.keys(serverMtdTotals).sort();
  const currentMtdPeriod = Object.keys(serverMtdStatuses).find((period) => serverMtdStatuses[period] === "PROVISIONAL")
    ?? sortedMtdPeriods[sortedMtdPeriods.length - 1] ?? "";
  const staleMtdPeriods = Object.keys(serverMtdStatuses).filter((period) => serverMtdStatuses[period] === "FINAL_UPLOAD_REQUIRED");
  const loadedAccountCount = renderedRecordAccounts.length;
  const visibleTableRowCount = renderedRecordAccounts.reduce((count, account) => count + 1 + (expandedAccounts.has(account.customer) ? account.plans.length : 0), 0);
  const signals = useMemo(() => serverSignals ?? [], [serverSignals]);
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? null;
  const allAccountsTotal = useMemo(() => {
    if (serverActualTotals === null) return null;
    const total = aggregateConsumptionActualTotals(draftPlans);
    const hasCurrentMtd = currentMtdPeriod !== "" && Object.prototype.hasOwnProperty.call(serverMtdTotals, currentMtdPeriod);
    return {
      ...total,
      actuals: showMtd && currentMtdPeriod
        ? { ...serverActualTotals, ...(hasCurrentMtd ? { [currentMtdPeriod]: serverMtdTotals[currentMtdPeriod] } : {}) }
        : serverActualTotals,
      forecasts: showMtd && currentMtdPeriod
        ? Object.fromEntries(Object.entries(total.forecasts).filter(([period]) => period !== currentMtdPeriod))
        : total.forecasts
    };
  }, [currentMtdPeriod, draftPlans, serverActualTotals, serverMtdTotals, showMtd]);
  const selectedPlan = selectedSeriesId === "__all__"
    ? allAccountsTotal
    : draftPlans.find((plan) => plan.id === selectedSeriesId) ?? allAccountsTotal;
  const selectedPlanLabel = selectedSeriesId === "__all__" || !("planId" in (selectedPlan ?? {}))
    ? serverActualTotals === null ? "All accounts · Server total unavailable" : "All accounts · Server total"
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
      void loadRecordsPage(true).catch((error) => setImportError(error instanceof Error ? error.message : "More Consumption Records could not be loaded."));
    }
  };

  useEffect(() => {
    const root = tableScrollRef.current;
    const sentinel = recordsSentinelRef.current;
    if (!root || !sentinel || !recordsHasMore || hasDraftChanges) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !recordsLoadingRef.current) {
        void loadMoreRecordsRef.current().catch((error) =>
          setImportError(error instanceof Error ? error.message : "More Consumption Records could not be loaded."));
      }
    }, { root: tableScrollRef.current, rootMargin: "0px 0px 96px 0px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [recordsHasMore, hasDraftChanges]);

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

  const selectPillar = async (pillar: ConsumptionPillar) => {
    if (pillar === selectedPillar || hasDraftChanges || forecastEditor || isSaving || blockingRecordsLoading || rangeLoading || importPhase !== "idle") return;
    setImportError("");
    try {
      await loadRecordsPage(false, { fromQuarter, toQuarter, search: appliedSearch }, pillar);
      setSelectedSignalId("");
      setSelectedSeriesId("__all__");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption pillar could not be loaded.");
    }
  };

  const submitRecordsQuery = async () => {
    if (!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || blockingRecordsLoading || hasDraftChanges || forecastEditor || searchComposing) return;
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


  const controlRecord = (controls: readonly ConsumptionApiControlTotal[], account: string, month: string) =>
    controls.find((control) => control.account === account && control.periodKey === month);
  const controlValue = (controls: readonly ConsumptionApiControlTotal[], account: string, month: string) =>
    controlRecord(controls, account, month)?.controlAmount;

  const updateControlForecast = (account: string, month: string, value: number | null) => {
    recordsRequestGeneration.current++;
    recordsLoadingRef.current = false;
    setRecordsLoadingPhase("idle");
    setDraftControlTotals((current) => {
      const next = current.filter((control) => !(control.account === account && control.periodKey === month));
      if (value !== null) next.push({ account, periodKey: month, controlAmount: value, detailAmount: null, matchStatus: "MANUAL_FORECAST" });
      return next.sort((left, right) => controlKey(left).localeCompare(controlKey(right)));
    });
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

  const positionForecastPopover = () => {
    const popover = forecastEditorPopoverRef.current;
    const anchor = forecastEditor?.anchor;
    if (!popover || !anchor?.isConnected) return;
    const gap = 6;
    const edge = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    let left = anchorRect.right + gap;
    if (left + popoverRect.width > window.innerWidth - edge) left = anchorRect.left - popoverRect.width - gap;
    left = Math.max(edge, Math.min(left, window.innerWidth - popoverRect.width - edge));
    const top = Math.max(edge, Math.min(anchorRect.top, window.innerHeight - popoverRect.height - edge));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  const closeForecastComposition = () => setForecastEditor(null);

  useEffect(() => {
    if (!forecastEditor) return;
    let frame = window.requestAnimationFrame(positionForecastPopover);
    const reposition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionForecastPopover);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || forecastEditorPopoverRef.current?.contains(target) || forecastEditor.anchor.contains(target)) return;
      closeForecastComposition();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [forecastEditor?.account, forecastEditor?.month, forecastEditor?.pillar, forecastEditor?.anchor, forecastEditor?.error]);

  const beginControlEdit = (anchor: HTMLElement, account: string, month: string, value: number | null) => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    if (selectedPillar === "ALL" || isSaving || recordsLoading || dataMode !== "backend") return;
    const key = forecastDraftKey(account, month);
    const draft = draftForecastCompositions.get(key);
    const saved = accountForecasts.find((forecast) => forecast.account === account && forecast.periodKey === month && forecast.pillar === selectedPillar);
    setForecastEditor({
      account,
      month,
      pillar: selectedPillar,
      anchor,
      total: toKInput(draft?.totalAmount ?? saved?.amount ?? value),
      newValue: toKInput(draft?.newAmount ?? saved?.newAmount),
      expansion: toKInput(draft?.expansionAmount ?? saved?.expansionAmount),
      error: ""
    });
  };

  const updateForecastEditor = (field: "total" | "newValue" | "expansion", value: string) => {
    setForecastEditor((current) => current ? { ...current, [field]: value, error: "" } : current);
  };

  const applyForecastComposition = () => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    if (!forecastEditor) return;
    const parsed = parseForecastCompositionK(forecastEditor.total, forecastEditor.newValue, forecastEditor.expansion);
    if (typeof parsed === "string") {
      setForecastEditor({ ...forecastEditor, error: parsed });
      return;
    }
    const key = forecastDraftKey(forecastEditor.account, forecastEditor.month);
    const saved = accountForecasts.find((forecast) => forecast.account === forecastEditor.account
      && forecast.periodKey === forecastEditor.month && forecast.pillar === forecastEditor.pillar);
    const unchanged = saved?.compositionStatus === "CLASSIFIED"
      && saved.amount === parsed.totalAmount
      && saved.newAmount === parsed.newAmount
      && saved.expansionAmount === parsed.expansionAmount;
    setDraftForecastCompositions((current) => {
      const next = new Map(current);
      if (unchanged) next.delete(key); else next.set(key, parsed);
      return next;
    });
    updateControlForecast(forecastEditor.account, forecastEditor.month, parsed.totalAmount);
    setForecastEditor(null);
  };

  const cancelForecastComposition = () => setForecastEditor(null);

  const saveForecasts = async () => {
    if (!canWrite) { setImportError("Write permission is required. Your forecast changes were kept."); return; }
    if (selectedPillar === "ALL" || isSaving || recordsLoading) return;
    setEditCell(null);
    editEntryValueRef.current = null;
    setIsSaving(true);
    setImportError("");
    setConflictRows([]);
    const controlUpdates = accounts.flatMap((account) =>
      [...editablePeriodIds].flatMap((month) => {
        const composition = draftForecastCompositions.get(forecastDraftKey(account.customer, month));
        if (!composition) return [];
        return [{ account: account.customer, periodKey: month, pillar: selectedPillar,
          amount: composition.totalAmount, ...composition }];
      }));
    try {
      if (dataMode === "fallback") {
        setSavedPlans(clonePlans(draftPlans));
        setSavedControlTotals(cloneControlTotals(draftControlTotals));

      } else if (dataMode !== "backend" || !apiEtag) {
        throw new Error("Authoritative Consumption workspace is not ready; Forecast was not saved.");
      } else {
        const workspace = await saveConsumptionForecasts(apiEtag, controlUpdates, selectedPillar);
        adoptWorkspace(workspace);
        try {
          await loadRecordsPage(false, { fromQuarter: workspace.fromQuarter, toQuarter: workspace.toQuarter, search: appliedSearch });
        } catch (refreshError) {
          adoptWorkspace(workspace);
          setImportError(`Forecasts were saved, but Consumption Records could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
        }
      }
      setEditCell(null);
      editEntryValueRef.current = null;
    } catch (error) {
      if (error instanceof ConsumptionConflictError) {
        const rows: ConflictRow[] = [];

        draftControlTotals.forEach((draft) => {
          const savedValue = controlValue(savedControlTotals, draft.account, draft.periodKey);
          if ((savedValue ?? null) === draft.controlAmount
            && !draftForecastCompositions.has(forecastDraftKey(draft.account, draft.periodKey))) return;
          rows.push({ plan: `${draft.account} · Account Forecast`, month: draft.periodKey,
            saved: savedValue ?? null, draft: draft.controlAmount,
            current: controlValue(accountForecastControls(error.current), draft.account, draft.periodKey) ?? null });
        });
        savedControlTotals.forEach((saved) => {
          if (controlValue(draftControlTotals, saved.account, saved.periodKey) !== undefined) return;
          rows.push({ plan: `${saved.account} · Account Forecast`, month: saved.periodKey,
            saved: saved.controlAmount, draft: null,
            current: controlValue(accountForecastControls(error.current), saved.account, saved.periodKey) ?? null });
        });
        setConflictRows(rows);
        setConflictWorkspace(error.current);
        setImportError("Forecast Save conflicted with a newer server version. Compare values below.");
      } else {
        setImportError(consumptionRecordsOperationError(error, "Consumption Forecast could not be saved."));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAllForecasts = () => {
    setDraftPlans(clonePlans(savedPlans));
    setDraftControlTotals(cloneControlTotals(savedControlTotals));
    setDraftForecastCompositions(new Map());
    cancelForecastComposition();
    setEditCell(null);
    editEntryValueRef.current = null;
  };

  useEffect(() => {
    if (importPhase !== "idle") importDialogRef.current?.open();
  }, [importPhase]);
  useEffect(() => {
    if (forecastImportPhase !== "idle") forecastImportDialogRef.current?.open();
  }, [forecastImportPhase]);

  const handleForecastCsvFile = async (event: Event) => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const file = files[0];
    input.value = "";
    if (!file || hasDraftChanges || dataMode !== "backend" || isSaving || forecastImportPhase !== "idle") return;
    setImportError("");
    setForecastImportResult("");
    setPendingForecastImport(null);
    setForecastImportPhase("previewing");
    try {
      const preview = await previewConsumptionForecastWide(file);
      setPendingForecastImport({ file, preview });
      setForecastImportPhase("preview");
    } catch (error) {
      const message = consumptionRecordsOperationError(error, "Forecast CSV could not be previewed.");
      setImportError(message);
      setForecastImportResult(message);
      setForecastImportPhase("error");
    }
  };

  const applyPendingForecastImport = async () => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    if (forecastApplyingRef.current || !pendingForecastImport || forecastImportPhase !== "preview" || pendingForecastImport.preview.hasBlockedErrors) return;
    forecastApplyingRef.current = true;
    setForecastImportPhase("applying");
    setImportError("");
    try {
      const result = await applyConsumptionForecastWide(pendingForecastImport.file, pendingForecastImport.preview.etag);
      const hasNoChanges = result.status === "APPLIED_NO_CONTROL_CHANGE" || result.status === "EXACT_REPLAY";
      setForecastImportResult(hasNoChanges
        ? "변경 없음: Forecast 값과 Sales Rep 정보가 현재 데이터와 같습니다."
        : `반영 완료: 변경된 항목 ${result.appliedCount}건 (Forecast 값과 Sales Rep 합계이며 Account 수가 아닙니다).`);
      setForecastImportPhase("complete");
      try {
        await loadRecordsPage(false, { fromQuarter, toQuarter, search: appliedSearch });
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : "Forecast records could not be refreshed.";
        setImportError(`반영은 완료됐지만 목록 새로고침에 실패했습니다: ${message}`);
      }
    } catch (error) {
      const message = consumptionRecordsOperationError(error, "Forecast CSV could not be applied.");
      setImportError(message);
      setForecastImportResult(`반영 실패: ${message}`);
      setForecastImportPhase("error");
    } finally {
      forecastApplyingRef.current = false;
    }
  };

  const handleCsvFiles = async (event: Event) => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length < 1) return;
    if (files.length > 8) {
      setImportError("Select 1 to 8 CSV files.");
      return;
    }
    if (hasDraftChanges || dataMode === "loading" || isSaving || exportingRef.current || importPhase !== "idle") return;
    setImportError("");
    setImportResult("");
    setPendingImport(null);
    setImportPhase("previewing");
    try {
      const preview = await previewConsumptionImport(files, "ALL");
      setPendingImport({ files, preview });
      setImportPhase("preview");
    } catch (error) {
      const message = consumptionRecordsOperationError(error, "Consumption CSV files could not be previewed.");
      setImportError(message);
      setImportResult(message);
      setImportPhase("error");
    }
  };

  const applyPendingImport = async () => {
    if (!canWrite) { setImportError("Write permission is required."); return; }
    if (!pendingImport || importPhase !== "preview" || pendingImport.preview.hasConflicts
      || isExactReplayPreview(pendingImport.preview)) return;
    setImportPhase("applying");
    setImportError("");
    try {
      const viewPillar=selectedPillar;
      const result = await applyConsumptionImport(pendingImport.files, "ALL", pendingImport.preview);
      if(viewPillar==="ALL")adoptWorkspace(result.workspace);
      let refreshFailed=false;
      try {
        await loadRecordsPage(false, { fromQuarter: result.workspace.fromQuarter, toQuarter: result.workspace.toQuarter, search: appliedSearch }, viewPillar);
      } catch (refreshError) {
        refreshFailed=true;
        if(viewPillar==="ALL"){
          adoptWorkspace(result.workspace);
        }else{
          setSavedPlans([]);setDraftPlans([]);setSavedControlTotals([]);setDraftControlTotals([]);setRecordAccountNames([]);
          setRecordsTotalAccounts(0);setRecordsNextOffset(0);setRecordsHasMore(false);setDataMode("error");
        }
        setImportError(`Import succeeded, but Consumption Records could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "unknown error"}`);
      }
      setSelectedSignalId("");
      setEditCell(null);
      setImportResult(`Incoming physical facts: ${result.physicalFactCount} · Inserted: ${result.insertedFactCount} · Overwritten: ${result.overwrittenFactCount} · Existing same values: ${result.unchangedFactCount} · Exact replay skipped: ${result.skippedFactCount} · Deleted: ${result.deletedFactCount} · Upload duplicates: ${result.deduplicatedFactCount} · Duplicate file set: ${result.duplicate ? "Yes" : "No"}`);
      setImportPhase(refreshFailed?"warning":"complete");
    } catch (error) {
      const message = consumptionRecordsOperationError(error, "Consumption CSV files could not be imported.");
      const confirmedRequestFailure = error instanceof ConsumptionApiError && error.status >= 400 && error.status < 500;
      const resultMessage = confirmedRequestFailure
        ? `Actual Import에 실패했습니다. ${message}`
        : "처리 결과를 확인하지 못했습니다. 반영 여부 확인이 필요합니다.";
      setImportError(resultMessage);
      setImportResult(resultMessage);
      setImportPhase("error");
    }
  };

  const exportImportCompatibleCsv = async () => {
    if (exportingRef.current || dataMode !== "backend" || isSaving || importPhase === "previewing" || importPhase === "applying") return;
    exportingRef.current = true;
    setIsExporting(true);
    setImportError("");
    try {
      const exported = await exportConsumptionImportCompatibleCsv(selectedPillar, fromQuarter, toQuarter);
      const url = URL.createObjectURL(exported.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption CSV could not be exported.");
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  const exportForecastCsv = async () => {
    if (exportingRef.current || dataMode !== "backend" || isSaving || importPhase === "previewing" || importPhase === "applying") return;
    exportingRef.current = true;
    setIsExporting(true);
    setImportError("");
    try {
      const exported = await exportConsumptionForecastCsv("ALL");
      const url = URL.createObjectURL(exported.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Consumption Forecast CSV could not be exported.");
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  const closeImportDialog = () => importDialogRef.current?.close();

  const renderQuarterCells = (series: ConsumptionPlan | ReturnType<typeof aggregateConsumptionAccounts>[number], accountLevel: boolean) => {
    const accountResolutions = accountLevel && "plans" in series ? Object.fromEntries(allMonths.map((month) => {
      const manual = controlValue(draftControlTotals, series.customer, month);
      return [month, resolveConsumptionControlTotal(series.plans, month, manual)];
    })) : {};
    const baseDisplaySeries: ConsumptionPlan | ReturnType<typeof aggregateConsumptionAccounts>[number] = accountLevel && "plans" in series ? {
      ...series,
      actuals: Object.fromEntries(allMonths.flatMap((month) => {
        const resolution = accountResolutions[month];
        return !editablePeriodIds.has(month) && resolution?.amount !== null ? [[month, resolution.amount]] : [];
      })),
      forecasts: Object.fromEntries(allMonths.flatMap((month) => {
        const resolution = accountResolutions[month];
        return editablePeriodIds.has(month) && resolution?.amount !== null ? [[month, resolution.amount]] : [];
      }))
    } : { ...series };
    const currentMtd = accountLevel && "plans" in series
      ? serverAccountMtdTotals[series.customer] ?? {}
      : "mtds" in series ? series.mtds ?? {} : {};
    const hasCurrentMtd = currentMtdPeriod !== "" && Object.prototype.hasOwnProperty.call(currentMtd, currentMtdPeriod);
    const displaySeries = showMtd && currentMtdPeriod ? {
      ...baseDisplaySeries,
      actuals: {
        ...baseDisplaySeries.actuals,
        ...(hasCurrentMtd ? { [currentMtdPeriod]: currentMtd[currentMtdPeriod] } : {})
      },
      forecasts: Object.fromEntries(Object.entries(baseDisplaySeries.forecasts).filter(([period]) => period !== currentMtdPeriod))
    } : baseDisplaySeries;
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
          const mtd = showMtd && month === currentMtdPeriod;
          const editable = selectedPillar !== "ALL" && editablePeriodIds.has(month) && !mtd;
          const value = editable
            ? displaySeries.forecasts[month] ?? displaySeries.actuals[month] ?? null
            : actual ? displaySeries.actuals[month] : forecast ? displaySeries.forecasts[month] : null;
          const key = `${series.id}-${month}`;
          if (accountLevel && "plans" in series) {
            const resolution = accountResolutions[month];
            const variance = forecastVariances.find((item) => item.account === series.customer && item.periodKey === month && item.pillar === selectedPillar);
            const composition = selectedPillar === "ALL" ? undefined : accountForecasts.find((item) =>
              item.account === series.customer && item.periodKey === month && item.pillar === selectedPillar);
            const canEditControl = canWrite && editable;
            const compositionDraft = draftForecastCompositions.get(forecastDraftKey(series.customer, month));
            const displayedComposition = compositionDraft && composition ? {
              ...composition,
              amount: compositionDraft.totalAmount,
              totalAmount: compositionDraft.totalAmount,
              newAmount: compositionDraft.newAmount,
              expansionAmount: compositionDraft.expansionAmount,
              baseAmount: compositionDraft.totalAmount - compositionDraft.newAmount - compositionDraft.expansionAmount,
              compositionStatus: "CLASSIFIED" as const
            } : composition;
            const dirty = draftForecastCompositions.has(forecastDraftKey(series.customer, month));
            if (mtd) return <td key={key} data-control-cell={`${series.customer}:${month}`} data-readonly="mtd"
              class="consumption-value-cell consumption-mtd-cell">
              <span>{hasCurrentMtd ? currency.format(currentMtd[month]) : "—"}<small>{hasCurrentMtd ? "MTD · provisional" : "MTD unavailable"}</small></span>
            </td>;
            return <td key={key} data-control-cell={`${series.customer}:${month}`}
              data-control-source={resolution?.source}
              class={`consumption-value-cell${editable ? " consumption-forecast-cell" : ""}${dirty ? " is-draft" : ""}`}
              onDblClick={(event) => canEditControl && beginControlEdit(event.currentTarget, series.customer, month, value)}>
              {displayedComposition ? <ForecastCompositionTooltip composition={displayedComposition}>
                <span>{value === null ? currency.format(0) : currency.format(value)}{dirty && <small>draft</small>}
                  {variance && variance.actualAmount !== null && variance.forecastAmount !== null && <small title="Account Actual minus preserved Final Forecast">
                    Actual {currency.format(variance.actualAmount)} · Final {currency.format(variance.forecastAmount)} · Variance {signedCurrency(variance.varianceAmount)}
                  </small>}</span>
              </ForecastCompositionTooltip> : <span>{value === null ? currency.format(0) : currency.format(value)}{dirty && <small>draft</small>}
                {variance && variance.actualAmount !== null && variance.forecastAmount !== null && <small title="Account Actual minus preserved Final Forecast">
                  Actual {currency.format(variance.actualAmount)} · Final {currency.format(variance.forecastAmount)} · Variance {signedCurrency(variance.varianceAmount)}
                </small>}</span>}
            </td>;
          }
          return <td key={key} class="consumption-value-cell" data-readonly={actual ? "actual" : "plan-actual"}>{value === null ? "—" : currency.format(value)}</td>;
        }),
        <td key={`${series.id}-${quarter}-total`} class={`consumption-value-cell consumption-quarter-total${forecastQuarter ? " is-forecast" : ""}`}>
          {currency.format(summary.total ?? 0)}
        </td>,
        <td key={`${series.id}-${quarter}-gap`} class={`consumption-value-cell consumption-preq-gap${forecastQuarter ? " is-forecast" : ""}`}>
          {summary.preQGap === null ? "—" : signedCurrency(summary.preQGap)}
        </td>
      ];
    });
  };

  const pageMessages: ConsumptionMessage[] = [];
  if (dataMode === "fallback") pageMessages.push({ id: "records-fallback", severity: "warning", summary: "운영 데이터를 불러오지 못해 예시 데이터를 표시합니다.", detail: "실제 업무에는 사용하지 마세요." });
  if (importError) pageMessages.push({ id: "records-operation-error", severity: "error", summary: "요청을 처리하지 못했습니다.", detail: "입력 내용을 확인한 뒤 다시 시도해 주세요." });
  if (rangeInitialized && rangeTouched && !rangeValid) pageMessages.push({ id: "records-range", severity: "warning", summary: "조회기간을 확인해 주세요.", detail: "시작 분기는 종료 분기보다 늦을 수 없습니다." });
  if (hasDraftChanges) pageMessages.push({ id: "records-draft", severity: "info", summary: "변경 내용을 저장하거나 취소해 주세요.", detail: "그 후 조회조건을 변경할 수 있습니다." });
  if (dataMode !== "loading" && serverActualTotals === null) pageMessages.push({ id: "records-total", severity: "warning", summary: "전체 합계를 확인할 수 없습니다.", detail: "현재 표에 불러온 값만 표시됩니다." });
  if (staleMtdPeriods.length > 0) pageMessages.push({ id: "records-stale-mtd", severity: "warning", summary: "Final upload required", detail: `${staleMtdPeriods.join(", ")} still has stale MTD data. Upload the final Actual before relying on that period.` });
  const visiblePageMessages = pageMessages.filter((message) => !dismissedMessageIds.has(message.id));

  if (dataMode === "loading" || blockingRecordsLoading) return <section class="accounts-workloads-page accounts-workloads-loading" aria-busy="true" aria-label="Consumption Records loading">
    <oj-progress-circle value={-1} size="md" aria-label="Consumption Records loading"></oj-progress-circle>
    <p>Loading Consumption Records...</p>
  </section>;

  return (
    <section class="consumption-page" aria-labelledby="consumptionTitle" data-fiscal-year={fiscalYear}>
      <header class="consumption-page__header">
        <div>
          {breadcrumb}
          <span class="kpi-eyebrow">Consumption / Attainment</span>
          <h1 id="consumptionTitle">Consumption Records</h1>
        </div>
        <div class="consumption-import-actions">
          <input ref={fileInputRef} class="consumption-file-input" type="file" accept=".csv,text/csv" multiple
            disabled={!canWrite || hasDraftChanges || rangeLoading || isSaving || isExporting || importPhase !== "idle" || forecastImportPhase !== "idle"} onChange={(event) => void handleCsvFiles(event)} />
          <input ref={forecastFileInputRef} class="consumption-file-input" type="file" accept=".csv,text/csv"
            disabled={!canWrite || hasDraftChanges || rangeLoading || dataMode !== "backend" || isSaving || isExporting || importPhase !== "idle" || forecastImportPhase !== "idle"} onChange={(event) => void handleForecastCsvFile(event)} />
          <oj-button chroming="outlined" title={!canWrite ? "Write permission is required." : `Import ${forecastFileName}`} disabled={!canWrite || hasDraftChanges || rangeLoading || dataMode !== "backend" || isSaving || isExporting || importPhase !== "idle" || forecastImportPhase !== "idle"} onojAction={() => forecastFileInputRef.current?.click()}>
            <span slot="startIcon" class="oj-ux-ico-upload"></span>
            Forecast Import
          </oj-button>
          <oj-button chroming="outlined" title="Export FORECAST data in the Forecast Import CSV format"
            disabled={rangeLoading || dataMode !== "backend" || isSaving || isExporting || importPhase === "previewing" || importPhase === "applying"}
            onojAction={() => void exportForecastCsv()}>
            <span slot="startIcon" class="oj-ux-ico-download"></span>
            {isExporting ? "Exporting…" : "Forecast Export"}
          </oj-button>
          <oj-button chroming="outlined" title={!canWrite ? "Write permission is required." : undefined} disabled={!canWrite || hasDraftChanges || rangeLoading || isSaving || isExporting || importPhase !== "idle" || forecastImportPhase !== "idle"} onojAction={() => fileInputRef.current?.click()}>
            <span slot="startIcon" class="oj-ux-ico-upload"></span>
            Actual Import
          </oj-button>
          <oj-button chroming="outlined" title="Export ACTUAL data in the Consumption Import CSV format"
            disabled={rangeLoading || dataMode !== "backend" || isSaving || isExporting || importPhase === "previewing" || importPhase === "applying"}
            onojAction={() => void exportImportCompatibleCsv()}>
            <span slot="startIcon" class="oj-ux-ico-download"></span>
            {isExporting ? "Exporting…" : "Actual Export"}
          </oj-button>
        </div>
      </header>
      <ConsumptionMessageBanner messages={visiblePageMessages}
        onClose={(messageId) => {
          if (messageId === "records-operation-error") {
            setImportError("");
            return;
          }
          setDismissedMessageIds((current) => new Set(current).add(messageId));
        }} />

      <section class="consumption-range-bar" aria-label="Consumption quarter range">
        <div class="consumption-range-pillar">
          <span>Pillar</span>
          <div class="consumption-pillar-selector" role="group" aria-label="Consumption Records pillar">
            {consumptionPillarOptions.map((option) => <button key={option.value} type="button"
              aria-pressed={selectedPillar === option.value}
              disabled={hasDraftChanges || !!forecastEditor || isSaving || blockingRecordsLoading || rangeLoading || importPhase !== "idle"}
              onClick={() => void selectPillar(option.value)}>{option.label}</button>)}
          </div>
        </div>
        <label htmlFor="consumptionFromQuarter">From Quarter
          <select id="consumptionFromQuarter" value={fromQuarter} disabled={rangeLoading || blockingRecordsLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setFromQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <label htmlFor="consumptionToQuarter">To Quarter
          <select id="consumptionToQuarter" value={toQuarter} disabled={rangeLoading || blockingRecordsLoading || hasDraftChanges} onChange={(event) => { setRangeTouched(true); setToQuarter((event.currentTarget as HTMLSelectElement).value); }}>
            {quarterOptions.map((quarter) => <option value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <label class="consumption-record-search" htmlFor="consumptionRecordSearch">Search
          <input id="consumptionRecordSearch" type="search" value={draftSearch} placeholder="Account, workload, end user, or Plan"
            disabled={hasDraftChanges || rangeLoading || blockingRecordsLoading}
            onCompositionStart={() => setSearchComposing(true)}
            onCompositionEnd={(event) => { setDraftSearch(event.currentTarget.value); setSearchComposing(false); }}
            onInput={(event) => setDraftSearch(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.isComposing && !searchComposing) { event.preventDefault(); void submitRecordsQuery(); } }} />
        </label>
        <button type="button" class={`consumption-range-apply`} disabled={!isConsumptionQuarterRangeValid(fromQuarter, toQuarter) || rangeLoading || blockingRecordsLoading || hasDraftChanges || !!forecastEditor || searchComposing || dataMode !== "backend"} onClick={() => void submitRecordsQuery()}>
          {rangeLoading ? "Applying…" : "Apply"}
        </button>

      </section>

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
              <p><strong>{pendingImport.files.length} CSV file{pendingImport.files.length === 1 ? "" : "s"}</strong> passed filename, pillar, range, and content validation.</p>
              <div class="consumption-import-file-list" aria-label="Import file preview">
                {pendingImport.preview.files.map((file) => <article key={file.fileName}>
                  <strong>{file.fileName}</strong>
                  <span>Pillar: {file.detectedPillar}</span>
                  <span>Owner: {file.owner}</span>
                  <span>Range: {file.fromPeriod} – {file.toPeriod}</span>
                  <span>Rows: {file.sourceRowCount} · Plans: {file.planCount} · Controls: {file.controlTotalCount}</span>
                </article>)}
              </div>
              <dl class="consumption-import-decision-summary">
                <div><dt>New</dt><dd>{pendingImport.preview.hasConflicts ? "—" : pendingImport.preview.insertFactCount}</dd></div>
                <div><dt>Updates</dt><dd>{pendingImport.preview.hasConflicts ? "—" : pendingImport.preview.overwriteCount}</dd></div>
                <div><dt>No change</dt><dd>{pendingImport.preview.hasConflicts ? "—" : pendingImport.preview.existingSameValueCount + pendingImport.preview.skippedFactCount + pendingImport.preview.sameValueDuplicateCount}</dd></div>
                <div class={pendingImport.preview.hasConflicts ? "is-conflict" : ""}><dt>Errors</dt><dd>{pendingImport.preview.conflictCount}</dd></div>
              </dl>
              {renderSalesRepPreview(pendingImport.preview.salesRepChanges)}
              <details class="consumption-import-technical-details">
                <summary>View technical details</summary>
                <dl>
                  <div><dt>Source rows</dt><dd>{pendingImport.preview.sourceRowCount}</dd></div>
                  <div><dt>Plans</dt><dd>{pendingImport.preview.planCount}</dd></div>
                  <div><dt>Control totals</dt><dd>{pendingImport.preview.controlTotalCount}</dd></div>
                  <div><dt>Existing same values</dt><dd>{pendingImport.preview.existingSameValueCount}</dd></div>
                  <div><dt>Upload duplicates</dt><dd>{pendingImport.preview.sameValueDuplicateCount}</dd></div>
                  <div><dt>Exact replay skipped</dt><dd>{pendingImport.preview.skippedFactCount}</dd></div>
                  <div><dt>Existing Actuals to delete</dt><dd>{pendingImport.preview.deleteFactCount}</dd></div>
                </dl>
                <p>Rolling files are partial upserts. Existing months omitted from a file are preserved, not deleted.</p>
              </details>
              {pendingImport.preview.overwrites.length > 0 && <details class="consumption-import-update-details">
                <summary>Updates detail ({pendingImport.preview.overwriteCount})</summary>
                <section class="consumption-import-overwrites" role="status" aria-labelledby="consumptionImportOverwriteTitle">
                  <strong id="consumptionImportOverwriteTitle">Existing Actuals to overwrite</strong>
                  <p>Scope is limited to the authenticated Owner, detected Pillar, and listed Plan/Period keys. Other Pillars and Forecasts are unchanged.</p>
                  <ul>{pendingImport.preview.overwrites.slice(0, 20).map((overwrite) => <li key={overwrite.key}><code>{overwrite.key}</code> · {currency.format(overwrite.existingValue)} → {currency.format(overwrite.newValue)}</li>)}</ul>
                  {pendingImport.preview.overwrites.length > 20 && <p>Showing 20 of {pendingImport.preview.overwriteCount} overwrite rows.</p>}
                </section>
              </details>}
              {pendingImport.preview.conflicts.length > 0 && <section class="consumption-import-hard-conflict" role="alert" aria-labelledby="consumptionImportConflictTitle">
                <strong id="consumptionImportConflictTitle">Import blocked</strong>
                <p>The upload contains duplicate Plan rows or conflicting uploaded values. Resolve every error before Import.</p>
                <ul>{pendingImport.preview.conflicts.map((conflict) => <li key={conflict.key}><code>{conflict.key}</code> · {conflict.reason} · #{conflict.fileOrdinals[0]} {conflict.files[0]} row {conflict.rows[0]}: {conflict.values[0] === null ? "Missing" : formatConflictCurrency(conflict.values[0])} → #{conflict.fileOrdinals[1]} {conflict.files[1]} row {conflict.rows[1]}: {conflict.values[1] === null ? "Missing" : formatConflictCurrency(conflict.values[1])}</li>)}</ul>
              </section>}
              <p>{pendingImport.preview.hasConflicts ? "Import is blocked until the upload errors are resolved."
                : isExactReplayPreview(pendingImport.preview) ? "This exact file set is already reflected in the authoritative workspace."
                  : "Apply will update the authoritative Consumption workspace atomically."}</p>
            </div>
          )}
          {(importPhase === "complete" || importPhase === "warning" || importPhase === "error") && (
            <div class={importPhase === "complete" ? "consumption-import-result is-success" : "consumption-import-result is-error"} role={importPhase === "complete" ? "status" : "alert"}>
              <span class={importPhase === "complete" ? "oj-ux-ico-check-circle" : importPhase === "warning" ? "oj-ux-ico-warning" : "oj-ux-ico-error"} aria-hidden="true"></span>
              <strong>{importPhase === "complete" ? "Import completed" : importPhase === "warning" ? "Import applied; refresh required" : "Import failed"}</strong>
              <p>{importResult}</p>
            </div>
          )}
        </div>
        <div slot="footer">
          {importPhase === "preview" && pendingImport && <><oj-button chroming="outlined" onojAction={closeImportDialog}>Cancel</oj-button><oj-button chroming="callToAction"
            disabled={!canWrite || pendingImport.preview.hasConflicts || isExactReplayPreview(pendingImport.preview)}
            title={!canWrite ? "Write permission is required." : undefined}
            onojAction={() => void applyPendingImport()}>{pendingImport.preview.hasConflicts ? "Resolve errors"
              : isExactReplayPreview(pendingImport.preview) ? "Already imported"
                : pendingImport.preview.insertFactCount + pendingImport.preview.overwriteCount === 0 ? "Apply metadata refresh"
                  : `Apply ${pendingImport.preview.insertFactCount} new · ${pendingImport.preview.overwriteCount} updates`}</oj-button></>}
          {(importPhase === "complete" || importPhase === "warning" || importPhase === "error") && <oj-button chroming="callToAction" onojAction={closeImportDialog}>Close</oj-button>}
        </div>
      </oj-dialog>
      <oj-dialog id="consumptionForecastImportDialog" ref={forecastImportDialogRef}
        dialogTitle="Forecast CSV preview and apply"
        cancelBehavior={forecastImportPhase === "previewing" || forecastImportPhase === "applying" ? "none" : "icon"}
        onojClose={() => {
          if (forecastImportPhase === "previewing" || forecastImportPhase === "applying") return;
          setForecastImportPhase("idle"); setPendingForecastImport(null); setForecastImportResult("");
        }}>
        <div slot="body" class="consumption-import-dialog-body" aria-live="polite">
          {(forecastImportPhase === "previewing" || forecastImportPhase === "applying") && <div class="consumption-import-progress" role="status">
            <oj-progress-circle value={-1} size="md"></oj-progress-circle>
            <div><strong>{forecastImportPhase === "previewing" ? "Validating Forecast CSV…" : "Applying Forecast atomically…"}</strong><p>Blank cells remain unchanged; explicit zero is retained.</p></div>
          </div>}
          {forecastImportPhase === "preview" && pendingForecastImport && <div class="consumption-import-preview">
            <p><strong>{pendingForecastImport.preview.sourceFileName}</strong></p>
            <p class="consumption-import-reference-note"><strong>Actual reference only:</strong> Actual values are read-only and are never imported by Forecast Import. {pendingForecastImport.preview.referenceNotice ?? ""}</p>
            <dl class="consumption-import-decision-summary">
              <div><dt>Forecast cells</dt><dd>{pendingForecastImport.preview.forecastCellCount}</dd></div>
              <div><dt>Blank no-op</dt><dd>{pendingForecastImport.preview.blankNoOpCount}</dd></div>
              <div><dt>Explicit zero</dt><dd>{pendingForecastImport.preview.explicitZeroCount}</dd></div>
              <div class={pendingForecastImport.preview.hasBlockedErrors ? "is-conflict" : ""}><dt>Blocked</dt><dd>{pendingForecastImport.preview.blockedErrors.length}</dd></div>
            </dl>
            {renderSalesRepPreview(pendingForecastImport.preview.salesRepChanges)}
            <p><strong>Canonical periods:</strong> {pendingForecastImport.preview.canonicalPeriods.join(", ") || "None"}</p>
            <p>{`Exact Plan ${pendingForecastImport.preview.changes.filter((change) => change.resolution === "EXACT_PLAN").length} · Forecast-only / Plan unassigned ${pendingForecastImport.preview.planUnassignedCount}`}</p>
            {pendingForecastImport.preview.changes.length > 0 && <table class="consumption-import-preview-table">
              <thead><tr><th>Account / Period</th><th>Raw</th><th>Canonical T | N | E</th><th>Reduction</th><th>Previous source</th><th>Status</th></tr></thead>
              <tbody>{pendingForecastImport.preview.changes.slice(0, 20).map((change) => <tr key={`${change.rowNumber}-${change.account}-${change.periodKey}`}>
                <th>{change.account} · {change.periodKey}</th>
                <td>{change.rawValue}</td>
                <td>{[change.totalAmount, change.newAmount, change.expansionAmount].map(formatForecastK).join(" | ")}</td>
                <td>{change.reductionAmount === null ? "N/A" : formatForecastK(change.reductionAmount)}</td>
                <td>{change.previousSource}</td>
                <td>{change.compositionStatus}</td>
              </tr>)}</tbody>
            </table>}
            {pendingForecastImport.preview.changes.length > 20 && <p>Showing 20 of {pendingForecastImport.preview.changes.length} changed cells.</p>}
            {pendingForecastImport.preview.blockedErrors.length > 0 && <ul aria-label="Blocking import errors">{pendingForecastImport.preview.blockedErrors.map((error) => <li key={`${error.rowNumber}-${error.column}-${error.code}`}>Row {error.rowNumber}{error.column ? ` · ${error.column}` : ""} · {error.code}: {error.message}</li>)}</ul>}
          </div>}
          {(forecastImportPhase === "complete" || forecastImportPhase === "error") && <div class={forecastImportPhase === "complete" ? "consumption-import-result is-success" : "consumption-import-result is-error"} role={forecastImportPhase === "complete" ? "status" : "alert"}>
            <strong>{forecastImportPhase === "complete" ? "Forecast Import completed" : "Forecast Import failed"}</strong><p>{forecastImportResult}</p>
          </div>}
        </div>
        <div slot="footer">
          {forecastImportPhase === "preview" && pendingForecastImport && <><oj-button chroming="outlined" onojAction={() => forecastImportDialogRef.current?.close()}>Cancel</oj-button><oj-button chroming="callToAction"
            disabled={!canWrite || pendingForecastImport.preview.hasBlockedErrors}
            title={!canWrite ? "Write permission is required." : undefined}
            onojAction={() => void applyPendingForecastImport()}>{`Apply ${pendingForecastImport.preview.forecastCellCount} cells`}</oj-button></>}
          {(forecastImportPhase === "complete" || forecastImportPhase === "error") && <oj-button chroming="callToAction" onojAction={() => forecastImportDialogRef.current?.close()}>Close</oj-button>}
        </div>
      </oj-dialog>
      {forecastEditor && createPortal(
        <div ref={forecastEditorPopoverRef} class="consumption-forecast-composition-popover" role="dialog"
          aria-modal="false" aria-label={`Edit ${forecastEditor.account} forecast`}>
          <form onSubmit={(event) => { event.preventDefault(); applyForecastComposition(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelForecastComposition();
              }
            }}>
            <header>
              <span><strong>{forecastEditor.account}</strong><small>{forecastEditor.pillar} · {forecastEditor.month}</small></span>
              <small class="consumption-forecast-composition-unit">K</small>
            </header>
            <div class="consumption-forecast-composition-fields">
              <label><span>Total</span><input type="text" inputMode="decimal" value={forecastEditor.total} disabled={!canWrite}
                ref={selectForecastEditor(`${forecastEditor.account}:${forecastEditor.month}`)}
                aria-invalid={forecastEditor.error && !validForecastKInput(forecastEditor.total) ? "true" : "false"}
                onInput={(event) => updateForecastEditor("total", event.currentTarget.value)} />
                {forecastEditor.error && !validForecastKInput(forecastEditor.total) && <small role="alert">Required · 0+ · max 2 decimals</small>}
              </label>
              <label><span>New</span><input type="text" inputMode="decimal" value={forecastEditor.newValue} disabled={!canWrite}
                aria-invalid={forecastEditor.error && !validForecastKInput(forecastEditor.newValue) ? "true" : "false"}
                onInput={(event) => updateForecastEditor("newValue", event.currentTarget.value)} />
                {forecastEditor.error && !validForecastKInput(forecastEditor.newValue) && <small role="alert">Required · 0+ · max 2 decimals</small>}
              </label>
              <label><span>Expansion</span><input type="text" inputMode="decimal" value={forecastEditor.expansion} disabled={!canWrite}
                aria-invalid={forecastEditor.error ? "true" : "false"}
                onInput={(event) => updateForecastEditor("expansion", event.currentTarget.value)} />
                {forecastEditor.error && (!validForecastKInput(forecastEditor.expansion)
                  ? <small role="alert">Required · 0+ · max 2 decimals</small>
                  : forecastEditor.error.startsWith("New + Expansion") && <small role="alert">New + Expansion ≤ Total</small>)}
              </label>
            </div>
            <footer>
              <button type="button" class="is-secondary" onClick={cancelForecastComposition}>취소</button>
              <button type="submit" class="is-primary" disabled={!canWrite} title={!canWrite ? "Write permission is required." : undefined}>적용</button>
            </footer>
          </form>
        </div>, document.body)}
      {conflictRows.length > 0 && (
        <section class="kpi-panel consumption-conflict-panel" aria-labelledby="consumptionConflictTitle">
          <div class="consumption-section-heading"><div><span class="kpi-section-label">HTTP 409 comparison</span><h2 id="consumptionConflictTitle">Forecast version conflict</h2></div></div>
          <table><thead><tr><th>Account / Month</th><th>Saved baseline</th><th>My draft</th><th>Current server</th></tr></thead>
            <tbody>{conflictRows.map((row) => <tr key={`${row.plan}-${row.month}`}><th>{row.plan} · {row.month}</th><td>{row.saved === null ? "—" : currency.format(row.saved)}</td><td>{row.draft === null ? "—" : currency.format(row.draft)}</td><td>{row.current === null ? "—" : currency.format(row.current)}</td></tr>)}</tbody>
          </table>
          <oj-button chroming="outlined" onojAction={() => conflictWorkspace && adoptWorkspace(conflictWorkspace)}>Use current server</oj-button>
        </section>
      )}

      <section class="kpi-panel consumption-table-panel" aria-labelledby="consumptionTableTitle" aria-busy={recordsLoadingPhase === "query" ? "true" : undefined}>
        {recordsLoadingPhase === "query" && <div class="consumption-results-refresh" role="status">
          <oj-progress-circle value={-1} size="sm" aria-label="Refreshing Consumption Records results"></oj-progress-circle>
          <span>Refreshing results…</span>
        </div>}
        <div class="consumption-section-heading consumption-table-heading">
          <div>
            <strong id="consumptionTableTitle" class="consumption-table-title">Account / Plan Consumption <small class="consumption-table-plan-count">{visiblePlans.length} plans</small></strong></div>
          <div class="consumption-table-heading__actions">
            <button type="button" role="switch" aria-checked={showMtd} class="consumption-mtd-switch"
              disabled={dataMode !== "backend" || !currentMtdPeriod}
              onClick={() => setShowMtd((current) => !current)}>
              <span>Show MTD</span><span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
            </button>
            {hasDraftChanges && (
              <div class="consumption-draft-actions" role="toolbar" aria-label="Forecast draft actions">
                <span>Draft changes</span>
                <oj-button chroming="callToAction" disabled={!canWrite || isSaving} title={!canWrite ? "Write permission is required." : undefined} onojAction={saveForecasts}>{isSaving ? "Saving…" : "Save"}</oj-button>
                <oj-button chroming="outlined" disabled={isSaving} onojAction={cancelAllForecasts}>Cancel</oj-button>
              </div>
            )}
          </div>
        </div>
        <div id="consumptionTableContent" class="consumption-table-content">
        <div class="consumption-scroll-controls" aria-label="Horizontal table navigation">
          <button type="button" aria-label="Move table left" title="Move left" disabled={tableScrollState.left <= 0} onClick={() => moveTableHorizontally(-1)}>‹</button>
          <button type="button" aria-label="Move table right" title="Move right" disabled={tableScrollState.left >= tableScrollState.max} onClick={() => moveTableHorizontally(1)}>›</button>
        </div>
        <div ref={tableScrollRef} class="consumption-table-scroll is-scrollable-y" tabIndex={0} aria-label="Scrollable Consumption Records table" onScroll={handleTableScroll} onKeyDown={handleTableKeyDown}>
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
                    const status = showMtd && month === currentMtdPeriod ? "MTD" : editablePeriodIds.has(month) ? "FORECAST" : "ACTUAL";
                    return <th key={`${quarter}-${month}`} class={`consumption-month-heading is-${status.toLowerCase()}`}>{shortMonth(month)}<small class={`consumption-month-status is-${status.toLowerCase()}`}>{status}</small></th>;
                  }),
                  <th key={`${quarter}-total`} class={getQuarterMonths(quarter).some((month) => editablePeriodIds.has(month)) ? "consumption-quarter-total is-forecast" : "consumption-quarter-total"}>Quarter Total</th>,
                  <th key={`${quarter}-gap`} class={getQuarterMonths(quarter).some((month) => editablePeriodIds.has(month)) ? "consumption-preq-gap is-forecast" : "consumption-preq-gap"}>PreQ Gap</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {renderedRecordAccounts.map((account) => {
                const visiblePlanCount = countUniqueConsumptionPlans(account.plans);
                const singlePlan = visiblePlanCount === 1 ? account.plans[0] : null;
                const expandable = visiblePlanCount > 1;
                const expanded = expandable && expandedAccounts.has(account.customer);
                return (
                  <>
                    <tr key={account.id} class={selectedSignal?.customer === account.customer ? "consumption-account-row is-context" : "consumption-account-row"}>
                      <th class="consumption-account-column" scope="row">
                        {expandable ? (
                          <button type="button" class="consumption-account-toggle" aria-expanded={expanded}
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${account.customer} Plans`}
                            onClick={() => toggleAccount(account.customer)}>
                            <span class="consumption-leading">
                              <span class="consumption-disclosure-slot"><span class={expanded ? "oj-ux-ico-chevron-down" : "oj-ux-ico-chevron-right"} aria-hidden="true"></span></span>
                              <span class="consumption-leading-copy"><ConsumptionTruncatedText text={account.customer} focusable={false} /><small>Account Forecast · {visiblePlanCount} visible Plans</small></span>
                            </span>
                          </button>
                        ) : singlePlan ? (
                          <span class="consumption-leading consumption-account-single">
                            <span class="consumption-disclosure-slot" aria-hidden="true"></span>
                            <span class="consumption-leading-copy"><ConsumptionTruncatedText text={`${account.customer}${singlePlan.workload ? ` (${singlePlan.workload})` : ""}`} />
                            <small>{singlePlan.endUser} · Plan {singlePlan.planId} · <ConsumptionDataCenter plan={singlePlan} selectedPillar={selectedPillar} /></small></span>
                          </span>
                        ) : (
                          <span class="consumption-leading consumption-account-single">
                            <span class="consumption-disclosure-slot" aria-hidden="true"></span>
                            <span class="consumption-leading-copy"><ConsumptionTruncatedText text={account.customer} />
                            <small>Forecast-only / Plan unassigned</small></span>
                          </span>
                        )}
                      </th>
                      {renderQuarterCells(account, true)}
                    </tr>
                    {expandable && expanded && account.plans.map((plan) => (
                      <tr key={plan.id} class={selectedSignal?.planId === plan.planId ? "consumption-plan-row is-context" : "consumption-plan-row"}>
                        <th class="consumption-account-column" scope="row">
                          <span class="consumption-leading">
                            <span class="consumption-disclosure-slot" aria-hidden="true"></span>
                            <span class="consumption-leading-copy"><ConsumptionTruncatedText className="consumption-end-user" text={`${plan.customer}${plan.workload ? ` (${plan.workload})` : ""}`} />
                            <small>{plan.endUser} · Plan {plan.planId} · <ConsumptionDataCenter plan={plan} selectedPillar={selectedPillar} /></small></span>
                          </span>
                        </th>
                        {renderQuarterCells(plan, false)}
                      </tr>
                    ))}
                  </>
                );
              })}
              {renderedRecordAccounts.length === 0 && <tr><td class="consumption-empty-state" colSpan={1 + quarters.length * 5}>No Consumption Records match the selected range and filters.</td></tr>}
            </tbody>
          </table>
          <div ref={recordsSentinelRef} class="consumption-records-sentinel" data-records-sentinel aria-hidden="true"></div>
        </div>
        <div class={`consumption-load-more${recordsHasMore ? "" : " is-placeholder"}`}>
          <span class="consumption-records-loading" role="status" aria-live="polite" aria-atomic="true">
            {(recordsLoading || rangeLoading) && <><oj-progress-circle value={-1} size="sm"></oj-progress-circle><span>Loading Consumption Records…</span></>}
          </span>
          {recordsHasMore && <button type="button" disabled={recordsLoading || hasDraftChanges} onClick={() => void loadRecordsPage(true)}>{recordsLoading ? "Loading…" : "Load More"}</button>}
          {!recordsHasMore && !recordsLoading && !rangeLoading && loadedAccountCount > 0 && <span class="consumption-records-complete" role="status">All accounts loaded.</span>}
          <small>Showing {loadedAccountCount} of {recordsTotalAccounts} accounts · {visiblePlans.length} plans</small>
        </div>
        </div>
      </section>
    </section>
  );
}
