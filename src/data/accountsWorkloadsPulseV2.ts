import { AccountWorkloadRow } from "./accountsWorkloadsMockData";
import { FiscalYear } from "./kpiMockData";

export type PulseUrgencyLevel = "critical" | "attention" | "upcoming";

export type PulseUrgencyCount = Readonly<{
  accounts: number;
  workloads: number;
}>;

export type AccountsWorkloadsPulseV2 = Readonly<{
  metrics: Readonly<{
    activeAccounts: number;
    activeWorkloads: number;
    arrUsd: number;
    acrUsd: number;
    importantWorkloads: number;
    targetCoverageWorkloads: number;
    targetCoveragePercent: number;
  }>;
  workloadsByAccount: ReadonlyArray<Readonly<{
    account: string;
    workloads: number;
  }>>;
  topAccountConcentrationPercent: number;
  renewalExpand: Readonly<Record<PulseUrgencyLevel, PulseUrgencyCount>>;
  newCommit: Readonly<Record<PulseUrgencyLevel, PulseUrgencyCount>>;
  topRenewalAction: Readonly<{
    account: string;
    daysRemaining: number;
  }> | null;
  topNewCommitReview: Readonly<{
    account: string;
    workloadName: string;
    target: string;
    daysRemaining: number;
  }> | null;
}>;

export type AccountPortfolioSummary = Readonly<{
  account: string;
  workloads: number;
  arrUsd: number;
  acrUsd: number;
  importantWorkloads: number;
  targetCoverageWorkloads: number;
}>;

export const summarizeAccountsWorkloadsByAccount = (
  rows: AccountWorkloadRow[]
): AccountPortfolioSummary[] => Array.from(
  rows.filter((row) => !row.isDeleted).reduce((summaries, row) => {
    const current = summaries.get(row.account) ?? {
      account: row.account,
      workloads: 0,
      arrUsd: 0,
      acrUsd: 0,
      importantWorkloads: 0,
      targetCoverageWorkloads: 0
    };
    summaries.set(row.account, {
      ...current,
      workloads: current.workloads + 1,
      arrUsd: current.arrUsd + (row.arrUsd ?? 0),
      acrUsd: current.acrUsd + (row.acrUsd ?? 0),
      importantWorkloads: current.importantWorkloads + (row.isImportant ? 1 : 0),
      targetCoverageWorkloads: current.targetCoverageWorkloads + (row.target.trim() === "" ? 0 : 1)
    });
    return summaries;
  }, new Map<string, AccountPortfolioSummary>()).values()
).sort((left, right) =>
  right.workloads - left.workloads || left.account.localeCompare(right.account)
);

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_TIME_ZONE = "Asia/Seoul";
const urgencyLevels: PulseUrgencyLevel[] = ["critical", "attention", "upcoming"];

export const getBusinessAsOfDate = (
  date = new Date(),
  timeZone = BUSINESS_TIME_ZONE
) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const toUtcTime = (isoDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
};

const daysBetween = (fromIso: string, toIso: string) => {
  const from = toUtcTime(fromIso);
  const to = toUtcTime(toIso);
  if (from === null || to === null) return null;
  return Math.floor((to - from) / DAY_MS);
};

const urgencyForDays = (days: number | null): PulseUrgencyLevel | null => {
  if (days === null || days > 270) return null;
  if (days <= 90) return "critical";
  if (days <= 180) return "attention";
  return "upcoming";
};

const emptyUrgency = (): Record<PulseUrgencyLevel, PulseUrgencyCount> => ({
  critical: { accounts: 0, workloads: 0 },
  attention: { accounts: 0, workloads: 0 },
  upcoming: { accounts: 0, workloads: 0 }
});

const summarizeUrgency = (
  classified: ReadonlyArray<Readonly<{ row: AccountWorkloadRow; urgency: PulseUrgencyLevel }>>
) => {
  const result = emptyUrgency();
  urgencyLevels.forEach((level) => {
    const matching = classified.filter((item) => item.urgency === level).map((item) => item.row);
    result[level] = {
      accounts: new Set(matching.map((row) => row.account)).size,
      workloads: matching.length
    };
  });
  return result;
};

