import assert from "node:assert/strict";
import { beginAppBusy, getAppBusyCount, subscribeAppBusy } from "../src/app/appBusy";
import { apiFetch } from "../src/auth/apiFetch";

async function run(): Promise<void> {
  assert.equal(getAppBusyCount(), 0);
  const snapshots: number[] = [];
  const unsubscribe = subscribeAppBusy((count: number) => snapshots.push(count));
  const finishFirst = beginAppBusy();
  const finishSecond = beginAppBusy();
  assert.equal(getAppBusyCount(), 2, "concurrent asynchronous work is counted");
  finishFirst();
  assert.equal(getAppBusyCount(), 1);
  finishFirst();
  assert.equal(getAppBusyCount(), 1, "a completion callback is idempotent");
  finishSecond();
  assert.equal(getAppBusyCount(), 0, "the shared loading state releases after all work completes");
  unsubscribe();
  assert.deepEqual(snapshots, [1, 2, 1, 0]);

  const failedFetch = async (): Promise<Response> => {
    throw new Error("network failure");
  };
  await assert.rejects(apiFetch("/test", undefined, failedFetch), /network failure/u);
  assert.equal(getAppBusyCount(), 0, "a rejected API request releases the shared loading state in finally");

  console.log("shared app busy state tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
