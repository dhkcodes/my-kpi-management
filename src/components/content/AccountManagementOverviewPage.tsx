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
  if (value === 0) return "$0";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(absolute >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
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

export function AccountManagementOverviewPage({ breadcrumb }: Props) {
  const [hierarchy, setHierarchy] = useState<Awaited<ReturnType<typeof fetchAccountsWorkloadsHierarchy>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const current = currentFiscalPeriod();
  const [actualFy, setActualFy] = useState(current.fiscalYear);
  const [actualQuarter, setActualQuarter] = useState<ActualQuarterFilter>("ALL");
  const [targetView, setTargetView] = useState<TargetView>("PRIORITY");
  const [targetPeriod, setTargetPeriod] = useState(`${current.fiscalYear} Q${current.quarter}`);
  const [expanded, setExpanded] = useState(new Set<string>());

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAccountsWorkloadsHierarchy({ includeArchived: true, includeDeletedDeals: false })
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
  const target = overview?.targetFor(targetView, search, new Date(), targetPeriod);
  const grouped = groupActual(actual?.deals ?? []);
  const maxQuarter = Math.max(1, ...(actual?.quarters.flatMap((q) => [q.newArr, q.expansionArr, q.renewalAcr]) ?? [1]));
  const targetPeriods = [...new Set((overview?.targetDeals ?? [])
    .filter((item) => item.deal.targetFiscalYear && item.deal.targetQuarter)
    .map(displayTarget))].sort();

  const toggle = (key: string) => setExpanded((before) => {
    const next = new Set(before);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

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
            <div class="account-overview__search-field"><span class="oj-ux-ico-search" aria-hidden="true"></span><input id="accountOverviewSearch" type="search" value={search} placeholder="Search by account name, owner, or CSM..." onInput={(event) => setSearch((event.currentTarget as HTMLInputElement).value)} /></div>
            <small>Type to filter accounts, workloads, and deals below.</small>
          </div>
          <section class="account-overview__exceptions" aria-label="Persistent exceptions">
            <button type="button" onClick={() => { setTargetView("OVERDUE"); document.getElementById("targetActions")?.scrollIntoView({ behavior: "smooth" }); }}><span class="account-overview__exception-icon is-overdue">!</span><span><strong>{overview.exceptions.overdue} overdue</strong><small>Target quarter ended</small></span></button>
            <button type="button" onClick={() => { setTargetView("PRIORITY"); document.getElementById("targetActions")?.scrollIntoView({ behavior: "smooth" }); }}><span class="account-overview__exception-icon is-warning">?</span><span><strong>{overview.exceptions.targetNotSet} target not set</strong><small>Open deals without FY/Q</small></span></button>
            <button type="button" onClick={() => document.getElementById("actualPerformance")?.scrollIntoView({ behavior: "smooth" })}><span class="account-overview__exception-icon is-warning">!</span><span><strong>{overview.exceptions.closeDateMissing} Close Date missing</strong><small>WON deals excluded</small></span></button>
          </section>
        </div>

        <section id="actualPerformance" class="account-overview__section account-overview__section--actual">
          <div class="account-overview__section-heading"><div class="account-overview__title-lockup"><span class="account-overview__title-mark"></span><div><h2>Actual Performance <small>• Actual Close Date</small></h2><p>WON deals are attributed to the fiscal year and quarter that contain their Actual Close Date.</p></div></div>
            <div class="account-overview__period-controls"><label>Fiscal year<select value={actualFy} onChange={(event) => setActualFy((event.currentTarget as HTMLSelectElement).value)}>{(overview.fiscalYears.length ? overview.fiscalYears : [current.fiscalYear]).map((fy) => <option value={fy}>{fy}</option>)}</select></label>
              <div class="account-overview__segments" aria-label="Actual quarter">{(["ALL", 1, 2, 3, 4] as const).map((quarter) => <button type="button" class={actualQuarter === quarter ? "is-selected" : ""} aria-pressed={actualQuarter === quarter} onClick={() => setActualQuarter(quarter)}>{quarter === "ALL" ? "All" : `Q${quarter}`}</button>)}</div></div>
          </div>

          <div class="account-overview__kpis">
            <article><span>NEW ARR</span><strong>{fmtUsd(actual!.kpis.newArr.amount)}</strong><small>{metricSecondary(actual!.kpis.newArr.missing, actual!.kpis.newArr.enteredAcr)}</small></article>
            <article><span>EXPANSION ARR</span><strong>{fmtUsd(actual!.kpis.expansionArr.amount)}</strong><small>{metricSecondary(actual!.kpis.expansionArr.missing, actual!.kpis.expansionArr.enteredAcr)}</small></article>
            <article><span>RENEWAL ACR</span><strong>{fmtUsd(actual!.kpis.renewalAcr.amount)}</strong><small>{metricSecondary(actual!.kpis.renewalAcr.missing, 0, false)}</small></article>
            <article><span>WON DEALS</span><strong>{actual!.kpis.wonDeals}</strong><small>{actualFy} · {actualQuarter === "ALL" ? "All quarters" : `Q${actualQuarter}`}</small></article>
          </div>

          <div class="account-overview__actual-details">
            <article class="account-overview__panel account-overview__quarter-chart">
              <div class="account-overview__panel-heading"><div><h3>{actualFy} quarterly comparison</h3><p>Grouped values · not cumulative</p></div><div class="account-overview__legend"><span class="is-new">New ARR</span><span class="is-expansion">Expansion ARR</span><span class="is-renewal">Renewal ACR</span></div></div>
              <div class="account-overview__vertical-chart"><div class="account-overview__axis"><span>{fmtUsd(maxQuarter)}</span><span>{fmtUsd(maxQuarter * .67)}</span><span>{fmtUsd(maxQuarter * .33)}</span><span>$0</span></div><div class="account-overview__plot">{actual!.quarters.map((item) => <div class={`account-overview__bar-group ${actualQuarter === item.quarter ? "is-selected" : ""}`}><div class="account-overview__bar-columns"><i class="is-new" style={{ height: `${Math.max(1, item.newArr / maxQuarter * 100)}%` }} title={`New ARR ${fmtUsd(item.newArr)}`}></i><i class="is-expansion" style={{ height: `${Math.max(1, item.expansionArr / maxQuarter * 100)}%` }} title={`Expansion ARR ${fmtUsd(item.expansionArr)}`}></i><i class="is-renewal" style={{ height: `${Math.max(1, item.renewalAcr / maxQuarter * 100)}%` }} title={`Renewal ACR ${fmtUsd(item.renewalAcr)}`}></i></div><strong>Q{item.quarter}</strong></div>)}</div></div>
            </article>

            <article class="account-overview__panel account-overview__hierarchy">
              <div class="account-overview__panel-heading"><div><h3>Account → Workload → Deal</h3><p>Trace selected actuals without mixing target-period attribution.</p></div></div>
              <div class="account-overview__hierarchy-head"><span>Name</span><span>New ARR</span><span>Expansion ARR</span><span>Renewal ACR</span><span>WON</span></div>
              {grouped.length === 0 ? <p class="account-overview__empty">No WON deals in this scope.</p> : grouped.map(({ account, workloads }) => {
                const accountDeals = [...workloads.values()].flatMap((item) => item.deals);
                const accountKey = `account-${account.id}`;
                return <div class="account-overview__tree-group"><button type="button" class="account-overview__tree-row is-account" onClick={() => toggle(accountKey)} aria-expanded={expanded.has(accountKey)}><span><i>{expanded.has(accountKey) ? "−" : "+"}</i>{account.name}{account.archived && <em>Archived</em>}</span><b>{fmtUsd(sumPrimary(accountDeals, "NEW"))}</b><b>{fmtUsd(sumPrimary(accountDeals, "EXPANSION"))}</b><b>{fmtUsd(sumPrimary(accountDeals, "RENEWAL"))}</b><b>{accountDeals.length}</b></button>
                  {expanded.has(accountKey) && [...workloads.values()].map(({ workload, deals }) => { const workloadKey = `workload-${workload.id}`; return <div><button type="button" class="account-overview__tree-row is-workload" onClick={() => toggle(workloadKey)} aria-expanded={expanded.has(workloadKey)}><span><i>{expanded.has(workloadKey) ? "−" : "+"}</i>{workload.name}{workload.archived && <em>Archived</em>}</span><b>{fmtUsd(sumPrimary(deals, "NEW"))}</b><b>{fmtUsd(sumPrimary(deals, "EXPANSION"))}</b><b>{fmtUsd(sumPrimary(deals, "RENEWAL"))}</b><b>{deals.length}</b></button>
                    {expanded.has(workloadKey) && deals.map((item) => <div class="account-overview__deal-row"><span><strong>{item.deal.name}</strong><small>{item.deal.revenueType} · Close {item.deal.actualCloseDate} · {displayTarget(item)} · {item.deal.opportunityNo ?? "No opportunity"}</small></span><b>{item.deal.revenueType.toUpperCase() === "NEW" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "EXPANSION" ? item.deal.arrUsd === null ? "—" : fmtUsd(item.deal.arrUsd) : "—"}</b><b>{item.deal.revenueType.toUpperCase() === "RENEWAL" ? item.deal.acrUsd === null ? "—" : fmtUsd(item.deal.acrUsd) : item.deal.acrUsd === null ? "—" : `ACR ${fmtUsd(item.deal.acrUsd)}`}</b><b>1</b></div>)}</div>; })}
                </div>;
              })}
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
            {target!.deals.length === 0 ? <p class="account-overview__empty">No OPEN deals in this target scope.</p> : target!.deals.map((item) => <div class="account-overview__target-row"><span><strong>{item.deal.name}</strong><small>{item.account.name} · {item.workload.name}</small></span><span>{item.deal.revenueType}</span><span>{displayTarget(item)}</span><b>{primaryAmount(item) === null ? "—" : fmtUsd(primaryAmount(item)!)}</b><span><em class={`account-overview__status is-${targetStatus(item).toLocaleLowerCase()}`}>{statusLabel(item)}</em></span><span>{daysToTargetEnd(item)}</span><span>{item.deal.latestUpdate || "No update"}</span></div>)}
          </article>
        </section>
      </>}
    </section>
  );
}
