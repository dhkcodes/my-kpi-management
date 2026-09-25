import assert from "node:assert/strict";
import type {
  ConfirmedOpportunityDeal,
  SubmittedOpportunityWrite,
} from "../src/components/content/opportunitySaveReconciliation";
import {
  correlateLegacyOpportunityResults,
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
    new Set([701]),
  ),
  "clientId mappings confirm multiple new rows independent of response and hierarchy order",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [submission("draft:case", null, { revenueType: "NEW" })],
    workloads([deal(913, { revenueType: "New" })]),
    [{ clientId: "draft:case", serverId: 913, workloadId: 51, action: "UPSERT" }],
  ),
  "the backend's display-label enum serialization is equivalent to the canonical write value",
);

const legacyMixedSubmissions = [
  submission("deal:701", 701, { name: "Existing updated" }),
  submission("draft:-20", null, { name: "First new", revenueType: "NEW" }),
  submission("draft:-21", null, { name: "Second new", revenueType: "EXPANSION" }),
];
const legacyMixedWorkloads = workloads([
  deal(701, { name: "Existing updated", revenueType: "New" }),
  deal(920, { name: "Second new", revenueType: "Expansion" }),
  deal(919, { name: "First new", revenueType: "New" }),
]);
const inferredLegacyResults = correlateLegacyOpportunityResults(
  legacyMixedSubmissions,
  legacyMixedWorkloads,
  new Set([701]),
);
assert.deepEqual(inferredLegacyResults, [
  { clientId: "draft:-20", serverId: 919, workloadId: 51, action: "UPSERT" },
  { clientId: "draft:-21", serverId: 920, workloadId: 51, action: "UPSERT" },
]);
assert.doesNotThrow(() => validateConfirmedOpportunityWrites(
  legacyMixedSubmissions,
  legacyMixedWorkloads,
  inferredLegacyResults,
  new Set([701]),
), "old Backend responses without dealResults remain safe for uniquely correlatable mixed batches");

const ambiguousLegacy = [
  submission("draft:-30", null, { name: "Same" }),
  submission("draft:-31", null, { name: "Same" }),
];
assert.deepEqual(
  correlateLegacyOpportunityResults(
    ambiguousLegacy,
    workloads([deal(930, { name: "Same" }), deal(931, { name: "Same" })]),
    new Set(),
  ),
  [],
  "identical new rows are never guessed or released without clientId correlation",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-existing-id", null)],
      workloads([deal(701)]),
      [{ clientId: "draft:-existing-id", serverId: 701, workloadId: 51, action: "UPSERT" }],
      new Set([701]),
    ),
  /serverId|mapping/i,
  "a malformed new-row mapping cannot reuse a server id that existed before submission",
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

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-6", null), submission("draft:-7", null, { name: "Other" })],
      workloads([deal(906), deal(907, { name: "Other" })]),
      [
        { clientId: "draft:-6", serverId: 906, workloadId: 51, action: "UPSERT" },
        { clientId: "draft:-7", serverId: 906, workloadId: 51, action: "UPSERT" },
      ],
    ),
  /serverId|mapping/i,
  "one server id cannot confirm two new client ids",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [
        submission("draft:-8", null, { name: "First concurrent" }),
        submission("draft:-9", null, { name: "Second concurrent" }),
      ],
      workloads([
        deal(701, { name: "Preexisting" }),
        deal(908, { name: "Second concurrent" }),
        deal(909, { name: "First concurrent" }),
      ]),
      [],
    ),
  /clientId|mapping|pending/i,
  "a GET cannot guess correlation for concurrent new rows after the POST response is lost",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [
        submission("draft:-10", null, { name: "Present" }),
        submission("draft:-11", null, { name: "Missing" }),
      ],
      workloads([deal(701, { name: "Preexisting" }), deal(910, { name: "Present" })]),
      [],
    ),
  /missing|mapping|returned/i,
  "a partial GET result cannot clear any pending submission as successful",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [submission("draft:-12", null, { name: "Expected value" })],
      workloads([deal(701, { name: "Preexisting" }), deal(912, { name: "Wrong value" })]),
      [],
    ),
  /missing|mapping|returned/i,
  "an inserted-looking row with unpersisted values cannot confirm a lost response",
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
