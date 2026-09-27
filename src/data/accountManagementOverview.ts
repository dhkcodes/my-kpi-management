import {
  AccountHierarchyAccount,
  AccountWorkload,
  AccountWorkloadDeal,
  AccountsWorkloadsHierarchy,
} from "./accountsWorkloadsApi";

export type ActualQuarter = 1 | 2 | 3 | 4;
export type ActualQuarterFilter = ActualQuarter | "ALL";
export type TargetView = "PRIORITY" | "OVERDUE" | "THIS_QUARTER" | "NEXT_QUARTER" | "CHOOSE_PERIOD";
export type RevenueKind = "NEW" | "EXPANSION" | "RENEWAL";

export type OverviewDeal = Readonly<{
  account: AccountHierarchyAccount;
  workload: AccountWorkload;
  deal: AccountWorkloadDeal;
  actualPeriod: Readonly<{ fiscalYear: string; quarter: ActualQuarter }> | null;
}>;

export type AmountMetric = Readonly<{ amount: number; missing: number; enteredAcr: number }>;
export type OverviewKpis = Readonly<{
  newArr: AmountMetric;
  expansionArr: AmountMetric;
  renewalAcr: AmountMetric;
  wonDeals: number;
}>;

export type QuarterMetric = Readonly<{
  quarter: ActualQuarter;
  newArr: number;
  expansionArr: number;
  renewalAcr: number;
  wonDeals: number;
}>;

const revenueKind = (value: string): RevenueKind | null => {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "NEW") return "NEW";
  if (normalized === "EXPANSION") return "EXPANSION";
  if (normalized === "RENEWAL") return "RENEWAL";
  return null;
};

export const fiscalPeriodForDate = (isoDate: string): { fiscalYear: string; quarter: ActualQuarter } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const fiscalEndYear = month >= 6 ? year + 1 : year;
  const fiscalYear = `FY${String(fiscalEndYear % 100).padStart(2, "0")}`;
  const quarter = month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : month === 12 || month <= 2 ? 3 : 4;
  return { fiscalYear, quarter };
};

const fiscalYearEnd = (fiscalYear: string) => {
  const match = /^FY(\d{2})$/.exec(fiscalYear);
  if (!match) return null;
  return 2000 + Number(match[1]);
};

export const quarterEndDate = (fiscalYear: string, quarter: number): string | null => {
  const endYear = fiscalYearEnd(fiscalYear);
  if (endYear === null || ![1, 2, 3, 4].includes(quarter)) return null;
  if (quarter === 1) return `${endYear - 1}-08-31`;
  if (quarter === 2) return `${endYear - 1}-11-30`;
  if (quarter === 3) return `${endYear}-02-${endYear % 4 === 0 ? "29" : "28"}`;
  return `${endYear}-05-31`;
};

export const currentFiscalPeriod = (today = new Date()): { fiscalYear: string; quarter: ActualQuarter } => {
  const iso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  return fiscalPeriodForDate(iso)!;
};

export const nextFiscalPeriod = (period: { fiscalYear: string; quarter: ActualQuarter }) => {
  if (period.quarter < 4) return { fiscalYear: period.fiscalYear, quarter: (period.quarter + 1) as ActualQuarter };
  const end = fiscalYearEnd(period.fiscalYear)!;
  return { fiscalYear: `FY${String((end + 1) % 100).padStart(2, "0")}`, quarter: 1 as ActualQuarter };
};

const flattenHierarchy = (hierarchy: AccountsWorkloadsHierarchy): OverviewDeal[] =>
  hierarchy.accounts.flatMap((account) => account.workloads.flatMap((workload) => workload.deals.map((deal) => ({
    account,
    workload,
    deal,
    actualPeriod: deal.actualCloseDate ? fiscalPeriodForDate(deal.actualCloseDate) : null,
  }))));

const matchesSearch = (item: OverviewDeal, search: string) => {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [item.account.name, item.workload.name, item.deal.name, item.deal.opportunityNo ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(needle));
};

const amountMetric = (items: readonly OverviewDeal[], kind: RevenueKind): AmountMetric => {
  let amount = 0;
  let missing = 0;
  let enteredAcr = 0;
  items.forEach(({ deal }) => {
    if (revenueKind(deal.revenueType) !== kind) return;
    const primary = kind === "RENEWAL" ? deal.acrUsd : deal.arrUsd;
    if (primary === null) missing += 1;
    else amount += primary;
    if (kind !== "RENEWAL" && deal.acrUsd !== null) enteredAcr += deal.acrUsd;
  });
  return { amount, missing, enteredAcr };
};

