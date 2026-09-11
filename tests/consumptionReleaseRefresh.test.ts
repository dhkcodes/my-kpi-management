import assert from "node:assert/strict";
import { createReleaseRefreshCheck } from "../src/app/releaseRefresh";

const response = (lastModified: string | null, ok = true, redirected = false) => ({
  ok,
  redirected,
  headers: { get: (name: string) => name.toLowerCase() === "last-modified" ? lastModified : null }
});

(async () => {
  const initial = "Thu, 10 Sep 2026 12:00:00 GMT";
  let reloads = 0;
  let marker: string | null = null;
  const unchanged = createReleaseRefreshCheck({
    initialLastModified: initial,
    fetchHead: async () => response(initial),
    reload: () => { reloads += 1; },
    getReloadTarget: () => marker,
    setReloadTarget: value => { marker = value; }
  });
  await unchanged();
  assert.equal(reloads, 0);

  let resolveHead!: (value: ReturnType<typeof response>) => void;
  const pending = new Promise<ReturnType<typeof response>>(resolve => { resolveHead = resolve; });
  const changed = createReleaseRefreshCheck({
    initialLastModified: initial,
    fetchHead: () => pending,
    reload: () => { reloads += 1; },
    getReloadTarget: () => marker,
    setReloadTarget: value => { marker = value; }
  });
  const first = changed();
  const concurrent = changed();
  resolveHead(response("Thu, 10 Sep 2026 12:01:00 GMT"));
  await Promise.all([first, concurrent]);
  await changed();
  assert.equal(reloads, 1, "overlapping and repeated checks must request one reload");
  assert.equal(marker, String(Date.parse("Thu, 10 Sep 2026 12:01:00 GMT")));

  let guardedReloads = 0;
  const guarded = createReleaseRefreshCheck({
    initialLastModified: initial,
    fetchHead: async () => response("Thu, 10 Sep 2026 12:01:00 GMT"),
    reload: () => { guardedReloads += 1; },
    getReloadTarget: () => marker,
    setReloadTarget: () => undefined
  });
  await guarded();
  assert.equal(guardedReloads, 0, "session marker must prevent a reload loop");

  for (const invalid of [response("Thu, 10 Sep 2026 12:01:00 GMT", false), response("Thu, 10 Sep 2026 12:01:00 GMT", true, true), response("Thu, 10 Sep 2026 11:59:00 GMT"), response(null)]) {
    let invalidReloads = 0;
    const check = createReleaseRefreshCheck({
      initialLastModified: initial,
      fetchHead: async () => invalid,
      reload: () => { invalidReloads += 1; },
      getReloadTarget: () => null,
      setReloadTarget: () => undefined
    });
    await check();
    assert.equal(invalidReloads, 0);
  }

  let failedReloads = 0;
  const failed = createReleaseRefreshCheck({
    initialLastModified: initial,
    fetchHead: async () => { throw new Error("offline"); },
    reload: () => { failedReloads += 1; },
    getReloadTarget: () => null,
    setReloadTarget: () => undefined
  });
  await failed();
  assert.equal(failedReloads, 0);
  console.log("consumptionReleaseRefresh.test.ts: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