const targetQuarterEnd = (fiscalYear: FiscalYear, target: string) => {
  const match = target.match(new RegExp(`^${fiscalYear} Q([1-4])$`));
  if (!match) return null;
  const fiscalEndYear = 2000 + Number(fiscalYear.slice(2));
  const fiscalStartYear = fiscalEndYear - 1;
  const quarter = Number(match[1]);
  const dates = [
    new Date(Date.UTC(fiscalStartYear, 8, 0)),
    new Date(Date.UTC(fiscalStartYear, 11, 0)),
    new Date(Date.UTC(fiscalEndYear, 2, 0)),
    new Date(Date.UTC(fiscalEndYear, 5, 0))
  ];
  return dates[quarter - 1].toISOString().slice(0, 10);
};

export const calculateAccountsWorkloadsPulseV2 = (
  rows: AccountWorkloadRow[],
  fiscalYear: FiscalYear,
  asOf: string
): AccountsWorkloadsPulseV2 => {
  const activeRows = rows.filter((row) => !row.isDeleted);
  const activeAccounts = new Set(activeRows.map((row) => row.account)).size;
  const targetCoverageWorkloads = activeRows.filter((row) => row.target.trim() !== "").length;

  const accountSummaries = summarizeAccountsWorkloadsByAccount(activeRows);
  const accountCounts = accountSummaries.map(({ account, workloads }) => ({ account, workloads }));
  const topAccounts = accountCounts.slice(0, 3);
  const remainingAccounts = accountCounts.slice(3);
  const remainingWorkloads = remainingAccounts.reduce((total, item) => total + item.workloads, 0);
  const workloadsByAccount = remainingAccounts.length > 0
    ? [...topAccounts, { account: `Other ${remainingAccounts.length} accounts`, workloads: remainingWorkloads }]
    : topAccounts;

  const renewalCandidates = activeRows
    .map((row) => ({ row, daysRemaining: daysBetween(asOf, row.endDate) }))
    .filter((item): item is { row: AccountWorkloadRow; daysRemaining: number } => item.daysRemaining !== null);
  const renewalClassified = renewalCandidates
    .map((item) => ({ ...item, urgency: urgencyForDays(item.daysRemaining) }))
    .filter((item): item is { row: AccountWorkloadRow; daysRemaining: number; urgency: PulseUrgencyLevel } => item.urgency !== null);
  const topRenewal = [...renewalClassified].sort((left, right) => left.daysRemaining - right.daysRemaining)[0] ?? null;

  const newCommitCandidates = activeRows
    .filter((row) => row.startDate === "" || row.endDate === "")
    .map((row) => {
      const quarterEnd = targetQuarterEnd(fiscalYear, row.target);
      return { row, daysRemaining: quarterEnd ? daysBetween(asOf, quarterEnd) : null };
    })
    .filter((item): item is { row: AccountWorkloadRow; daysRemaining: number } => item.daysRemaining !== null);
  const newCommitClassified = newCommitCandidates
    .map((item) => ({ ...item, urgency: urgencyForDays(item.daysRemaining) }))
    .filter((item): item is { row: AccountWorkloadRow; daysRemaining: number; urgency: PulseUrgencyLevel } => item.urgency !== null);
  const topNewCommit = [...newCommitClassified].sort((left, right) => left.daysRemaining - right.daysRemaining)[0] ?? null;

  return {
    metrics: {
      activeAccounts,
      activeWorkloads: activeRows.length,
      arrUsd: activeRows.reduce((total, row) => total + (row.arrUsd ?? 0), 0),
      acrUsd: activeRows.reduce((total, row) => total + (row.acrUsd ?? 0), 0),
      importantWorkloads: activeRows.filter((row) => row.isImportant).length,
      targetCoverageWorkloads,
      targetCoveragePercent: activeRows.length === 0 ? 0 : Math.round((targetCoverageWorkloads / activeRows.length) * 100)
    },
    workloadsByAccount,
    topAccountConcentrationPercent: activeRows.length === 0 || accountCounts.length === 0
      ? 0
      : Math.round((accountCounts[0].workloads / activeRows.length) * 100),
    renewalExpand: summarizeUrgency(renewalClassified),
    newCommit: summarizeUrgency(newCommitClassified),
    topRenewalAction: topRenewal
      ? { account: topRenewal.row.account, daysRemaining: topRenewal.daysRemaining }
      : null,
    topNewCommitReview: topNewCommit
      ? {
          account: topNewCommit.row.account,
          workloadName: topNewCommit.row.workloadName,
          target: topNewCommit.row.target,
          daysRemaining: topNewCommit.daysRemaining
        }
      : null
  };
};
