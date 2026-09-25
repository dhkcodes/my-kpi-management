import assert from "node:assert/strict";
import { validateConfirmedOpportunityWrites } from "../src/components/content/opportunitySaveReconciliation";

const confirmed = [
  {
    id: 51,
    deals: [
      { id: 701, name: "Server normalized name", arrKrw: 1410000 },
      { id: 702, name: "Second saved opportunity", arrKrw: null },
    ],
  },
];

const baseline = [
  {
    id: 51,
    deals: [{ id: 701 }],
  },
];

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [
      { workloadId: 51, originalId: 701, deleted: false },
      { workloadId: 51, originalId: null, deleted: false },
    ],
    confirmed,
    baseline,
  ),
  "a successful authoritative response must not be rejected because the server normalized returned values",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [{ workloadId: 51, originalId: 799, deleted: true }],
    confirmed,
    baseline,
  ),
  "an absent deleted id confirms deletion",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [{ workloadId: 51, originalId: 799, deleted: false }],
      confirmed,
      baseline,
    ),
  /Saved Opportunity was not returned/,
  "an existing update still requires the same server id in the authoritative response",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [{ workloadId: 999, originalId: null, deleted: false }],
      confirmed,
      baseline,
    ),
  /workload was not returned/,
  "the touched workload must be present before local drafts are cleared",
);

assert.doesNotThrow(() =>
  validateConfirmedOpportunityWrites(
    [
      { workloadId: 51, originalId: null, deleted: false },
      { workloadId: 51, originalId: null, deleted: false },
    ],
    [
      {
        id: 51,
        deals: [
          { id: 802 },
          { id: 701 },
          { id: 801 },
        ],
      },
    ],
    baseline,
  ),
  "multiple new rows are confirmed by new server identities, independent of order and normalized values",
);

assert.throws(
  () =>
    validateConfirmedOpportunityWrites(
      [
        { workloadId: 51, originalId: null, deleted: false },
        { workloadId: 51, originalId: null, deleted: false },
      ],
      [{ id: 51, deals: [{ id: 701 }, { id: 839 }] }],
      baseline,
    ),
  /result was incomplete.*Reload before retrying/i,
  "a partial authoritative response must not be treated as two confirmed inserts",
);

console.log("Opportunity save reconciliation contracts passed");
