import assert from "node:assert/strict";
import { beginAppBusy, getAppBusyCount, subscribeAppBusy } from "../src/app/appBusy";
import {
  runAccountsWorkloadsOpportunitySaveFlow,
  runAccountsWorkloadsSaveFlow,
} from "../src/app/accountsWorkloadsSaveFlow";

const apiStep = (
  name: string,
  calls: string[],
  result: boolean | void,
  error?: Error,
) => async (): Promise<any> => {
  calls.push(name);
  const finish = beginAppBusy();
  try {
    await Promise.resolve();
    if (error) throw error;
    return result;
  } finally {
    finish();
  }
};

async function run(): Promise<void> {
  assert.equal(getAppBusyCount(), 0);

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    const saved = await runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true),
      saveDealDrafts: async () => {
        calls.push("deal-noop");
        return true;
      },
      reload: apiStep("reload", calls, undefined),
    });
    unsubscribe();
    assert.equal(saved, true);
    assert.deepEqual(calls, ["aw-save", "deal-noop", "reload"]);
    assert.deepEqual(snapshots, [1, 2, 1, 2, 1, 0],
      "normal AW save keeps one outer busy scope across POST and reload GET");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    const saved = await runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true),
      saveDealDrafts: apiStep("deal-save", calls, true),
      reload: apiStep("reload", calls, undefined),
    });
    unsubscribe();
    assert.equal(saved, true);
    assert.deepEqual(calls, ["aw-save", "deal-save", "reload"],
      "AW, Opportunity and reload are each invoked exactly once");
    assert.deepEqual(snapshots, [1, 2, 1, 2, 1, 2, 1, 0],
      "AW plus Opportunity save never drops busy to zero between requests");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    const saved = await runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, false),
      saveDealDrafts: apiStep("deal-save", calls, true),
      reload: apiStep("reload", calls, undefined),
    });
    unsubscribe();
    assert.equal(saved, false);
    assert.deepEqual(calls, ["aw-save"], "a rejected AW save is not retried and does not reload");
    assert.deepEqual(snapshots, [1, 2, 1, 0]);
    assert.equal(getAppBusyCount(), 0, "save failure releases the outer busy scope");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    const saved = await runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true),
      saveDealDrafts: apiStep("deal-save", calls, false),
      reload: apiStep("reload", calls, undefined),
    });
    unsubscribe();
    assert.equal(saved, false);
    assert.deepEqual(calls, ["aw-save", "deal-save"],
      "a rejected Opportunity save is not retried and does not reload");
    assert.deepEqual(snapshots, [1, 2, 1, 2, 1, 0]);
    assert.equal(getAppBusyCount(), 0, "Opportunity save failure releases the outer busy scope");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    await assert.rejects(runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true, new Error("AW save failed")),
      saveDealDrafts: apiStep("deal-save", calls, true),
      reload: apiStep("reload", calls, undefined),
    }), /AW save failed/u);
    unsubscribe();
    assert.deepEqual(calls, ["aw-save"]);
    assert.deepEqual(snapshots, [1, 2, 1, 0]);
    assert.equal(getAppBusyCount(), 0, "thrown AW save failure releases the outer busy scope");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    await assert.rejects(runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true),
      saveDealDrafts: apiStep("deal-save", calls, true, new Error("Opportunity save failed")),
      reload: apiStep("reload", calls, undefined),
    }), /Opportunity save failed/u);
    unsubscribe();
    assert.deepEqual(calls, ["aw-save", "deal-save"]);
    assert.deepEqual(snapshots, [1, 2, 1, 2, 1, 0]);
    assert.equal(getAppBusyCount(), 0, "thrown Opportunity save failure releases the outer busy scope");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    await assert.rejects(runAccountsWorkloadsSaveFlow({
      saveAwDrafts: apiStep("aw-save", calls, true),
      saveDealDrafts: apiStep("deal-save", calls, true),
      reload: apiStep("reload", calls, undefined, new Error("reload failed")),
    }), /reload failed/u);
    unsubscribe();
    assert.deepEqual(calls, ["aw-save", "deal-save", "reload"]);
    assert.deepEqual(snapshots, [1, 2, 1, 2, 1, 2, 1, 0]);
    assert.equal(getAppBusyCount(), 0, "reload failure releases the outer busy scope");
  }

  {
    const calls: string[] = [];
    let liveDrafts = ["Latest Update entered immediately before Save"];
    let submittedDrafts: string[] = [];
    const saved = await runAccountsWorkloadsSaveFlow({
      saveAwDrafts: async () => {
        calls.push("aw-save");
        liveDrafts = [];
        return true;
      },
      saveDealDrafts: async () => {
        throw new Error("prepared Opportunity save must be used");
      },
      prepareDealSave: () => {
        const snapshot = [...liveDrafts];
        calls.push("deal-snapshot");
        return async () => {
          calls.push("deal-save");
          submittedDrafts = snapshot;
          return true;
        };
      },
      reload: async () => {
        calls.push("reload");
      },
    });
    assert.equal(saved, true);
    assert.deepEqual(calls, ["deal-snapshot", "aw-save", "deal-save", "reload"]);
    assert.deepEqual(submittedDrafts, ["Latest Update entered immediately before Save"],
      "combined save submits the Opportunity snapshot captured before the awaited AW save");
  }

  {
    const calls: string[] = [];
    const snapshots: number[] = [];
    const unsubscribe = subscribeAppBusy((count) => snapshots.push(count));
    const saved = await runAccountsWorkloadsOpportunitySaveFlow({
      saveDealDrafts: apiStep("deal-post-and-confirm", calls, true),
    });
    unsubscribe();
    assert.equal(saved, true);
    assert.deepEqual(calls, ["deal-post-and-confirm"]);
    assert.deepEqual(snapshots, [1, 2, 1, 0],
      "standalone Opportunity save keeps one outer busy scope across POST and confirmation GET");
  }

  console.log("Accounts & Workloads save-flow busy lifecycle tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
