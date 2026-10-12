import assert from "node:assert/strict";

import { createSingleFlightSwapController } from "../src/utils/singleFlightSwap";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}>;

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

void (async () => {
  const controller = createSingleFlightSwapController<{ mode: boolean; summary: string }>();
  const view = { mode: false, rows: "last successful rows", summary: "last successful summary" };
  let requestCount = 0;

  const success = deferred<{ mode: boolean; summary: string }>();
  const pending = controller.run(() => {
    requestCount += 1;
    return success.promise;
  }, (next) => {
    view.mode = next.mode;
    view.summary = next.summary;
  });
  assert.deepEqual(view, {
    mode: false,
    rows: "last successful rows",
    summary: "last successful summary",
  }, "pending replacement must retain the last successful mode, rows, and summary");

  const duplicateApplied = await controller.run(() => {
    requestCount += 1;
    return Promise.resolve({ mode: true, summary: "duplicate" });
  }, () => assert.fail("duplicate activation must not apply"));
  assert.equal(duplicateApplied, false);
  assert.equal(requestCount, 1, "duplicate activation must create only one request");

  success.resolve({ mode: true, summary: "fresh summary" });
  assert.equal(await pending, true);
  assert.deepEqual(view, {
    mode: true,
    rows: "last successful rows",
    summary: "fresh summary",
  }, "successful replacement must swap mode and summary together while preserving rows");

  const failure = deferred<{ mode: boolean; summary: string }>();
  const failed = controller.run(() => failure.promise, (next) => {
    view.mode = next.mode;
    view.summary = next.summary;
  });
  failure.reject(new Error("summary unavailable"));
  await assert.rejects(failed, /summary unavailable/);
  assert.deepEqual(view, {
    mode: true,
    rows: "last successful rows",
    summary: "fresh summary",
  }, "failed replacement must preserve the last successful mode, rows, and summary");

  const stale = deferred<{ mode: boolean; summary: string }>();
  const staleRun = controller.run(() => stale.promise, (next) => {
    view.mode = next.mode;
    view.summary = next.summary;
  });
  controller.invalidate();
  const latest = deferred<{ mode: boolean; summary: string }>();
  const latestRun = controller.run(() => latest.promise, (next) => {
    view.mode = next.mode;
    view.summary = next.summary;
  });
  latest.resolve({ mode: false, summary: "latest summary" });
  assert.equal(await latestRun, true);
  stale.resolve({ mode: true, summary: "stale summary" });
  assert.equal(await staleRun, false);
  assert.deepEqual(view, {
    mode: false,
    rows: "last successful rows",
    summary: "latest summary",
  }, "stale completion must not overwrite the latest successful result");

  console.log("consumption Summary single-flight swap behavior passed");
})();
