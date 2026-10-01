import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { KeyboardEvent } from "preact/compat";
import "ojs/ojprogress-circle";
import { fetchForecastActualComparison, type ForecastActualComparison, type ForecastActualMode, type ForecastActualRow } from "../../data/consumptionApi";
import { compareForecastActualRows, forecastActualPeriodsLatestFirst, type ForecastActualSortDirection, type ForecastActualSortKey } from "../../data/forecastActualSort";
import { compareExactDecimals, formatExactKFixed, subtractExactDecimals } from "../../data/exactDecimal";
import { FiscalYear } from "../../data/kpiMockData";
import { formatMtdAppliedDate } from "../../data/mtdDate";

const formatAmount = (value: string | null, unavailable = "미확정") => value === null
  ? unavailable
  : formatExactKFixed(value, 2);
const formatPercent = (value: string | null) => value === null ? "미확정" : `${value}%`;
const tone = (value: string | null) => {
  if (value === null) return "";
  const compared = compareExactDecimals(value, "0");
  return compared < 0 ? "is-negative" : compared > 0 ? "is-positive" : "";
};
const SortIndicator = ({ active, direction }: { active: boolean; direction: ForecastActualSortDirection }) => active
  ? <span class={`forecast-actual-sort-indicator is-${direction}`} aria-hidden="true"></span>
  : null;
const ScrollChevron = ({ direction }: { direction: "left" | "right" }) => <span class={`forecast-actual-chevron is-${direction}`} aria-hidden="true"></span>;
const monthByPeriod = (row: ForecastActualRow, periodKey: string) => row.months.find((month) => month.periodKey === periodKey);

