import assert from "node:assert/strict";
import {
  addExactDecimals,
  compareExactDecimals,
  divideExactDecimal,
  formatExactCurrency,
  formatExactK,
  formatExactKFixed,
  formatExactPercent,
  negateExactDecimal,
  subtractExactDecimals
} from "../src/data/exactDecimal";

assert.equal(addExactDecimals("900719925474.0003", "0.0001"), "900719925474.0004",
  "exact addition must not lose a fraction above Number.MAX_SAFE_INTEGER");
assert.equal(addExactDecimals("450359962737.0001", "450359962737.0002"), "900719925474.0003",
  "DP + OCI must retain the exact ALL aggregate");
assert.equal(subtractExactDecimals("0.0001", "900719925474.0003"), "-900719925474.0002");
assert.equal(negateExactDecimal("0.0001"), "-0.0001");
assert.equal(compareExactDecimals("900719925474.0003", "900719925474.0002"), 1);
assert.equal(subtractExactDecimals("1.25e3", "2.5E-1"), "1249.75",
  "scientific JSON number tokens are normalized without projecting through Number");

assert.equal(formatExactCurrency("900719925474.0003"), "$900,719,925,474.0003");
assert.equal(formatExactCurrency("0.0001"), "$0.0001");
assert.equal(formatExactCurrency("-12.3"), "-$12.3");
assert.equal(formatExactK("900719925474.0003"), "$900,719,925.4740003 K");
assert.equal(formatExactK("0.0001"), "$0.0000001 K");
assert.equal(formatExactKFixed("1234567", 2), "$1,234.57 K");
assert.equal(formatExactKFixed("0", 2), "$0.00 K");
assert.equal(formatExactKFixed("-1255", 2), "-$1.26 K");

assert.equal(divideExactDecimal("1", "6", 1), "0.2", "division uses round-half-away-from-zero");
assert.equal(divideExactDecimal("-1", "6", 1), "-0.2");
assert.equal(formatExactPercent("1", "6", 1), "16.7%", "display percentages have one decimal and round half away from zero");
assert.equal(formatExactPercent("2", "3", 1), "66.7%");
assert.equal(formatExactPercent("1", "0", 1), null);
assert.equal(formatExactPercent("1", "8"), "12.50%", "default ratio display uses two decimal percentage points");
assert.equal(formatExactPercent("1", "40"), "2.50%", "two-decimal ratio display retains trailing zero");
assert.equal(formatExactPercent("1", ""), null, "blank denominator is unavailable, not zero percent");
assert.equal(formatExactPercent("1", null), null, "missing denominator is unavailable, not zero percent");

console.log("exact decimal tests passed");
