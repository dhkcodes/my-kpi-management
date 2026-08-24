import assert from "node:assert/strict";

import { getTargetPeriodOptions, splitTargetPeriod, TargetFiscalYear } from "../src/data/targetPeriod";

const previousFiscalYear: TargetFiscalYear = splitTargetPeriod("FY25 Q1")!.fiscalYear;
assert.equal(previousFiscalYear, "FY25", "target periods support the previous FY without casting it to an app-selected FiscalYear");

assert.deepEqual(getTargetPeriodOptions("FY27"), [
  "FY26 Q1", "FY26 Q2", "FY26 Q3", "FY26 Q4",
  "FY27 Q1", "FY27 Q2", "FY27 Q3", "FY27 Q4",
  "FY28 Q1", "FY28 Q2", "FY28 Q3", "FY28 Q4"
]);
assert.deepEqual(getTargetPeriodOptions("FY26"), [
  "FY25 Q1", "FY25 Q2", "FY25 Q3", "FY25 Q4",
  "FY26 Q1", "FY26 Q2", "FY26 Q3", "FY26 Q4",
  "FY27 Q1", "FY27 Q2", "FY27 Q3", "FY27 Q4"
]);
assert.deepEqual(splitTargetPeriod("FY28 Q4"), { fiscalYear: "FY28", quarter: "Q4" });
assert.equal(splitTargetPeriod("Q4"), null);

console.log("targetPeriod tests passed");