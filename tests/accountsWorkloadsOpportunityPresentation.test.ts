import assert from "node:assert/strict";
import {
  accountsWorkloadsBatchErrorSummary,
  formatOpportunityFieldError,
  isContractDateRangeValid,
  sortOpportunitiesByTarget
} from "../src/components/content/accountsWorkloadsOpportunityPresentation";
import { AccountWorkloadDeal, AccountsWorkloadsFieldError } from "../src/data/accountsWorkloadsApi";

const deal = (
  id: number,
  name: string,
  targetFiscalYear: string | null,
  targetQuarter: number | null,
  status: AccountWorkloadDeal["status"] = "WON"
): AccountWorkloadDeal => ({
  id,
  workloadId: 10,
  versionNo: 1,
  name,
  opportunityNo: null,
  revenueType: "NEW",
  status,
  targetFiscalYear,
  targetQuarter,
  actualCloseDate: null,
  contractStartDate: null,
  contractEndDate: null,
  arrUsd: null,
  arrKrw: null,
  acrUsd: null,
  acrKrw: null,
  winProbability: null,
  latestUpdate: null,
  notes: null,
  deleted: false,
  deletedAt: null,
  sourceCommitmentId: null
});

const input = [
  deal(1, "Zulu", "FY27", 4),
  deal(2, "Beta", "FY28", 1),
  deal(3, "Alpha", "FY28", 1, "WON"),
  deal(4, "Alpha", "FY28", 1, "OPEN"),
  deal(5, "가나다", "FY27", 4),
  deal(6, "No target B", null, null),
  deal(7, "No target A", null, null),
  deal(8, "Same", "FY27", 3, "WON"),
  deal(9, "Same", "FY27", 3, "WON")
];
const sorted = sortOpportunitiesByTarget(input);
assert.deepEqual(
  sorted.map((item) => item.id),
  [4, 3, 2, 5, 1, 8, 9, 7, 6],
  "FY/quarter desc, name asc, OPEN first, missing target last, and stable exact ties"
);
assert.deepEqual(input.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9], "sorting must not mutate saved/draft order");

assert.equal(isContractDateRangeValid("2026-08-02", "2026-08-01"), false, "reversed dates are invalid");
assert.equal(isContractDateRangeValid("2026-08-01", "2026-08-01"), true, "the same date is valid");
assert.equal(
  accountsWorkloadsBatchErrorSummary,
  "저장할 수 없는 항목이 있습니다. 아래 내용을 확인하고 수정해 주세요.",
  "the batch-level error must be understandable Korean"
);

const rangeError: AccountsWorkloadsFieldError = {
  operationIndex: 0,
  entity: "deal",
  clientId: "deal:4",
  field: "contractEndDate",
  code: "RANGE",
  message: "contract end must not precede start"
};
const invalidDeal = {
  ...deal(4, "Alpha Renewal", "FY28", 1, "OPEN"),
  contractStartDate: "2026-08-02",
  contractEndDate: "2026-08-01"
};
assert.equal(
  formatOpportunityFieldError(rangeError, invalidDeal),
  "Opportunity ‘Alpha Renewal’ · 시작일: 2026-08-02 · 종료일: 2026-08-01 — 시작일(Start Date)이 종료일(End Date)보다 늦습니다. 시작일을 종료일 이전 또는 같은 날짜로 수정해 주세요."
);

console.log("accountsWorkloadsOpportunityPresentation tests passed");
