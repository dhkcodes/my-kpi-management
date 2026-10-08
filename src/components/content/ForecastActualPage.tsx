import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { KeyboardEvent } from "preact/compat";
import "ojs/ojprogress-circle";
import "ojs/ojbutton";
import "ojs/ojmenu";
import "ojs/ojoption";
import type { ojMenu } from "ojs/ojmenu";
import { fetchForecastActualComparison, type ForecastActualComparison, type ForecastActualMode, type ForecastActualRow } from "../../data/consumptionApi";
import { consumptionPillarOptions, type ConsumptionPillar } from "../../data/consumptionData";
import {
  assessForecastActualMonth,
  assessForecastActualQuarter,
  FORECAST_ACTUAL_QUARTERS,
  forecastActualQuarterForPeriod,
  visibleForecastActualPeriods,
  type ForecastActualQuarter,
  type ForecastActualQuarterResult,
  type ForecastActualQuarterStatus
} from "../../data/forecastActualAssessment";
import { compareForecastActualRows, type ForecastActualSortDirection, type ForecastActualSortKey } from "../../data/forecastActualSort";
import { addExactDecimals, compareExactDecimals, formatExactKFixed } from "../../data/exactDecimal";
import { FiscalYear, getLatestFiscalYear } from "../../data/kpiMockData";

import { PageActivity, PageDataProgress, PageFilterPanel, PageShell } from "../common/PageShell";
import { ConsumptionMtdControl } from "./ConsumptionMtdControl";

const formatAmount = (value: string | null, unavailable = "Unconfirmed") => value === null ? unavailable : formatExactKFixed(value, 2);
const renderTotalAmount = (value: string | null) => value === null
  ? <span class="forecast-actual-value-badge is-na">N/A</span>
  : formatAmount(value);
const SortIndicator = ({ active, direction }: { active: boolean; direction: ForecastActualSortDirection }) => active
  ? <span class={`forecast-actual-sort-indicator is-${direction}`} aria-hidden="true"></span> : null;
const shortStatus = (label: string) => {
  return label;
};
const statusTooltip = (label: string, tooltip: string) => {
  if (label === "Confirmed Shortfall") return `Confirmed Shortfall means confirmed Final Actual is below Forecast. ${tooltip}`;
  if (label === "Projected Shortfall") return `Projected Shortfall means projected month-end Actual is below Forecast; it is not a confirmed Final Actual gap. ${tooltip}`;
  if (label === "Projected On Track") return `Projected month-end Actual is on track against Forecast. ${tooltip}`;
  if (label === "Actual Pending") return `Actual is not confirmed, so Forecast and Actual cannot be compared yet. ${tooltip}`;
  return tooltip;
};
const monthByPeriod = (row: ForecastActualRow, periodKey: string) => row.months.find((month) => month.periodKey === periodKey);
const MONTH_NAMES: Readonly<Record<string, string>> = Object.freeze({
  JAN: "JANUARY", FEB: "FEBRUARY", MAR: "MARCH", APR: "APRIL", MAY: "MAY", JUN: "JUNE",
  JUL: "JULY", AUG: "AUGUST", SEP: "SEPTEMBER", OCT: "OCTOBER", NOV: "NOVEMBER", DEC: "DECEMBER"
});
const monthLabel = (periodKey: string) => {
  const code = periodKey.split("-")[1] ?? periodKey;
  return MONTH_NAMES[code] ?? code;
};

