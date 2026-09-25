import assert from "node:assert/strict";
import {
  ConfirmedOpportunityDeal,
  SubmittedOpportunityWrite,
  validateConfirmedOpportunityWrites,
} from "../src/components/content/opportunitySaveReconciliation";

const deal = (
  id: number,
  overrides: Partial<ConfirmedOpportunityDeal> = {},
): ConfirmedOpportunityDeal => ({
  id,
  name: "Opportunity",
  opportunityNo: null,
  revenueType: "NEW",
  status: "OPEN",
  targetFiscalYear: null,
  targetQuarter: null,
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
  ...overrides,
});

const submission = (
  clientId: string,
  originalId: number | null,
  overrides: Partial<SubmittedOpportunityWrite["write"]> = {},
): SubmittedOpportunityWrite => ({
  clientId,
  workloadId: 51,
  originalId,
  write: {
    id: originalId,
    clientId,
    workloadRef: "51",
    versionNo: originalId === null ? null : 3,
    name: "Opportunity",
    opportunityNo: null,
    revenueType: "NEW",
    status: "OPEN",
    targetFiscalYear: null,
    targetQuarter: null,
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
    action: "UPSERT",
    ...overrides,
  },
});

const workloads = (deals: ReadonlyArray<ConfirmedOpportunityDeal>) => [
  { id: 51, deals },
];

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:existing-701", 701, { name: "Changed name" })],
      workloads([deal(701, { name: "Old name" })]),
      [],
    ),
  /name/,
  "an existing id alone must not confirm an update when the persisted value is unchanged",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-1", null)],
      workloads([deal(839)]),
      [{ clientId: "some-other-draft", serverId: 839, workloadId: 51, action: "UPSERT" }],
    ),
  /clientId|mapping/i,
  "an unrelated inserted row must not confirm a new submission merely because counts match",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [
      submission("draft:-1", null, { name: " First " }),
      submission("draft:-2", null, { name: "Second" }),
    ],
    workloads([
      deal(902, { name: "Second" }),
      deal(901, { name: "First" }),
    ]),
    [
      { clientId: "draft:-2", serverId: 902, workloadId: 51, action: "UPSERT" },
      { clientId: "draft:-1", serverId: 901, workloadId: 51, action: "UPSERT" },
    ],
  ),
  "clientId mappings confirm multiple new rows independent of response and hierarchy order",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [submission("draft:-3", null, {
      name: "  Normalized Name  ",
      opportunityNo: "   ",
      arrUsd: 12.34565,
      arrKrw: 12.34564,
      acrUsd: -1.23455,
      acrKrw: 0,
      winProbability: 87.65435,
      latestUpdate: "  updated  ",
      notes: "  keep notes exactly  ",
    })],
    workloads([deal(903, {
      name: "Normalized Name",
      opportunityNo: null,
      arrUsd: 12.3457,
      arrKrw: 12.3456,
      acrUsd: -1.2346,
      acrKrw: 0,
      winProbability: 87.6544,
      latestUpdate: "updated",
      notes: "  keep notes exactly  ",
    })]),
    [{ clientId: "draft:-3", serverId: 903, workloadId: 51, action: "UPSERT" }],
  ),
  "server trim, blank-to-null, and Oracle half-up scale-4 normalization are accepted",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-4", null, { status: "WON", notes: "exact" })],
      workloads([deal(904, { status: "OPEN", notes: "exact" })]),
      [{ clientId: "draft:-4", serverId: 904, workloadId: 51, action: "UPSERT" }],
    ),
  /status/,
  "a persisted field mismatch identifies the actual field",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-5", null)],
      workloads([deal(905)]),
      [],
    ),
  /clientId|mapping/i,
  "a missing new-row mapping is an unconfirmed save",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [submission("draft:701", 701, { latestUpdate: "" })],
    workloads([deal(701, { latestUpdate: "server retained update" })]),
    [],
  ),
  "blank latestUpdate on an existing row means retain server state and is excluded from comparison",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [{ ...submission("draft:799", 799), write: { ...submission("draft:799", 799).write, action: "DELETE" } }],
    workloads([]),
    [{ clientId: "draft:799", serverId: 799, workloadId: 51, action: "DELETE" }],
  ),
  "deletion is confirmed by absence of the original id",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [{ ...submission("draft:799", 799), write: { ...submission("draft:799", 799).write, action: "DELETE" } }],
      workloads([deal(799)]),
      [{ clientId: "draft:799", serverId: 799, workloadId: 51, action: "DELETE" }],
    ),
  /still returned/,
  "a returned original id does not confirm deletion",
);

console.log("Opportunity save reconciliation contracts passed");
