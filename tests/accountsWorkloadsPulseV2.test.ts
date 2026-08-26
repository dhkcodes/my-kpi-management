import assert from "node:assert/strict";
import { AccountWorkloadRow } from "../src/data/accountsWorkloadsMockData";
import {
  calculateAccountsWorkloadsPulseV2,
  getBusinessAsOfDate,
  summarizeAccountsWorkloadsByAccount
} from "../src/data/accountsWorkloadsPulseV2";

const row = (
  id: string,
  account: string,
  overrides: Partial<AccountWorkloadRow> = {}
): AccountWorkloadRow => ({
  id,
  sourceRowNumber: Number(id.replace(/\D/g, "")) || 1,
  planNumber: `PLAN-${id}`,
  account,
  workloadName: `Workload ${id}`,
  opptyNo: `OPPTY-${id}`,
  startDate: "2026-06-10",
  endDate: "2028-06-10",
  arrUsd: 100,
  arrKrw: 150_000,
  acrUsd: 200,
  acrKrw: 300_000,
  target: "",
  winProbability: 50,
  latestUpdate: "",
  notes: "",
  isImportant: false,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  ...overrides
});

const rows: AccountWorkloadRow[] = [
  row("r1", "Account A", { target: "FY27 Q1", endDate: "2026-08-20", isImportant: true, arrUsd: 1_000, acrUsd: 2_000 }),
  row("r2", "Account A", { target: "FY27 Q2", endDate: "2026-12-01", arrUsd: 2_000, acrUsd: 3_000 }),
  row("r3", "Account B", { endDate: "2027-03-01", arrUsd: null, acrUsd: 4_000 }),
  row("r4", "Account C", { startDate: "", endDate: "", target: "FY27 Q2", isImportant: true, arrUsd: 4_000, acrUsd: null }),
  row("r5", "Account D", { endDate: "", target: "FY27 Q1", arrUsd: 5_000, acrUsd: 6_000 }),
  row("r6", "Deleted Account", { isDeleted: true, startDate: "", endDate: "2026-08-10", target: "FY27 Q3", arrUsd: 99_999, acrUsd: 99_999 }),
  row("r7", "Account E", { target: "FY26 Q4", arrUsd: 7_000, acrUsd: 8_000 })
];

assert.equal(
  getBusinessAsOfDate(new Date("2026-08-05T15:30:00Z")),
  "2026-08-06",
  "business date must use Asia/Seoul rather than UTC"
);

const pulse = calculateAccountsWorkloadsPulseV2(rows, "FY27", "2026-08-05");
const urgencyCounts = (summary: typeof pulse.renewalExpand) => Object.fromEntries(
  Object.entries(summary).map(([level, value]) => [level, { accounts: value.accounts, workloads: value.workloads }])
);

assert.deepEqual(pulse.metrics, {
  activeAccounts: 5,
  activeWorkloads: 6,
  arrUsd: 19_000,
  acrUsd: 23_000,
  importantWorkloads: 2,
  targetCoverageWorkloads: 5,
  targetCoveragePercent: 83
});

assert.deepEqual(pulse.workloadsByAccount, [
  { account: "Account A", workloads: 2 },
  { account: "Account B", workloads: 1 },
  { account: "Account C", workloads: 1 },
  { account: "Other 2 accounts", workloads: 2 }
]);
assert.equal(pulse.topAccountConcentrationPercent, 33);

assert.deepEqual(summarizeAccountsWorkloadsByAccount(rows), [
  { account: "Account A", workloads: 2, arrUsd: 3_000, acrUsd: 5_000, importantWorkloads: 1, targetCoverageWorkloads: 2 },
  { account: "Account B", workloads: 1, arrUsd: 0, acrUsd: 4_000, importantWorkloads: 0, targetCoverageWorkloads: 0 },
  { account: "Account C", workloads: 1, arrUsd: 4_000, acrUsd: 0, importantWorkloads: 1, targetCoverageWorkloads: 1 },
  { account: "Account D", workloads: 1, arrUsd: 5_000, acrUsd: 6_000, importantWorkloads: 0, targetCoverageWorkloads: 1 },
  { account: "Account E", workloads: 1, arrUsd: 7_000, acrUsd: 8_000, importantWorkloads: 0, targetCoverageWorkloads: 1 }
]);

assert.deepEqual(urgencyCounts(pulse.renewalExpand), {
  critical: { accounts: 1, workloads: 1 },
  attention: { accounts: 1, workloads: 1 },
  upcoming: { accounts: 1, workloads: 1 }
});
assert.deepEqual(pulse.topRenewalAction, {
  account: "Account A",
  daysRemaining: 15
});

