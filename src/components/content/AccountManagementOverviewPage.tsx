import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  AccountHierarchyAccount,
  AccountWorkload,
  fetchAccountsWorkloadsHierarchy,
} from "../../data/accountsWorkloadsApi";
import {
  ActualQuarterFilter,
  OverviewExceptionFilter,
  OverviewDeal,
  OverviewSort,
  OverviewSortColumn,
  TargetView,
  buildAccountManagementOverview,
  currentFiscalPeriod,
  formatDaysToClose,
  overviewPrimaryAmount,
  sortOverviewDeals,
  targetStatus,
  toggleOverviewExceptionFilter,
} from "../../data/accountManagementOverview";
import { AppMessageBanner } from "./AppMessageBanner";
import "ojs/ojprogress-circle";
import { PageShell, PageFilterPanel, PageActivity } from "../common/PageShell";
import { FiscalYearSelector } from "../common/FiscalYearSelector";
import { ConsumptionViewportProgress } from "./ConsumptionViewportProgress";
import type { FiscalYear } from "../../data/kpiMockData";


type Props = Readonly<{
  breadcrumb?: ComponentChildren;
  onNavigate: (routeId: string) => void;
}>;

const fmtUsd = (value: number) => {
  const thousands = value / 1_000;
  return `$${thousands.toLocaleString("en-US", { maximumFractionDigits: Math.abs(thousands) < 10 ? 1 : 0 })}K`;
};

const metricSecondary = (missing: number, enteredAcr: number, showAcr = true) => [
  showAcr ? `Entered ACR ${fmtUsd(enteredAcr)}` : "",
  missing ? `missing ${missing}` : "",
].filter(Boolean).join(" · ") || "Complete";

const displayTarget = (item: OverviewDeal) => item.deal.targetFiscalYear && item.deal.targetQuarter
  ? `${item.deal.targetFiscalYear} Q${item.deal.targetQuarter}` : "Target not set";

const statusLabel = (item: OverviewDeal) => ({
  OVERDUE: "Overdue",
  THIS_QUARTER: "This quarter",
  NEXT_QUARTER: "Next quarter",
  TARGET_NOT_SET: "Target not set",
  FUTURE: "Future",
}[targetStatus(item)]);

const primaryAmount = overviewPrimaryAmount;

const groupActual = (items: readonly OverviewDeal[]) => {
  const accounts = new Map<number, { account: AccountHierarchyAccount; workloads: Map<number, { workload: AccountWorkload; deals: OverviewDeal[] }> }>();
  items.forEach((item) => {
    if (!accounts.has(item.account.id)) accounts.set(item.account.id, { account: item.account, workloads: new Map() });
    const account = accounts.get(item.account.id)!;
    if (!account.workloads.has(item.workload.id)) account.workloads.set(item.workload.id, { workload: item.workload, deals: [] });
    account.workloads.get(item.workload.id)!.deals.push(item);
  });
  return [...accounts.values()];
};

const sumArrByKind = (items: readonly OverviewDeal[], kind: "NEW" | "EXPANSION" | "RENEWAL") => items.reduce((sum, item) => {
  if (item.deal.revenueType.toUpperCase() !== kind) return sum;
  return sum + (item.deal.arrUsd ?? 0);
}, 0);

const sumAcr = (items: readonly OverviewDeal[]) => items.reduce((sum, item) => sum + (item.deal.acrUsd ?? 0), 0);

type RevenueMeasure = "ALL" | "ARR" | "ACR";
type RevenueKind = "NEW" | "EXPANSION" | "RENEWAL";
const revenueKinds: readonly RevenueKind[] = ["NEW", "EXPANSION", "RENEWAL"];

const sumMeasure = (items: readonly OverviewDeal[], kind: RevenueKind, measure: Exclude<RevenueMeasure, "ALL">) =>
  items.reduce((sum, item) => item.deal.revenueType.toUpperCase() === kind
    ? sum + (measure === "ARR" ? item.deal.arrUsd ?? 0 : item.deal.acrUsd ?? 0)
    : sum, 0);

