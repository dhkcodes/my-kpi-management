import assert from "node:assert/strict";
import { createOpportunitySaveLock } from "../src/components/content/opportunitySaveLock";

type Draft = {
  key: string;
  name: string;
  id: number;
  versionNo: number;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const run = async () => {
  const lock = createOpportunitySaveLock();
  const submitted: Draft = {
    key: "draft:-1",
    name: "Submitted",
    id: -1,
    versionNo: 0,
  };
  const unrelated: Draft = {
    key: "deal:77",
    name: "Unrelated",
    id: 77,
    versionNo: 4,
  };
  const drafts = new Map<string, Draft>([
    [submitted.key, submitted],
    [unrelated.key, unrelated],
  ]);
  const response = deferred<Readonly<{ id: number; versionNo: number }>>();
  let requestCount = 0;
  let confirmed: Readonly<{ id: number; versionNo: number }> | null = null;

  const save = async (): Promise<boolean> => {
    const snapshot = lock.tryStart([drafts.get(submitted.key)!]);
    if (!snapshot) return false;
    requestCount += 1;
    try {
      confirmed = await response.promise;
      for (const draft of snapshot) drafts.delete(draft.key);
      return true;
    } finally {
      lock.release();
    }
  };

  const pendingSave = save();
  assert.equal(lock.isLocked(), true, "save locks synchronously before the request yields");
  assert.equal(requestCount, 1, "one request starts");

  const mutations = [
    () => drafts.set("draft:-2", { key: "draft:-2", name: "Added", id: -2, versionNo: 0 }),
    () => drafts.set(submitted.key, { ...submitted, name: "Edited during save" }),
    () => drafts.delete(submitted.key),
    () => drafts.delete(submitted.key),
  ];
  for (const mutation of mutations) {
    assert.equal(lock.tryMutation(mutation), false, "add/edit/cancel/delete is rejected while save is pending");
  }
  assert.equal(await save(), false, "duplicate save is rejected while the response is pending");
  assert.deepEqual(drafts.get(submitted.key), submitted, "submitted input stays unchanged while pending");
  assert.equal(drafts.has("draft:-2"), false, "a new draft cannot be added while pending");

  response.resolve({ id: 501, versionNo: 9 });
  assert.equal(await pendingSave, true);
  assert.deepEqual(confirmed, { id: 501, versionNo: 9 }, "server-confirmed id and version are received");
  assert.equal(drafts.has(submitted.key), false, "only the submitted draft is cleared after success");
  assert.deepEqual(drafts.get(unrelated.key), unrelated, "an unrelated AW draft is preserved");
  assert.equal(lock.isLocked(), false, "lock is released after success processing");

  const failedLock = createOpportunitySaveLock();
  const failedDrafts = new Map([[submitted.key, submitted]]);
  const failure = deferred<never>();
  const failingSave = async () => {
    const snapshot = failedLock.tryStart(failedDrafts.values());
    assert.ok(snapshot);
    try {
      await failure.promise;
    } finally {
      failedLock.release();
    }
  };
  const pendingFailure = failingSave();
  failure.reject(new Error("network failed"));
  await assert.rejects(pendingFailure, /network failed/);
  assert.deepEqual(failedDrafts.get(submitted.key), submitted, "failed input is retained for retry");
  assert.equal(failedLock.isLocked(), false, "lock is released after failure");
  assert.equal(
    failedLock.tryMutation(() => failedDrafts.set(submitted.key, { ...submitted, name: "Retry edit" })),
    true,
    "editing is restored after failure",
  );
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
