import { h } from "preact";
import { useMemo, useState } from "preact/hooks";
import { FiscalYear } from "../../data/kpiMockData";
import { AccountWorkloadRow } from "../../data/accountsWorkloadsMockData";
import { AccountsWorkloadsDataSource } from "../../data/accountsWorkloadsDataSource";
import {
  calculateAccountsWorkloadsPulseV2,
  PulseUrgencyLevel
} from "../../data/accountsWorkloadsPulseV2";
import "oj-c/meter-bar";

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2
});

const urgencyLabels: Record<PulseUrgencyLevel, string> = {
  critical: "Critical",
  attention: "Attention",
  upcoming: "Upcoming"
};

const urgencyDays: Record<PulseUrgencyLevel, string> = {
  critical: "0–90d",
  attention: "91–180d",
  upcoming: "181–270d"
};

const barColors = ["#c74634", "#d77b20", "#417590", "#756f69"];
const workloadCount = (value: number) => `${value} ${value === 1 ? "workload" : "workloads"}`;

type Props = Readonly<{
  fiscalYear: FiscalYear;
  rows: AccountWorkloadRow[];
  asOf: string;
  dataAvailable: boolean;
  loading: boolean;
  dataSource: AccountsWorkloadsDataSource;
  onOpenAccount: (account: string) => void;
}>;

export function AccountsWorkloadsPulseV2({ fiscalYear, rows, asOf, dataAvailable, loading, dataSource, onOpenAccount }: Props) {
  const pulse = useMemo(
    () => calculateAccountsWorkloadsPulseV2(rows, fiscalYear, asOf),
    [rows, fiscalYear, asOf]
  );
  const [expandedUrgency, setExpandedUrgency] = useState("");
  const maxAccountWorkloads = Math.max(1, ...pulse.workloadsByAccount.map((item) => item.workloads));
  const deletedRows = rows.filter((row) => row.isDeleted).length;
  const urgencyOrder: PulseUrgencyLevel[] = ["critical", "attention", "upcoming"];
  const metricCards = [
    { label: "Active Accounts", value: `${pulse.metrics.activeAccounts}`, detail: "distinct customers" },
    { label: "Active Commitments", value: `${pulse.metrics.activeWorkloads}`, detail: `${deletedRows} deleted excluded` },
    { label: "ARR", value: compactCurrency.format(pulse.metrics.arrUsd), detail: "active commitments" },
    { label: "ACR", value: compactCurrency.format(pulse.metrics.acrUsd), detail: "annual contract value" },
    { label: "Important", value: `${pulse.metrics.importantWorkloads}`, detail: "flagged workloads" },
    {
      label: "Target input completeness",
      value: `${pulse.metrics.targetCoveragePercent}%`,
      detail: `${pulse.metrics.targetCoverageWorkloads} of ${pulse.metrics.activeWorkloads} workloads`
    }
  ];

  const renderUrgency = (kind: "new" | "renewal", level: PulseUrgencyLevel) => {
    const count = kind === "new" ? pulse.newCommit[level] : pulse.renewalExpand[level];
    const key = `${kind}:${level}`;
    return (
      <div class="accounts-pulse-v2-urgency-group" key={level}>
        <div class="accounts-pulse-v2-urgency-row">
          <span class={`accounts-pulse-v2-pill accounts-pulse-v2-pill--${level}`}>{urgencyLabels[level]}</span>
          <span class="accounts-pulse-v2-days">{urgencyDays[level]}</span>
          <button type="button" class="accounts-pulse-v2-workload-count" aria-expanded={expandedUrgency === key}
            disabled={count.workloads === 0} onClick={() => setExpandedUrgency((current) => current === key ? "" : key)}>
            {workloadCount(count.workloads)}
          </button>
        </div>
        {expandedUrgency === key && (
          <ul class="accounts-pulse-v2-workload-list">
            {count.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpenAccount(item.account)}>
                  <strong>{item.workloadName}</strong><span>{item.account}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source="loading">
        <div class="accounts-pulse-v2__header"><div><span class="kpi-eyebrow">My Customers 360</span><h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2></div></div>
        <div class="accounts-pulse-v2__unavailable" role="status"><strong>Loading Accounts &amp; Workloads data…</strong></div>
      </section>
    );
  }

  if (!dataAvailable) {
    return (
      <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source={dataSource}>
        <div class="accounts-pulse-v2__header"><div><span class="kpi-eyebrow">My Customers 360</span><h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2></div></div>
        <div class="accounts-pulse-v2__unavailable" role="status">
          <strong>Accounts &amp; Workloads data is not available for {fiscalYear}</strong>
          <span>Select FY27 to view the currently loaded dataset.</span>
        </div>
      </section>
    );
  }

  return (
    <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source={dataSource}>
      <div class="accounts-pulse-v2__header"><div><span class="kpi-eyebrow">My Customers 360</span><h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2></div></div>
      <div class="accounts-pulse-v2__metrics" aria-label="Accounts and workloads metrics">
        {metricCards.map((metric) => <article class="accounts-pulse-v2-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
      </div>
      <div class="accounts-pulse-v2__grid">
        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--new" aria-labelledby="newCommitTitle">
          <div class="accounts-pulse-v2-card__title-row"><h3 id="newCommitTitle">New Commit</h3><span>Start or End Date Needed</span></div>
          <div class="accounts-pulse-v2-urgency-list">{urgencyOrder.map((level) => renderUrgency("new", level))}</div>
        </article>
        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--renewal" aria-labelledby="renewalCommitTitle">
          <div class="accounts-pulse-v2-card__title-row"><h3 id="renewalCommitTitle">Renewal / Expand Commit</h3><span>Commit End Date</span></div>
          <div class="accounts-pulse-v2-urgency-list">{urgencyOrder.map((level) => renderUrgency("renewal", level))}</div>
        </article>
        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--accounts" aria-labelledby="workloadsByAccountTitle">
          <h3 id="workloadsByAccountTitle">Commitments by Account</h3>
          <div class="accounts-pulse-v2-account-head"><span>Account</span><span>Commitments</span></div>
          <div class="accounts-pulse-v2-account-list">
            {pulse.workloadsByAccount.map((item, index) => (
              <button type="button" class="accounts-pulse-v2-account-row" key={item.account}
                disabled={item.account.startsWith("Other ")} onClick={() => onOpenAccount(item.account)}>
                <div><strong>{item.account}</strong><span>{item.workloads}</span></div>
                <oj-c-meter-bar class="accounts-pulse-v2-account-meter" value={item.workloads} min={0} max={maxAccountWorkloads}
                  color={barColors[index] ?? barColors[barColors.length - 1]} readonly={true} size="sm" tabIndex={-1} aria-hidden="true"></oj-c-meter-bar>
              </button>
            ))}
          </div>
          <div class="accounts-pulse-v2-concentration">{pulse.topAccountConcentrationPercent}% concentrated in one account</div>
        </article>
      </div>
    </section>
  );
}
