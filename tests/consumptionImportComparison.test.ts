import assert from "node:assert/strict";
import {
  buildForecastImportComparisons,
  describeActualImportChange
} from "../src/data/consumptionImportComparison";

const previewRows = [
  { normalizedAccount: "ACME", pillar: "DP" as const, periodKey: "FY27-OCT", forecastAmount: "9007199254740993.11" }
];
const currentForecasts = [
  { normalizedAccount: "ACME", pillar: "DP" as const, periodKey: "FY27-OCT", amountExact: "9007199254740992.01" }
];

const exact = buildForecastImportComparisons("cm-20", "cm-20", previewRows, currentForecasts);
assert.deepEqual(exact[0], {
  status: "available",
  currentValue: "9007199254740992.01",
  inputValue: "9007199254740993.11",
  difference: "1.1"
}, "Forecast comparison must subtract exact decimals without a Number projection");

const versionMismatch = buildForecastImportComparisons("cm-20", "cm-21", previewRows, currentForecasts);
assert.deepEqual(versionMismatch[0], {
  status: "unavailable",
  inputValue: "9007199254740993.11",
  reason: "Version mismatch"
}, "ETag mismatch must be comparison unavailable, never zero or new");

const missing = buildForecastImportComparisons("cm-20", "cm-20", previewRows, []);
assert.deepEqual(missing[0], {
  status: "unavailable",
  inputValue: "9007199254740993.11",
  reason: "No unique current value"
}, "an unmatched row must remain comparison unavailable");

const unavailable = buildForecastImportComparisons("cm-20", null, previewRows, []);
assert.equal(unavailable[0].status, "unavailable");
assert.equal(unavailable[0].reason, "Current data unavailable");

const duplicate = buildForecastImportComparisons("cm-20", "cm-20", previewRows, [
  ...currentForecasts,
  { ...currentForecasts[0], amountExact: "1" }
]);
assert.deepEqual(duplicate[0], {
  status: "unavailable",
  inputValue: "9007199254740993.11",
  reason: "Duplicate join key"
}, "a duplicate current join key must remain comparison unavailable");

const duplicateInput = buildForecastImportComparisons("cm-20", "cm-20", [...previewRows, ...previewRows], currentForecasts);
assert.equal(duplicateInput[0].status, "unavailable");
assert.equal(duplicateInput[0].reason, "Duplicate join key");
assert.equal(duplicateInput[1].status, "unavailable");
assert.equal(duplicateInput[1].reason, "Duplicate join key");

const invalidDecimal = buildForecastImportComparisons("cm-20", "cm-20", [
  { ...previewRows[0], forecastAmount: "not-a-decimal" }
], currentForecasts);
assert.deepEqual(invalidDecimal[0], {
  status: "unavailable",
  inputValue: "not-a-decimal",
  reason: "Invalid decimal"
}, "invalid exact-decimal input must remain comparison unavailable instead of breaking Preview");

assert.deepEqual(describeActualImportChange("5", "5", "FINAL", "MTD"), {
  difference: "0",
  amountChanged: false,
  metadataChanged: true,
  reason: "Status FINAL → MTD"
}, "same amount with FINAL/MTD mismatch must expose zero difference and the metadata reason");
assert.deepEqual(describeActualImportChange("5", "7.25", "FINAL", "FINAL"), {
  difference: "2.25",
  amountChanged: true,
  metadataChanged: false,
  reason: "Amount changed"
});
assert.deepEqual(describeActualImportChange("5", "7.25", "FINAL", "MTD"), {
  difference: "2.25",
  amountChanged: true,
  metadataChanged: true,
  reason: "Amount and status FINAL → MTD changed"
});
assert.equal(describeActualImportChange("5", "5", null, "MTD").reason, "Status comparison unavailable");

console.log("consumptionImportComparison tests passed");
