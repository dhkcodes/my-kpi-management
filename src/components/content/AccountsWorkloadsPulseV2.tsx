import { h } from "preact";
import { useMemo } from "preact/hooks";
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
const accountCount = (value: number) => `${value} ${value === 1 ? "acct" : "accts"}`;
const workloadCount = (value: number) => `${value} ${value === 1 ? "workload" : "workloads"}`;
const displayAsOf = (asOf: string) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
}).format(new Date(`${asOf}T00:00:00Z`));

type Props = Readonly<{
  fiscalYear: FiscalYear;
  rows: AccountWorkloadRow[];
  asOf: string;
  dataAvailable: boolean;
  loading: boolean;
  dataSource: AccountsWorkloadsDataSource;
}>;

export function AccountsWorkloadsPulseV2({ fiscalYear, rows, asOf, dataAvailable, loading, dataSource }: Props) {
  const pulse = useMemo(
    () => calculateAccountsWorkloadsPulseV2(rows, fiscalYear, asOf),
    [rows, fiscalYear, asOf]
  );
  const maxAccountWorkloads = Math.max(1, ...pulse.workloadsByAccount.map((item) => item.workloads));
  const deletedRows = rows.filter((row) => row.isDeleted).length;
  const urgencyOrder: PulseUrgencyLevel[] = ["critical", "attention", "upcoming"];
  const metricCards = [
    { label: "Active Accounts", value: `${pulse.metrics.activeAccounts}`, detail: "distinct customers" },
    { label: "Active Workloads", value: `${pulse.metrics.activeWorkloads}`, detail: `${deletedRows} deleted excluded` },
    { label: "ARR", value: compactCurrency.format(pulse.metrics.arrUsd), detail: "active workloads" },
    { label: "ACR", value: compactCurrency.format(pulse.metrics.acrUsd), detail: "annual contract value" },
    { label: "Important", value: `${pulse.metrics.importantWorkloads}`, detail: "flagged workloads" },
    {
      label: "Target Coverage",
      value: `${pulse.metrics.targetCoveragePercent}%`,
      detail: `${pulse.metrics.targetCoverageWorkloads} of ${pulse.metrics.activeWorkloads} workloads`
    }
  ];

  if (loading) {
    return (
      <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source="loading">
        <div class="accounts-pulse-v2__header">
          <div>
            <span class="kpi-eyebrow">My Customers 360</span>
            <h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2>
            <p>{fiscalYear} portfolio pulse</p>
          </div>
        </div>
        <div class="accounts-pulse-v2__unavailable" role="status">
          <strong>Loading Accounts &amp; Workloads data…</strong>
        </div>
      </section>
    );
  }

  if (!dataAvailable) {
    return (
      <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source={dataSource}>
        <div class="accounts-pulse-v2__header">
          <div>
            <span class="kpi-eyebrow">My Customers 360</span>
            <h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2>
            <p>{fiscalYear} portfolio pulse · proactive renewal and commit management</p>
          </div>
          <span class="accounts-pulse-v2__concept">Concept 01 · Executive Pulse V2</span>
        </div>
        <div class="accounts-pulse-v2__unavailable" role="status">
          <strong>Accounts &amp; Workloads data is not available for {fiscalYear}</strong>
          <span>Select FY27 to view the currently loaded dataset.</span>
        </div>
      </section>
    );
  }

  return (
    <section class="accounts-pulse-v2 kpi-panel" aria-labelledby="accountsPulseV2Title" data-source={dataSource}>
      <div class="accounts-pulse-v2__header">
        <div>
          <span class="kpi-eyebrow">My Customers 360</span>
          <h2 id="accountsPulseV2Title">Accounts &amp; Workloads</h2>
          <p>{fiscalYear} portfolio pulse · proactive renewal and commit management</p>
        </div>
        <span class="accounts-pulse-v2__concept">Concept 01 · Executive Pulse V2</span>
      </div>

      <div class="accounts-pulse-v2__metrics" aria-label="Accounts and workloads metrics">
        {metricCards.map((metric) => (
          <article class="accounts-pulse-v2-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      <div class="accounts-pulse-v2__grid">
        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--new" aria-labelledby="newCommitTitle">
          <div class="accounts-pulse-v2-card__title-row">
            <h3 id="newCommitTitle">New Commit</h3>
            <span>Missing Dates</span>
          </div>
          <div class="accounts-pulse-v2-urgency-list">
            {urgencyOrder.map((level) => {
              const count = pulse.newCommit[level];
              return (
                <div class="accounts-pulse-v2-urgency-row" key={level}>
                  <span class={`accounts-pulse-v2-pill accounts-pulse-v2-pill--${level}`}>{urgencyLabels[level]}</span>
                  <span>{urgencyDays[level]}</span>
                  <strong aria-label={`${accountCount(count.accounts)} and ${workloadCount(count.workloads)}`}>
                    {count.accounts} acct · {count.workloads} wl
                  </strong>
                </div>
              );
            })}
          </div>
        </article>

        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--renewal" aria-labelledby="renewalCommitTitle">
          <div class="accounts-pulse-v2-card__title-row">
            <h3 id="renewalCommitTitle">Renewal / Expand Commit</h3>
            <span>End Date</span>
          </div>
          <div class="accounts-pulse-v2-urgency-list">
            {urgencyOrder.map((level) => {
              const count = pulse.renewalExpand[level];
              return (
                <div class="accounts-pulse-v2-urgency-row" key={level}>
                  <span class={`accounts-pulse-v2-pill accounts-pulse-v2-pill--${level}`}>{urgencyLabels[level]}</span>
                  <span>{urgencyDays[level]}</span>
                  <strong aria-label={`${accountCount(count.accounts)} and ${workloadCount(count.workloads)}`}>
                    {count.accounts} acct · {count.workloads} wl
                  </strong>
                </div>
              );
            })}
          </div>
        </article>

        <article class="accounts-pulse-v2-card accounts-pulse-v2-card--accounts" aria-labelledby="workloadsByAccountTitle">
          <h3 id="workloadsByAccountTitle">Workloads by Account</h3>
          <div class="accounts-pulse-v2-account-head"><span>Account</span><span>Workloads</span></div>
          <div class="accounts-pulse-v2-account-list">
            {pulse.workloadsByAccount.map((item, index) => (
              <div class="accounts-pulse-v2-account-row" key={item.account}>
                <div><strong>{item.account}</strong><span>{item.workloads}</span></div>
                <oj-c-meter-bar
                  class="accounts-pulse-v2-account-meter"
                  value={item.workloads}
                  min={0}
                  max={maxAccountWorkloads}
                  color={barColors[index] ?? barColors[barColors.length - 1]}
                  readonly={true}
                  size="sm"
                  tabIndex={-1}
                  aria-hidden="true">
                </oj-c-meter-bar>
              </div>
            ))}
          </div>
          <div class="accounts-pulse-v2-concentration">
            {pulse.topAccountConcentrationPercent}% concentrated in one account
          </div>
        </article>
      </div>

      <p class="accounts-pulse-v2__note">
        Urgency uses calendar days as of {displayAsOf(asOf)} · overdue active rows remain Critical until resolved or soft-deleted
      </p>
    </section>
  );
}
