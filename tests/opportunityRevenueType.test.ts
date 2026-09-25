import assert from "node:assert/strict";
import {
  canonicalizeOpportunityRevenueType,
  opportunityRevenueTypeOptions,
} from "../src/data/opportunityRevenueType";

assert.equal(canonicalizeOpportunityRevenueType(" New "), "NEW");
assert.equal(canonicalizeOpportunityRevenueType("expansion"), "EXPANSION");
assert.equal(canonicalizeOpportunityRevenueType("RENEWAL"), "RENEWAL");

assert.deepEqual(
  opportunityRevenueTypeOptions(" New ").map((option) => option.value),
  ["NEW", "EXPANSION", "RENEWAL"],
  "display-case variants canonicalize to one default option instead of creating a duplicate",
);
assert.deepEqual(
  opportunityRevenueTypeOptions(" Strategic Alliance "),
  [
    { value: "Strategic Alliance", label: "Strategic Alliance" },
    { value: "NEW", label: "New" },
    { value: "EXPANSION", label: "Expansion" },
    { value: "RENEWAL", label: "Renewal" },
  ],
  "unknown persisted values remain available as trimmed custom options with their original text",
);

console.log("Opportunity Revenue Type contracts passed");
