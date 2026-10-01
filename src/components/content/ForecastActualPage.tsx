import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { KeyboardEvent } from "preact/compat";
import "ojs/ojprogress-circle";
import { fetchForecastActualComparison, type ForecastActualComparison, type ForecastActualMode, type ForecastActualRow } from "../../data/consumptionApi";
import { consumptionPillarOptions, type ConsumptionPillar } from "../../data/consumptionData";
import {
  assessForecastActualMonth,
  countDistinctForecastActualAccounts,
  countForecastActualProblemAccounts,
  filterForecastActualProblemRows,
  summarizeForecastActualActuals,
  visibleForecastActualPeriods,
  type ForecastActualProblemFilter
} from "../../data/forecastActualAssessment";
import { compareForecastActualRows, type ForecastActualSortDirection, type ForecastActualSortKey } from "../../data/forecastActualSort";
import { compareExactDecimals, formatExactKFixed } from "../../data/exactDecimal";
import { FiscalYear } from "../../data/kpiMockData";
import { formatMtdAppliedDate } from "../../data/mtdDate";

const formatAmount = (value: string | null, unavailable = "Unconfirmed") => value === null ? unavailable : formatExactKFixed(value, 2);
const SortIndicator = ({ active, direction }: { active: boolean; direction: ForecastActualSortDirection }) => active
  ? <span class={`forecast-actual-sort-indicator is-${direction}`} aria-hidden="true"></span> : null;
const ScrollChevron = ({ direction }: { direction: "left" | "right" }) => <span class={`forecast-actual-chevron is-${direction}`} aria-hidden="true"></span>;
const monthByPeriod = (row: ForecastActualRow, periodKey: string) => row.months.find((month) => month.periodKey === periodKey);
const MONTH_NAMES: Readonly<Record<string, string>> = Object.freeze({
  JAN: "JANUARY", FEB: "FEBRUARY", MAR: "MARCH", APR: "APRIL", MAY: "MAY", JUN: "JUNE",
  JUL: "JULY", AUG: "AUGUST", SEP: "SEPTEMBER", OCT: "OCTOBER", NOV: "NOVEMBER", DEC: "DECEMBER"
});
const monthLabel = (periodKey: string) => {
  const code = periodKey.split("-")[1] ?? periodKey;
  return MONTH_NAMES[code] ?? code;
};

