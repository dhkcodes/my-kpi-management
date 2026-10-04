import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beginAppBusy, getAppBusyCount, subscribeAppBusy } from "../src/app/appBusy";
import {
  apiFetch,
  apiFetchQuiet,
  resetAuthRequiredNotification,
  subscribeAuthRequired
} from "../src/auth/apiFetch";

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

  let quietCredentials = "";
  const quietSuccess = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    quietCredentials = String(init?.credentials ?? "");
    return new Response("[]", { status: 200 });
  };
  await apiFetchQuiet("/suggestions", undefined, quietSuccess);
  assert.equal(quietCredentials, "include", "quiet requests preserve authenticated cookie delivery");
  assert.equal(getAppBusyCount(), 0, "quiet requests never toggle the blocking global busy state");
  await assert.rejects(apiFetchQuiet("/suggestions", undefined, failedFetch), /network failure/u);
  assert.equal(getAppBusyCount(), 0, "quiet request failures propagate without leaking busy state");

  resetAuthRequiredNotification();
  let authRequiredCount = 0;
  const unsubscribeAuth = subscribeAuthRequired(() => { authRequiredCount += 1; });
  await apiFetchQuiet("/suggestions", undefined, async () => new Response("", { status: 401 }));
  unsubscribeAuth();
  assert.equal(authRequiredCount, 1, "quiet requests preserve the shared 401 authentication flow");

  const busySource = readFileSync(join(process.cwd(), "src/app/appBusy.ts"), "utf8");
  const overlaySource = readFileSync(join(process.cwd(), "src/components/AppBusyOverlay.tsx"), "utf8");
  assert.match(busySource, /addEventListener\(type, blockInteractionWhileBusy, true\)/, "busy starts install a synchronous capture-phase interaction guard");
  assert.match(busySource, /removeEventListener\(type, blockInteractionWhileBusy, true\)/, "the interaction guard is removed when the final busy operation finishes");
  assert.match(overlaySource, /element\.inert = true/, "background application content becomes inert while processing");
  assert.match(overlaySource, /role="dialog" aria-modal="true"/, "the blocking overlay exposes modal semantics");

  console.log("shared app busy state tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
