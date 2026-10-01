import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { KeyboardEvent } from "preact/compat";
import "ojs/ojprogress-circle";
import { fetchForecastActualComparison, type ForecastActualComparison, type ForecastActualMode, type ForecastActualRow } from "../../data/consumptionApi";
import { compareForecastActualRows, forecastActualPeriodsLatestFirst, type ForecastActualSortDirection, type ForecastActualSortKey } from "../../data/forecastActualSort";
import { compareExactDecimals, formatExactCurrency, subtractExactDecimals } from "../../data/exactDecimal";
import { FiscalYear } from "../../data/kpiMockData";
import { formatMtdAppliedDate } from "../../data/mtdDate";

const formatAmount = (value: string | null) => {
  if (value === null) return "N/A";
  const formatted = formatExactCurrency(value);
  const [whole, fraction = ""] = formatted.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};
const formatPercent = (value: string | null) => value === null ? "N/A" : `${value}%`;
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

  const periods = useMemo(() => forecastActualPeriodsLatestFirst(data?.rows ?? []), [data]);
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
      <div>{breadcrumb}<span class="kpi-eyebrow">Consumption / Forecast vs Actual</span><h1 id="forecastActualTitle">Forecast vs Actual</h1></div>
      <div class="forecast-actual-header-actions">
        <span class="kpi-section-label">Actual basis</span>
        {actualMode === "MTD" && mtdAppliedDate && <span class="consumption-mtd-applied-date">MTD 반영 일자 {mtdAppliedDate}</span>}
        <button type="button" role="switch" aria-label="Include MTD" aria-checked={actualMode === "MTD"} class="consumption-mtd-switch"
          onClick={() => setActualMode((current) => current === "MTD" ? "FINAL" : "MTD")}>
          <span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
        </button>
        <small>{actualMode === "MTD" ? "MTD ON · 잠정 참고 비교" : "FINAL · 확정 실적 비교"}</small>
      </div>
    </header>

    <section class="forecast-actual-filters" aria-label="Forecast vs Actual filters">
      <label>Quarter<select value={quarter} onChange={(event) => { setQuarter(event.currentTarget.value); setSalesRep(""); resetAccountScope(); }}><option value="ALL">All quarters</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></label>
      <label>Pillar<select value={pillar} onChange={(event) => { setPillar(event.currentTarget.value); setSalesRep(""); resetAccountScope(); }}><option value="ALL">All pillars</option><option value="DP">Data Platform</option><option value="OCI">OCI</option></select></label>
      <label>Sales Rep<select value={salesRep} onChange={(event) => { setSalesRep(event.currentTarget.value); resetAccountScope(); }}><option value="">All sales reps</option>{data?.salesRepOptions.map((value) => <option value={value}>{value}</option>)}</select></label>
      <label>Account
        <div class="consumption-insights-combobox forecast-actual-account-search" ref={accountComboboxRef}>
          <input type="search" role="combobox" aria-autocomplete="list" aria-expanded={accountSearchOpen} aria-controls="forecastActualAccountOptions"
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
      </label>
    </section>

    {loading && !data && <div class="forecast-actual-loading" role="status"><oj-progress-circle size="sm" value={-1}></oj-progress-circle><span>Loading comparison…</span></div>}
    {error && <div class="consumption-inline-error" role="alert"><strong>Unable to load comparison</strong><span>{error}</span></div>}

    {data && summary && <div class={loading ? "forecast-actual-results is-updating" : "forecast-actual-results"} aria-busy={loading}>
      <div class="forecast-actual-period-note"><strong>{data.fiscalYear} · {data.quarter}</strong><span>{periodSpan}</span><span>{periods.length}개 데이터 월 · 최신 월부터 표시</span></div>
      {actualMode === "MTD" && <section class="forecast-actual-mtd-comparison"><p><strong>월 Forecast · MTD 누적액 · 단순 차이</strong><span>월 중간 참고 비교이며 확정 미달 판정이 아님</span></p></section>}
      <section class="forecast-actual-summary" aria-label="Comparison summary">
        <article><span>Full-period Forecast</span><strong>{formatAmount(summary.fullPeriodForecastAmount)}</strong><small>{periodSpan}</small></article>
        <article><span>Confirmed Actual</span><strong>{formatAmount(summary.confirmedActualAmount)}</strong><small>FINAL periods only</small></article>
        <article class={tone(summary.confirmedDifferenceAmount)}><span>Confirmed Difference</span><strong>{formatAmount(summary.confirmedDifferenceAmount)}</strong><small>{formatPercent(summary.confirmedDifferencePercent)}</small></article>
        <article><span>Projected period close</span><strong>{formatAmount(summary.projectedAmount)}</strong><small>MTD mode only</small></article>
        <article><span>Accounts needing attention</span><strong>{summary.attentionAccountCount}</strong><small>{summary.accountCount} accounts in view</small></article>
      </section>

      <section class="forecast-actual-matrix-shell" aria-label="Account monthly comparison">
        <div class="consumption-scroll-controls" aria-label="Monthly horizontal scroll controls">
          <button type="button" aria-label="Scroll monthly columns left" disabled={!monthScroll.left} onClick={() => scrollMonths(-1)}><ScrollChevron direction="left" /></button>
          <button type="button" aria-label="Scroll monthly columns right" disabled={!monthScroll.right} onClick={() => scrollMonths(1)}><ScrollChevron direction="right" /></button>
        </div>
        <div class="forecast-actual-month-scroll" ref={monthScrollRef} tabIndex={0} onScroll={refreshMonthScrollState} onKeyDown={handleMonthScrollKeyDown}>
          <table class="forecast-actual-matrix">
            <thead><tr>
              <th class="is-sticky is-account" aria-sort={ariaSort("account")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("account")}>Account<SortIndicator active={sortKey === "account"} direction={sortDirection} /></button></th>
              <th class="is-sticky is-rep" aria-sort={ariaSort("salesRep")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("salesRep")}>Sales rep<SortIndicator active={sortKey === "salesRep"} direction={sortDirection} /></button></th>
              <th class="is-sticky is-summary" aria-sort={ariaSort("forecast")}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort("forecast")}>Full-period summary<SortIndicator active={sortKey === "forecast"} direction={sortDirection} /></button></th>
              {periods.map((periodKey) => <th aria-sort={ariaSort(`month:${periodKey}`)}><button type="button" class="forecast-actual-sort-button" onClick={() => toggleSort(`month:${periodKey}`)}>{periodKey}<SortIndicator active={sortKey === `month:${periodKey}`} direction={sortDirection} /></button></th>)}
            </tr></thead>
            <tbody>
              {rows.map((row) => <tr>
                <th scope="row" class="is-sticky is-account"><strong>{row.account}</strong><small class="forecast-actual-account-rep">{row.salesRep || "Unassigned"}</small></th>
                <td class="is-sticky is-rep"><span class="forecast-actual-secondary">{row.salesRep || "Unassigned"}</span></td>
                <td class="is-sticky is-summary"><div class="forecast-actual-fixed-summary"><span>Forecast <strong>{formatAmount(row.fullPeriodForecastAmount)}</strong></span><span>Confirmed Actual <strong>{formatAmount(row.confirmedActualAmount)}</strong></span><span class={tone(row.differenceAmount)}>Difference <strong>{formatAmount(row.differenceAmount)}</strong></span><div class="forecast-actual-statuses"><span class={`forecast-actual-status ${row.actualShortfall ? "is-confirmed-risk" : ""}`}>{row.actualShortfall === null ? "확정 판정 대기" : row.actualShortfall ? "확정 실적 미달" : "확정 실적 충족"}</span><span class={`forecast-actual-status ${row.attention === true ? "is-projection-watch" : ""}`}>{row.attention === null ? "예상 판정 불가" : row.attention ? "예상 기반 주시" : "예상 기준 정상"}</span></div></div></td>
                {periods.map((periodKey) => {
                  const month = monthByPeriod(row, periodKey);
                  if (!month) return <td class="forecast-actual-month-cell is-empty"><div class="forecast-actual-month-cell__content"><span>데이터 없음</span></div></td>;
                  const mtdDifference = month.actualState === "MTD" && month.actualAmount !== null && month.forecastAmount !== null
                    ? subtractExactDecimals(month.actualAmount, month.forecastAmount) : null;
                  return <td class={`forecast-actual-month-cell ${month.actualState === "MTD" ? "is-provisional" : ""}`}>
                    <div class="forecast-actual-month-cell__content">
                      <span>월 Forecast <strong>{month.forecastAmount === null ? "미입력" : formatAmount(month.forecastAmount)}</strong></span>
                      <span>{month.actualState === "MTD" ? "MTD 누적액" : "Actual"} <strong>{formatAmount(month.actualAmount)}</strong></span>
                      {month.monthEndProjection !== null && <span class="forecast-actual-projection">예상 마감 <strong>{formatAmount(month.monthEndProjection)}</strong></span>}
                      <span class={tone(month.actualState === "MTD" ? mtdDifference : month.differenceAmount)}>{month.actualState === "MTD" ? "단순 차이" : "Difference"} <strong>{formatAmount(month.actualState === "MTD" ? mtdDifference : month.differenceAmount)}</strong></span>
                      <small class="forecast-actual-month-state"><strong>{month.actualState === "FINAL" ? "확정 Actual" : month.actualState === "MTD" ? "잠정 MTD" : "미확정"}</strong></small>
                    </div>
                  </td>;
                })}
              </tr>)}
              {!rows.length && <tr><td class="forecast-actual-empty" colSpan={3 + periods.length}>No accounts match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>}
  </main>;
};
