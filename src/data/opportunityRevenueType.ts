export const OPPORTUNITY_REVENUE_TYPES = ["NEW", "EXPANSION", "RENEWAL"] as const;

const revenueTypeLabels: Readonly<Record<(typeof OPPORTUNITY_REVENUE_TYPES)[number], string>> = {
  NEW: "New",
  EXPANSION: "Expansion",
  RENEWAL: "Renewal",
};

export const canonicalizeOpportunityRevenueType = (value: string): string => {
  const trimmed = value.trim();
  const canonical = trimmed.toLocaleUpperCase();
  return OPPORTUNITY_REVENUE_TYPES.includes(
    canonical as (typeof OPPORTUNITY_REVENUE_TYPES)[number],
  ) ? canonical : trimmed;
};

export const opportunityRevenueTypeOptions = (value: string) => {
  const current = canonicalizeOpportunityRevenueType(value);
  const custom = current && !OPPORTUNITY_REVENUE_TYPES.includes(
    current as (typeof OPPORTUNITY_REVENUE_TYPES)[number],
  ) ? [{ value: current, label: current }] : [];
  return [
    ...custom,
    ...OPPORTUNITY_REVENUE_TYPES.map((item) => ({
      value: item,
      label: revenueTypeLabels[item],
    })),
  ];
};