const metricsFor = (items: readonly OverviewDeal[]): OverviewKpis => ({
  newArr: amountMetric(items, "NEW"),
  expansionArr: amountMetric(items, "EXPANSION"),
  renewalAcr: amountMetric(items, "RENEWAL"),
  wonDeals: items.length,
});

const sameTargetPeriod = (item: OverviewDeal, period: { fiscalYear: string; quarter: number }) =>
  item.deal.targetFiscalYear === period.fiscalYear && item.deal.targetQuarter === period.quarter;

const isOverdue = (item: OverviewDeal, today: Date) => {
  if (!item.deal.targetFiscalYear || item.deal.targetQuarter === null) return false;
  const end = quarterEndDate(item.deal.targetFiscalYear, item.deal.targetQuarter);
  return end !== null && end < today.toISOString().slice(0, 10);
};

export const targetStatus = (item: OverviewDeal, today = new Date()): "OVERDUE" | "THIS_QUARTER" | "NEXT_QUARTER" | "TARGET_NOT_SET" | "FUTURE" => {
  if (!item.deal.targetFiscalYear || item.deal.targetQuarter === null) return "TARGET_NOT_SET";
  if (isOverdue(item, today)) return "OVERDUE";
  const current = currentFiscalPeriod(today);
  if (sameTargetPeriod(item, current)) return "THIS_QUARTER";
  if (sameTargetPeriod(item, nextFiscalPeriod(current))) return "NEXT_QUARTER";
  return "FUTURE";
};

export const buildAccountManagementOverview = (hierarchy: AccountsWorkloadsHierarchy, today = new Date()) => {
  const flattened = flattenHierarchy(hierarchy).filter((item) => !item.deal.deleted);
  const actualDeals = flattened.filter((item) => item.deal.status === "WON" && item.actualPeriod !== null);
  const targetDeals = flattened.filter((item) => item.deal.status === "OPEN" && !item.account.archived && !item.workload.archived);
  const fiscalYears = [...new Set(actualDeals.map((item) => item.actualPeriod!.fiscalYear))].sort().reverse();

  return {
    actualDeals,
    targetDeals,
    fiscalYears,
    exceptions: {
      overdue: targetDeals.filter((item) => isOverdue(item, today)).length,
      targetNotSet: targetDeals.filter((item) => !item.deal.targetFiscalYear || item.deal.targetQuarter === null).length,
      closeDateMissing: flattened.filter((item) => item.deal.status === "WON" && !item.deal.actualCloseDate).length,
    },
    actualFor(fiscalYear: string, quarter: ActualQuarterFilter, search: string) {
      const yearDeals = actualDeals.filter((item) => item.actualPeriod?.fiscalYear === fiscalYear && matchesSearch(item, search));
      const selected = yearDeals.filter((item) => quarter === "ALL" || item.actualPeriod?.quarter === quarter);
      return {
        deals: selected,
        kpis: metricsFor(selected),
        quarters: ([1, 2, 3, 4] as const).map((value): QuarterMetric => {
          const metrics = metricsFor(yearDeals.filter((item) => item.actualPeriod?.quarter === value));
          return { quarter: value, newArr: metrics.newArr.amount, expansionArr: metrics.expansionArr.amount, renewalAcr: metrics.renewalAcr.amount, wonDeals: metrics.wonDeals };
        }),
      };
    },
    targetFor(view: TargetView, search: string, at = today, chosenPeriod = "") {
      const searched = targetDeals.filter((item) => matchesSearch(item, search));
      const current = currentFiscalPeriod(at);
      const next = nextFiscalPeriod(current);
      const deals = searched.filter((item) => {
        const status = targetStatus(item, at);
        if (view === "PRIORITY") return ["OVERDUE", "THIS_QUARTER", "NEXT_QUARTER", "TARGET_NOT_SET"].includes(status);
        if (view === "OVERDUE") return status === "OVERDUE";
        if (view === "THIS_QUARTER") return sameTargetPeriod(item, current);
        if (view === "NEXT_QUARTER") return sameTargetPeriod(item, next);
        return `${item.deal.targetFiscalYear ?? ""} Q${item.deal.targetQuarter ?? ""}` === chosenPeriod;
      });
      return {
        deals,
        pipeline: {
          newArr: amountMetric(deals, "NEW"),
          expansionArr: amountMetric(deals, "EXPANSION"),
          renewalAcr: amountMetric(deals, "RENEWAL"),
        },
      };
    },
  };
};
