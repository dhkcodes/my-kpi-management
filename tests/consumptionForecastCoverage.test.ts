import * as assert from "node:assert/strict";
import { formatForecastCoverage } from "../src/data/consumptionForecastCoverage";

assert.equal(
  formatForecastCoverage(["FY27-SEP", "FY27-OCT", "FY27-NOV"]),
  "Partial · Sep–Nov",
  "stored Forecast rows define coverage, even when the API's selected-period metadata spans the fiscal year"
);
assert.equal(
  formatForecastCoverage(["FY27-SEP", "FY27-NOV"]),
  "Partial · Sep, Nov",
  "non-contiguous stored rows must not be presented as a range"
);
assert.equal(
  formatForecastCoverage([]),
  "No forecast entered",
  "missing Forecast rows have no coverage"
);

console.log("consumption forecast coverage tests passed");