export const ForecastActualPage = ({ fiscalYear, breadcrumb }: Readonly<{ fiscalYear: FiscalYear; breadcrumb?: ComponentChildren }>) => {
  const [quarter, setQuarter] = useState("ALL");
  const [pillar, setPillar] = useState("ALL");
  const [actualMode, setActualMode] = useState<ForecastActualMode>("FINAL");
  const [salesRep, setSalesRep] = useState("");
  const [account, setAccount] = useState("");
  const [data, setData] = useState<ForecastActualComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<ForecastActualSortKey>("account");
  const [sortDirection, setSortDirection] = useState<ForecastActualSortDirection>("asc");
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
    setSalesRep("");
    setAccount("");
    setAccountSearch("");
    setAccountOptionCache([]);
  }, [fiscalYear]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchForecastActualComparison({ fiscalYear, quarter, pillar: pillar as "ALL" | "DP" | "OCI", actualMode, salesRep, account })
      .then((next) => { if (!controller.signal.aborted) setData(next); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load Forecast vs Actual."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fiscalYear, quarter, pillar, actualMode, salesRep, account]);

  useEffect(() => {
    if (!accountSearchOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountComboboxRef.current?.contains(event.target as Node)) setAccountSearchOpen(false);
    };
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
      setAccount("");
      setAccountSearch("");
      setAccountSearchOpen(false);
      setActiveAccountIndex(0);
      return;
    }
    if (!account) setAccountOptionCache(data.accountOptions);
  }, [account, data]);

  const rows = useMemo(() => [...(data?.rows ?? [])].sort((left, right) => {
    const compared = compareForecastActualRows(left, right, sortKey, sortDirection);
    return compared || left.account.localeCompare(right.account, undefined, { sensitivity: "base" });
  }), [data, sortKey, sortDirection]);

  const periods = useMemo(() => forecastActualPeriodsLatestFirst(data?.rows ?? [], data?.comparisonPeriods ?? []), [data]);
  const displayedActualMode = data?.actualMode ?? actualMode;
  const mtdAppliedDate = useMemo(() => {
    const timestamps = (data?.rows ?? []).flatMap((row) => row.months)
      .filter((month) => month.actualState === "MTD" && month.actualAsOf)
      .map((month) => month.actualAsOf as string)
      .map((value) => ({ value, time: new Date(value).getTime() }))
      .filter(({ time }) => !Number.isNaN(time))
      .sort((left, right) => left.time - right.time);
    return formatMtdAppliedDate(timestamps[timestamps.length - 1]?.value);
  }, [data]);
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

  const scrollMonths = (direction: -1 | 1) => {
    const element = monthScrollRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(240, element.clientWidth * .72), behavior: "smooth" });
  };
  const handleMonthScrollKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scrollMonths(event.key === "ArrowLeft" ? -1 : 1);
  };

  const toggleSort = (key: ForecastActualSortKey) => {
    if (sortKey === key) return setSortDirection((current) => current === "asc" ? "desc" : "asc");
    setSortKey(key);
    setSortDirection(key === "salesRep" || key === "account" ? "asc" : "desc");
  };
  const ariaSort = (key: ForecastActualSortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none";

  const resetAccountScope = () => {
    setAccount("");
    setAccountSearch("");
    setAccountSearchOpen(false);
    setAccountOptionCache([]);
    setActiveAccountIndex(0);
  };

  const chooseAccount = (value: string) => {
    setAccount(value);
    setAccountSearch("");
    setAccountSearchOpen(false);
    setActiveAccountIndex(0);
  };
  const handleAccountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setAccountSearchOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveAccountIndex((current) => Math.max(0, Math.min(filteredAccountOptions.length, current + direction)));
    } else if (event.key === "Enter" && accountSearchOpen) {
      event.preventDefault();
      chooseAccount(activeAccountIndex === 0 ? "" : filteredAccountOptions[activeAccountIndex - 1] ?? "");
    } else if (event.key === "Escape") {
      setAccountSearchOpen(false);
      setAccountSearch("");
    }
  };

  const summary = data?.summary;
  const periodSpan = periods.length ? `${periods[0]} → ${periods[periods.length - 1]}` : "표시할 데이터 월 없음";

  return <main class="consumption-page forecast-actual-page" aria-labelledby="forecastActualTitle">
    <header class="consumption-page__header forecast-actual-header">
      <div class="forecast-actual-title-block">{breadcrumb}<span class="kpi-eyebrow">Consumption / Forecast vs Actual</span><h1 id="forecastActualTitle">Forecast vs Actual</h1></div>
      <div class="forecast-actual-search-panel">
        <label htmlFor="forecastActualAccountSearch">Account</label>
        <div class="consumption-insights-combobox forecast-actual-account-search" ref={accountComboboxRef}>
          <input id="forecastActualAccountSearch" type="search" role="combobox" aria-autocomplete="list" aria-expanded={accountSearchOpen} aria-controls="forecastActualAccountOptions"
            aria-activedescendant={accountSearchOpen ? `forecast-actual-account-option-${activeAccountIndex}` : undefined}
            value={accountSearchOpen ? accountSearch : (account || "All accounts")}
            onFocus={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
            onClick={(event) => { setAccountSearchOpen(true); setAccountSearch(""); event.currentTarget.select(); }}
            onInput={(event) => { setAccountSearch(event.currentTarget.value); setAccount(""); setAccountSearchOpen(true); setActiveAccountIndex(0); }}
            onCompositionStart={() => setAccountComposing(true)}
            onCompositionEnd={(event) => { setAccountComposing(false); setAccountSearch(event.currentTarget.value); }}
            onKeyDown={handleAccountKeyDown} />
          {account && <button type="button" class="consumption-insights-clear" aria-label="Clear selected account" onClick={() => chooseAccount("")}>Clear</button>}
          {accountSearchOpen && <div id="forecastActualAccountOptions" class="consumption-insights-options" role="listbox">
            <button id="forecast-actual-account-option-0" type="button" role="option" aria-selected={!account} class={activeAccountIndex === 0 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount("")}><strong>All accounts</strong><small>전체 Account 보기</small></button>
            {filteredAccountOptions.map((value, index) => <button id={`forecast-actual-account-option-${index + 1}`} type="button" role="option" aria-selected={account === value} class={activeAccountIndex === index + 1 ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount(value)}><strong>{value}</strong></button>)}
            {!filteredAccountOptions.length && <p>No matching accounts.</p>}
          </div>}
        </div>
      </div>
      <div class="forecast-actual-header-actions consumption-analysis-mtd-control">
        {displayedActualMode === "MTD" && mtdAppliedDate && <span class="consumption-mtd-applied-date">MTD 반영 일자 {mtdAppliedDate}</span>}
        <span class="kpi-section-label">MTD</span>
        <button type="button" role="switch" aria-label="Include MTD" aria-checked={actualMode === "MTD"} class="consumption-mtd-switch"
          onClick={() => setActualMode((current) => current === "MTD" ? "FINAL" : "MTD")}>
          <span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
        </button>
        {loading && data && <small role="status">Updating…</small>}
      </div>
    </header>

    <section class="forecast-actual-filters" aria-label="Forecast vs Actual filters">
      <label>Quarter<select value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); setSalesRep(""); resetAccountScope(); }}><option value="ALL">All quarters</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></label>
      <label>Pillar<select value={pillar} onChange={(event) => { setPillar(event.currentTarget.value); setSalesRep(""); resetAccountScope(); }}><option value="ALL">All pillars</option><option value="DP">Data Platform</option><option value="OCI">OCI</option></select></label>
      <label>Sales Rep<select value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccountScope(); }}><option value="">All sales reps</option>{data?.salesRepOptions.map((value) => <option value={value}>{value}</option>)}</select></label>
    </section>

    {loading && !data && <div class="forecast-actual-loading" role="status"><oj-progress-circle size="sm" value={-1}></oj-progress-circle><span>Loading comparison…</span></div>}
    {error && <div class="consumption-inline-error" role="alert"><strong>Unable to load comparison</strong><span>{error}</span></div>}

    {data && summary && <div class={loading ? "forecast-actual-results is-updating" : "forecast-actual-results"} aria-busy={loading}>
      <div class="forecast-actual-period-note"><strong>{data.fiscalYear} · {data.quarter}</strong><span>{periodSpan}</span><span>{periods.length}개 데이터 월 · 최신 월부터 표시 · 금액 K USD</span></div>
      <section class="forecast-actual-summary" aria-label="Comparison summary">
        <article><span>Forecast</span><strong>{formatAmount(summary.fullPeriodForecastAmount)}</strong><small>Full-period</small></article>
        <article><span>Actual</span><strong>{formatAmount(summary.confirmedActualAmount)}</strong><small>FINAL periods only</small></article>
        <article class={tone(summary.confirmedDifferenceAmount)}><span>Difference</span><strong>{summary.confirmedActualAmount === null ? "미확정" : formatAmount(summary.confirmedDifferenceAmount, "비교 불가")}</strong><small>FINAL periods only · {summary.confirmedDifferencePercent === null ? "미확정" : formatPercent(summary.confirmedDifferencePercent)}</small></article>
        <article><span>Projected close</span><strong>{formatAmount(summary.projectedAmount)}</strong><small>MTD mode only</small></article>
        <article><span>Attention</span><strong>{summary.attentionAccountCount}</strong><small>{summary.accountCount} accounts in view</small></article>
      </section>

      <section class="forecast-actual-matrix-shell" aria-label="Account monthly comparison">
        <div class="consumption-scroll-controls" aria-label="Monthly horizontal scroll controls">
          <button type="button" aria-label="Scroll monthly columns left" disabled={!monthScroll.left} onClick={() => scrollMonths(-1)}><ScrollChevron direction="left" /></button>
          <button type="button" aria-label="Scroll monthly columns right" disabled={!monthScroll.right} onClick={() => scrollMonths(1)}><ScrollChevron direction="right" /></button>
        </div>
        <div class="forecast-actual-month-scroll" ref={monthScrollRef} tabIndex={0} onScroll={refreshMonthScrollState} onKeyDown={handleMonthScrollKeyDown}>
          <table class="forecast-actual-matrix">
            <thead>
              <tr class="forecast-actual-group-header">
                <th rowSpan={2} class="is-sticky is-account" aria-sort={ariaSort("account")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("account")}>Account<SortIndicator active={sortKey === "account"} direction={sortDirection} /></button></th>
                <th rowSpan={2} class="is-sticky is-rep" aria-sort={ariaSort("salesRep")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("salesRep")}>Sales Rep<SortIndicator active={sortKey === "salesRep"} direction={sortDirection} /></button></th>
                <th colSpan={4} class="is-summary-group">Full-period summary</th>
                {periods.map((periodKey) => <th colSpan={3} class="forecast-actual-period-group">{periodKey}</th>)}
              </tr>
              <tr class="forecast-actual-subheader">
                <th class="is-summary is-summary-forecast" aria-sort={ariaSort("forecast")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("forecast")}>Forecast<SortIndicator active={sortKey === "forecast"} direction={sortDirection} /></button></th>
                <th class="is-summary is-summary-actual" aria-sort={ariaSort("actual")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("actual")}>Actual<SortIndicator active={sortKey === "actual"} direction={sortDirection} /></button></th>
                <th class="is-summary is-summary-difference">Difference</th>
                <th class="is-summary is-summary-status" aria-sort={ariaSort("status")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("status")}>예상 판정<SortIndicator active={sortKey === "status"} direction={sortDirection} /></button></th>
                {periods.flatMap((periodKey) => [<th class="forecast-actual-month-subhead" aria-sort={ariaSort(`month:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`month:${periodKey}`)}>Forecast<SortIndicator active={sortKey === `month:${periodKey}`} direction={sortDirection} /></button></th>, <th class="forecast-actual-month-subhead">Actual</th>, <th class="forecast-actual-month-subhead">Difference</th>])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => <tr>
                <th scope="row" class="is-sticky is-account"><strong>{row.account}</strong></th>
                <td class="is-sticky is-rep"><span class="forecast-actual-secondary">{row.salesRep || "Unassigned"}</span></td>
                <td class="is-summary is-summary-forecast forecast-actual-number">{formatAmount(row.fullPeriodForecastAmount)}</td>
                <td class="is-summary is-summary-actual forecast-actual-number">{row.confirmedActualAmount === null ? "미확정" : formatAmount(row.confirmedActualAmount)}</td>
                <td class={`is-summary is-summary-difference forecast-actual-number ${tone(row.differenceAmount)}`}>{formatAmount(row.differenceAmount, "비교 불가")}</td>
                <td class="is-summary is-summary-status"><span class={`forecast-actual-status ${row.attention === true ? "is-projection-watch" : row.attention === false ? "is-on-track" : "is-unavailable"}`}>{row.attention === null ? "불가" : row.attention ? "주의" : "정상"}</span></td>
                {periods.flatMap((periodKey) => {
                  const month = monthByPeriod(row, periodKey);
                  if (!month) return [<td class="forecast-actual-month-value is-empty">미입력</td>, <td class="forecast-actual-month-value is-empty">미확정</td>, <td class="forecast-actual-month-value is-empty">비교 불가</td>];
                  const actualDifference = month.actualState === "MTD" && month.actualAmount !== null && month.forecastAmount !== null
                    ? subtractExactDecimals(month.actualAmount, month.forecastAmount) : month.differenceAmount;
                  const differenceText = month.actualAmount === null || month.forecastAmount === null ? "비교 불가" : formatAmount(actualDifference, "비교 불가");
                  return [
                    <td class="forecast-actual-month-value forecast-actual-number">{month.forecastAmount === null ? "미입력" : formatAmount(month.forecastAmount)}</td>,
                    <td class={`forecast-actual-month-value forecast-actual-number ${month.actualState === "MTD" ? "is-provisional" : ""}`}>{month.actualAmount === null ? "미확정" : formatAmount(month.actualAmount)}</td>,
                    <td class={`forecast-actual-month-value forecast-actual-number ${tone(actualDifference)}`}>{differenceText}</td>
                  ];
                })}
              </tr>)}
              {!rows.length && <tr><td class="forecast-actual-empty" colSpan={6 + periods.length * 3}>No accounts match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>}
  </main>;
};
