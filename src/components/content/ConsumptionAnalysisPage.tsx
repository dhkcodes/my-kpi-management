import { ComponentChildren, h } from "preact";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { beginAppBusy } from "../../app/appBusy";
import { FiscalYear, getLatestFiscalYear } from "../../data/kpiMockData";
import { formatMtdAppliedDate } from "../../data/mtdDate";
import {
  ConsumptionAnalysis,
  ConsumptionAnalysisAlert,
  ConsumptionAnalysisQuarter,
  fetchConsumptionAnalysis
} from "../../data/consumptionApi";
import {
  ConsumptionAnalysisAccountCandidate,
  ConsumptionAnalysisPlan,
  ForecastCompositionCategory,
  ConsumptionPillar,
  calculateOpenForecastExposureExact,
  consumptionPillarOptions,
  filterForecastCompositionAccounts,
  formatConsumptionDataCenter,
  getAlertActualTrend,
  isUnmappedConsumptionLabel,
  shouldRefreshConsumptionAnalysisContext
} from "../../data/consumptionData";
import {
  addExactDecimals,
  compareExactDecimals,
  divideExactDecimal,
  exactDecimalToChartCoordinate,
  formatExactKFixed,
  formatExactPercent,
  negateExactDecimal,
  subtractExactDecimals
} from "../../data/exactDecimal";
import "ojs/ojprogress-circle";
import "ojs/ojchart";
import "ojs/ojbutton";
import "ojs/ojmenu";
import "ojs/ojoption";
import type { ojChart } from "ojs/ojchart";
import type { ojMenu } from "ojs/ojmenu";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { ConsumptionMessageBanner } from "./ConsumptionMessageBanner";
import type { ConsumptionMessage } from "./ConsumptionMessageBanner";
import { PageActivity, PageDataProgress, PageFilterPanel, PageShell } from "../common/PageShell";
import html2canvasPro = require("html2canvas-pro");
import { jsPDF } from "jspdf";

const chartCurrencyK = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Ratio displays use two percentage-point decimals and decimal HALF_UP rounding. */
const PERCENT_DISPLAY_PRECISION = 2;
const signedCurrencyExact = (amountExact: string | null) => amountExact === null ? "N/A"
  : `${compareExactDecimals(amountExact, "0") > 0 ? "+" : ""}${formatExactKFixed(amountExact, 2)}`;
const percentageTextExact = (percentageExact: string | null, signed = false) => percentageExact === null ? "N/A"
  : `${signed && compareExactDecimals(percentageExact, "0") > 0 ? "+" : ""}${divideExactDecimal(percentageExact, "1", PERCENT_DISPLAY_PRECISION)}%`;
const qoqKind = (status: ConsumptionAnalysisQuarter["status"]) => status === "ACTUAL" ? "ACTUAL"
  : status === "FORECAST" ? "FORECAST" : status === "MIXED" ? "MIXED" : status === "NOT_OPEN" ? "NOT OPEN" : "INCOMPLETE";
const splitLabel = (value: { actualAmountExact: string; forecastAmountExact: string }) => `ACTUAL ${formatExactKFixed(value.actualAmountExact, 2)} · Open Forecast ${formatExactKFixed(value.forecastAmountExact, 2)}`;
const planSplitLabel = (value: ConsumptionAnalysisPlan) => `ACTUAL ${formatExactKFixed(value.actualAmountExact, 2)} · Open Forecast ${value.forecastEntryStatus === "UNAVAILABLE" ? "N/A" : formatExactKFixed(value.forecastAmountExact, 2)}`;
// Oracle JET accepts Number coordinates only. These helpers are the sole lossy chart boundary.
const amountExactToKChartCoordinate = (amountExact: string): number => exactDecimalToChartCoordinate(divideExactDecimal(amountExact, "1000", 12)!);
const trendChartCoordinateLabel = ({ value }: Readonly<{ value: number }>) => `${chartCurrencyK.format(value / 1000)} K`;
const movementChartCoordinateLabel = ({ value }: Readonly<{ value: number }>) => `${chartCurrencyK.format(value)} K`;
const movementAxisChartCoordinateConverter = {
  format: (value: string | number) => `${chartCurrencyK.format(Number(value))} K`,
  parse: (value: string) => Number(value.replace(/[^0-9.-]/g, ""))
};
const contributionPercentText = (percentageExact: string | null) => percentageExact === null ? "—" : percentageTextExact(percentageExact);
const contributionBarWidthChartCoordinate = (percentageExact: string | null) => percentageExact === null ? 0
  : Math.max(0, Math.min(100, exactDecimalToChartCoordinate(percentageExact)));
const actualEntryText = (status: "PROVIDED" | "MISSING", amountExact: string) => status === "MISSING"
  ? "Actual not entered" : compareExactDecimals(amountExact, "0") === 0 ? "Actual 0 entered" : "Actual only";
const ACTUAL_COLOR = "#315f75";
const FORECAST_COLOR = "#78abc4";
const MTD_COLOR = "#b56a3b";
const OPEN_FORECAST_TOOLTIP = "Open Forecast selection excludes FINAL periods. Forecast for an included MTD period remains shown. Total removes overlapping Forecast once and uses MTD instead.";
const OPEN_FORECAST_EXPOSURE_TOOLTIP = "The numerator is Open Forecast selected from non-FINAL periods before overlap removal. The denominator is covered-period total minus provisional MTD and includes finalized Actual. This is not the chart composition share.";
const InfoTooltip = ({ id, label, text }: Readonly<{ id: string; label: string; text: string }>) => <span class="consumption-info-tooltip">
  <button type="button" class="consumption-info-tooltip__trigger oj-ux-ico-information-s" aria-label={label} aria-describedby={id}></button>
  <span id={id} class="consumption-info-tooltip__content" role="tooltip">{text}</span>
</span>;
const OpenForecastLabel = ({ tooltipId, tooltipText = OPEN_FORECAST_TOOLTIP }: Readonly<{ tooltipId?: string; tooltipText?: string }>) => {
  const generatedId = useId();
  return <span>Open Forecast <InfoTooltip id={tooltipId ?? `openForecastTooltip-${generatedId}`} label="Explain Open Forecast" text={tooltipText} /></span>;
};
const MOVEMENT_COLORS = { New: "#2f7d32", Expansion: "#2f6f9f", Reduction: "#b94a48" } as const;
const ALL_ACCOUNTS = "All Accounts Total";
const COMPOSITION_CATEGORIES: readonly ForecastCompositionCategory[] = ["All", "New", "Expansion", "Reduction"];
type InsightChartPoint = Readonly<{
  id: string;
  seriesId: string;
  groupId: string;
  value: number | null;
  color: string;
  shortDesc: string;
  pattern?: "smallDiagonalRight";
  markerSize?: number;
  dataLabel?: string;
}>;

const renderInsightChartItem = ({ data }: Readonly<{ data: InsightChartPoint }>) => <oj-chart-item
  value={data.value ?? undefined}
  seriesId={data.seriesId}
  groupId={[data.groupId]}
  color={data.color}
  pattern={data.pattern}
  markerSize={data.markerSize}
  shortDesc={data.shortDesc}>
