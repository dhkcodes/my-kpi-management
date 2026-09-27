import { ComponentChildren, h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  AccountHierarchyAccount,
  AccountWorkload,
  fetchAccountsWorkloadsHierarchy,
} from "../../data/accountsWorkloadsApi";
import {
  ActualQuarterFilter,
  OverviewDeal,
  TargetView,
  buildAccountManagementOverview,
  currentFiscalPeriod,
  quarterEndDate,
  targetStatus,
} from "../../data/accountManagementOverview";
import { AppMessageBanner } from "./AppMessageBanner";
import "ojs/ojprogress-circle";

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

const primaryAmount = (item: OverviewDeal) =>
  item.deal.revenueType.toUpperCase() === "RENEWAL" ? item.deal.acrUsd : item.deal.arrUsd;

const daysToTargetEnd = (item: OverviewDeal) => {
  if (!item.deal.targetFiscalYear || !item.deal.targetQuarter) return "—";
  const end = quarterEndDate(item.deal.targetFiscalYear, item.deal.targetQuarter);
  if (!end) return "—";
  const days = Math.ceil((new Date(`${end}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`;
};

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

const sumPrimary = (items: readonly OverviewDeal[], kind: "NEW" | "EXPANSION" | "RENEWAL") => items.reduce((sum, item) => {
  if (item.deal.revenueType.toUpperCase() !== kind) return sum;
  return sum + (kind === "RENEWAL" ? item.deal.acrUsd ?? 0 : item.deal.arrUsd ?? 0);
}, 0);

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
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const current = currentFiscalPeriod();
  const [actualFy, setActualFy] = useState(current.fiscalYear);
  const [actualQuarter, setActualQuarter] = useState<ActualQuarterFilter>("ALL");
  const [actualMeasure, setActualMeasure] = useState<RevenueMeasure>("ALL");
  const [targetView, setTargetView] = useState<TargetView>("PRIORITY");
  const [targetPeriod, setTargetPeriod] = useState(`${current.fiscalYear} Q${current.quarter}`);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [latestUpdateTooltip, setLatestUpdateTooltip] = useState<{ text: string; left: number; top: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAccountsWorkloadsHierarchy({ includeArchived: false, includeDeletedDeals: false })
      .then((value) => { if (active) { setHierarchy(value); setError(""); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Overview data could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const overview = useMemo(() => hierarchy ? buildAccountManagementOverview(hierarchy) : null, [hierarchy]);
  useEffect(() => {
    if (overview && overview.fiscalYears.length && !overview.fiscalYears.includes(actualFy)) setActualFy(overview.fiscalYears[0]);
  }, [overview, actualFy]);

  const actual = overview?.actualFor(actualFy, actualQuarter, search);
  const actualYear = overview?.actualFor(actualFy, "ALL", search);
  const target = overview?.targetFor(targetView, search, new Date(), targetPeriod);
  const grouped = groupActual(actual?.deals ?? []);
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
  const targetPrimaryTotal = (target?.deals ?? []).reduce((sum, item) => sum + (primaryAmount(item) ?? 0), 0);
  const targetPeriods = [...new Set((overview?.targetDeals ?? [])
    .filter((item) => item.deal.targetFiscalYear && item.deal.targetQuarter)
    .map(displayTarget))].sort();

  const toggle = (key: string) => setExpanded((before) => {
    const next = new Set(before);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const showLatestUpdate = (element: HTMLElement, text: string) => {
    const bounds = element.getBoundingClientRect();
    setLatestUpdateTooltip({
      text,
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - 352)),
      top: Math.min(bounds.bottom + 6, window.innerHeight - 96),
    });
  };

  return (
    <section class="account-management-overview" aria-labelledby="accountManagementOverviewTitle">
      <header class="account-overview__header">
        <div>{breadcrumb}<span class="kpi-eyebrow">Accounts &amp; Workloads / Overview</span><h1 id="accountManagementOverviewTitle">Account Management Overview</h1></div>
      </header>

      <AppMessageBanner ariaLabel="Account overview notifications" messages={error ? [{ id: "overview-load-error", severity: "error", summary: "Unable to load Account Management Overview", detail: error, persistence: "sticky" }] : []} onClose={() => setError("")} />

      {loading && <div class="account-overview__loading" role="status"><oj-progress-circle value={-1} size="sm"></oj-progress-circle> Loading overview</div>}

      {overview && <>
        <div class="account-overview__top-row">
          <div class="account-overview__search">
            <label for="accountOverviewSearch">Account</label>
            <div class="account-overview__search-combobox">
              <div class="account-overview__search-field"><span class="oj-ux-ico-search" aria-hidden="true"></span><input id="accountOverviewSearch" type="search" role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="accountOverviewOptions" value={search} placeholder="Search Account" autoComplete="off" onFocus={() => setSearchOpen(true)} onInput={(event) => { setSearch((event.currentTarget as HTMLInputElement).value); setSearchOpen(true); }} />{search && <button type="button" aria-label="Clear account" onClick={() => { setSearch(""); setSearchOpen(true); }}>Clear</button>}</div>
              {searchOpen && <div id="accountOverviewOptions" class="account-overview__search-options" role="listbox">
                <button type="button" role="option" aria-selected={!search} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(""); setSearchOpen(false); }}><strong>All Accounts</strong><small>Active Account &amp; Workload only</small></button>
                {filteredAccountNames.map((account) => <button type="button" role="option" key={account} aria-selected={search === account} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(account); setSearchOpen(false); }}><strong>{account}</strong><small>Account &amp; Workload</small></button>)}
                {filteredAccountNames.length === 0 && <p>No matching Accounts.</p>}
              </div>}
            </div>
            <small>Search the account list or select an account to filter the overview.</small>
          </div>
          <section class="account-overview__exceptions" aria-label="Persistent exceptions">
            <button type="button" onClick={() => { setTargetView("OVERDUE"); document.getElementById("targetActions")?.scrollIntoView({ behavior: "smooth" }); }}><span class="account-overview__exception-icon is-overdue">!</span><span><strong>{overview.exceptions.overdue} overdue</strong><small>Target quarter ended</small></span></button>
            <button type="button" onClick={() => { setTargetView("PRIORITY"); document.getElementById("targetActions")?.scrollIntoView({ behavior: "smooth" }); }}><span class="account-overview__exception-icon is-warning">?</span><span><strong>{overview.exceptions.targetNotSet} target not set</strong><small>Open deals without FY/Q</small></span></button>
            <button type="button" onClick={() => document.getElementById("actualPerformance")?.scrollIntoView({ behavior: "smooth" })}><span class="account-overview__exception-icon is-warning">!</span><span><strong>{overview.exceptions.closeDateMissing} Close Date missing</strong><small>WON deals excluded</small></span></button>
          </section>
        </div>

        <section id="actualPerformance" class="account-overview__section account-overview__section--actual">
          <div class="account-overview__section-heading"><div class="account-overview__title-lockup"><span class="account-overview__title-mark"></span><div><h2>Actual Performance <small>• Actual Close Date</small></h2><p>WON deals are attributed to the fiscal year and quarter that contain their Actual Close Date.</p></div></div>
            <div class="account-overview__period-controls"><label>Fiscal year<select value={actualFy} onChange={(event) => setActualFy((event.currentTarget as HTMLSelectElement).value)}>{(overview.fiscalYears.length ? overview.fiscalYears : [current.fiscalYear]).map((fy) => <option key={fy} value={fy}>{fy}</option>)}</select></label>
              <div><span class="account-overview__control-label">Quarter</span><div class="account-overview__segments" aria-label="Actual quarter">{(["ALL", 1, 2, 3, 4] as const).map((quarter) => <button key={quarter} type="button" class={actualQuarter === quarter ? "is-selected" : ""} aria-pressed={actualQuarter === quarter} onClick={() => setActualQuarter(quarter)}>{quarter === "ALL" ? "All" : `Q${quarter}`}</button>)}</div></div>
              <div><span class="account-overview__control-label">Measure</span><div class="account-overview__segments" aria-label="Revenue measure">{(["ALL", "ARR", "ACR"] as const).map((measure) => <button key={measure} type="button" class={actualMeasure === measure ? "is-selected" : ""} aria-pressed={actualMeasure === measure} onClick={() => setActualMeasure(measure)}>{measure === "ALL" ? "All" : measure}</button>)}</div></div></div>
          </div>

          <div class="account-overview__kpis">
            {([null, ...revenueKinds] as const).map((kind) => { const scoped = kind === null ? actual!.deals : actual!.deals.filter((item) => item.deal.revenueType.toUpperCase() === kind); return <article key={kind ?? "TOTAL"}><span>{kind === null ? "Total" : kind === "NEW" ? "New" : kind === "EXPANSION" ? "Expansion" : "Renewal"}</span><div class="account-overview__metric-lines">{visibleMeasures.map((measure) => <strong key={measure}><small>{measure}</small>{fmtUsd(kind === null ? revenueKinds.reduce((sum, revenueKind) => sum + sumMeasure(actual!.deals, revenueKind, measure), 0) : sumMeasure(actual!.deals, kind, measure))}</strong>)}</div><small>{scoped.length} WON deals · USD K</small></article>; })}
          </div>

          <div class="account-overview__actual-details">
            <article class="account-overview__panel account-overview__quarter-chart">
              <div class="account-overview__panel-heading"><div><h3>{actualFy} quarterly comparison</h3><p>ARR / ACR measure bars stacked by New / Expansion / Renewal · not cumulative · USD K</p></div><div class="account-overview__legend">{revenueKinds.map((kind) => <span key={kind} class={`is-${kind.toLocaleLowerCase()}`}>{kind === "NEW" ? "New" : kind === "EXPANSION" ? "Expansion" : "Renewal"}</span>)}</div></div>
              <div class="account-overview__vertical-chart"><div class="account-overview__axis"><span>{fmtUsd(maxQuarter)}</span><span>{fmtUsd(maxQuarter * .67)}</span><span>{fmtUsd(maxQuarter * .33)}</span><span>$0K</span></div><div class="account-overview__plot">{quarterSeries.map((item) => <div key={item.quarter} class={`account-overview__bar-group ${actualQuarter === item.quarter ? "is-selected" : ""}`}><div class="account-overview__bar-columns">{item.bars.map((bar) => { const total = bar.segments.reduce((sum, segment) => sum + segment.value, 0); return <span key={bar.measure} class="account-overview__bar-item" title={`${bar.measure} total ${fmtUsd(total)}`}><small>{fmtUsd(total)}</small><span class="account-overview__bar-stack" style={{ height: `${Math.max(1, total / maxQuarter * 100)}%` }}>{bar.segments.map((segment) => <i key={segment.kind} class={`is-${segment.kind.toLocaleLowerCase()}`} title={`${segment.kind} ${bar.measure} ${fmtUsd(segment.value)}`} style={{ flexGrow: segment.value, minHeight: segment.value ? "2px" : "0" }}></i>)}</span><b>{bar.measure}</b></span>; })}</div><strong>Q{item.quarter}</strong></div>)}</div></div>
            </article>

            <article class="account-overview__panel account-overview__hierarchy">
              <div class="account-overview__panel-heading"><div><h3>Account → Workload → Deal</h3><p>Trace selected actuals without mixing target-period attribution.</p></div></div>
              <div class="account-overview__hierarchy-head"><span>Name</span><span>New ARR</span><span>Expansion ARR</span><span>Renewal ACR</span><span>WON</span></div>
              <div class="account-overview__hierarchy-scroll">{grouped.length === 0 ? <p class="account-overview__empty">No WON deals in this scope.</p> : grouped.map(({ account, workloads }) => {
                const accountDeals = [...workloads.values()].flatMap((item) => item.deals);
                const accountKey = `account-${account.id}`;
                return <div class="account-overview__tree-group"><button type="button" class="account-overview__tree-row is-account" onClick={() => toggle(accountKey)} aria-expanded={expanded.has(accountKey)}><span><i>{expanded.has(accountKey) ? "−" : "+"}</i>{account.name}{account.archived && <em>Archived</em>}</span><b>{fmtUsd(sumPrimary(accountDeals, "NEW"))}</b><b>{fmtUsd(sumPrimary(accountDeals, "EXPANSION"))}</b><b>{fmtUsd(sumPrimary(accountDeals, "RENEWAL"))}</b><b>{accountDeals.length}</b></button>
                  {expanded.has(accountKey) && [...workloads.values()].map(({ workload, deals }) => { const workloadKey = `workload-${workload.id}`; return <div><button type="button" class="account-overview__tree-row is-workload" onClick={() => toggle(workloadKey)} aria-expanded={expanded.has(workloadKey)}><span><i>{expanded.has(workloadKey) ? "−" : "+"}</i>{workload.name}{workload.archived && <em>Archived</em>}</span><b>{fmtUsd(sumPrimary(deals, "NEW"))}</b><b>{fmtUsd(sumPrimary(deals, "EXPANSION"))}</b><b>{fmtUsd(sumPrimary(deals, "RENEWAL"))}</b><b>{deals.length}</b></button>
                    {expanded.has(workloadKey) && deals.map((item) => <div class="account-overview__deal-row"><span><strong>{item.deal.name}</strong><small>{item.deal.revenueType} · Close {item.deal.actualCloseDate} · {displayTarget(item)} · {item.deal.opportunityNo ?? "No opportunity"}</small></span><b>{item.deal.revenueType.toUpperCase() === "NEW" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "EXPANSION" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "RENEWAL" ? item.deal.acrUsd === null ? "—" : fmtUsd(item.deal.acrUsd) : item.deal.acrUsd === null ? "—" : `ACR ${fmtUsd(item.deal.acrUsd)}`}</b><b>1</b></div>)}</div>; })}
                </div>;
              })}</div>
            </article>
          </div>
        </section>

        <section id="targetActions" class="account-overview__section account-overview__section--target">
          <div class="account-overview__section-heading"><div class="account-overview__title-lockup"><span class="account-overview__title-mark"></span><div><h2>Target Actions <small>• Target FY / Quarter</small></h2><p>Open deals are shown by Target Fiscal Year and Target Quarter, independent from Actual Performance.</p></div></div>
            <div class="account-overview__target-tabs" role="tablist" aria-label="Target action view">{([
              ["PRIORITY", "Priority"], ["OVERDUE", "Overdue"], ["THIS_QUARTER", "This quarter"], ["NEXT_QUARTER", "Next quarter"], ["CHOOSE_PERIOD", "Choose period"]
            ] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={targetView === value} class={targetView === value ? "is-selected" : ""} onClick={() => setTargetView(value)}><strong>{label}</strong>{value === "THIS_QUARTER" && <small>{current.fiscalYear} · Q{current.quarter}</small>}{value === "NEXT_QUARTER" && <small>Upcoming</small>}{value === "CHOOSE_PERIOD" && <small>FY / Q</small>}</button>)}</div>
          </div>
          {targetView === "CHOOSE_PERIOD" && <label class="account-overview__target-period">Target period<select value={targetPeriod} onChange={(event) => setTargetPeriod((event.currentTarget as HTMLSelectElement).value)}>{(targetPeriods.length ? targetPeriods : [targetPeriod]).map((period) => <option value={period}>{period}</option>)}</select></label>}

          <div class="account-overview__pipeline">
            <article><span>NEW ARR PIPELINE</span><strong>{fmtUsd(target!.pipeline.newArr.amount)}</strong><small>{metricSecondary(target!.pipeline.newArr.missing, target!.pipeline.newArr.enteredAcr)}</small></article>
            <article><span>EXPANSION ARR PIPELINE</span><strong>{fmtUsd(target!.pipeline.expansionArr.amount)}</strong><small>{metricSecondary(target!.pipeline.expansionArr.missing, target!.pipeline.expansionArr.enteredAcr)}</small></article>
            <article><span>RENEWAL ACR PIPELINE</span><strong>{fmtUsd(target!.pipeline.renewalAcr.amount)}</strong><small>{metricSecondary(target!.pipeline.renewalAcr.missing, 0, false)}</small></article>
          </div>

          <article class="account-overview__panel account-overview__target-list"><div class="account-overview__panel-heading"><div><h3>Open Deal action list</h3><p>{target!.deals.length} deals in the selected target scope</p></div></div>
            <div class="account-overview__target-head"><span>Account / Workload / Deal</span><span>Type</span><span>Target FY/Q</span><span>Amount</span><span>Status</span><span>To target-quarter end</span><span>Latest update</span></div>
            <div class="account-overview__target-scroll">{target!.deals.length === 0 ? <p class="account-overview__empty">No OPEN deals in this target scope.</p> : target!.deals.map((item) => { const latestUpdate = item.deal.latestUpdate || "No update"; return <div key={item.deal.id} class="account-overview__target-row"><span><strong>{item.account.name} ({item.workload.name})</strong><small>{item.deal.name} ({item.deal.opportunityNo ?? "No Opportunity ID"})</small></span><span>{item.deal.revenueType}</span><span>{displayTarget(item)}</span><b>{primaryAmount(item) === null ? "—" : fmtUsd(primaryAmount(item)!)}</b><span><em class={`account-overview__status is-${targetStatus(item).toLocaleLowerCase()}`}>{statusLabel(item)}</em></span><span>{daysToTargetEnd(item)}</span><span class="account-overview__latest-update" tabIndex={0} aria-describedby={latestUpdateTooltip?.text === latestUpdate ? "accountOverviewLatestUpdateTooltip" : undefined} onMouseEnter={(event) => showLatestUpdate(event.currentTarget, latestUpdate)} onMouseLeave={() => setLatestUpdateTooltip(null)} onFocus={(event) => showLatestUpdate(event.currentTarget, latestUpdate)} onBlur={() => setLatestUpdateTooltip(null)}>{latestUpdate}</span></div>; })}</div>
            <footer class="account-overview__target-footer"><span>{target!.deals.length} open deals</span><strong>Selected total {fmtUsd(targetPrimaryTotal)}</strong></footer>
            {latestUpdateTooltip && <div id="accountOverviewLatestUpdateTooltip" class="account-overview__latest-tooltip" role="tooltip" style={{ left: `${latestUpdateTooltip.left}px`, top: `${latestUpdateTooltip.top}px` }}>{latestUpdateTooltip.text}</div>}
          </article>
        </section>
      </>}
    </section>
  );
}
