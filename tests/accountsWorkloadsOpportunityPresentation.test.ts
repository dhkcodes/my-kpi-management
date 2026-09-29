import assert from "node:assert/strict";
import {
  accountsWorkloadsBatchErrorSummary,
  formatAwParentAmountK,
  formatOpportunityFieldError,
  isContractDateRangeValid,
  sumWonOpportunityAmount,
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

const amountDeal = (id: number, status: AccountWorkloadDeal["status"], arrKrw: number | null, acrKrw: number | null, deleted = false): AccountWorkloadDeal => ({
  ...deal(id, `Amount ${id}`, "FY27", 1, status), arrKrw, acrKrw, deleted,
  deletedAt: deleted ? "2026-09-29T00:00:00Z" : null
});
const mixedAmounts = [
  { ...amountDeal(20, "WON", null, null), arrUsd: 100, acrUsd: 40 },
  { ...amountDeal(21, "OPEN", null, null), name: "아이디어정보기술 OPEN", opportunityNo: "A9KFF9", arrUsd: 30276.87, acrUsd: 600 },
  { ...amountDeal(22, "LOST", null, null), arrUsd: 800, acrUsd: 500 },
  { ...amountDeal(23, "WON", null, null, true), arrUsd: 700, acrUsd: 300 }
];
assert.equal(sumWonOpportunityAmount(mixedAmounts, "arrUsd"), 100,
  "ARR includes only active Closed Won opportunities; OPEN A9KFF9 (30,276.87), LOST, and archived rows are excluded");
assert.equal(sumWonOpportunityAmount(mixedAmounts, "acrUsd"), 40,
  "ACR uses the same Closed Won scope");
assert.equal(sumWonOpportunityAmount([amountDeal(24, "OPEN", 50, 20)], "arrKrw"), 0,
  "no closed opportunity yields zero");
assert.equal(sumWonOpportunityAmount([{ ...mixedAmounts[1], status: "WON" }], "arrUsd"), 30276.87,
  "a persisted OPEN to WON transition immediately adds the amount to aggregates");
assert.equal(sumWonOpportunityAmount([{ ...mixedAmounts[0], status: "OPEN" }], "arrUsd"), 0,
  "a persisted WON to OPEN transition immediately removes the amount from aggregates");
assert.equal(sumWonOpportunityAmount([{ ...mixedAmounts[0], status: "LOST" }], "arrUsd"), 0,
  "a persisted WON to LOST transition immediately removes the amount from aggregates");
assert.equal(formatAwParentAmountK(30276.87), "30.28K",
  "AW parent totals are divided by 1,000 and marked with K without changing the raw amount");
assert.equal(formatAwParentAmountK(0), "0K", "an empty WON total remains an explicit zero in K units");

const renamedWhileEditing = input.map((item) => item.id === 2 ? { ...item, name: "Aardvark" } : item);
assert.deepEqual(
  sortOpportunitiesByTarget(
    renamedWhileEditing,
    (item) => item.id === 2 ? "Beta" : item.name
  ).map((item) => item.id),
  [4, 3, 2, 5, 1, 8, 9, 7, 6],
  "an unsaved Opportunity name uses its original sort key so typing does not move the row"
);
assert.deepEqual(
  sortOpportunitiesByTarget(renamedWhileEditing).map((item) => item.id),
  [2, 4, 3, 5, 1, 8, 9, 7, 6],
  "after save clears the frozen key, the updated name participates in sorting"
);

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