type QuarterResultFilter = Readonly<{ quarter: ForecastActualQuarter; status: "SHORTFALL" | "MATCHED" | "EXCEEDED" }>;
const resultLabel = (status: ForecastActualQuarterStatus, inProgress = false) => ({
  SHORTFALL: inProgress ? "Remaining to Target" : "Confirmed Shortfall", MATCHED: "Matched", EXCEEDED: "Exceeded", NO_FORECAST: "N/A",
  MISSING_ACTUAL: "Actual Pending", PARTIAL_ACTUAL: "Actual Pending", FUTURE: "Actual Pending"
}[status]);
const resultTooltip = (result: ForecastActualQuarterResult) => {
  if (result.status === "MATCHED") return "Matched means the quarter difference is exactly zero; the displayed amount is the zero difference, not the sum of matched Actual.";
  if (result.status === "SHORTFALL") return "Shortfall is the positive amount by which the full stored quarter Forecast exceeds quarter Actual.";
  if (result.status === "EXCEEDED") return "Exceeded is the amount by which quarter Actual exceeds the full stored quarter Forecast.";
  if (result.status === "NO_FORECAST") return "No Forecast has been stored for this Account and quarter; an explicit zero Forecast is still comparable.";
  if (result.status === "PARTIAL_ACTUAL") return "Actual is available for only part of the quarter, so no quarter gap is classified yet.";
  if (result.status === "FUTURE") return "This quarter is in the future; Actual is not expected yet.";
  return "Quarter Actual is missing, so no gap is classified.";
};
const sumQuarterValue = (results: readonly ForecastActualQuarterResult[], selector: (result: ForecastActualQuarterResult) => string | null) => {
  const values = results.map(selector).filter((value): value is string => value !== null);
  return values.length ? values.reduce((total, value) => addExactDecimals(total, value), "0") : null;
};
const sumMonthlyValue = (rows: readonly ForecastActualRow[], periodKey: string, selector: (month: ForecastActualRow["months"][number]) => string | null) => {
  const values = rows.map((row) => monthByPeriod(row, periodKey))
    .filter((month): month is ForecastActualRow["months"][number] => Boolean(month))
    .map(selector).filter((value): value is string => value !== null);
  return values.length ? values.reduce((total, value) => addExactDecimals(total, value), "0") : null;
};
const sumDifferenceBySign = (rows: readonly ForecastActualRow[], periodKey: string, sign: "NEGATIVE" | "POSITIVE") => {
  const values = rows.map((row) => monthByPeriod(row, periodKey)?.differenceAmount ?? null)
    .filter((value): value is string => value !== null)
    .filter((value) => sign === "NEGATIVE" ? compareExactDecimals(value, "0") < 0 : compareExactDecimals(value, "0") > 0);
  return values.length ? values.reduce((total, value) => addExactDecimals(total, value), "0") : null;
};
const latestMtdAppliedTimestamp = (comparison: ForecastActualComparison): string | null => {
  const timestamps = comparison.rows.flatMap((row) => row.months)
    .filter((month) => month.actualState === "MTD" && month.actualAsOf)
    .map((month) => month.actualAsOf as string)
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter(({ time }) => !Number.isNaN(time)).sort((left, right) => left.time - right.time);
  return timestamps[timestamps.length - 1]?.value ?? null;
};

