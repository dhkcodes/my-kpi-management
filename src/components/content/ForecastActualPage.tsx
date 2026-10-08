import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { KeyboardEvent } from "preact/compat";
import "ojs/ojprogress-circle";
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
import { FiscalYear } from "../../data/kpiMockData";
import { formatMtdAppliedDate } from "../../data/mtdDate";
import { PageActivity, PageDataProgress, PageFilterPanel, PageShell } from "../common/PageShell";

const formatAmount = (value: string | null, unavailable = "Unconfirmed") => value === null ? unavailable : formatExactKFixed(value, 2);
const SortIndicator = ({ active, direction }: { active: boolean; direction: ForecastActualSortDirection }) => active
  ? <span class={`forecast-actual-sort-indicator is-${direction}`} aria-hidden="true"></span> : null;
const shortStatus = (label: string) => {
  if (label === "Final shortfall") return "Final gap";
  if (label === "Projected MTD shortfall") return "Projected gap";
  if (label === "Projected on track") return "Projected OK";
  if (label === "Unconfirmed") return "Pending";
  if (label === "Not comparable") return "N/A";
  return label;
};
const statusTooltip = (label: string, tooltip: string) => {
  if (label === "Final shortfall") return `Final shortfall means confirmed Final Actual is below Forecast. ${tooltip}`;
  if (label === "Projected MTD shortfall") return `Projected shortfall means projected month-end Actual is below Forecast; it is not a confirmed Final Actual gap. ${tooltip}`;
  if (label === "Projected on track") return `Projected month-end Actual is on track against Forecast. ${tooltip}`;
  if (label === "Unconfirmed") return `Actual is not confirmed, so Forecast and Actual cannot be compared yet. ${tooltip}`;
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
const resultLabel = (status: ForecastActualQuarterStatus) => ({
  SHORTFALL: "Shortfall", MATCHED: "Matched", EXCEEDED: "Exceeded", NO_FORECAST: "No forecast",
  MISSING_ACTUAL: "Actual missing", PARTIAL_ACTUAL: "Partial actual", FUTURE: "Future"
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
  const [resultFilter, setResultFilter] = useState<QuarterResultFilter | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<Date | null>(null);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const [debouncedAccountSearch, setDebouncedAccountSearch] = useState("");
  const [accountComposing, setAccountComposing] = useState(false);
  const [accountOptionCache, setAccountOptionCache] = useState<string[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const accountComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSalesRep(""); setAccount(""); setAccountSearch(""); setAccountOptionCache([]); setResultFilter(null);
  }, [fiscalYear]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetchForecastActualComparison({ fiscalYear, quarter: "ALL", pillar, actualMode, salesRep, account }, controller.signal)
      .then((next) => { if (!controller.signal.aborted) { setData(next); setLastCompletedAt(new Date()); } })
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

  return <PageShell className="consumption-insights-page forecast-actual-page" ariaLabelledBy="forecastActualTitle"
    breadcrumb={breadcrumb} title="Forecast vs Actual" headingSpacing="compact"
    activityPosition="custom" busy={loading} busyLabel="Loading Forecast vs Actual results"
    filters={<PageFilterPanel className="forecast-actual-toolbar" ariaLabel="Forecast vs Actual filters">
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
      <div class="forecast-actual-control forecast-actual-mtd-control">
        <span>MTD</span>
        <div class="forecast-actual-mtd-row">
          {displayedActualMode === "MTD" && mtdAppliedDate && <span class="consumption-mtd-applied-date">Updated on {mtdAppliedDate}</span>}
          <button type="button" role="switch" aria-label="Include MTD" aria-checked={actualMode === "MTD"}
            disabled={loading || !currentData?.currentMtdAvailable} class="consumption-mtd-switch"
            onClick={() => { setResultFilter(null); setActualMode((current) => current === "MTD" ? "FINAL" : "MTD"); }}>
            <span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
          </button>
        </div>
      </div>
    </PageFilterPanel>}>

    {error && <div class="consumption-inline-error" role="alert"><strong>Unable to load comparison</strong><span>{error}</span></div>}
    {!currentData && loading && <div class="forecast-actual-results forecast-actual-loading" role="status" aria-live="polite">Loading Forecast vs Actual results…</div>}
    <PageDataProgress busy={loading} busyLabel="Loading Forecast vs Actual results" />

    {currentData && <div class="forecast-actual-results" aria-busy={loading}>
      <section class="forecast-actual-total-strip" aria-label="Selected scope totals">
        <span><small>Total Forecast</small><strong>{formatAmount(selectedTotalForecast, "N/A")}</strong><em>K USD</em></span>
        <span><small>Total Actual</small><strong>{formatAmount(selectedTotalActual, "N/A")}</strong><em>K USD</em></span>
      </section>
      <section class="forecast-actual-quarter-cards" aria-label="Quarter results">
        {quarterCards.map((card) => {
          return <article key={card.quarter} class={quarter === card.quarter || resultFilter?.quarter === card.quarter ? "is-selected" : ""}>
            <header><strong>{card.quarter}</strong><small>{card.quarter === currentQuarter ? "In progress · cumulative Actual" : "Quarter result"}</small></header>
            <div class="forecast-actual-quarter-totals"><span>Forecast <strong>{formatAmount(card.forecastAmount, "N/A")}</strong></span><span>Actual <strong>{formatAmount(card.actualAmount, "N/A")}</strong></span></div>
            <div class="forecast-actual-quarter-actions">
              {(["SHORTFALL", "MATCHED", "EXCEEDED"] as const).map((status) => {
                const label = status === "SHORTFALL" ? "Shortfall" : status === "MATCHED" ? "Matched" : "Exceeded";
                const amount = status === "SHORTFALL" ? card.shortfallAmount : status === "MATCHED" ? card.matchedAmount : card.exceededAmount;
                const tooltip = status === "MATCHED"
                  ? "Matched difference is exactly 0 K USD. It is not the sum of matched customers' Actual. Activate to filter matched Accounts."
                  : `${label} is summed after each Account is compared within this quarter; excess from another Account is not offset.`;
                const pressed = resultFilter?.quarter === card.quarter && resultFilter.status === status;
                return <button key={status} type="button" class={`is-${status.toLowerCase()}`} aria-pressed={pressed}
                  aria-label={`${card.quarter} ${label}: ${formatAmount(amount, "0")} K USD. ${tooltip}`} data-tooltip={tooltip}
                  onClick={() => toggleResultFilter(card.quarter, status)}><span>{label}</span><strong>{formatAmount(amount, "0")}</strong><small>K USD</small></button>;
              })}
            </div>
          </article>;
        })}
      </section>
      {resultFilter && <div class="forecast-actual-result-filter" role="status"><span>{resultFilter.quarter} · {resultLabel(resultFilter.status)}</span><button type="button" onClick={() => setResultFilter(null)}>Clear result filter</button></div>}

      <section class="forecast-actual-matrix-shell" aria-label="Account monthly comparison">
        <div class="forecast-actual-matrix-toolbar">
          <PageActivity busy={loading} busyLabel="Loading Forecast vs Actual results"
            onRefresh={() => setRefreshNonce((value) => value + 1)} lastCompletedAt={lastCompletedAt}
            showBusyLabel={false} compactTimestampButton />
        </div>
        <div class="forecast-actual-matrix-layout">
          <table class="forecast-actual-matrix">
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
                    title={resultTooltip(quarterResult)} data-tooltip={resultTooltip(quarterResult)} tabIndex={0}><strong>{resultLabel(quarterResult.status)}</strong><small>{quarterResult.relevantAmount === null ? "N/A" : `${formatAmount(quarterResult.relevantAmount)} K`}</small></span>}</td>
                  {periods.flatMap((periodKey) => {
                    const month = monthByPeriod(row, periodKey);
                    if (!month) return [
                      <td key={`${periodKey}-forecast`} class="forecast-actual-month-value is-forecast is-empty" title="Forecast has not been entered.">No FCST</td>,
                      <td key={`${periodKey}-actual`} class="forecast-actual-month-value is-actual is-empty" title="Actual is not confirmed."><span class="forecast-actual-value-badge is-pending">Pending</span></td>,
                      <td key={`${periodKey}-difference`} class="forecast-actual-month-value is-difference is-empty" title="Not comparable until both Forecast and Actual are available."><span class="forecast-actual-value-badge is-na">N/A</span></td>,
                      <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class="forecast-actual-status is-unavailable" title="Actual is not confirmed, so Forecast and Actual cannot be compared yet." data-tooltip="Actual is not confirmed, so Forecast and Actual cannot be compared yet." aria-label="Pending: Actual is not confirmed, so Forecast and Actual cannot be compared yet." tabIndex={0}>Pending</span></td>
                    ];
                    const assessment = assessForecastActualMonth(month);
                    const statusClass = assessment.kind === "FINAL_SHORTFALL" ? "is-shortfall" : assessment.kind === "MTD_SHORTFALL" ? "is-projection-watch" : assessment.kind === "NORMAL" ? "is-on-track" : "is-unavailable";
                    const differenceClass = assessment.differenceAmount === null ? "" : compareExactDecimals(assessment.differenceAmount, "0") < 0 ? "is-negative" : compareExactDecimals(assessment.differenceAmount, "0") > 0 ? "is-positive" : "";
                    const statusTooltipText = statusTooltip(assessment.label, assessment.tooltip);
                    const statusLabel = shortStatus(assessment.label);
                    return [
                      <td key={`${periodKey}-forecast`} class={`forecast-actual-month-value is-forecast ${month.forecastAmount === null ? "is-empty" : "forecast-actual-number"}`} title={month.forecastAmount === null ? "Forecast has not been entered." : "Forecast amount in K USD."}>{month.forecastAmount === null ? "No FCST" : formatAmount(month.forecastAmount)}</td>,
                      <td key={`${periodKey}-actual`} class={`forecast-actual-month-value is-actual ${month.actualAmount === null ? "is-empty" : "forecast-actual-number"} ${month.actualState === "MTD" ? "is-provisional" : ""}`} title={month.actualAmount === null ? "Actual is not confirmed." : month.actualState === "MTD" ? "Cumulative MTD Actual; not final" : "Final Actual"}>{month.actualAmount === null ? <span class="forecast-actual-value-badge is-pending">Pending</span> : formatAmount(month.actualAmount)}{month.actualState === "MTD" && month.actualAmount !== null ? <small class="is-mtd-label">MTD</small> : null}</td>,
                      <td key={`${periodKey}-difference`} class={`forecast-actual-month-value is-difference ${assessment.differenceAmount === null ? "is-empty" : "forecast-actual-number"} ${differenceClass}`} title={assessment.tooltip}>{assessment.differenceAmount === null ? <span class="forecast-actual-value-badge is-na">N/A</span> : formatAmount(assessment.differenceAmount)}</td>,
                      <td key={`${periodKey}-status`} class="forecast-actual-month-value is-status forecast-actual-status-cell"><span class={`forecast-actual-status ${statusClass}`} title={statusTooltipText} data-tooltip={statusTooltipText} aria-label={`${statusLabel}: ${statusTooltipText}`} tabIndex={0}>{statusLabel}</span>{assessment.projectedAmount !== null ? <small>Month-end {formatAmount(assessment.projectedAmount)}</small> : null}</td>
                    ];
                  })}
                </tr>;
              })}
              {!rows.length && <tr><td class="forecast-actual-empty" colSpan={3 + periods.length * 4}>{resultFilter ? "No accounts match the selected quarter result filter." : "No accounts match the selected filters."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>}
  </PageShell>;
};