assert.deepEqual(urgencyCounts(pulse.newCommit), {
  critical: { accounts: 1, workloads: 1 },
  attention: { accounts: 1, workloads: 1 },
  upcoming: { accounts: 0, workloads: 0 }
});
assert.deepEqual(pulse.topNewCommitReview, {
  account: "Account D",
  workloadName: "Workload r5",
  target: "FY27 Q1",
  daysRemaining: 26
});

assert.equal(
  calculateAccountsWorkloadsPulseV2([rows[6]], "FY27", "2026-08-05").topRenewalAction,
  null,
  "renewal top action must stay within the 270-day action window"
);

const emptyUrgencyExpected = {
  critical: { accounts: 0, workloads: 0 },
  attention: { accounts: 0, workloads: 0 },
  upcoming: { accounts: 0, workloads: 0 }
};

const boundaryRows = [
  row("b-overdue", "Boundary Overdue", { endDate: "2026-08-01" }),
  row("b-90", "Boundary 90", { endDate: "2026-11-03" }),
  row("b-91", "Boundary 91", { endDate: "2026-11-04" }),
  row("b-180", "Boundary 180", { endDate: "2027-02-01" }),
  row("b-181", "Boundary 181", { endDate: "2027-02-02" }),
  row("b-270", "Boundary 270", { endDate: "2027-05-02" }),
  row("b-271", "Boundary 271", { endDate: "2027-05-03" }),
  row("b-deleted", "Boundary Deleted", { endDate: "2026-08-01", isDeleted: true })
];

assert.deepEqual(
  urgencyCounts(calculateAccountsWorkloadsPulseV2(boundaryRows, "FY27", "2026-08-05").renewalExpand),
  {
    critical: { accounts: 2, workloads: 2 },
    attention: { accounts: 2, workloads: 2 },
    upcoming: { accounts: 2, workloads: 2 }
  },
  "renewal bands must include overdue and exact upper boundaries while excluding day 271 and soft-deleted rows"
);

const renewalAt = (endDate: string, isDeleted = false) =>
  calculateAccountsWorkloadsPulseV2(
    [row(`renewal-${endDate}-${isDeleted}`, "Renewal Boundary", { endDate, isDeleted })],
    "FY27",
    "2026-08-05"
  ).renewalExpand;

assert.equal(renewalAt("2026-08-01").critical.workloads, 1, "overdue End Date remains Critical");
assert.equal(renewalAt("2026-11-03").critical.workloads, 1, "renewal day 90 is Critical");
assert.equal(renewalAt("2026-11-04").attention.workloads, 1, "renewal day 91 is Attention");
assert.equal(renewalAt("2027-02-01").attention.workloads, 1, "renewal day 180 is Attention");
assert.equal(renewalAt("2027-02-02").upcoming.workloads, 1, "renewal day 181 is Upcoming");
assert.equal(renewalAt("2027-05-02").upcoming.workloads, 1, "renewal day 270 is Upcoming");
assert.deepEqual(urgencyCounts(renewalAt("2027-05-03")), emptyUrgencyExpected, "renewal day 271 is outside the summary window");
assert.deepEqual(urgencyCounts(renewalAt("2026-08-01", true)), emptyUrgencyExpected, "soft-deleted renewal rows are excluded");

const newCommitBoundaryRow = row("new-boundary", "New Boundary", {
  startDate: "",
  endDate: "",
  target: "FY27 Q1"
});
const newCommitAt = (asOf: string) =>
  calculateAccountsWorkloadsPulseV2([newCommitBoundaryRow], "FY27", asOf).newCommit;

assert.equal(newCommitAt("2026-09-01").critical.workloads, 1, "overdue Target Quarter remains Critical");
assert.equal(newCommitAt("2026-06-02").critical.workloads, 1, "day 90 is Critical");
assert.equal(newCommitAt("2026-06-01").attention.workloads, 1, "day 91 is Attention");
assert.equal(newCommitAt("2026-03-04").attention.workloads, 1, "day 180 is Attention");
assert.equal(newCommitAt("2026-03-03").upcoming.workloads, 1, "day 181 is Upcoming");
assert.equal(newCommitAt("2025-12-04").upcoming.workloads, 1, "day 270 is Upcoming");
assert.deepEqual(
  urgencyCounts(newCommitAt("2025-12-03")),
  emptyUrgencyExpected,
  "day 271 is outside the New Commit summary window"
);

console.log("accountsWorkloadsPulseV2 tests passed");