export const ForecastActualPage = ({ fiscalYear, fiscalYears, onFiscalYearChange, breadcrumb }: Readonly<{
  fiscalYear: FiscalYear;
  fiscalYears: readonly FiscalYear[];
  onFiscalYearChange: (fiscalYear: FiscalYear) => void;
  breadcrumb?: ComponentChildren;
}>) => {
  const [quarter, setQuarter] = useState("ALL");
  const [pillar, setPillar] = useState<ConsumptionPillar>("ALL");
  const [actualMode, setActualMode] = useState<ForecastActualMode>("FINAL");
  const [salesRep, setSalesRep] = useState("");
  const [account, setAccount] = useState("");
  const [data, setData] = useState<ForecastActualComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<ForecastActualSortKey>("account");
  const [sortDirection, setSortDirection] = useState<ForecastActualSortDirection>("asc");
  const [resultFilter, setResultFilter] = useState<QuarterResultFilter | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<Date | null>(null);
  const [jetControlsReady, setJetControlsReady] = useState(false);
  const [mtdAppliedTimestamp, setMtdAppliedTimestamp] = useState<string | null>(null);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const [debouncedAccountSearch, setDebouncedAccountSearch] = useState("");
  const [accountComposing, setAccountComposing] = useState(false);
  const [accountOptionCache, setAccountOptionCache] = useState<string[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [matrixScrollState, setMatrixScrollState] = useState({ left: 0, max: 0 });
  const accountComboboxRef = useRef<HTMLDivElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const matrixFrameRef = useRef<HTMLDivElement>(null);
  const matrixScrollRef = useRef<HTMLElement>(null);
  const viewportControlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all(["oj-menu-button", "oj-menu"].map((name) => customElements.whenDefined(name)))
      .then(() => { if (active) setJetControlsReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSalesRep(""); setAccount(""); setAccountSearch(""); setAccountOptionCache([]); setResultFilter(null);
  }, [fiscalYear]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetchForecastActualComparison({ fiscalYear, quarter: "ALL", pillar, actualMode, salesRep, account }, controller.signal)
      .then(async (next) => {
        let appliedTimestamp = latestMtdAppliedTimestamp(next);
        if (!appliedTimestamp && actualMode === "FINAL" && next.currentMtdAvailable) {
          const metadata = await fetchForecastActualComparison(
            { fiscalYear, quarter: "ALL", pillar, actualMode: "MTD", salesRep, account }, controller.signal);
          appliedTimestamp = latestMtdAppliedTimestamp(metadata);
        }
        if (!controller.signal.aborted) {
          setData(next); setMtdAppliedTimestamp(appliedTimestamp); setLastCompletedAt(new Date());
        }
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load Forecast vs Actual."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fiscalYear, pillar, actualMode, salesRep, account, refreshNonce]);

  useEffect(() => {
    if (!accountSearchOpen) return;
    const close = (event: PointerEvent) => { if (!accountComboboxRef.current?.contains(event.target as Node)) setAccountSearchOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [accountSearchOpen]);

  useEffect(() => {
    if (accountComposing) return;
    const timeout = window.setTimeout(() => setDebouncedAccountSearch(accountSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [accountComposing, accountSearch]);

  useEffect(() => {
    if (!data) return;
    if (account && !data.accountOptions.includes(account)) {
      setAccount(""); setAccountSearch(""); setAccountSearchOpen(false); setActiveAccountIndex(0);
      return;
    }
    if (!account) setAccountOptionCache(data.accountOptions);
  }, [account, data]);

  useEffect(() => {
    if (data && !data.currentMtdAvailable && actualMode === "MTD") setActualMode("FINAL");
  }, [actualMode, data]);

  // Preserve the previous result while the next filtered request is in flight.
  // The effect cleanup guards against stale responses replacing newer ones.
  const currentData = data;
  const contentReady = jetControlsReady && currentData !== null;

  const allPeriods = useMemo(
    () => visibleForecastActualPeriods(currentData?.fullForecastPeriods ?? [], currentData?.rows ?? []),
    [currentData]
  );
  const periods = useMemo(() => quarter === "ALL" ? allPeriods
    : allPeriods.filter((periodKey) => forecastActualQuarterForPeriod(periodKey) === quarter), [allPeriods, quarter]);
  const quarterResultsByAccount = useMemo(() => {
    const map = new Map<string, Readonly<Record<ForecastActualQuarter, ForecastActualQuarterResult>>>();
    const rowsByAccount = new Map<string, ForecastActualRow[]>();
    for (const row of currentData?.rows ?? []) rowsByAccount.set(row.account, [...(rowsByAccount.get(row.account) ?? []), row]);
    for (const [accountName, accountRows] of rowsByAccount) map.set(accountName, {
      Q1: assessForecastActualQuarter(accountRows, "Q1", new Date(), currentData?.actualMode ?? actualMode),
      Q2: assessForecastActualQuarter(accountRows, "Q2", new Date(), currentData?.actualMode ?? actualMode),
      Q3: assessForecastActualQuarter(accountRows, "Q3", new Date(), currentData?.actualMode ?? actualMode),
      Q4: assessForecastActualQuarter(accountRows, "Q4", new Date(), currentData?.actualMode ?? actualMode)
    });
    return map;
  }, [currentData]);
  const quarterCards = useMemo(() => FORECAST_ACTUAL_QUARTERS.map((cardQuarter) => {
    const results = Array.from(quarterResultsByAccount.values()).map((byQuarter) => byQuarter[cardQuarter]);
    const statusAmount = (status: QuarterResultFilter["status"]) => sumQuarterValue(
      results.filter((result) => result.status === status), (result) => result.relevantAmount
    ) ?? "0";
    return {
      quarter: cardQuarter,
      forecastAmount: sumQuarterValue(results, (result) => result.forecastAmount),
      actualAmount: sumQuarterValue(results, (result) => result.actualAmount),
      shortfallAmount: statusAmount("SHORTFALL"), matchedAmount: statusAmount("MATCHED"), exceededAmount: statusAmount("EXCEEDED")
    };
  }), [quarterResultsByAccount]);
  const rows = useMemo(() => {
    const filtered = (currentData?.rows ?? []).filter((row) => !resultFilter
      || quarterResultsByAccount.get(row.account)?.[resultFilter.quarter].status === resultFilter.status);
    return filtered.sort((left, right) => {
      if (resultFilter) {
        if (resultFilter.status !== "MATCHED") {
          const leftAmount = quarterResultsByAccount.get(left.account)?.[resultFilter.quarter].relevantAmount ?? "0";
          const rightAmount = quarterResultsByAccount.get(right.account)?.[resultFilter.quarter].relevantAmount ?? "0";
          const byAmount = compareExactDecimals(rightAmount, leftAmount);
          if (byAmount) return byAmount;
        }
        return left.account.localeCompare(right.account, undefined, { sensitivity: "base" })
          || left.salesRep.localeCompare(right.salesRep, undefined, { sensitivity: "base" });
      }
      const compared = compareForecastActualRows(left, right, sortKey, sortDirection);
      return compared || left.account.localeCompare(right.account, undefined, { sensitivity: "base" });
    });
  }, [currentData, quarterResultsByAccount, resultFilter, sortDirection, sortKey]);
  const monthlyTotals = useMemo(() => Object.fromEntries(periods.map((periodKey) => [periodKey, {
    forecast: sumMonthlyValue(rows, periodKey, (month) => month.forecastAmount),
    actual: sumMonthlyValue(rows, periodKey, (month) => month.actualAmount),
    shortfall: sumDifferenceBySign(rows, periodKey, "NEGATIVE"),
    exceeded: sumDifferenceBySign(rows, periodKey, "POSITIVE")
  }])) as Record<string, Readonly<{ forecast: string | null; actual: string | null; shortfall: string | null; exceeded: string | null }>>, [periods, rows]);
  const displayedActualMode = currentData?.actualMode ?? actualMode;

  const accountOptions = account ? accountOptionCache : (data?.accountOptions ?? accountOptionCache);
  const filteredAccountOptions = useMemo(() => {
    const query = debouncedAccountSearch.toLocaleLowerCase();
    return accountOptions.filter((option) => !query || option.toLocaleLowerCase().includes(query));
  }, [accountOptions, debouncedAccountSearch]);


  const toggleSort = (key: ForecastActualSortKey) => {
    if (sortKey === key) return setSortDirection((current) => current === "asc" ? "desc" : "asc");
    setSortKey(key); setSortDirection(key === "salesRep" || key === "account" ? "asc" : "desc");
  };
  const ariaSort = (key: ForecastActualSortKey): "ascending" | "descending" | "none" => sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
  const resetAccountScope = () => { setAccount(""); setAccountSearch(""); setAccountSearchOpen(false); setAccountOptionCache([]); setActiveAccountIndex(0); setResultFilter(null); };
  const chooseAccount = (value: string) => { setAccount(value); setAccountSearch(""); setAccountSearchOpen(false); setActiveAccountIndex(0); setResultFilter(null); };
  const handleAccountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setAccountSearchOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveAccountIndex((current) => Math.max(0, Math.min(filteredAccountOptions.length, current + direction)));
    } else if (event.key === "Enter" && accountSearchOpen) {
      event.preventDefault(); chooseAccount(activeAccountIndex === 0 ? "" : filteredAccountOptions[activeAccountIndex - 1] ?? "");
    } else if (event.key === "Escape") { setAccountSearchOpen(false); setAccountSearch(""); }
  };
  const toggleResultFilter = (nextQuarter: ForecastActualQuarter, status: QuarterResultFilter["status"]) => {
    setQuarter(nextQuarter);
    setResultFilter((current) => current?.quarter === nextQuarter && current.status === status ? null : { quarter: nextQuarter, status });
  };

  const currentQuarter = forecastActualQuarterForPeriod(`FY00-${new Date().toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}`) ?? "Q1";
  const displayedResultQuarter = (resultFilter?.quarter ?? (quarter === "ALL" ? currentQuarter : quarter)) as ForecastActualQuarter;
  const selectedRangeResults = Array.from(quarterResultsByAccount.values()).flatMap((result) => quarter === "ALL"
    ? FORECAST_ACTUAL_QUARTERS.map((value) => result[value])
    : [result[quarter as ForecastActualQuarter]]);
  const selectedTotalForecast = sumQuarterValue(selectedRangeResults, (result) => result.forecastAmount);
  const selectedTotalActual = sumQuarterValue(selectedRangeResults, (result) => result.actualAmount);
  const selectedMtdActual = periods.map((periodKey) => sumMonthlyValue(rows, periodKey,
    (month) => month.actualState === "MTD" ? month.actualAmount : null))
    .filter((value): value is string => value !== null)
    .reduce((total, value) => addExactDecimals(total, value), "0");
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
  const fiscalYearControl = <oj-menu-button class="consumption-analysis-fy-button forecast-actual-fy-button oj-button-sm" chroming="outlined"
    aria-label={`Selected fiscal year ${fiscalYear}`}>
    {fiscalYear}
    <oj-menu class="consumption-analysis-fy-menu" slot="menu" aria-label="Select fiscal year" onojMenuAction={handleFiscalYearMenuAction}>
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
  const updateViewportControls = () => {
    const root = pageScrollRef.current;
    const frame = matrixFrameRef.current;
    const controls = viewportControlsRef.current;
    const viewport = matrixScrollRef.current;
    if (!root || !frame || !controls || !viewport) return;

    const rootRect = root.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const tableRect = viewport.getBoundingClientRect();
    const rootTop = Math.max(0, rootRect.top);
    const rootBottom = Math.min(window.innerHeight, rootRect.bottom);
    const centerY = (rootTop + rootBottom) / 2;
    const left = Math.max(rootRect.left, frameRect.left, 0);
    const right = Math.min(rootRect.right, frameRect.right, window.innerWidth);
    const centerX = left + Math.max(0, right - left) / 2;
    const tableVisible = viewport.scrollWidth > viewport.clientWidth + 1
      && rootBottom > rootTop
      && tableRect.bottom > rootTop
      && tableRect.top < rootBottom
      && centerY >= tableRect.top
      && centerY <= tableRect.bottom;

    controls.dataset.visible = tableVisible ? "true" : "false";
    controls.style.setProperty("--consumption-viewport-center-x", `${centerX}px`);
    controls.style.setProperty("--consumption-viewport-center-y", `${centerY}px`);
    controls.style.setProperty("--consumption-viewport-left", `${left}px`);
    controls.style.setProperty("--consumption-viewport-right", `${right}px`);
  };
  const updateMatrixScrollState = () => {
    const viewport = matrixScrollRef.current;
    if (!viewport) return;
    const matrix = viewport.querySelector<HTMLElement>(".forecast-actual-matrix");
    // Sticky leading columns can inflate scrollWidth beyond the table's actual right edge.
    // Clamp to the rendered table width so the final month ends at the viewport edge.
    const contentWidth = matrix?.offsetWidth ?? viewport.scrollWidth;
    const max = Math.max(0, Math.round(contentWidth - viewport.clientWidth));
    if (viewport.scrollLeft > max) viewport.scrollLeft = max;
    setMatrixScrollState({
      left: Math.round(viewport.scrollLeft),
      max
    });
    updateViewportControls();
  };
  const scrollMatrix = (direction: -1 | 1) => {
    const viewport = matrixScrollRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * Math.max(320, viewport.clientWidth * .78), behavior: "smooth" });
    window.setTimeout(updateMatrixScrollState, 240);
  };

  useEffect(() => {
    const root = pageScrollRef.current;
    const frame = matrixFrameRef.current;
    const viewport = matrixScrollRef.current;
    if (!root || !frame || !viewport) return undefined;
    const update = () => window.requestAnimationFrame(updateMatrixScrollState);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(root);
    resizeObserver.observe(frame);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", update);
    update();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [currentData, periods.length, rows.length]);

  return <PageShell className="consumption-insights-page forecast-actual-page" ariaLabelledBy="forecastActualTitle"
    scrollElementRef={(element) => { pageScrollRef.current = element; }} onScroll={updateViewportControls}
    breadcrumb={breadcrumb} title="Forecast vs Actual" titleControls={fiscalYearControl} headingSpacing="compact"
    activityPosition="custom" busy={loading} busyLabel="Loading Forecast vs Actual results"
    filters={contentReady ? <PageFilterPanel className="forecast-actual-toolbar" ariaLabel="Forecast vs Actual filters">
      <div class="forecast-actual-control forecast-actual-pillar"><span>Pillar</span><div class="consumption-pillar-selector" role="group" aria-label="Forecast vs Actual pillar">
        {consumptionPillarOptions.map((option) => <button key={option.value} type="button" aria-pressed={pillar === option.value}
          onClick={() => { if (option.value === pillar) return; setPillar(option.value); setSalesRep(""); resetAccountScope(); }}>{option.label}</button>)}
      </div></div>
      <label class="forecast-actual-control">Quarter<select id="forecastActualQuarter" value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); setResultFilter(null); }}><option value="ALL">All</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></label>
      <label class="forecast-actual-control">Sales Rep<select id="forecastActualSalesRep" value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccountScope(); }}><option value="">All</option>{data?.salesRepOptions.map((value) => <option value={value}>{value}</option>)}</select></label>
      <div class="forecast-actual-control forecast-actual-search-panel">
        <label htmlFor="forecastActualAccountSearch">Account</label>
        <div class="consumption-insights-combobox forecast-actual-account-search" ref={accountComboboxRef}>
          <input id="forecastActualAccountSearch" type="search" role="combobox" aria-autocomplete="list" aria-expanded={accountSearchOpen} aria-controls="forecastActualAccountOptions"
            aria-activedescendant={accountSearchOpen ? `forecast-actual-account-option-${activeAccountIndex}` : undefined}
            value={accountSearchOpen ? accountSearch : (account || "All")}
            onFocus={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
            onClick={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
            onInput={(event) => { setAccountSearch(event.currentTarget.value); setAccount(""); setAccountSearchOpen(true); setActiveAccountIndex(0); setResultFilter(null); }}
            onCompositionStart={() => setAccountComposing(true)} onCompositionEnd={(event) => { setAccountComposing(false); setAccountSearch(event.currentTarget.value); }} onKeyDown={handleAccountKeyDown} />
          {account && <button type="button" class="consumption-insights-clear" aria-label="Clear selected account" onClick={() => chooseAccount("")}>Clear</button>}
          {accountSearchOpen && <div id="forecastActualAccountOptions" class="consumption-insights-options" role="listbox">
            <button id="forecast-actual-account-option-0" type="button" role="option" aria-selected={!account} class={activeAccountIndex === 0 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount("")}><strong>All accounts</strong><small>전체 Account 보기</small></button>
            {filteredAccountOptions.map((value, index) => <button key={value} id={`forecast-actual-account-option-${index + 1}`} type="button" role="option" aria-selected={account === value} class={activeAccountIndex === index + 1 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount(value)}><strong>{value}</strong></button>)}
            {!filteredAccountOptions.length && <p>No matching accounts.</p>}
          </div>}
        </div>
      </div>
    </PageFilterPanel> : undefined}>

    {error && <div class="consumption-inline-error" role="alert"><strong>Unable to load comparison</strong><span>{error}</span></div>}
    <PageDataProgress busy={!contentReady && !error} busyLabel="Loading Forecast vs Actual results" />

    {contentReady && currentData && <div class="forecast-actual-results" aria-busy="false">
      <div class="consumption-records-toolbar consumption-analysis-toolbar forecast-actual-data-toolbar" role="toolbar" aria-label="Forecast vs Actual data controls">
        <div class="consumption-records-toolbar__left">
          <ConsumptionMtdControl checked={actualMode === "MTD"} disabled={loading || !currentData?.currentMtdAvailable}
            mtdAppliedDate={mtdAppliedTimestamp}
            onToggle={() => { setResultFilter(null); setActualMode((current) => current === "MTD" ? "FINAL" : "MTD"); }}
            tooltipId="forecast-show-mtd-tooltip" />
        </div>
        <div class="consumption-records-toolbar-activity">
          <PageActivity busy={loading} busyLabel="Loading Forecast vs Actual results"
            onRefresh={() => setRefreshNonce((value) => value + 1)} lastCompletedAt={lastCompletedAt}
            showBusyLabel={false} compactTimestampButton />
        </div>
      </div>
      <section class="forecast-actual-overview" aria-label="Selected scope totals and quarter results">
        <div class="forecast-actual-total-strip" aria-label="Selected scope totals">
          <span class="forecast-actual-total-card forecast-actual-total-card--actual"><small>Total Actual</small><span class="forecast-actual-total-value"><strong>{formatAmount(selectedTotalActual, "N/A")}</strong>
            {displayedActualMode === "MTD" && <em class="forecast-actual-total-mtd">(MTD <mark>{formatAmount(selectedMtdActual, "N/A")}</mark>)</em>}
          </span></span>
          <span class="forecast-actual-total-card forecast-actual-total-card--forecast"><small>Total Forecast</small><strong>{formatAmount(selectedTotalForecast, "N/A")}</strong></span>
        </div>
        <div class="forecast-actual-quarter-cards" aria-label="Quarter results">
        {quarterCards.map((card) => {
          return <article key={card.quarter} class={quarter === card.quarter || resultFilter?.quarter === card.quarter ? "is-selected" : ""}
            role="button" tabIndex={0} aria-pressed={quarter === card.quarter || resultFilter?.quarter === card.quarter}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              if (quarter === card.quarter || resultFilter?.quarter === card.quarter) {
                setQuarter("ALL");
                setResultFilter(null);
              } else {
                setQuarter(card.quarter);
                setResultFilter(null);
              }
            }} onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (quarter === card.quarter || resultFilter?.quarter === card.quarter) { setQuarter("ALL"); setResultFilter(null); }
              else { setQuarter(card.quarter); setResultFilter(null); }
            }}>
            <header><strong>{card.quarter}</strong><small class={fiscalYear === currentFiscalYear && card.quarter === currentQuarter ? "is-in-progress" : "is-quarter-result"}>{fiscalYear === currentFiscalYear && card.quarter === currentQuarter ? "In progress" : "Quarter result"}</small></header>
            <div class="forecast-actual-quarter-actions">
              {(["SHORTFALL", "MATCHED", "EXCEEDED"] as const).map((status) => {
                const isProvisional = fiscalYear === currentFiscalYear && card.quarter === currentQuarter;
                const fullLabel = status === "SHORTFALL" ? (isProvisional ? "Remaining to Target" : "Confirmed Shortfall") : status === "MATCHED" ? "Matched" : "Exceeded";
                const label = fullLabel;
                const amount = status === "SHORTFALL" ? card.shortfallAmount : status === "MATCHED" ? card.matchedAmount : card.exceededAmount;
                const tooltip = `${isProvisional ? "This quarter is in progress; amounts and status are provisional. " : ""}${status === "MATCHED"
                  ? "Matched difference is exactly 0 K USD. It is not the sum of matched customers' Actual. Activate to filter matched Accounts."
                  : `${fullLabel} is summed after each Account is compared within this quarter; excess from another Account is not offset.`}`;
                const pressed = resultFilter?.quarter === card.quarter && resultFilter.status === status;
                return <button key={status} type="button" class={`is-${status.toLowerCase()}`} aria-pressed={pressed}
                  aria-label={`${card.quarter} ${fullLabel}: ${formatAmount(amount, "0")} K USD. ${tooltip}`} data-tooltip={tooltip}
                  onClick={(event) => { event.stopPropagation(); toggleResultFilter(card.quarter, status); }}><span>{label}</span><strong>{formatAmount(amount, "0")}</strong></button>;
              })}
            </div>
          </article>;
        })}
        </div>
      </section>

      <section ref={matrixFrameRef} class="forecast-actual-matrix-frame" aria-label="Forecast vs Actual monthly table">
        <section class="forecast-actual-matrix-shell" ref={matrixScrollRef} tabIndex={0} aria-label="Scrollable monthly comparison table" onScroll={updateMatrixScrollState}>
          <div class="forecast-actual-matrix-layout">
          <table class="forecast-actual-matrix">
            <colgroup>
              <col class="forecast-actual-col-account" />
              <col class="forecast-actual-col-rep" />
              <col class="forecast-actual-col-result" />
              {periods.flatMap((periodKey) => [
                <col key={`${periodKey}-forecast-col`} class="forecast-actual-col-month" />,
                <col key={`${periodKey}-actual-col`} class="forecast-actual-col-month" />,
                <col key={`${periodKey}-difference-col`} class="forecast-actual-col-difference" />,
                <col key={`${periodKey}-status-col`} class="forecast-actual-col-status" />
              ])}
            </colgroup>
            <thead>
              <tr class="forecast-actual-group-header">
                <th rowSpan={2} class="is-sticky is-account" aria-sort={ariaSort("account")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("account")}>Account<SortIndicator active={sortKey === "account"} direction={sortDirection} /></button></th>
                <th rowSpan={2} class="is-sticky is-rep" aria-sort={ariaSort("salesRep")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("salesRep")}>Sales Rep<SortIndicator active={sortKey === "salesRep"} direction={sortDirection} /></button></th>
                <th rowSpan={2} class="is-sticky is-quarter-result">{displayedResultQuarter} Result</th>
                {periods.map((periodKey) => <th key={periodKey} colSpan={4} class="forecast-actual-period-group">{monthLabel(periodKey)}</th>)}
              </tr>
              <tr class="forecast-actual-subheader">
                {periods.flatMap((periodKey) => [
                  <th key={`${periodKey}-forecast`} class="forecast-actual-month-subhead is-forecast" aria-sort={ariaSort(`month:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`month:${periodKey}`)}>Forecast<SortIndicator active={sortKey === `month:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-actual`} class="forecast-actual-month-subhead is-actual" aria-sort={ariaSort(`actual:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`actual:${periodKey}`)}>Actual{currentData?.partialActualPeriods.includes(periodKey) ? " (Partial)" : ""}<SortIndicator active={sortKey === `actual:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-difference`} class="forecast-actual-month-subhead is-difference" aria-sort={ariaSort(`difference:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`difference:${periodKey}`)}>Difference<SortIndicator active={sortKey === `difference:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-status`} class="forecast-actual-month-subhead is-status forecast-actual-status-cell" aria-sort={ariaSort(`status:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`status:${periodKey}`)}>Status<SortIndicator active={sortKey === `status:${periodKey}`} direction={sortDirection} /></button></th>
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const quarterResult = quarterResultsByAccount.get(row.account)?.[displayedResultQuarter];
                return <tr key={`${row.salesRep}:${row.account}`}>
                  <th scope="row" class="is-sticky is-account"><strong>{row.account}</strong></th>
                  <td class="is-sticky is-rep"><strong>{row.salesRep || "Unassigned"}</strong></td>
                  <td class="is-sticky is-quarter-result">{quarterResult && <span class={`forecast-actual-quarter-result is-${quarterResult.status.toLowerCase()}`}
                    title={resultTooltip(quarterResult)} data-tooltip={resultTooltip(quarterResult)} tabIndex={0}><strong>{resultLabel(quarterResult.status, fiscalYear === currentFiscalYear && quarterResult.quarter === currentQuarter)}</strong><small>{quarterResult.relevantAmount === null ? "N/A" : `${formatAmount(quarterResult.relevantAmount)} K`}</small></span>}</td>
                  {periods.flatMap((periodKey) => {
                    const month = monthByPeriod(row, periodKey);
                    if (!month) return [
                      <td key={`${periodKey}-forecast`} class="forecast-actual-month-value is-forecast is-empty" title="Forecast has not been entered."><span class="forecast-actual-value-badge is-no-forecast">No FCST</span></td>,
                      <td key={`${periodKey}-actual`} class="forecast-actual-month-value is-actual is-empty" title="Actual data is not available for this month."><span class="forecast-actual-value-badge is-pending">Actual Pending</span></td>,
                      <td key={`${periodKey}-difference`} class="forecast-actual-month-value is-difference is-empty" title="Not comparable until both Forecast and Actual are available."><span class="forecast-actual-value-badge is-na">N/A</span></td>,
                      <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class="forecast-actual-status is-unavailable" title="Actual data is not available for this month." data-tooltip="Actual data is not available for this month." aria-label="Actual Pending: Actual data is not available for this month." tabIndex={0}>Actual Pending</span></td>
                    ];
                    const assessment = assessForecastActualMonth(month);
                    const statusClass = assessment.kind === "FINAL_SHORTFALL" ? "is-shortfall" : assessment.kind === "MTD_SHORTFALL" ? "is-projection-watch" : assessment.kind === "NORMAL" ? "is-on-track" : "is-unavailable";
                    const differenceClass = assessment.differenceAmount === null ? "" : compareExactDecimals(assessment.differenceAmount, "0") < 0 ? "is-negative" : compareExactDecimals(assessment.differenceAmount, "0") > 0 ? "is-positive" : "";
                    const statusTooltipText = month.actualAmount === null
                      ? "Actual data is not available for this month."
                      : statusTooltip(assessment.label, assessment.tooltip);
                    const statusLabel = shortStatus(assessment.label);
                    return [
                      <td key={`${periodKey}-forecast`} class={`forecast-actual-month-value is-forecast ${month.forecastAmount === null ? "is-empty" : "forecast-actual-number"}`} title={month.forecastAmount === null ? "Forecast has not been entered." : "Forecast amount in K USD."}>{month.forecastAmount === null ? <span class="forecast-actual-value-badge is-no-forecast">No FCST</span> : formatAmount(month.forecastAmount)}</td>,
                      <td key={`${periodKey}-actual`} class={`forecast-actual-month-value is-actual ${month.actualAmount === null ? "is-empty" : "forecast-actual-number"} ${month.actualState === "MTD" ? "is-provisional" : ""}`} title={month.actualAmount === null ? "Actual data is not available for this month." : month.actualState === "MTD" ? "Cumulative MTD Actual; not final" : "Final Actual"}>{month.actualAmount === null ? <span class="forecast-actual-value-badge is-pending">Actual Pending</span> : formatAmount(month.actualAmount)}{month.actualState === "MTD" && month.actualAmount !== null ? <small class="is-mtd-label">MTD</small> : null}</td>,
                      <td key={`${periodKey}-difference`} class={`forecast-actual-month-value is-difference ${assessment.differenceAmount === null ? "is-empty" : "forecast-actual-number"} ${differenceClass}`} title={assessment.tooltip}>{assessment.differenceAmount === null ? <span class="forecast-actual-value-badge is-na">N/A</span> : formatAmount(assessment.differenceAmount)}</td>,
                      <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class={`forecast-actual-status ${statusClass}`} title={statusTooltipText} data-tooltip={statusTooltipText} aria-label={`${statusLabel}: ${statusTooltipText}`} tabIndex={0}>{statusLabel}</span>{assessment.projectedAmount !== null ? <small>Month-end {formatAmount(assessment.projectedAmount)}</small> : null}</td>
                    ];
                  })}
                </tr>;
              })}
              {!rows.length && <tr><td class="forecast-actual-empty" colSpan={3 + periods.length * 4}>{resultFilter ? "No accounts match the selected quarter result filter." : "No accounts match the selected filters."}</td></tr>}
            </tbody>
            <tfoot class="forecast-actual-monthly-totals">
              <tr class="is-forecast-row">
                <th colSpan={3} class="forecast-actual-total-label is-sticky">Monthly Forecast total</th>
                {periods.flatMap((periodKey) => [
                  <td key={`${periodKey}-forecast-total`} class="forecast-actual-number">{renderTotalAmount(monthlyTotals[periodKey]?.forecast ?? null)}</td>,
                  <td key={`${periodKey}-forecast-total-actual`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-forecast-total-difference`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-forecast-total-status`} aria-hidden="true">—</td>
                ])}
              </tr>
              <tr class="is-actual-row">
                <th colSpan={3} class="forecast-actual-total-label is-sticky">Monthly Actual total</th>
                {periods.flatMap((periodKey) => [
                  <td key={`${periodKey}-actual-total-forecast`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-actual-total`} class="forecast-actual-number">{renderTotalAmount(monthlyTotals[periodKey]?.actual ?? null)}</td>,
                  <td key={`${periodKey}-actual-total-difference`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-actual-total-status`} aria-hidden="true">—</td>
                ])}
              </tr>
              <tr class="is-shortfall-row">
                <th colSpan={3} class="forecast-actual-total-label is-sticky">Difference · Confirmed Shortfall total</th>
                {periods.flatMap((periodKey) => [
                  <td key={`${periodKey}-shortfall-forecast`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-shortfall-actual`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-shortfall`} class="forecast-actual-number is-negative">{renderTotalAmount(monthlyTotals[periodKey]?.shortfall ?? null)}</td>,
                  <td key={`${periodKey}-shortfall-status`} aria-hidden="true">—</td>
                ])}
              </tr>
              <tr class="is-exceeded-row">
                <th colSpan={3} class="forecast-actual-total-label is-sticky">Difference · Exceeded total</th>
                {periods.flatMap((periodKey) => [
                  <td key={`${periodKey}-exceeded-forecast`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-exceeded-actual`} aria-hidden="true">—</td>,
                  <td key={`${periodKey}-exceeded`} class="forecast-actual-number is-positive">{renderTotalAmount(monthlyTotals[periodKey]?.exceeded ?? null)}</td>,
                  <td key={`${periodKey}-exceeded-status`} aria-hidden="true">—</td>
                ])}
              </tr>
            </tfoot>
          </table>
          </div>
        </section>
        <div ref={viewportControlsRef} class="consumption-viewport-controls forecast-actual-viewport-controls" data-visible="false">
          <div class="consumption-scroll-controls" aria-label="Scroll monthly table">
            <button type="button" aria-label="Scroll table left" title="Scroll table left" disabled={matrixScrollState.left <= 1} onClick={() => scrollMatrix(-1)}><span class="oj-ux-ico-chevron-left" aria-hidden="true"></span></button>
            <button type="button" aria-label="Scroll table right" title="Scroll table right" disabled={matrixScrollState.left >= matrixScrollState.max - 1} onClick={() => scrollMatrix(1)}><span class="oj-ux-ico-chevron-right" aria-hidden="true"></span></button>
          </div>
        </div>
      </section>
    </div>}
  </PageShell>;
};
