import * as assert from "node:assert/strict";
import { updateOpportunityCurrencyPair } from "../src/components/content/opportunityCurrency";

const values = {
  arrUsd: 100,
  arrKrw: 150_000,
  acrUsd: 50,
  acrKrw: 75_000,
};

assert.deepEqual(
  updateOpportunityCurrencyPair(values, "arrUsd", "12.34", 1400),
  { arrUsd: 12.34, arrKrw: 17_276 },
  "ARR USD edits must calculate rounded KRW",
);
assert.deepEqual(
  updateOpportunityCurrencyPair(values, "arrKrw", "17276", 1400),
  { arrUsd: 12.34, arrKrw: 17_276 },
  "ARR KRW edits must calculate USD to two decimals",
);
assert.deepEqual(
  updateOpportunityCurrencyPair(values, "acrUsd", "1.235", 1400),
  { acrUsd: 1.235, acrKrw: 1_729 },
  "ACR must use the same exchange-rate rule",
);
assert.deepEqual(
  updateOpportunityCurrencyPair(values, "acrKrw", "", 1400),
  { acrUsd: null, acrKrw: null },
  "clearing one currency must clear its paired value",
);
assert.deepEqual(
  updateOpportunityCurrencyPair(values, "arrUsd", "5", null),
  { arrUsd: 5 },
  "a missing rate must not invent or overwrite a paired value",
);
assert.deepEqual(
  updateOpportunityCurrencyPair(values, "arrKrw", "1400", 0),
  { arrKrw: 1400 },
  "an invalid rate must leave the opposite stored amount unchanged",
);

console.log("opportunity currency conversion tests passed");
