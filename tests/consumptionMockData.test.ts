import assert from "node:assert/strict";
import { parseConsumptionCsv } from "../src/data/consumptionData";
import { consumptionSyntheticCsv } from "../src/data/consumptionMockData";

const parsed = parseConsumptionCsv(consumptionSyntheticCsv);
assert.equal(parsed.plans.length, 6, "public fallback provides six synthetic detailed plans");
assert.equal(parsed.controlTotals.length, 1, "synthetic Multiple row exercises the control-total path");
assert.equal(parsed.plans.every((plan) => plan.planId.startsWith("SYN-")), true, "public fixtures use synthetic identifiers only");
const customerAllowlist = ["Blue River Works", "Cedar Labs", "Maple Systems", "Northstar Media", "Pulse Harbor", "Summit Retail"];
assert.deepEqual([...new Set(parsed.plans.map((plan) => plan.customer))].sort(), customerAllowlist, "fallback uses only approved fictional customers");

console.log("consumptionMockData tests passed");