export const ForecastActualPage = ({ fiscalYear, breadcrumb }: Readonly<{ fiscalYear: FiscalYear; breadcrumb?: ComponentChildren }>) => {
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
  const [problemFilter, setProblemFilter] = useState<ForecastActualProblemFilter | null>(null);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const [debouncedAccountSearch, setDebouncedAccountSearch] = useState("");
  const [accountComposing, setAccountComposing] = useState(false);
  const [accountOptionCache, setAccountOptionCache] = useState<string[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [monthScroll, setMonthScroll] = useState({ left: false, right: false });
  const accountComboboxRef = useRef<HTMLDivElement>(null);
  const monthScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSalesRep(""); setAccount(""); setAccountSearch(""); setAccountOptionCache([]); setProblemFilter(null);
  }, [fiscalYear]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetchForecastActualComparison({ fiscalYear, quarter, pillar, actualMode, salesRep, account }, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setData(next); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load Forecast vs Actual."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fiscalYear, quarter, pillar, actualMode, salesRep, account]);

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

  // Preserve the previous result while the next filtered request is in flight.
  // The effect cleanup guards against stale responses replacing newer ones.
  const currentData = data;

  const periods = useMemo(
    () => visibleForecastActualPeriods(currentData?.fullForecastPeriods ?? [], currentData?.rows ?? []),
    [currentData]
  );
  const problemCounts = useMemo(() => countForecastActualProblemAccounts(currentData?.rows ?? [], periods), [currentData, periods]);
  const rows = useMemo(() => filterForecastActualProblemRows(currentData?.rows ?? [], problemFilter, periods).sort((left, right) => {
    const compared = compareForecastActualRows(left, right, sortKey, sortDirection);
    return compared || left.account.localeCompare(right.account, undefined, { sensitivity: "base" });
  }), [currentData, periods, problemFilter, sortDirection, sortKey]);
  const displayedAccountCount = useMemo(() => countDistinctForecastActualAccounts(rows), [rows]);
  const allAccountCount = useMemo(() => countDistinctForecastActualAccounts(currentData?.rows ?? []), [currentData]);
  const actualTotals = useMemo(() => summarizeForecastActualActuals(currentData?.rows ?? [], periods), [currentData, periods]);
  const displayedActualMode = currentData?.actualMode ?? actualMode;
  const mtdAppliedDate = useMemo(() => {
    const timestamps = (currentData?.rows ?? []).flatMap((row) => row.months)
      .filter((month) => month.actualState === "MTD" && month.actualAsOf)
      .map((month) => month.actualAsOf as string)
      .map((value) => ({ value, time: new Date(value).getTime() }))
      .filter(({ time }) => !Number.isNaN(time)).sort((left, right) => left.time - right.time);
    return formatMtdAppliedDate(timestamps[timestamps.length - 1]?.value);
  }, [currentData]);
  const accountOptions = account ? accountOptionCache : (data?.accountOptions ?? accountOptionCache);
  const filteredAccountOptions = useMemo(() => {
    const query = debouncedAccountSearch.toLocaleLowerCase();
    return accountOptions.filter((option) => !query || option.toLocaleLowerCase().includes(query));
  }, [accountOptions, debouncedAccountSearch]);

  const refreshMonthScrollState = () => {
    const element = monthScrollRef.current;
    if (!element) return setMonthScroll({ left: false, right: false });
    setMonthScroll({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(refreshMonthScrollState);
    window.addEventListener("resize", refreshMonthScrollState);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", refreshMonthScrollState); };
  }, [periods.length, rows.length]);
  const scrollMonths = (direction: -1 | 1) => monthScrollRef.current?.scrollBy({ left: direction * Math.max(240, monthScrollRef.current.clientWidth * .72), behavior: "smooth" });
  const handleMonthScrollKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); scrollMonths(event.key === "ArrowLeft" ? -1 : 1);
  };
  const toggleSort = (key: ForecastActualSortKey) => {
    if (sortKey === key) return setSortDirection((current) => current === "asc" ? "desc" : "asc");
    setSortKey(key); setSortDirection(key === "salesRep" || key === "account" ? "asc" : "desc");
  };
  const ariaSort = (key: ForecastActualSortKey): "ascending" | "descending" | "none" => sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
  const resetAccountScope = () => { setAccount(""); setAccountSearch(""); setAccountSearchOpen(false); setAccountOptionCache([]); setActiveAccountIndex(0); setProblemFilter(null); };
  const chooseAccount = (value: string) => { setAccount(value); setAccountSearch(""); setAccountSearchOpen(false); setActiveAccountIndex(0); setProblemFilter(null); };
  const handleAccountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setAccountSearchOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveAccountIndex((current) => Math.max(0, Math.min(filteredAccountOptions.length, current + direction)));
    } else if (event.key === "Enter" && accountSearchOpen) {
      event.preventDefault(); chooseAccount(activeAccountIndex === 0 ? "" : filteredAccountOptions[activeAccountIndex - 1] ?? "");
    } else if (event.key === "Escape") { setAccountSearchOpen(false); setAccountSearch(""); }
  };
  const toggleProblemFilter = (value: ForecastActualProblemFilter) => setProblemFilter((current) => current === value ? null : value);
  const summary = currentData?.summary;

  return <main class="consumption-insights-page forecast-actual-page" aria-labelledby="forecastActualTitle">
    <header class="consumption-page__header consumption-insights-header forecast-actual-header">
      <div class="forecast-actual-title-block">{breadcrumb}<span class="kpi-eyebrow">Consumption / Forecast vs Actual</span><h1 id="forecastActualTitle">Forecast vs Actual</h1></div>
      <div class="forecast-actual-toolbar" aria-label="Forecast vs Actual filters">
        <div class="forecast-actual-control forecast-actual-mtd-control">
          <span>MTD</span>
          {displayedActualMode === "MTD" && mtdAppliedDate && <span class="consumption-mtd-applied-date">As of {mtdAppliedDate}</span>}
          <button type="button" role="switch" aria-label="Include MTD" aria-checked={actualMode === "MTD"} class="consumption-mtd-switch"
            onClick={() => { setProblemFilter(null); setActualMode((current) => current === "MTD" ? "FINAL" : "MTD"); }}>
            <span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
          </button>
        </div>
        <label class="forecast-actual-control">Quarter<select id="forecastActualQuarter" value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); setSalesRep(""); resetAccountScope(); }}><option value="ALL">All</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></label>
        <div class="forecast-actual-control forecast-actual-pillar"><span>Pillar</span><div class="consumption-pillar-selector" role="group" aria-label="Forecast vs Actual pillar">
          {consumptionPillarOptions.map((option) => <button key={option.value} type="button" aria-pressed={pillar === option.value}
            onClick={() => { if (option.value === pillar) return; setPillar(option.value); setSalesRep(""); resetAccountScope(); }}>{option.label}</button>)}
        </div></div>
        <label class="forecast-actual-control">Sales Rep<select id="forecastActualSalesRep" value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccountScope(); }}><option value="">All</option>{data?.salesRepOptions.map((value) => <option value={value}>{value}</option>)}</select></label>
        <div class="forecast-actual-control forecast-actual-search-panel">
          <label htmlFor="forecastActualAccountSearch">Account</label>
          <div class="consumption-insights-combobox forecast-actual-account-search" ref={accountComboboxRef}>
            <input id="forecastActualAccountSearch" type="search" role="combobox" aria-autocomplete="list" aria-expanded={accountSearchOpen} aria-controls="forecastActualAccountOptions"
              aria-activedescendant={accountSearchOpen ? `forecast-actual-account-option-${activeAccountIndex}` : undefined}
              value={accountSearchOpen ? accountSearch : (account || "All")}
              onFocus={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
              onClick={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
              onInput={(event) => { setAccountSearch(event.currentTarget.value); setAccount(""); setAccountSearchOpen(true); setActiveAccountIndex(0); setProblemFilter(null); }}
              onCompositionStart={() => setAccountComposing(true)} onCompositionEnd={(event) => { setAccountComposing(false); setAccountSearch(event.currentTarget.value); }} onKeyDown={handleAccountKeyDown} />
            {account && <button type="button" class="consumption-insights-clear" aria-label="Clear selected account" onClick={() => chooseAccount("")}>Clear</button>}
            {accountSearchOpen && <div id="forecastActualAccountOptions" class="consumption-insights-options" role="listbox">
              <button id="forecast-actual-account-option-0" type="button" role="option" aria-selected={!account} class={activeAccountIndex === 0 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount("")}><strong>All accounts</strong><small>전체 Account 보기</small></button>
              {filteredAccountOptions.map((value, index) => <button key={value} id={`forecast-actual-account-option-${index + 1}`} type="button" role="option" aria-selected={account === value} class={activeAccountIndex === index + 1 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount(value)}><strong>{value}</strong></button>)}
              {!filteredAccountOptions.length && <p>No matching accounts.</p>}
            </div>}
          </div>
        </div>
      </div>
    </header>

    {loading && !currentData && <div class="forecast-actual-loading" role="status"><oj-progress-circle size="sm" value={-1}></oj-progress-circle><span>Loading comparison…</span></div>}
    {error && <div class="consumption-inline-error" role="alert"><strong>Unable to load comparison</strong><span>{error}</span></div>}

    {currentData && summary && <div class="forecast-actual-results" aria-busy={loading}>
      <section class="forecast-actual-summary" aria-label="Comparison summary">
        <article class="is-forecast" title="Full-period Forecast for the selected filters."><span>Forecast</span><strong>{formatAmount(summary.fullPeriodForecastAmount)}</strong><small>K USD · selected scope</small></article>
        <article><span>Actual</span><strong>{formatAmount(actualTotals.totalAmount)}</strong><small>{actualTotals.includesMtd
          ? `K USD · Final ${formatAmount(actualTotals.confirmedAmount, "None")} + MTD ${formatAmount(actualTotals.mtdAmount, "None")}`
          : `K USD · ${actualTotals.hasActual ? "Final total" : "Unconfirmed is not counted as zero"}`}</small></article>
        <button type="button" title="Final Actual is below Forecast. Accounts are counted once; activate to filter rows." class={problemFilter === "FINAL_SHORTFALL" ? "forecast-actual-problem-card is-final-shortfall is-selected" : "forecast-actual-problem-card is-final-shortfall"} aria-pressed={problemFilter === "FINAL_SHORTFALL"} onClick={() => toggleProblemFilter("FINAL_SHORTFALL")}><span>Final shortfall</span><strong>{problemCounts.finalShortfall}</strong><small>Accounts · activate to filter</small></button>
        <button type="button" title="Projected month-end Actual is below Forecast using MTD through the as-of date minus three days. Accounts are counted once; activate to filter rows." class={problemFilter === "MTD_SHORTFALL" ? "forecast-actual-problem-card is-mtd-shortfall is-selected" : "forecast-actual-problem-card is-mtd-shortfall"} aria-pressed={problemFilter === "MTD_SHORTFALL"} onClick={() => toggleProblemFilter("MTD_SHORTFALL")}><span>Projected MTD shortfall</span><strong>{problemCounts.mtdShortfall}</strong><small>Accounts · activate to filter</small></button>
        <article><span>Accounts</span><strong>{problemFilter ? displayedAccountCount : allAccountCount}</strong><small>{problemFilter ? "filtered · distinct Accounts" : "current filters · distinct Accounts"}</small></article>
      </section>

      <section class="forecast-actual-matrix-shell" aria-label="Account monthly comparison">
        <div class="forecast-actual-matrix-toolbar"><span class="forecast-actual-unit-note">Amount: K USD</span><div class="consumption-scroll-controls" aria-label="Monthly horizontal scroll controls">
          <button type="button" aria-label="Scroll monthly columns left" disabled={!monthScroll.left} onClick={() => scrollMonths(-1)}><ScrollChevron direction="left" /></button>
          <button type="button" aria-label="Scroll monthly columns right" disabled={!monthScroll.right} onClick={() => scrollMonths(1)}><ScrollChevron direction="right" /></button>
        </div></div>
        <div class="forecast-actual-month-scroll" ref={monthScrollRef} tabIndex={0} onScroll={refreshMonthScrollState} onKeyDown={handleMonthScrollKeyDown}>
          <table class="forecast-actual-matrix">
            <thead>
              <tr class="forecast-actual-group-header">
                <th rowSpan={2} class="is-sticky is-account" aria-sort={ariaSort("account")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("account")}>Account<SortIndicator active={sortKey === "account"} direction={sortDirection} /></button></th>
                <th rowSpan={2} class="is-sticky is-rep" aria-sort={ariaSort("salesRep")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("salesRep")}>Sales Rep<SortIndicator active={sortKey === "salesRep"} direction={sortDirection} /></button></th>
                {periods.map((periodKey) => <th key={periodKey} colSpan={4} class="forecast-actual-period-group">{monthLabel(periodKey)}</th>)}
              </tr>
              <tr class="forecast-actual-subheader">
                {periods.flatMap((periodKey) => [
                  <th key={`${periodKey}-forecast`} class="forecast-actual-month-subhead" aria-sort={ariaSort(`month:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`month:${periodKey}`)}>Forecast<SortIndicator active={sortKey === `month:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-actual`} class="forecast-actual-month-subhead" aria-sort={ariaSort(`actual:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`actual:${periodKey}`)}>Actual{currentData?.partialActualPeriods.includes(periodKey) ? " (Partial)" : ""}<SortIndicator active={sortKey === `actual:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-difference`} class="forecast-actual-month-subhead is-difference" aria-sort={ariaSort(`difference:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`difference:${periodKey}`)}>Difference<SortIndicator active={sortKey === `difference:${periodKey}`} direction={sortDirection} /></button></th>,
                  <th key={`${periodKey}-status`} class="forecast-actual-month-subhead is-status forecast-actual-status-cell" aria-sort={ariaSort(`status:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`status:${periodKey}`)}>Status<SortIndicator active={sortKey === `status:${periodKey}`} direction={sortDirection} /></button></th>
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => <tr key={`${row.salesRep}:${row.account}`}>
                <th scope="row" class="is-sticky is-account"><strong>{row.account}</strong></th>
                <td class="is-sticky is-rep"><strong>{row.salesRep || "Unassigned"}</strong></td>
                {periods.flatMap((periodKey) => {
                  const month = monthByPeriod(row, periodKey);
                  if (!month) return [
                    <td key={`${periodKey}-forecast`} class="forecast-actual-month-value is-empty">Not entered</td>,
                    <td key={`${periodKey}-actual`} class="forecast-actual-month-value is-empty">Unconfirmed</td>,
                    <td key={`${periodKey}-difference`} class="forecast-actual-month-value is-difference is-empty">Not comparable</td>,
                    <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class="forecast-actual-status is-unavailable">Unconfirmed</span></td>
                  ];
                  const assessment = assessForecastActualMonth(month);
                  const statusClass = assessment.kind === "FINAL_SHORTFALL" ? "is-shortfall" : assessment.kind === "MTD_SHORTFALL" ? "is-projection-watch" : assessment.kind === "NORMAL" ? "is-on-track" : "is-unavailable";
                  const differenceClass = assessment.differenceAmount === null ? "" : compareExactDecimals(assessment.differenceAmount, "0") < 0
                    ? "is-negative" : compareExactDecimals(assessment.differenceAmount, "0") > 0 ? "is-positive" : "";
                  return [
                    <td key={`${periodKey}-forecast`} class="forecast-actual-month-value forecast-actual-number">{month.forecastAmount === null ? "Not entered" : formatAmount(month.forecastAmount)}</td>,
                    <td key={`${periodKey}-actual`} class={`forecast-actual-month-value forecast-actual-number ${month.actualState === "MTD" ? "is-provisional" : ""}`} title={month.actualState === "MTD" ? "Cumulative MTD Actual; not final" : "Final Actual"}>{month.actualAmount === null ? "Unconfirmed" : formatAmount(month.actualAmount)}{month.actualState === "MTD" && month.actualAmount !== null ? <small class="is-mtd-label">MTD</small> : null}</td>,
                    <td key={`${periodKey}-difference`} class={`forecast-actual-month-value forecast-actual-number is-difference ${differenceClass}`} title={assessment.tooltip}>{assessment.differenceAmount === null ? "Not comparable" : formatAmount(assessment.differenceAmount)}</td>,
                    <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class={`forecast-actual-status ${statusClass}`} title={assessment.tooltip}>{assessment.label}</span>{assessment.projectedAmount !== null ? <small>Month-end {formatAmount(assessment.projectedAmount)}</small> : null}</td>
                  ];
                })}
              </tr>)}
              {!rows.length && <tr><td class="forecast-actual-empty" colSpan={2 + periods.length * 4}>{problemFilter ? "No accounts match the selected exception filter." : "No accounts match the selected filters."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>}
  </main>;
};