export function AccountManagementOverviewPage({ breadcrumb }: Props) {
  const [hierarchy, setHierarchy] = useState<Awaited<ReturnType<typeof fetchAccountsWorkloadsHierarchy>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  // Match Consumption: update the controlled filter immediately and keep the
  // last response mounted. Lock/invalidate synchronously, before effects run.
  const queryControlsLockRef = useRef(true);
  const requestGeneration = useRef(0);
  const refresh = (applyFilter?: () => void) => {
    if (queryControlsLockRef.current) return;
    queryControlsLockRef.current = true;
    ++requestGeneration.current;
    setSearchOpen(false);
    setLoading(true);
    applyFilter?.();
    setReloadKey((value) => value + 1);
  };
  const fySelectedRef = useRef(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const overviewSearchRef = useRef<HTMLDivElement>(null);
  const current = currentFiscalPeriod();
  const [actualFy, setActualFy] = useState(current.fiscalYear);
  const [actualQuarter, setActualQuarter] = useState<ActualQuarterFilter>("ALL");
  const [actualMeasure, setActualMeasure] = useState<RevenueMeasure>("ALL");
  const [selectedException, setSelectedException] = useState<OverviewExceptionFilter | null>(null);
  const [targetView, setTargetView] = useState<TargetView>("PRIORITY");
  const [targetSort, setTargetSort] = useState<OverviewSort | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(`${current.fiscalYear} Q${current.quarter}`);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [latestUpdateTooltip, setLatestUpdateTooltip] = useState<{ text: string; left: number; top: number } | null>(null);

  useEffect(() => {
    let active = true;
    const generation = ++requestGeneration.current;
    queryControlsLockRef.current = true;
    setLoading(true);
    setError("");
    fetchAccountsWorkloadsHierarchy({ includeArchived: false, includeDeletedDeals: false })
      .then((value) => {
        if (!active || generation !== requestGeneration.current) return;
        setHierarchy(value);
        if (!fySelectedRef.current) {
          const years = buildAccountManagementOverview(value).fiscalYears;
          setActualFy((year) => years.length && !years.includes(year) ? years[0] : year);
        }
        setCompletedAt(new Date());
      })
      .catch((cause: unknown) => {
        if (active && generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Overview data could not be loaded.");
      })
      .finally(() => {
        if (active && generation === requestGeneration.current) {
          queryControlsLockRef.current = false;
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!searchOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!overviewSearchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [searchOpen]);

  const overview = useMemo(() => hierarchy ? buildAccountManagementOverview(hierarchy) : null, [hierarchy]);

  const selectedAccountFilter = selectedAccount
    ? { accountId: selectedAccountId ?? undefined, accountName: selectedAccount }
    : undefined;
  const actual = overview?.actualFor(actualFy, actualQuarter, "", selectedAccountFilter);
  const actualYear = overview?.actualFor(actualFy, "ALL", "", selectedAccountFilter);
  const target = overview?.targetFor(targetView, "", new Date(), targetPeriod, selectedAccountFilter);
  const actualListDeals = selectedException === "CLOSE_DATE_MISSING"
    ? overview?.closeDateMissingFor("", selectedAccountFilter) ?? []
    : actual?.deals ?? [];
  const grouped = groupActual(actualListDeals);
  const visibleMeasures = actualMeasure === "ALL" ? (["ARR", "ACR"] as const) : [actualMeasure];
  const quarterSeries = ([1, 2, 3, 4] as const).map((quarter) => {
    const deals = (actualYear?.deals ?? []).filter((item) => item.actualPeriod?.quarter === quarter);
    return { quarter, bars: visibleMeasures.map((measure) => ({
      measure,
      segments: revenueKinds.map((kind) => ({ kind, value: sumMeasure(deals, kind, measure) })),
    })) };
  });
  const maxQuarter = Math.max(1, ...quarterSeries.flatMap((quarter) => quarter.bars.map((bar) => bar.segments.reduce((sum, item) => sum + item.value, 0))));
  const accountNames = [...new Set((hierarchy?.accounts ?? []).filter((account) => !account.archived && account.workloads.some((workload) => !workload.archived)).map((account) => account.name))].sort((a, b) => a.localeCompare(b));
  const filteredAccountNames = accountNames.filter((account) => account.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const accountDetails = (accountName: string) => hierarchy?.accounts.find((account) => account.name === accountName)?.workloads
    .filter((workload) => !workload.archived)
    .map((workload) => `${workload.name} · ${workload.plans.map((plan) => plan.sourcePlanNumber).filter(Boolean).join(", ") || "—"}`)
    .join(" | ") || "— · —";

  const activeWorkloadCount = (hierarchy?.accounts ?? [])
    .filter((account) => !account.archived && (!selectedAccount || (selectedAccountId !== null ? account.id === selectedAccountId : account.name === selectedAccount)))
    .reduce((total, account) => total + account.workloads.filter((workload) => !workload.archived).length, 0);
  const openOpportunityCount = overview?.openFor("", selectedAccountFilter).length ?? 0;
  const sortedTargetDeals = sortOverviewDeals(target?.deals ?? [], targetSort);
  const effectiveTargetSort: OverviewSort = targetSort ?? { column: "closeDate", direction: "ascending" };
  const sortTargetBy = (column: OverviewSortColumn) => setTargetSort((before) => {
    const current = before ?? { column: "closeDate", direction: "ascending" };
    return { column, direction: current.column === column && current.direction === "ascending" ? "descending" : "ascending" };
  });
  const targetPrimaryTotal = (target?.deals ?? []).reduce((sum, item) => sum + (primaryAmount(item) ?? 0), 0);
  const targetPeriods = [...new Set((overview?.targetDeals ?? [])
    .filter((item) => item.deal.targetFiscalYear && item.deal.targetQuarter)
    .map(displayTarget))].sort();

  const toggle = (key: string) => setExpanded((before) => {
    const next = new Set(before);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const toggleException = (requested: OverviewExceptionFilter) => {
    const next = toggleOverviewExceptionFilter(selectedException, requested);
    setSelectedException(next);
    if (next === "OVERDUE" || next === "TARGET_NOT_SET") {
      setTargetView(next);
      document.getElementById("targetActions")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setTargetView("PRIORITY");
    if (next === "CLOSE_DATE_MISSING") {
      document.getElementById("actualOpportunityList")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const showLatestUpdate = (element: HTMLElement, text: string) => {
    const bounds = element.getBoundingClientRect();
    setLatestUpdateTooltip({
      text,
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - 352)),
      top: Math.min(bounds.bottom + 6, window.innerHeight - 96),
    });
  };

  return (
    <PageShell className="account-management-overview account-overview-standard" ariaLabelledBy="accountManagementOverviewTitle"
      title="Account Management Overview" breadcrumb={breadcrumb} headingSpacing="compact" activityPosition="custom" busy={loading} busyLabel="Refreshing overview"
      titleControls={<FiscalYearSelector selected={actualFy as FiscalYear} current={current.fiscalYear as FiscalYear} disabled={loading} onSelect={(year) => refresh(() => { fySelectedRef.current = true; setActualFy(year); })} />}
      filters={<PageFilterPanel className="account-overview__filters" ariaLabel="Overview search and filters">
        <label class="account-overview__filter">Quarter<select aria-label="Actual quarter" disabled={loading} value={actualQuarter} onChange={(event) => { const value = event.currentTarget.value; refresh(() => setActualQuarter(value === "ALL" ? "ALL" : Number(value) as 1 | 2 | 3 | 4)); }}>{(["ALL", 1, 2, 3, 4] as const).map((quarter) => <option key={quarter} value={quarter}>{quarter === "ALL" ? "All" : `Q${quarter}`}</option>)}</select></label>
        <label class="account-overview__filter">Measure<select aria-label="Revenue measure" disabled={loading} value={actualMeasure} onChange={(event) => { const value = event.currentTarget.value as RevenueMeasure; refresh(() => setActualMeasure(value)); }}>{(["ALL", "ARR", "ACR"] as const).map((measure) => <option key={measure} value={measure}>{measure === "ALL" ? "All" : measure}</option>)}</select></label>
          <div class="account-overview__search">
            <label for="accountOverviewSearch">Account</label>
            <div class="account-overview__search-combobox" ref={overviewSearchRef}>
              <div class="account-overview__search-field"><span class="oj-ux-ico-search" aria-hidden="true"></span><input id="accountOverviewSearch" disabled={loading} type="search" role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="accountOverviewOptions" value={searchOpen ? search : (selectedAccount || "All Accounts")} placeholder="Search Account" autoComplete="off" onFocus={() => setSearchOpen(true)} onClick={(event) => { setSearch(""); setSearchOpen(true); event.currentTarget.select(); }} onInput={(event) => { setSearch((event.currentTarget as HTMLInputElement).value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setSearch(""); setSearchOpen(false); event.currentTarget.blur(); } }} />{searchOpen && search && <button type="button" aria-label="Clear account" onClick={() => { setSearch(""); setSearchOpen(true); }}>Clear</button>}</div>
              {searchOpen && <div id="accountOverviewOptions" class="account-overview__search-options" role="listbox">
                <button type="button" role="option" aria-selected={!selectedAccount} onMouseDown={(event) => event.preventDefault()} onClick={() => refresh(() => { setSelectedAccount(""); setSelectedAccountId(null); setSearch(""); })}><strong>All Accounts</strong><small>Active Account &amp; Workload only</small></button>
                {filteredAccountNames.map((account) => <button type="button" role="option" key={account} aria-selected={selectedAccount === account} onMouseDown={(event) => event.preventDefault()} onClick={() => { const id = hierarchy?.accounts.find((candidate) => candidate.name === account)?.id ?? null; refresh(() => { setSelectedAccount(account); setSelectedAccountId(id); setSearch(""); }); }}><strong>{account}</strong><small>{accountDetails(account)}</small></button>)}
                {filteredAccountNames.length === 0 && <p>No matching Accounts.</p>}
              </div>}
            </div>

          </div>
      </PageFilterPanel>}>
      <link rel="stylesheet" href="components/content/AccountManagementOverviewPage.css" />
      <AppMessageBanner ariaLabel="Account overview notifications" messages={error ? [{ id: "overview-load-error", severity: "error", summary: "Unable to load Account Management Overview", detail: error, persistence: "sticky" }] : []} onClose={() => setError("")} />

      <ConsumptionViewportProgress busy={loading} busyLabel="Refreshing overview" />
      <div class="account-overview__reload-row">
        <PageActivity busy={loading} lastCompletedAt={completedAt} onRefresh={() => refresh()} refreshDisabled={loading} compactTimestampButton />
      </div>
      {overview && <>
          <section class="account-overview__exceptions" aria-label="Portfolio and persistent exceptions">
            <button type="button" class={selectedException === "OVERDUE" ? "is-selected" : ""} aria-pressed={selectedException === "OVERDUE"} onClick={() => toggleException("OVERDUE")}><span class="account-overview__exception-icon is-overdue">!</span><span><strong><b>{overview.exceptions.overdue}</b> Overdue</strong><small>Close Date has passed</small></span></button>
            <button type="button" class={selectedException === "CLOSE_DATE_MISSING" ? "is-selected" : ""} aria-pressed={selectedException === "CLOSE_DATE_MISSING"} onClick={() => toggleException("CLOSE_DATE_MISSING")}><span class="account-overview__exception-icon is-warning">!</span><span><strong><b>{overview.exceptions.closeDateMissing}</b> Close date missing</strong><small>WON Opportunities excluded</small></span></button>
            <article class="account-overview__portfolio-card"><span class="account-overview__exception-icon">✓</span><span><strong><b>{activeWorkloadCount}</b> Active Workloads</strong><small>Non-archived workloads in scope</small></span></article>
            <article class="account-overview__portfolio-card"><span class="account-overview__exception-icon">○</span><span><strong><b>{openOpportunityCount}</b> Open {openOpportunityCount === 1 ? "Opportunity" : "Opportunities"}</strong><small>Open deals in active scope</small></span></article>
          </section>

        <section id="actualPerformance" class="account-overview__section account-overview__section--actual">
          <div class="account-overview__section-heading"><div class="account-overview__title-lockup"><span class="account-overview__title-mark"></span><div><h2>Actual Performance <small>• Actual Close Date</small></h2></div></div>

          </div>

          <div class="account-overview__kpis">
            {([null, ...revenueKinds] as const).map((kind) => { const scoped = kind === null ? actual!.deals : actual!.deals.filter((item) => item.deal.revenueType.toUpperCase() === kind); return <article key={kind ?? "TOTAL"}><span>{kind === null ? "Total" : kind === "NEW" ? "New" : kind === "EXPANSION" ? "Expansion" : "Renewal"}</span><div class="account-overview__metric-lines">{visibleMeasures.map((measure) => <strong key={measure}><small>{measure}</small>{fmtUsd(kind === null ? revenueKinds.reduce((sum, revenueKind) => sum + sumMeasure(actual!.deals, revenueKind, measure), 0) : sumMeasure(actual!.deals, kind, measure))}</strong>)}</div><small class="account-overview__won-count"><b>{scoped.length}</b> WON Opportunities · USD K</small></article>; })}
          </div>

          <div class="account-overview__actual-details">
            <article class="account-overview__panel account-overview__quarter-chart">
              <div class="account-overview__panel-heading"><div><h3>{actualFy} quarterly comparison</h3></div><div class="account-overview__legend">{revenueKinds.map((kind) => <span key={kind} class={`is-${kind.toLocaleLowerCase()}`}>{kind === "NEW" ? "New" : kind === "EXPANSION" ? "Expansion" : "Renewal"}</span>)}</div></div>
              <div class="account-overview__vertical-chart"><div class="account-overview__axis"><span>{fmtUsd(maxQuarter)}</span><span>{fmtUsd(maxQuarter * 2 / 3)}</span><span>{fmtUsd(maxQuarter / 3)}</span><span>$0K</span></div><div class="account-overview__plot">{quarterSeries.map((item) => <div key={item.quarter} class={`account-overview__bar-group ${actualQuarter === item.quarter ? "is-selected" : ""}`}><div class="account-overview__bar-columns">{item.bars.map((bar) => { const total = bar.segments.reduce((sum, segment) => sum + segment.value, 0); return <span key={bar.measure} class="account-overview__bar-item" title={`${bar.measure} total ${fmtUsd(total)}`}><span class="account-overview__bar-track"><small class="account-overview__bar-total" style={{ bottom: `${total / maxQuarter * 100}%` }}>{fmtUsd(total)}</small><span class="account-overview__bar-stack" style={{ height: `${total / maxQuarter * 100}%` }}>{bar.segments.map((segment) => <i key={segment.kind} class={`is-${segment.kind.toLocaleLowerCase()}`} title={`${segment.kind} ${bar.measure} ${fmtUsd(segment.value)}`} style={{ flex: `${segment.value} 1 0`, minHeight: 0 }}></i>)}</span></span><b>{bar.measure}</b></span>; })}</div><strong>Q{item.quarter}</strong></div>)}</div></div>
            </article>

            <article id="actualOpportunityList" class="account-overview__panel account-overview__hierarchy">
              <div class="account-overview__panel-heading"><div><h3>{selectedException === "CLOSE_DATE_MISSING" ? "Close date missing Opportunities" : "Account → Workload → Opportunity"}</h3></div>{selectedException === "CLOSE_DATE_MISSING" && <button type="button" onClick={() => setSelectedException(null)}>Clear filter</button>}</div>
              <div class="account-overview__hierarchy-head"><span>Name</span><span>NEW<small>ARR</small></span><span>EXPANSION<small>ARR</small></span><span>RENEWAL<small>ARR</small></span><span>ACR</span></div>
              <div class="account-overview__hierarchy-scroll">{grouped.length === 0 ? <p class="account-overview__empty">{selectedException === "CLOSE_DATE_MISSING" ? "No Close date missing Opportunities in this scope." : "No WON Opportunities in this scope."}</p> : grouped.map(({ account, workloads }) => {
                const accountDeals = [...workloads.values()].flatMap((item) => item.deals);
                const accountKey = `account-${account.id}`;
                const accountExpanded = selectedException === "CLOSE_DATE_MISSING" || expanded.has(accountKey);
                return <div class="account-overview__tree-group"><button type="button" class="account-overview__tree-row is-account" onClick={() => toggle(accountKey)} aria-expanded={accountExpanded}><span><i>{accountExpanded ? "−" : "+"}</i>{account.name}{account.archived && <em>Archived</em>}</span><b>{fmtUsd(sumArrByKind(accountDeals, "NEW"))}</b><b>{fmtUsd(sumArrByKind(accountDeals, "EXPANSION"))}</b><b>{fmtUsd(sumArrByKind(accountDeals, "RENEWAL"))}</b><b>{fmtUsd(sumAcr(accountDeals))}</b></button>
                  {accountExpanded && [...workloads.values()].map(({ workload, deals }) => { const workloadKey = `workload-${workload.id}`; const workloadExpanded = selectedException === "CLOSE_DATE_MISSING" || expanded.has(workloadKey); return <div><button type="button" class="account-overview__tree-row is-workload" onClick={() => toggle(workloadKey)} aria-expanded={workloadExpanded}><span><i>{workloadExpanded ? "−" : "+"}</i>{workload.name}{workload.archived && <em>Archived</em>}</span><b>{fmtUsd(sumArrByKind(deals, "NEW"))}</b><b>{fmtUsd(sumArrByKind(deals, "EXPANSION"))}</b><b>{fmtUsd(sumArrByKind(deals, "RENEWAL"))}</b><b>{fmtUsd(sumAcr(deals))}</b></button>
                    {workloadExpanded && deals.map((item) => <div class="account-overview__deal-row"><span><strong>{item.deal.name}</strong><small>{item.deal.revenueType} · {item.deal.actualCloseDate ? `Close ${item.deal.actualCloseDate}` : "Close date missing"} · {displayTarget(item)} · {item.deal.opportunityNo ?? "No opportunity"}</small></span><b>{item.deal.revenueType.toUpperCase() === "NEW" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "EXPANSION" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "RENEWAL" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.acrUsd === null ? "—" : fmtUsd(item.deal.acrUsd)}</b></div>)}</div>; })}
                </div>;
              })}</div>
            </article>
          </div>
        </section>

        <section id="targetActions" class="account-overview__section account-overview__section--target">
          <div class="account-overview__section-heading"><div class="account-overview__title-lockup"><span class="account-overview__title-mark"></span><div><h2>Target Actions <small>• Target FY / Quarter</small></h2></div></div>
            <div class="account-overview__target-tabs" role="tablist" aria-label="Target action view">{([
              ["PRIORITY", "Priority"], ["OVERDUE", "Overdue"], ["THIS_QUARTER", "This quarter"], ["NEXT_QUARTER", "Next quarter"], ["CHOOSE_PERIOD", "Choose period"]
            ] as const).map(([value, label]) => <button type="button" role="tab" disabled={loading} aria-selected={targetView === value} class={targetView === value ? "is-selected" : ""} onClick={() => refresh(() => { setTargetView(value); setSelectedException(null); })}><strong>{label}</strong>{value === "THIS_QUARTER" && <small>{current.fiscalYear} · Q{current.quarter}</small>}{value === "NEXT_QUARTER" && <small>Upcoming</small>}{value === "CHOOSE_PERIOD" && <small>FY / Q</small>}</button>)}</div>
          </div>
          {targetView === "CHOOSE_PERIOD" && <label class="account-overview__target-period">Target period<select disabled={loading} value={targetPeriod} onChange={(event) => { const value = (event.currentTarget as HTMLSelectElement).value; refresh(() => setTargetPeriod(value)); }}>{(targetPeriods.length ? targetPeriods : [targetPeriod]).map((period) => <option value={period}>{period}</option>)}</select></label>}

          <div class="account-overview__pipeline">
            <article><span>NEW ARR PIPELINE</span><strong>{fmtUsd(target!.pipeline.newArr.amount)}</strong><small>{metricSecondary(target!.pipeline.newArr.missing, target!.pipeline.newArr.enteredAcr)}</small></article>
            <article><span>EXPANSION ARR PIPELINE</span><strong>{fmtUsd(target!.pipeline.expansionArr.amount)}</strong><small>{metricSecondary(target!.pipeline.expansionArr.missing, target!.pipeline.expansionArr.enteredAcr)}</small></article>
            <article><span>ACR</span><strong>{fmtUsd(target!.pipeline.acr.amount)}</strong><small>{metricSecondary(target!.pipeline.acr.missing, 0, false)}</small></article>
          </div>

          <article class="account-overview__panel account-overview__target-list"><div class="account-overview__panel-heading"><div><h3>Open Opportunity action list</h3></div></div>
            <div class="account-overview__target-grid" role="table" aria-label="OPEN Opportunities" aria-colcount={8}><div class="account-overview__target-head" role="row">{([
              ["account", "Account / Workload / Opportunity"], ["type", "Type"], ["amount", "Amount"], ["target", "Target FY/Q"],
              ["status", "Status"], ["closeDate", "Close Date"], ["daysToClose", "Days to Close"], ["latestUpdate", "Latest Update"],
            ] as const).map(([column, label]) => <span key={column} role="columnheader" aria-sort={effectiveTargetSort.column === column ? effectiveTargetSort.direction : "none"}><button type="button" class="account-overview__sort-button" onClick={() => sortTargetBy(column)} title={column === "closeDate" ? "Recorded Close Date (actualCloseDate), missing dates last" : `Sort by ${label}`}>{label}<i aria-hidden="true">{effectiveTargetSort.column === column ? effectiveTargetSort.direction === "ascending" ? "↑" : "↓" : "↕"}</i></button></span>)}</div>
            <div class="account-overview__target-scroll" role="rowgroup">{sortedTargetDeals.length === 0 ? <p class="account-overview__empty">No OPEN Opportunities in this target scope.</p> : sortedTargetDeals.map((item) => { const latestUpdate = item.deal.latestUpdate || "No update"; return <div key={item.deal.id} class="account-overview__target-row" role="row"><span role="cell"><strong>{item.account.name} ({item.workload.name})</strong><small>{item.deal.name} ({item.deal.opportunityNo ?? "No Opportunity ID"})</small></span><span role="cell"><em class={`account-overview__type-badge is-${item.deal.revenueType.toLowerCase()}`}>{item.deal.revenueType}</em></span><b role="cell">{primaryAmount(item) === null ? "—" : fmtUsd(primaryAmount(item)!)}</b><span role="cell">{displayTarget(item)}</span><span role="cell"><em class={`account-overview__status is-${targetStatus(item).toLocaleLowerCase()}`}>{statusLabel(item)}</em></span><span role="cell">{item.deal.actualCloseDate || "—"}</span><span role="cell">{formatDaysToClose(item.deal.actualCloseDate)}</span><span role="cell" class="account-overview__latest-update" tabIndex={0} aria-describedby={latestUpdateTooltip?.text === latestUpdate ? "accountOverviewLatestUpdateTooltip" : undefined} onMouseEnter={(event) => showLatestUpdate(event.currentTarget, latestUpdate)} onMouseLeave={() => setLatestUpdateTooltip(null)} onFocus={(event) => showLatestUpdate(event.currentTarget, latestUpdate)} onBlur={() => setLatestUpdateTooltip(null)}>{latestUpdate}</span></div>; })}</div>
            </div><footer class="account-overview__target-footer"><span>{target!.deals.length} open Opportunities</span><strong>Selected total {fmtUsd(targetPrimaryTotal)}</strong></footer>
            {latestUpdateTooltip && <div id="accountOverviewLatestUpdateTooltip" class="account-overview__latest-tooltip" role="tooltip" style={{ left: `${latestUpdateTooltip.left}px`, top: `${latestUpdateTooltip.top}px` }}>{latestUpdateTooltip.text}</div>}
          </article>
        </section>
      </>}
    </PageShell>
  );
}
