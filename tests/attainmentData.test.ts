import assert from "node:assert/strict";
import {
  calculateAttainment,
  calculateFiscalYearSummary,
  formatAttainment,
  formatAttainmentAmount,
  formatBudget
} from "../src/data/attainmentData";

assert.equal(formatAttainmentAmount(1234.49), "$1,234 K", "amounts are displayed as rounded integer K");
assert.equal(formatAttainmentAmount(1234.5), "$1,235 K", "amount display rounds only at the presentation boundary");
assert.equal(formatBudget(610.125), "$610 K", "budget is already K and is not converted again");

assert.equal(calculateAttainment(125, 100), 125);
assert.equal(calculateAttainment(0, 100), 0);
assert.equal(calculateAttainment(125, 0), null, "zero budget has no valid attainment denominator");
assert.equal(calculateAttainment(125, null), null, "missing budget has no valid attainment denominator");
assert.equal(formatAttainment(null), "—");
assert.equal(formatBudget(null), "—", "missing budget renders as an em dash");
assert.notEqual(formatBudget(0), "—", "an explicit zero budget remains distinguishable from missing");

const summary = calculateFiscalYearSummary([
  { quarter: "Q1", budget: 100, actual: 50, forecast: 80, dpActual: 20, dpForecast: 30, ociActual: 30, ociForecast: 50 },
  { quarter: "Q2", budget: 200, actual: 180, forecast: 220, dpActual: 80, dpForecast: 100, ociActual: 100, ociForecast: 120 },
  { quarter: "Q3", budget: 0, actual: 20, forecast: 25, dpActual: 8, dpForecast: 10, ociActual: 12, ociForecast: 15 },
  { quarter: "Q4", budget: 100, actual: 50, forecast: 75, dpActual: 20, dpForecast: 30, ociActual: 30, ociForecast: 45 }
]);
assert.deepEqual(summary, {
  budget: 400,
  actual: 300,
  forecast: 400,
  dpActual: 128,
  dpForecast: 170,
  ociActual: 172,
  ociForecast: 230,
  actualAttainment: 75,
  forecastAttainment: 100,
  actualVarianceToBudget: -100,
  forecastVarianceToBudget: 0
});
assert.notEqual(summary.actualAttainment, (50 + 90) / 2, "FY attainment is not an average of quarter percentages");

const incompleteBudget = calculateFiscalYearSummary([
  { quarter: "Q1", budget: 100, actual: 1, forecast: 2, dpActual: 1, dpForecast: 1, ociActual: 0, ociForecast: 1 },
  { quarter: "Q2", budget: null, actual: 2, forecast: 3, dpActual: 1, dpForecast: 1, ociActual: 1, ociForecast: 2 },
  { quarter: "Q3", budget: 100, actual: 3, forecast: 4, dpActual: 1, dpForecast: 2, ociActual: 2, ociForecast: 2 },
  { quarter: "Q4", budget: 100, actual: 4, forecast: 5, dpActual: 2, dpForecast: 2, ociActual: 2, ociForecast: 3 }
]);
assert.equal(incompleteBudget.budget, null);
assert.equal(incompleteBudget.actualAttainment, null);
assert.equal(incompleteBudget.forecastVarianceToBudget, null);

const noBudget = calculateFiscalYearSummary([
  { quarter: "Q1", budget: null, actual: 1, forecast: 2, dpActual: 1, dpForecast: 1, ociActual: 0, ociForecast: 1 },
  { quarter: "Q2", budget: null, actual: 2, forecast: 3, dpActual: 1, dpForecast: 1, ociActual: 1, ociForecast: 2 },
  { quarter: "Q3", budget: null, actual: 3, forecast: 4, dpActual: 1, dpForecast: 2, ociActual: 2, ociForecast: 2 },
  { quarter: "Q4", budget: null, actual: 4, forecast: 5, dpActual: 2, dpForecast: 2, ociActual: 2, ociForecast: 3 }
]);
assert.equal(noBudget.budget, null);
assert.equal(noBudget.actualAttainment, null);
assert.equal(noBudget.actualVarianceToBudget, null);

const zeroBudget = calculateFiscalYearSummary([
  { quarter: "Q1", budget: 0, actual: 1, forecast: 2, dpActual: 1, dpForecast: 1, ociActual: 0, ociForecast: 1 },
  { quarter: "Q2", budget: 0, actual: 2, forecast: 3, dpActual: 1, dpForecast: 1, ociActual: 1, ociForecast: 2 },
  { quarter: "Q3", budget: 0, actual: 3, forecast: 4, dpActual: 1, dpForecast: 2, ociActual: 2, ociForecast: 2 },
  { quarter: "Q4", budget: 0, actual: 4, forecast: 5, dpActual: 2, dpForecast: 2, ociActual: 2, ociForecast: 3 }
]);
assert.equal(zeroBudget.budget, 0);
assert.equal(zeroBudget.actualAttainment, null);
assert.equal(zeroBudget.forecastAttainment, null);
assert.equal(zeroBudget.actualVarianceToBudget, null);
assert.equal(zeroBudget.forecastVarianceToBudget, null);

console.log("attainmentData tests passed");
