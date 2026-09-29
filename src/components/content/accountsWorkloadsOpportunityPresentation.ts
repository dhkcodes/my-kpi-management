import {
  AccountWorkloadDeal,
  AccountsWorkloadsFieldError
} from "../../data/accountsWorkloadsApi";

export const accountsWorkloadsBatchErrorSummary =
  "저장할 수 없는 항목이 있습니다. 아래 내용을 확인하고 수정해 주세요.";

const targetRank = (deal: AccountWorkloadDeal) => {
  const fiscalYear = /^FY(\d+)$/.exec(deal.targetFiscalYear ?? "");
  if (!fiscalYear || deal.targetQuarter === null || deal.targetQuarter < 1 || deal.targetQuarter > 4)
    return null;
  return Number(fiscalYear[1]) * 4 + deal.targetQuarter;
};

export const sortOpportunitiesByTarget = (
  deals: readonly AccountWorkloadDeal[],
  sortName: (deal: AccountWorkloadDeal) => string = (deal) => deal.name
): AccountWorkloadDeal[] =>
  deals
    .map((deal, originalIndex) => ({ deal, originalIndex }))
    .sort((left, right) => {
      const leftTarget = targetRank(left.deal);
      const rightTarget = targetRank(right.deal);
      if (leftTarget === null && rightTarget !== null) return 1;
      if (leftTarget !== null && rightTarget === null) return -1;
      if (leftTarget !== null && rightTarget !== null && leftTarget !== rightTarget)
        return rightTarget - leftTarget;

      const nameOrder = sortName(left.deal).localeCompare(
        sortName(right.deal),
        ["ko-KR", "en-US"],
        { numeric: true, sensitivity: "base" }
      );
      if (nameOrder !== 0) return nameOrder;

      const leftOpen = left.deal.status === "OPEN" ? 0 : 1;
      const rightOpen = right.deal.status === "OPEN" ? 0 : 1;
      return leftOpen - rightOpen || left.originalIndex - right.originalIndex;
    })
    .map(({ deal }) => deal);

export const sumWonOpportunityAmount = (
  deals: readonly AccountWorkloadDeal[],
  field: "arrUsd" | "arrKrw" | "acrUsd" | "acrKrw"
) => deals.reduce(
  (sum, deal) => sum + (
    deal.status === "WON" && !deal.deleted ? (deal[field] ?? 0) : 0
  ),
  0
);

export const isContractDateRangeValid = (
  startDate: string | null,
  endDate: string | null
) => !startDate || !endDate || startDate <= endDate;

const fieldLabel = (field: string) => {
  if (field === "name") return "Opportunity 이름";
  if (field === "contractStartDate") return "시작일(Start Date)";
  if (field === "contractEndDate") return "종료일(End Date)";
  if (field === "targetQuarter") return "Target Quarter";
  return field;
};

export const formatOpportunityFieldError = (
  error: AccountsWorkloadsFieldError,
  deal?: AccountWorkloadDeal
) => {
  if (
    deal &&
    error.entity === "deal" &&
    error.field === "contractEndDate" &&
    error.code === "RANGE" &&
    !isContractDateRangeValid(deal.contractStartDate, deal.contractEndDate)
  )
    return `Opportunity ‘${deal.name || "이름 없음"}’ · 시작일: ${deal.contractStartDate ?? "미입력"} · 종료일: ${deal.contractEndDate ?? "미입력"} — 시작일(Start Date)이 종료일(End Date)보다 늦습니다. 시작일을 종료일 이전 또는 같은 날짜로 수정해 주세요.`;

  const opportunity = deal ? `Opportunity ‘${deal.name || "이름 없음"}’ · ` : "";
  return `${opportunity}${fieldLabel(error.field)}: ${error.message}`;
};