</oj-chart-item>;

const chart = (points: readonly InsightChartPoint[]) => new ArrayDataProvider([...points], { keyAttributes: "id" });
const candidateSearchText = (candidate: ConsumptionAnalysisAccountCandidate) => candidate.account.toLocaleLowerCase();
const matchesCandidate = (candidate: ConsumptionAnalysisAccountCandidate, search: string) =>
  candidateSearchText(candidate).includes(search.trim().toLocaleLowerCase());
const fiscalQuarterForPeriod = (periodKey: string | undefined) => {
  const month = periodKey?.split("-")[1];
  if (["JUN", "JUL", "AUG"].includes(month ?? "")) return "Q1";
  if (["SEP", "OCT", "NOV"].includes(month ?? "")) return "Q2";
  if (["DEC", "JAN", "FEB"].includes(month ?? "")) return "Q3";
  if (["MAR", "APR", "MAY"].includes(month ?? "")) return "Q4";
  return "";
};

const findAlertPlan = (analysis: ConsumptionAnalysis, alert: ConsumptionAnalysisAlert): ConsumptionAnalysisPlan | null =>
  analysis.accounts.find((account) => account.account === alert.account)?.workloads
    .find((workload) => workload.workload === alert.workload)?.plans
    .find((plan) => plan.serverPlanId === alert.serverPlanId) ?? null;

const statusTone = (status: string) => `consumption-insights-status is-${status.toLowerCase()}`;
const alertPresentation = (alert: ConsumptionAnalysisAlert) => ({
  typeLabel: alert.type.replaceAll("_", " "),
  typeIcon: alert.type === "ABOVE_USUAL" ? "oj-ux-ico-arrow-up" : alert.type === "BELOW_USUAL" ? "oj-ux-ico-arrow-down" : "oj-ux-ico-plus",
  typeTone: `is-${alert.type.toLowerCase().replaceAll("_", "-")}`,
  gradeTone: `is-${alert.grade.toLowerCase()}`,
  gradeIcon: alert.grade === "CRITICAL" ? "oj-ux-ico-error" : alert.grade === "HIGH" ? "oj-ux-ico-warning" : "oj-ux-ico-information-s"
});

const InsightsDataCenter = ({ plan, selectedPillar }: Readonly<{ plan: ConsumptionAnalysisPlan; selectedPillar: ConsumptionPillar }>) => {
  const display = formatConsumptionDataCenter(plan, selectedPillar);
  return <span class="consumption-data-center" aria-label={`Data center count ${display.primary}`}><span>DC {display.primary}</span></span>;
};

