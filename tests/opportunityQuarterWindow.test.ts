import assert from "node:assert/strict";
import { targetOptionsFor } from "../src/components/content/opportunityQuarterWindow";

assert.deepEqual(targetOptionsFor(new Date("2026-10-09T00:00:00Z")), [
  "FY26 Q1", "FY26 Q2", "FY26 Q3", "FY26 Q4", "FY27 Q1", "FY27 Q2",
  "FY27 Q3", "FY27 Q4", "FY28 Q1", "FY28 Q2", "FY28 Q3",
], "FY27 Q2 exposes five past, current, and five future quarters");

assert.equal(targetOptionsFor(new Date("2026-12-31T14:59:59Z"))[5], "FY27 Q3");
assert.equal(targetOptionsFor(new Date("2026-12-31T15:00:00Z"))[5], "FY27 Q3",
  "December and January remain in the same fiscal quarter");
assert.equal(targetOptionsFor(new Date("2026-05-31T14:59:59Z"))[5], "FY26 Q4");
assert.equal(targetOptionsFor(new Date("2026-05-31T15:00:00Z"))[5], "FY27 Q1",
  "the fiscal-year boundary follows Asia/Seoul");

console.log("opportunityQuarterWindow.test.ts: all assertions passed");
