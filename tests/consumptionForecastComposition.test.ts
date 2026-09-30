import assert from "node:assert/strict";
import { forecastAmountExactToKInput, parseForecastCompositionK } from "../src/data/forecastComposition";

assert.equal(forecastAmountExactToKInput("1230"), "1.23");
assert.equal(forecastAmountExactToKInput("1234.9999"), "1.23");
assert.equal(forecastAmountExactToKInput("1235"), "1.24", "existing internal values round HALF_UP only for two-decimal K display");
assert.deepEqual(parseForecastCompositionK("1.23", "0.20", "0.03"), {
  totalAmountExact: "1230",
  newAmountExact: "200",
  expansionAmountExact: "30"
});
assert.equal(parseForecastCompositionK("1.234", "0", "0"), "Enter non-negative K values with up to 2 decimals.");
assert.equal(parseForecastCompositionK("1.00", "0.80", "0.21"), "New + Expansion must not exceed Total.");
console.log("consumption Forecast composition two-decimal K tests passed");