export function ConsumptionAnalysisPage({ fiscalYear, fiscalYears, onFiscalYearChange, breadcrumb }: Readonly<{ fiscalYear: FiscalYear; fiscalYears: readonly FiscalYear[]; onFiscalYearChange: (fiscalYear: FiscalYear) => void; breadcrumb?: ComponentChildren }>) {
  const [selectedPillar, setSelectedPillar] = useState<ConsumptionPillar>("ALL");
  const [includeMtd, setIncludeMtd] = useState(false);
  const [selectedSalesRep, setSelectedSalesRep] = useState("");
  const [analysisResponse, setAnalysis] = useState<ConsumptionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAccountContext, setSelectedAccountContext] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [debouncedCandidateSearch, setDebouncedCandidateSearch] = useState("");
  const [candidateComposing, setCandidateComposing] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [selectedAlertId, setSelectedAlertId] = useState("");
  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [selectedMovement, setSelectedMovement] = useState<{ quarter: string; category: ForecastCompositionCategory } | null>(null);
  const [exporting, setExporting] = useState<"png" | "pdf" | "">("");
  const [exportError, setExportError] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastDataLoadedAt, setLastDataLoadedAt] = useState<Date | null>(null);
  const requestGeneration = useRef(0);
  const consumptionComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (candidateComposing) return;
    const timeout = window.setTimeout(() => setDebouncedCandidateSearch(candidateSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [candidateComposing, candidateSearch]);

  useEffect(() => {
    if (!comboboxOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!consumptionComboboxRef.current?.contains(event.target as Node)) setComboboxOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [comboboxOpen]);


  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    void fetchConsumptionAnalysis({ fiscalYear, search: debouncedCandidateSearch, account: selectedAccountContext, salesRep: selectedSalesRep, pillar: selectedPillar, includeMtd })
      .then((value) => {
        if (!active || generation !== requestGeneration.current) return;
        if (!debouncedCandidateSearch && selectedAccountContext && !value.accountCandidates.some((candidate) =>
          candidate.account.toLocaleLowerCase() === selectedAccountContext.toLocaleLowerCase())) {
          setSelectedAccountContext("");
          setCandidateSearch("");
          setDebouncedCandidateSearch("");
          setSelectedAlertId("");
          setSelectedAccountName("");
                return;
        }
        setAnalysis(value);
        setLastDataLoadedAt(new Date());
        if (includeMtd && !value.currentMtdAvailable) setIncludeMtd(false);
        setSelectedAlertId((current) => value.alerts.some((alert) => alert.alertId === current) ? current : "");
        setSelectedAccountName((current) => current && value.accounts.some((account) => account.account === current) ? current : "");
      })
      .catch((reason) => {
        if (active && generation === requestGeneration.current) {
          setError(reason instanceof Error ? reason.message : "Consumption Analysis could not be loaded.");
          if (analysisResponse?.fiscalYear === fiscalYear) {
            setSelectedPillar(analysisResponse.selectedPillar);
            setSelectedSalesRep(analysisResponse.selectedSalesRep ?? "");
            setSelectedAccountContext(analysisResponse.selectedAccount ?? "");
            setCandidateSearch("");
            setDebouncedCandidateSearch("");
          } else if (analysisResponse) {
            setAnalysis(null);
          }
        }
      })
      .finally(() => { if (active && generation === requestGeneration.current) setLoading(false); });
    return () => { active = false; };
  }, [debouncedCandidateSearch, fiscalYear, includeMtd, refreshTrigger, selectedAccountContext, selectedPillar, selectedSalesRep]);

  // Keep the last completed response mounted while same-FY filters refresh.
  // The refresh indicator makes that transition explicit; replacing the
  // response with null here would also remove and recreate the header/filter
  // controls before the request completes.
  const analysis = analysisResponse?.fiscalYear === fiscalYear ? analysisResponse : null;

  const filteredCandidates = useMemo(() => (analysis?.accountCandidates ?? [])
    .filter((candidate) => matchesCandidate(candidate, candidateSearch)), [analysis, candidateSearch]);
  const candidateOptions = useMemo<Array<ConsumptionAnalysisAccountCandidate | null>>(
    () => [null, ...filteredCandidates], [filteredCandidates]);
  const selectedAlert = analysis?.alerts.find((alert) => alert.alertId === selectedAlertId) ?? null;
  const alertPlan = analysis && selectedAlert ? findAlertPlan(analysis, selectedAlert) : null;
  const trendPoints = useMemo(() => selectedAlert && alertPlan
    ? getAlertActualTrend(alertPlan.actualTrend, selectedAlert.periodKey)
    : analysis?.contextActualTrend ?? [], [alertPlan, analysis, selectedAlert]);
  const emphasizedTrendPeriods = useMemo(() => new Set(trendPoints.slice(-4).map((point) => point.periodKey)), [trendPoints]);
  const selectedAccount = analysis?.accounts.find((account) => account.account === selectedAccountName) ?? null;
  const topAccounts = analysis?.accounts.slice(0, 5) ?? [];
  const growthAccounts = useMemo(() => [...(analysis?.accounts ?? [])]
    .filter((account) => account.actualGrowthAmountExact !== null && compareExactDecimals(account.actualGrowthAmountExact, "0") > 0)
    .sort((left, right) => compareExactDecimals(right.actualGrowthAmountExact!, left.actualGrowthAmountExact!)).slice(0, 5), [analysis]);
  const declineAccounts = useMemo(() => [...(analysis?.accounts ?? [])]
    .filter((account) => account.actualGrowthAmountExact !== null && compareExactDecimals(account.actualGrowthAmountExact, "0") < 0)
    .sort((left, right) => compareExactDecimals(left.actualGrowthAmountExact!, right.actualGrowthAmountExact!)).slice(0, 5), [analysis]);
  const attentionAccounts = useMemo(() => (analysis?.accounts ?? [])
    .filter((account) => account.attentionReasons.length > 0)
    .sort((left, right) => compareExactDecimals(right.actualAmountExact, left.actualAmountExact)), [analysis]);
  const selectedPlans = selectedAccount?.workloads.flatMap((workload) =>
    workload.plans.map((plan) => ({ workload: workload.workload, plan, percentageContext: "selected Account" }))) ?? [];

  const selectAccountContext = (account: string) => {
    const refreshRequired = shouldRefreshConsumptionAnalysisContext(selectedAccountContext, account, debouncedCandidateSearch);
    if (refreshRequired) setLoading(true);
    setSelectedAccountContext(account.trim());
    setCandidateSearch("");
    setDebouncedCandidateSearch("");
    setComboboxOpen(false);
    setActiveCandidateIndex(0);
    setSelectedAlertId("");
    setSelectedAccountName("");
    setSelectedMovement(null);
  };

  const selectCandidateAt = (index: number) => selectAccountContext(candidateOptions[index]?.account ?? "");
  const handleComboboxKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setComboboxOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : candidateOptions.length - 1;
      setActiveCandidateIndex((current) => (current + delta) % Math.max(1, candidateOptions.length));
    } else if (event.key === "Enter" && comboboxOpen) {
      event.preventDefault();
      selectCandidateAt(activeCandidateIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setComboboxOpen(false);
      setCandidateSearch("");
    } else if (event.key === "Tab") {
      setComboboxOpen(false);
    }
  };

  const fiscalTotalsChart = useMemo(() => {
    if (!analysis) return chart([]);
    const mtdAmountExact = analysis.mtdSummary?.amountExact ?? "0";
    const overlapAmountExact = analysis.portfolio.forecastOverlapAmountExact;
    const rows = [
      { label: analysis.fiscalYear, actualAmountExact: analysis.portfolio.actualAmountExact, forecastAmountExact: analysis.portfolio.forecastAmountExact,
        mtdAmountExact, overlapAmountExact },
      { label: analysis.priorFiscalYear, actualAmountExact: analysis.portfolio.priorActualAmountExact, forecastAmountExact: analysis.portfolio.priorForecastAmountExact,
        mtdAmountExact: "0", overlapAmountExact: "0" }
    ];
    return chart(rows.flatMap((row) => {
      const finalizedActualExact = subtractExactDecimals(row.actualAmountExact, row.mtdAmountExact);
      const nonOverlappingForecastExact = subtractExactDecimals(row.forecastAmountExact, row.overlapAmountExact);
      const points: InsightChartPoint[] = [
        { id: `${row.label}-actual`, seriesId: "ACTUAL", groupId: row.label, value: exactDecimalToChartCoordinate(finalizedActualExact), color: ACTUAL_COLOR,
          shortDesc: `${row.label} finalized ACTUAL ${formatExactKFixed(finalizedActualExact)}` },
        { id: `${row.label}-forecast`, seriesId: "Open Forecast", groupId: row.label, value: exactDecimalToChartCoordinate(nonOverlappingForecastExact), color: FORECAST_COLOR,
          pattern: "smallDiagonalRight", shortDesc: `${row.label} non-overlapping Open Forecast ${formatExactKFixed(nonOverlappingForecastExact)}` }
      ];
      if (compareExactDecimals(row.mtdAmountExact, "0") > 0) points.splice(1, 0,
        { id: `${row.label}-mtd`, seriesId: "MTD actual", groupId: row.label, value: exactDecimalToChartCoordinate(row.mtdAmountExact), color: MTD_COLOR,
          shortDesc: `${row.label} MTD actual ${formatExactKFixed(row.mtdAmountExact)}` });
      return points;
    }));
  }, [analysis]);
  const quarterTotalsChart = useMemo(() => {
    if (!analysis) return chart([]);
    const mtdQuarter = fiscalQuarterForPeriod(analysis.mtdSummary?.periodKey);
    return chart(analysis.quarters.flatMap((quarter) => {
      const mtdAmountExact = quarter.quarter === mtdQuarter ? analysis.mtdSummary?.amountExact ?? "0" : "0";
      const overlapExact = quarter.forecastOverlapAmountExact;
      const finalizedActualExact = subtractExactDecimals(quarter.actualAmountExact, mtdAmountExact);
      const nonOverlappingForecastExact = subtractExactDecimals(quarter.forecastAmountExact, overlapExact);
      const points: InsightChartPoint[] = [
        { id: `${quarter.quarter}-actual`, seriesId: "ACTUAL", groupId: quarter.quarter, value: exactDecimalToChartCoordinate(finalizedActualExact), color: ACTUAL_COLOR, shortDesc: `${quarter.quarter} finalized ACTUAL ${formatExactKFixed(finalizedActualExact)}` },
        { id: `${quarter.quarter}-forecast`, seriesId: "Open Forecast", groupId: quarter.quarter, value: exactDecimalToChartCoordinate(nonOverlappingForecastExact), color: FORECAST_COLOR, pattern: "smallDiagonalRight", shortDesc: `${quarter.quarter} non-overlapping Open Forecast ${formatExactKFixed(nonOverlappingForecastExact)}` }
      ];
      if (compareExactDecimals(mtdAmountExact, "0") > 0) points.splice(1, 0,
        { id: `${quarter.quarter}-mtd`, seriesId: "MTD actual", groupId: quarter.quarter, value: exactDecimalToChartCoordinate(mtdAmountExact), color: MTD_COLOR,
          shortDesc: `${quarter.quarter} MTD actual ${formatExactKFixed(mtdAmountExact)}` });
      return points;
    }));
  }, [analysis]);
  const movementChart = useMemo(() => {
    if (!analysis) return chart([]);
    return chart(analysis.movementBridge.flatMap((point) => {
      const chartPoint = (category: "All" | "New" | "Expansion" | "Reduction", amountExact: string, color: string) => {
        const signedAmountExact = category === "Reduction" ? negateExactDecimal(amountExact) : amountExact;
        return { id: `${point.quarter}-${category}`, seriesId: category, groupId: point.quarter,
          value: amountExactToKChartCoordinate(signedAmountExact), color,
          shortDesc: `${point.quarter} ${category}${category === "All" ? " Forecast" : ""} ${formatExactKFixed(signedAmountExact)} USD · ${point.includedForecastPeriods.join(", ")}` };
      };
      const points: InsightChartPoint[] = [];
      if (point.totalForecastAmountExact !== null) points.push(chartPoint("All", point.totalForecastAmountExact, "#4b5563"));
      if (point.newAmountExact !== null) points.push(chartPoint("New", point.newAmountExact, MOVEMENT_COLORS.New));
      if (point.expansionAmountExact !== null) points.push(chartPoint("Expansion", point.expansionAmountExact, MOVEMENT_COLORS.Expansion));
      if (point.reductionAmountExact !== null) points.push(chartPoint("Reduction", point.reductionAmountExact, MOVEMENT_COLORS.Reduction));
      return points;
    }));
  }, [analysis]);
  const trendChart = useMemo(() => chart(trendPoints.map((point) => ({
    id: point.periodKey,
    seriesId: "ACTUAL",
    groupId: point.periodKey,
    value: point.actualAmountChartCoordinate,
    color: ACTUAL_COLOR,
    markerSize: emphasizedTrendPeriods.has(point.periodKey) ? 9 : 5,
    shortDesc: `${point.periodKey} ACTUAL ${point.actualAmountExact === null ? "N/A" : formatExactKFixed(point.actualAmountExact)}`
  }))), [emphasizedTrendPeriods, trendPoints]);
  const mtdAppliedTimestamp = analysis?.mtdAsOf ?? analysis?.mtdSummary?.asOf;
  const mtdAppliedDate = formatMtdAppliedDate(mtdAppliedTimestamp);
  const currentFiscalYear = getLatestFiscalYear();
  const currentFiscalYearNumber = Number(currentFiscalYear.slice(2));
  const adjacentFiscalYears = fiscalYears
    .filter((year) => Math.abs(Number(year.slice(2)) - currentFiscalYearNumber) <= 1)
    .sort((left, right) => Number(right.slice(2)) - Number(left.slice(2)));
  const earlierFiscalYears = fiscalYears
    .filter((year) => Number(year.slice(2)) < currentFiscalYearNumber - 1)
    .sort((left, right) => Number(right.slice(2)) - Number(left.slice(2)));
  const handleFiscalYearMenuAction = (event: ojMenu.ojMenuAction) => {
    const year = String(event.detail.selectedValue) as FiscalYear;
    if (fiscalYears.includes(year) && year !== fiscalYear) onFiscalYearChange(year);
  };
  const fiscalYearControl = <oj-menu-button class="consumption-analysis-fy-button oj-button-sm" chroming="outlined"
    aria-label={`Selected fiscal year ${fiscalYear}`}>
    {fiscalYear}
    <oj-menu slot="menu" aria-label="Select fiscal year" onojMenuAction={handleFiscalYearMenuAction}>
      {adjacentFiscalYears.map((year) => <oj-option key={year} value={year}>
        {year === currentFiscalYear ? `${year} · Current` : year}
      </oj-option>)}
      {earlierFiscalYears.length > 0 && <oj-option>Earlier FYs…
        <oj-menu>
          {earlierFiscalYears.map((year) => <oj-option key={year} value={year}>{year}</oj-option>)}
        </oj-menu>
      </oj-option>}
    </oj-menu>
  </oj-menu-button>;
  const messages: ConsumptionMessage[] = error
    ? [{ id: "analysis-load", severity: "error", summary: "데이터를 불러오지 못했습니다.", detail: "잠시 후 다시 시도해 주세요." }]
    : [];
  const refreshAnalysis = () => {
    setLoading(true);
    setRefreshTrigger((current) => current + 1);
  };
  if (!analysis) return <PageShell className="consumption-insights-page consumption-initial-state"
    ariaLabelledBy="consumptionAnalysisTitle" rootAttributes={{ "data-fiscal-year": fiscalYear }}
    breadcrumb={breadcrumb} title="Consumption Analysis" titleControls={fiscalYearControl} headingSpacing="compact"
    busy={loading} busyLabel="Loading Consumption Analysis" onRefresh={refreshAnalysis}
    messages={<ConsumptionMessageBanner messages={messages} onClose={() => setError("")} />}>
    <PageDataProgress busy={loading} busyLabel="Loading Consumption Analysis" />
  </PageShell>;

  const latestCompleteQuarter = [...analysis.quarters].reverse()
    .find((quarter) => quarter.status === "ACTUAL" && quarter.coveragePercent === 100) ?? null;
  const forecastExposureExact = calculateOpenForecastExposureExact(
    analysis.portfolio.forecastAmountExact,
    analysis.portfolio.totalAmountExact,
    analysis.mtdSummary?.amountExact ?? "0"
  );
  const selectedContextLabel = selectedAccountContext || ALL_ACCOUNTS;
  const contributionPeriodLabel = analysis.periodCoverage.actualPeriods.length === 0
    ? "No finalized Actual period"
    : `Finalized Actual periods: ${analysis.periodCoverage.actualPeriods.join(", ")} · MTD excluded`;
  const contextTrendLabel = selectedAccountContext ? `${ALL_ACCOUNTS} · ${selectedAccountContext} filter` : ALL_ACCOUNTS;
  const selectedMovementPoint = selectedMovement ? analysis.movementBridge.find((point) => point.quarter === selectedMovement.quarter) ?? null : null;
  const selectedMovementAccounts = selectedMovement && selectedMovementPoint
    ? filterForecastCompositionAccounts(selectedMovementPoint.accounts, selectedMovement.category) : [];
  const movementValueExact = (account: ConsumptionAnalysis["movementBridge"][number]["accounts"][number]) => selectedMovement?.category === "New"
    ? account.newAmountExact : selectedMovement?.category === "Expansion" ? account.expansionAmountExact : negateExactDecimal(account.reductionAmountExact);
  const periodRange = (periods: readonly string[]) => periods.length === 0 ? "not provided"
    : periods.length === 1 ? periods[0] : `${periods[0]}–${periods[periods.length - 1]}`;
  const attentionCoverageLabel = `Finalized Actual ${periodRange(analysis.periodCoverage.actualPeriods)} + opened Forecast periods ${periodRange(analysis.periodCoverage.forecastPeriods)} · MTD excluded`;
  const displayedActualAmountExact = analysis.portfolio.actualAmountExact;
  const actualLabel = includeMtd && analysis.mtdSummary !== null
    ? `Actual (includes MTD ${formatExactKFixed(analysis.mtdSummary.amountExact, 2)})` : "Actual";

  const compositionTotals = selectedMovementAccounts.reduce((total, account) => ({
    totalForecastAmountExact: addExactDecimals(total.totalForecastAmountExact, account.totalForecastAmountExact),
    newAmountExact: addExactDecimals(total.newAmountExact, account.newAmountExact),
    expansionAmountExact: addExactDecimals(total.expansionAmountExact, account.expansionAmountExact),
    reductionAmountExact: addExactDecimals(total.reductionAmountExact, account.reductionAmountExact)
  }), { totalForecastAmountExact: "0", newAmountExact: "0", expansionAmountExact: "0", reductionAmountExact: "0" });
  const selectMovement = (event: ojChart.ojItemDrill<string, InsightChartPoint, null>) => {
    const { detail } = event;
    const category = detail.series;
    const quarter = Array.isArray(detail.group) ? detail.group[0] : detail.group;
    if ((category === "All" || category === "New" || category === "Expansion" || category === "Reduction") && quarter) setSelectedMovement({ quarter, category });
  };

  const downloadCanvas = async (format: "png" | "pdf") => {
    const target = document.getElementById("consumptionAnalysisExportTarget");
    if (!target || exporting) return;
    setExporting(format);
    setExportError("");
    const finishBusy = beginAppBusy();
    try {
      await document.fonts?.ready;
      const html2canvasModule = html2canvasPro as unknown as {
        default?: (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
        html2canvas?: (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      };
      const renderElement = html2canvasModule.default ?? html2canvasModule.html2canvas
        ?? html2canvasPro as unknown as (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      const canvas = await renderElement(target, {
        backgroundColor: "#f7f7f8",
        scale: Math.min(2, 4096 / Math.max(target.scrollWidth, 1)),
        useCORS: true,
        logging: false,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight
      });
      const filename = `consumption-analysis-${fiscalYear}-${new Date().toISOString().slice(0, 10)}`;
      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const printableHeightPx = Math.floor(canvas.width * pageHeight / pageWidth);
        for (let top = 0, page = 0; top < canvas.height; top += printableHeightPx, page += 1) {
          if (page > 0) pdf.addPage();
          const sliceHeight = Math.min(printableHeightPx, canvas.height - top);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = sliceHeight;
          slice.getContext("2d")?.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageWidth, sliceHeight * pageWidth / canvas.width, undefined, "FAST");
        }
        pdf.save(`${filename}.pdf`);
      }
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      finishBusy();
      setExporting("");
    }
  };

  return <PageShell className="consumption-insights-page" ariaLabelledBy="consumptionAnalysisTitle"
    rootAttributes={{ id: "consumptionAnalysisExportTarget", "data-fiscal-year": fiscalYear, "data-account-context": selectedAccountContext || "all" }}
    breadcrumb={breadcrumb} title="Consumption Analysis" titleControls={fiscalYearControl} headingSpacing="compact"
    busy={loading || !!exporting} busyLabel={exporting ? "Exporting analysis" : "Refreshing analysis"} activityPosition="custom"
    actions={<div class="consumption-import-actions is-compact" data-html2canvas-ignore="true" aria-label="Export current Consumption Analysis view">
      <oj-button class="oj-button-sm" chroming="outlined" disabled={loading || !!exporting}
        title="Export the current Consumption Analysis view as PNG" onojAction={() => void downloadCanvas("png")}>
        <span slot="startIcon" class="oj-ux-ico-download" aria-hidden="true"></span>{exporting === "png" ? "Exporting…" : "PNG"}
      </oj-button>
      <oj-button class="oj-button-sm" chroming="outlined" disabled={loading || !!exporting}
        title="Export the current Consumption Analysis view as PDF" onojAction={() => void downloadCanvas("pdf")}>
        <span slot="startIcon" class="oj-ux-ico-download" aria-hidden="true"></span>{exporting === "pdf" ? "Exporting…" : "PDF"}
      </oj-button>
      {exportError && <span class="consumption-export-error" role="alert">{exportError}</span>}
    </div>}
    messages={<ConsumptionMessageBanner messages={messages} onClose={() => setError("")} />}
    filters={<PageFilterPanel className="consumption-insights-header-actions" ariaLabel="Consumption Analysis filters">
        <div class="consumption-insights-pillar">
          <span>Pillar</span>
          <div class="consumption-pillar-selector" role="group" aria-label="Consumption Analysis pillar">
            {consumptionPillarOptions.map((option) => <button key={option.value} type="button" aria-pressed={selectedPillar === option.value}
              disabled={loading && !analysis}
              onClick={() => { if(option.value===selectedPillar)return; setLoading(true); setSelectedPillar(option.value); setCandidateSearch(""); setDebouncedCandidateSearch(""); setComboboxOpen(false); setActiveCandidateIndex(0); setSelectedAlertId(""); setSelectedAccountName(""); setSelectedMovement(null); }}>{option.label}</button>)}
          </div>
        </div>
        <div class="consumption-insights-context" aria-label="Consumption Analysis filters">
          <div class="consumption-insights-filter consumption-insights-filter--sales-rep">
            <label htmlFor="consumptionSalesRepContext">Sales Rep</label>
            <select id="consumptionSalesRepContext" value={selectedSalesRep}
              onChange={(event) => { setLoading(true); setSelectedSalesRep(event.currentTarget.value); setSelectedAccountContext(""); setSelectedAccountName(""); setSelectedAlertId(""); }}>
              <option value="">All Sales Reps</option>
              {analysis.salesRepOptions.map((salesRep) => <option key={salesRep} value={salesRep}>{salesRep}</option>)}
            </select>
          </div>
          <div class="consumption-insights-filter consumption-insights-filter--account">
            <label htmlFor="consumptionAccountContext">Account</label>
            <div class="consumption-insights-combobox" ref={consumptionComboboxRef}>
            <input id="consumptionAccountContext" type="search" role="combobox" aria-autocomplete="list"
            aria-expanded={comboboxOpen} aria-controls="consumptionAccountOptions"
            aria-activedescendant={comboboxOpen ? `consumption-account-option-${activeCandidateIndex}` : undefined}
            value={comboboxOpen ? candidateSearch : selectedContextLabel}
            placeholder="Search Account"
            onClick={(event) => { setComboboxOpen(true); setCandidateSearch(""); event.currentTarget.select(); }}
            onInput={(event) => { setCandidateSearch(event.currentTarget.value); setComboboxOpen(true); setActiveCandidateIndex(0); }}
            onCompositionStart={() => setCandidateComposing(true)}
            onCompositionEnd={(event) => { setCandidateSearch(event.currentTarget.value); setCandidateComposing(false); }}
            onKeyDown={handleComboboxKeyDown} />
          {selectedAccountContext && <button type="button" class="consumption-insights-clear" aria-label="Clear account" onClick={() => selectAccountContext("")}>Clear</button>}
          {comboboxOpen && <div id="consumptionAccountOptions" class="consumption-insights-options" role="listbox">
            <button id="consumption-account-option-0" type="button" role="option" aria-selected={!selectedAccountContext}
              class={activeCandidateIndex === 0 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => selectAccountContext("")}>
              <strong>All Accounts</strong>
            </button>
            {analysis.accountCandidates.filter((candidate) => matchesCandidate(candidate, candidateSearch)).map((candidate, index) => <button
              id={`consumption-account-option-${index + 1}`} type="button" role="option" key={candidate.account}
              aria-selected={selectedAccountContext === candidate.account} class={activeCandidateIndex === index + 1 ? "is-active" : ""}
              onMouseDown={(event) => event.preventDefault()} onClick={() => selectAccountContext(candidate.account)}>
              <strong>{candidate.account}</strong>
            </button>)}
            {filteredCandidates.length === 0 && <p>No matching Accounts.</p>}
          </div>}
          </div>
        </div>
        </div>
    </PageFilterPanel>}>
    <div class="consumption-records-toolbar consumption-analysis-toolbar" role="toolbar" aria-label="Consumption Analysis data controls" data-html2canvas-ignore="true">
      <div class="consumption-records-toolbar__left">
        <span class="consumption-mtd-control consumption-info-tooltip">
          <button type="button" role="switch" aria-label="Show MTD" aria-checked={includeMtd} aria-describedby="showMtdTooltip"
            disabled={loading || !analysis.currentMtdAvailable} class="consumption-mtd-switch"
            onClick={() => { setLoading(true); setIncludeMtd((current) => !current); }}>
            <span class="consumption-mtd-switch__label">Show MTD<sup aria-hidden="true">!</sup></span><span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
          </button>
          <span id="showMtdTooltip" class="consumption-info-tooltip__content" role="tooltip">MTD is the latest provisional month-to-date actual for the current open period.</span>
        </span>
        {includeMtd && mtdAppliedDate ? <time class="consumption-mtd-applied-date" dateTime={mtdAppliedTimestamp ?? undefined}
          title={mtdAppliedTimestamp ?? undefined}>Updated on {mtdAppliedDate}</time> : null}
      </div>
      <div class="consumption-records-toolbar-activity">
        <PageActivity busy={loading} busyLabel="Refreshing analysis" refreshDisabled={!!exporting}
          onRefresh={refreshAnalysis} lastCompletedAt={lastDataLoadedAt} compactTimestampButton />
      </div>
    </div>
    <PageDataProgress busy={loading} busyLabel="Refreshing analysis" />

    <section class="kpi-panel consumption-sales-rep-overview" aria-labelledby="salesRepOverviewTitle">
      <div class="consumption-section-heading"><div><h2 id="salesRepOverviewTitle">Sales Rep Overview</h2></div>
      </div>
      <div class="consumption-sales-rep-table"><table><thead><tr><th>Sales Rep</th><th>Actual YTD</th><th>YoY same-period Actual</th><th>Covered-period Expected</th><th>Accounts</th><th>Top 3</th><th>Attention</th></tr></thead><tbody>
        {analysis.salesRepOverview.map((row) => <tr key={row.salesRep} class={analysis.selectedSalesRep === row.salesRep ? "is-selected" : ""}>
          <th><button type="button" onClick={() => { setLoading(true); setSelectedSalesRep(row.salesRep); setSelectedAccountContext(""); setSelectedAccountName(""); }}>{row.salesRep}</button></th>
          <td>{formatExactKFixed(row.actualAmountExact)}</td><td class={row.actualGrowthAmountExact === null ? "" : compareExactDecimals(row.actualGrowthAmountExact, "0") < 0 ? "is-negative" : "is-positive"}>
            {row.actualGrowthAmountExact === null ? "N/A"
              : <>{formatExactKFixed(row.actualGrowthAmountExact)} · {row.yoyComparisonStatus === "PRIOR_PERIOD_ZERO" ? "rate N/A" : percentageTextExact(row.actualGrowthPercentExact, true)}</>}
          </td>
          <td>{formatExactKFixed(row.fyExpectedAmountExact)}</td><td>{row.accountCount}</td><td>{percentageTextExact(row.topThreeConcentrationPercentExact)}</td><td>{row.attentionAccountCount}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section class="consumption-insights-kpis" aria-label="Consumption KPIs">
      <article class="kpi-panel"><span>{analysis.fiscalYear} covered-period consumption</span><strong>{formatExactKFixed(analysis.portfolio.totalAmountExact)}</strong><small><span class="consumption-metric is-actual">{actualLabel} {formatExactKFixed(displayedActualAmountExact)}</span><span aria-hidden="true"> · </span><span class="consumption-metric is-forecast"><OpenForecastLabel tooltipId="coveredPeriodForecastTooltip" /> {formatExactKFixed(analysis.portfolio.forecastAmountExact)}</span></small></article>
      <article class="kpi-panel"><span>Latest complete quarter</span><strong>{latestCompleteQuarter ? formatExactKFixed(latestCompleteQuarter.totalAmountExact) : "N/A"}</strong><small class="consumption-metric is-quarter">{latestCompleteQuarter ? <>{latestCompleteQuarter.quarter}<span aria-hidden="true"> · </span><span class={latestCompleteQuarter.qoqChangePercentExact !== null && compareExactDecimals(latestCompleteQuarter.qoqChangePercentExact, "0") < 0 ? "is-negative" : "is-positive"}>{percentageTextExact(latestCompleteQuarter.qoqChangePercentExact, true)} QoQ</span></> : "No complete ACTUAL quarter"}</small></article>
      <article class="kpi-panel"><span><OpenForecastLabel tooltipId="forecastExposureTooltip" tooltipText={OPEN_FORECAST_EXPOSURE_TOOLTIP} /> exposure</span><strong>{forecastExposureExact}%</strong><small><span class="consumption-metric is-forecast">{formatExactKFixed(analysis.portfolio.forecastAmountExact)}</span> of selected total</small></article>
      <article class="kpi-panel"><span>Change alerts</span><strong>{analysis.alerts.length}</strong><small><span class="consumption-metric is-critical">{analysis.alerts.filter((alert) => alert.grade === "CRITICAL").length} critical</span><span aria-hidden="true"> · </span><span class="consumption-metric is-high">{analysis.alerts.filter((alert) => alert.grade === "HIGH").length} high</span></small></article>
    </section>

    <section class="consumption-insights-performance-grid">
      <section class="kpi-panel" aria-labelledby="fyQuarterTotalsTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">{actualLabel} + <OpenForecastLabel tooltipId="totalsHeadingForecastTooltip" /></span><h2 id="fyQuarterTotalsTitle">FY &amp; Quarter totals</h2></div><span class="consumption-insights-legend"><i class="is-actual"></i>Finalized ACTUAL {includeMtd && analysis.mtdSummary && <><i class="is-mtd"></i>MTD actual</>} <i class="is-forecast"></i><OpenForecastLabel tooltipId="totalsLegendForecastTooltip" /></span></div>
        <div class="consumption-insights-total-regions">
          <div class="consumption-insights-fy-total"><h3>Covered-period totals</h3><oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={fiscalTotalsChart} dataLabel={trendChartCoordinateLabel} legend={{ rendered: "off" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label="Covered-period ACTUAL and Open Forecast stacked totals"><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart></div>
          <div class="consumption-insights-totals-divider" role="separator" aria-orientation="vertical"></div>
          <div class="consumption-insights-quarter-totals">
            <h3>{analysis.fiscalYear} Mixed quarter consumption</h3>
            <oj-chart class="consumption-insights-totals-chart" type="bar" orientation="horizontal" stack="on" data={quarterTotalsChart} dataLabel={trendChartCoordinateLabel} legend={{ rendered: "off" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label={`${analysis.fiscalYear} Q1 Q2 Q3 Q4 ACTUAL-first and Open Forecast fallback consumption in K`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>
          </div>
        </div>
      </section>
      <section class="kpi-panel" aria-labelledby="qoqTitle">
        <div class="consumption-section-heading"><div><span class="kpi-section-label">vs previous fiscal quarter</span><h2 id="qoqTitle">Quarter-over-quarter</h2></div></div>
        <div class="consumption-insights-qoq-cards">{analysis.quarters.map((quarter) => <article key={quarter.quarter} class={quarter.qoqChangePercentExact !== null && compareExactDecimals(quarter.qoqChangePercentExact, "0") < 0 ? "is-negative" : "is-positive"}><span>{quarter.quarter}</span><strong>{percentageTextExact(quarter.qoqChangePercentExact, true)}</strong><small class={statusTone(quarter.status)}>{qoqKind(quarter.status)}</small></article>)}</div>

      </section>
    </section>

    <section class="kpi-panel consumption-insights-composition" aria-labelledby="forecastCompositionTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Entered and derived Forecast signals · K USD</span><h2 id="forecastCompositionTitle">Forecast signals by quarter</h2></div></div>
      <div class="consumption-insights-composition-grid" data-quarter-count={analysis.movementBridge.length}>
        <div class="consumption-insights-composition-chart" data-quarter-count={analysis.movementBridge.length}>
          <div class="consumption-insights-composition-legend" aria-label="Forecast signal categories">
            <span><i style="--legend-color:#59636e"></i>All</span>
            {Object.entries(MOVEMENT_COLORS).map(([category, color]) => <span key={category}><i style={`--legend-color:${color}`}></i>{category}</span>)}
          </div>
          <oj-chart class="consumption-insights-composition-chart__plot" type="bar" orientation="horizontal" stack="off" data={movementChart} dataLabel={movementChartCoordinateLabel} xAxis={{ tickLabel: { converter: movementAxisChartCoordinateConverter } }} drilling="on" onojItemDrill={selectMovement} legend={{ rendered: "off" }} styleDefaults={{ dataLabelPosition: "center" }} aria-label="Quarterly All Forecast New Expansion and Reduction as separate K USD amount bars"><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>

        </div>
        <section class="consumption-insights-movement-detail" aria-live="polite" aria-label={selectedMovement ? `${selectedMovement.quarter} ${selectedMovement.category} Account detail` : "Forecast composition detail"}>
          {selectedMovement && selectedMovementPoint ? <>
            <div class="consumption-insights-movement-heading">
              <div><span class="kpi-section-label">Forecast composition detail</span><h3>{selectedMovement.quarter} · {selectedMovement.category}</h3></div>
              <div class="consumption-insights-composition-selector" role="group" aria-label={`${selectedMovement.quarter} composition category`}>
                {COMPOSITION_CATEGORIES.map((category) => <button key={category} type="button" aria-pressed={selectedMovement.category === category}
                  onClick={() => setSelectedMovement({ quarter: selectedMovement.quarter, category })}>{category}</button>)}
              </div>
            </div>
            <div class="consumption-insights-movement-list">
              {selectedMovementAccounts.length > 0 ? <table><thead><tr><th>Account</th>{selectedMovement.category === "All" ? <><th>Total</th><th>New</th><th>Expansion</th><th>Reduction</th></> : <th>{selectedMovement.category}</th>}</tr></thead><tbody>
                {selectedMovementAccounts.map((account) => <tr key={account.account}><td>{account.account}</td>{selectedMovement.category === "All" ? <>
                  <td>{formatExactKFixed(account.totalForecastAmountExact)}</td><td>{formatExactKFixed(account.newAmountExact)}</td><td>{formatExactKFixed(account.expansionAmountExact)}</td><td>{formatExactKFixed(account.reductionAmountExact)}</td>
                </> : <td>{formatExactKFixed(movementValueExact(account))}</td>}</tr>)}
              </tbody>{selectedMovement.category === "All" ? <tfoot><tr><th>Total</th><th>{formatExactKFixed(compositionTotals.totalForecastAmountExact)}</th><th>{formatExactKFixed(compositionTotals.newAmountExact)}</th><th>{formatExactKFixed(compositionTotals.expansionAmountExact)}</th><th>{formatExactKFixed(compositionTotals.reductionAmountExact)}</th></tr></tfoot>
                : <tfoot><tr><th>Total</th><th>{formatExactKFixed(selectedMovementAccounts.reduce((sum, account) => addExactDecimals(sum, movementValueExact(account)), "0"))}</th></tr></tfoot>}</table>
                : <p class="consumption-empty-state">No Account has a visible Forecast amount or confirmed component for this quarter.</p>}
            </div>
          </> : <div class="consumption-insights-composition-empty"><span class="kpi-section-label">Forecast composition detail</span><h3>Select a composition bar</h3></div>}
        </section>
      </div>
    </section>

    <section class="kpi-panel consumption-insights-alert-trend" aria-labelledby="alertTrendTitle">
      <div class="consumption-section-heading"><div><span class="kpi-section-label">Detect change → verify trend</span><h2 id="alertTrendTitle">{"Consumption Change Alerts & linked Plan Trend"}</h2></div><span class="consumption-insights-status is-actual">ACTUAL ONLY</span></div>
      <div class="consumption-insights-alert-trend-grid" data-trend-contract="getAlertActualTrend(actualTrend)">
        <div class="consumption-signal-inbox">{analysis.alerts.map((alert) => { const presentation = alertPresentation(alert); const plan = findAlertPlan(analysis, alert); return <button type="button" key={alert.alertId}
          class={selectedAlert?.alertId === alert.alertId ? "consumption-signal is-selected" : "consumption-signal"}
          aria-pressed={selectedAlert?.alertId === alert.alertId} onClick={() => setSelectedAlertId((current) => current === alert.alertId ? "" : alert.alertId)}>
          <span class="consumption-signal-main"><strong>{alert.account}</strong><span>{alert.workloadMapped && <>{alert.workload} · </>}Plan {alert.planId}{plan && <> · <InsightsDataCenter plan={plan} selectedPillar={analysis.selectedPillar} /></>}</span><span class="consumption-signal-badges"><span class={`consumption-signal-type ${presentation.typeTone}`} aria-label={`Change type ${presentation.typeLabel}`}><i class={presentation.typeIcon} aria-hidden="true"></i>{presentation.typeLabel}</span><span class={`consumption-signal-grade ${presentation.gradeTone}`} aria-label={`Severity ${alert.grade}`}><i class={presentation.gradeIcon} aria-hidden="true"></i>{alert.grade}</span></span></span>
          <span class="consumption-signal-metrics"><strong>{formatExactKFixed(alert.actualAmountExact)}</strong><small>{signedCurrencyExact(alert.changeAmountExact)} · {percentageTextExact(alert.changePercentExact, true)}</small></span>
        </button>; })}{analysis.alerts.length === 0 && <p class="consumption-empty-state">No ACTUAL usage change alerts for this context.</p>}</div>
        <div class="consumption-insights-linked-trend">
          <div><h3>ACTUAL Trend</h3><p>{selectedAlert ? `${selectedAlert.account} · ${selectedAlert.workloadMapped ? `${selectedAlert.workload} · ` : ""}${selectedAlert.planId}` : contextTrendLabel}</p></div>
          {trendPoints.length === 6 ? <oj-chart class="consumption-insights-actual-chart" type="line" data={trendChart} legend={{ rendered: "off" }}
            dataLabel={trendChartCoordinateLabel} styleDefaults={{ dataLabelPosition: "aboveMarker", dataLabelCollision: "fitInBounds", hideOverlappingLabels: "on", markerDisplayed: "on" }}
            aria-label={`${selectedAlert ? "Selected Plan" : contextTrendLabel} six-month ACTUAL Trend`}><template slot="itemTemplate" render={renderInsightChartItem}></template></oj-chart>
            : <p class="consumption-empty-state">Six contiguous ACTUAL months ending at the alert month are unavailable.</p>}
          {selectedAlert && <p class="consumption-signal-reason"><strong>Why flagged:</strong> {selectedAlert.reason}</p>}
        </div>
      </div>
    </section>

    <section class="consumption-sales-account-review" aria-label="Sales Account growth and attention">
      <section class="kpi-panel consumption-sales-account-card"><div class="consumption-section-heading"><div><span class="kpi-section-label">YoY same-period ACTUAL contribution · K USD</span><h2>Account Growth / Reduction</h2></div></div>
        <div class="consumption-sales-movement-columns">
          <div><h3>Growth</h3>{growthAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}><span>{account.account}</span><strong>{formatExactKFixed(account.actualGrowthAmountExact!)}</strong></button>)}{growthAccounts.length === 0 && <p class="consumption-empty-state">No growing Accounts.</p>}</div>
          <div><h3>Reduction</h3>{declineAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}><span>{account.account}</span><strong>{formatExactKFixed(account.actualGrowthAmountExact!)}</strong></button>)}{declineAccounts.length === 0 && <p class="consumption-empty-state">No Accounts with YoY reduction.</p>}</div>
        </div>
      </section>
      <section class="kpi-panel consumption-sales-account-card"><div class="consumption-section-heading"><div><span class="kpi-section-label">Reason-based review</span><h2>Attention Accounts <InfoTooltip id="attentionAccountsTooltip" label="Explain Attention Accounts coverage" text={attentionCoverageLabel} /></h2></div></div>
        <div class="consumption-sales-attention-list">{attentionAccounts.map((account) => <button type="button" key={account.account} onClick={() => selectAccountContext(account.account)}>
          <span><strong>{account.account}</strong><small>{account.salesRep} · {account.attentionReasons.join(" · ")}</small></span>
          <span class="consumption-sales-attention-amounts"><strong>Actual {formatExactKFixed(account.actualAmountExact)}</strong><small>{account.forecastEntryStatus === "MISSING"
            ? "Forecast missing · Covered-period expected unavailable"
            : account.forecastEntryStatus === "ZERO"
              ? <><OpenForecastLabel /> {formatExactKFixed(account.forecastAmountExact)} (entered as 0) · Covered-period expected {formatExactKFixed(addExactDecimals(account.actualAmountExact, account.forecastAmountExact))}</>
              : <><OpenForecastLabel /> {formatExactKFixed(account.forecastAmountExact)} · Covered-period expected {formatExactKFixed(addExactDecimals(account.actualAmountExact, account.forecastAmountExact))}</>}</small></span>
        </button>)}{attentionAccounts.length === 0 && <p class="consumption-empty-state">No Accounts require attention for this context.</p>}</div>
      </section>
    </section>

    <section class="consumption-insights-contribution" aria-label="Account to Plan contribution">
      <span class="kpi-section-label">Account Contribution → Plan Contribution · ACTUAL ONLY</span>
      <div class="consumption-insights-contribution-grid">
        <section class="kpi-panel" aria-labelledby="accountContributionTitle"><div class="consumption-section-heading"><div><h2 id="accountContributionTitle">Account Contribution <InfoTooltip id="accountContributionTooltip" label="Explain Account Contribution coverage" text={`${selectedContextLabel} · ${contributionPeriodLabel}`} /></h2></div></div>
          <div class="consumption-insights-contribution-list">{topAccounts.map((account) => <button type="button" key={account.account}
            class={selectedAccount?.account === account.account ? "is-selected" : ""} aria-pressed={selectedAccount?.account === account.account}
            onClick={() => setSelectedAccountName(account.account)}>
            <span>{account.account} · {account.salesRep}</span><strong>{formatExactKFixed(account.actualAmountExact)}</strong><small>{contributionPercentText(account.percentageExact)} · {actualEntryText(account.actualEntryStatus, account.actualAmountExact)}</small><i><b style={`width:${contributionBarWidthChartCoordinate(account.percentageExact)}%`}></b></i>
          </button>)}</div>
        </section>
        <section class="kpi-panel" aria-labelledby="planContributionTitle"><div class="consumption-section-heading"><div><h2 id="planContributionTitle">Plan Contribution <InfoTooltip id="planContributionTooltip" label="Explain Plan Contribution coverage" text={`${selectedAccount?.account ?? "Select an Account"} · ${contributionPeriodLabel}`} /></h2></div></div>
          <div class="consumption-insights-plan-list">{selectedPlans.map(({ workload, plan, percentageContext }) => <article key={plan.serverPlanId}><div><strong>{plan.endUser}</strong><span class={statusTone(plan.status)}>{plan.status}</span></div><small>{!isUnmappedConsumptionLabel(workload) && <><b>{workload}</b> · </>}Plan {plan.planId} · <InsightsDataCenter plan={plan} selectedPillar={analysis.selectedPillar} /> · {contributionPercentText(plan.percentageExact)} of {percentageContext}</small><div class="consumption-insights-plan-track" aria-label={`${contributionPercentText(plan.percentageExact)} of ${percentageContext}; ACTUAL ${formatExactKFixed(plan.actualAmountExact)}`}><div class="consumption-insights-split-bar" style={`width:${contributionBarWidthChartCoordinate(plan.percentageExact)}%`}><i class="is-actual" style="width:100%"></i></div></div><span>ACTUAL {formatExactKFixed(plan.actualAmountExact)} · {actualEntryText(plan.actualEntryStatus, plan.actualAmountExact)}</span></article>)}{selectedPlans.length === 0 && <p class="consumption-empty-state">No Plan contribution is available.</p>}</div>
        </section>
      </div>
    </section>
  </PageShell>;
}
