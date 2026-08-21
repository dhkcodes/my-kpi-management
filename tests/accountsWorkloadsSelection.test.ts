import assert from "node:assert/strict";
import {
  applyDraftDelete,
  applyDraftRestore,
  applyPermanentDeletesLocally,
  classifyAccountDeleteTargets,
  hasEditableAccountWorkloadChanges,
  hasSelectedDeletedRows,
  overlayEditableAccountWorkloadChanges,
  remainingPermanentDeleteIds,
  resolveDeleteMode,
  withMinimumPendingDuration
} from "../src/data/accountsWorkloadsSelection";
import { AccountWorkloadRow } from "../src/data/accountsWorkloadsMockData";

const row = (id: string, savedDeleted = false): AccountWorkloadRow => ({
  id,
  commitmentId: Number(id),
  versionNo: 1,
  sourceRowNumber: Number(id),
  planNumber: "",
  account: `Account ${id}`,
  workloadName: `Workload ${id}`,
  opptyNo: "",
  startDate: "",
  endDate: "",
  arrUsd: null,
  arrKrw: null,
  acrUsd: null,
  acrKrw: null,
  target: "",
  winProbability: null,
  latestUpdate: "",
  notes: "",
  isImportant: false,
  isDeleted: savedDeleted,
  deletedAt: savedDeleted ? "2026-08-13T00:00:00Z" : null,
  deletedBy: savedDeleted ? "actor" : null
});

const savedRows = [row("1"), row("2", true)];
assert.equal(resolveDeleteMode(savedRows, ["1"]), "draft");
assert.equal(resolveDeleteMode(savedRows, ["2"]), "permanent");
assert.equal(resolveDeleteMode(savedRows, ["1", "2"]), "mixed");
assert.equal(hasSelectedDeletedRows(savedRows, ["1"]), false, "Restore stays hidden for active-only selection");
assert.equal(hasSelectedDeletedRows(savedRows, ["2"]), true, "Restore shows for a deleted selection");
assert.equal(hasSelectedDeletedRows(savedRows, ["1", "2"]), true, "Restore shows for a mixed selection");
assert.deepEqual(
  remainingPermanentDeleteIds([row("2", true), row("3")], ["1", "2", "3"]),
  ["2"],
  "only failed, still-soft-deleted permanent targets remain retryable"
);

const selection = ["1"];
const deletedDrafts = applyDraftDelete(savedRows, selection, "current-user", "2026-08-13T00:00:00Z");
assert.equal(deletedDrafts[0].isDeleted, true);
assert.deepEqual(selection, ["1"], "draft delete must not mutate selection");
const restoredDrafts = applyDraftRestore(deletedDrafts, selection, savedRows);
assert.equal(restoredDrafts[0].isDeleted, false);
assert.equal(restoredDrafts[0].deletedAt, null);
assert.deepEqual(selection, ["1"], "restore must not mutate selection");

const editedRows = [{ ...savedRows[0], account: "Edited Account", isImportant: true }, savedRows[1]];
assert.equal(hasEditableAccountWorkloadChanges(savedRows, editedRows), true, "a changed editable cell is dirty");
assert.equal(hasEditableAccountWorkloadChanges(savedRows, [{ ...savedRows[0], isImportant: true }, savedRows[1]]), false,
  "Highlight is not edit-dirty");
assert.equal(hasEditableAccountWorkloadChanges(savedRows, [{ ...savedRows[0], isDeleted: true }, savedRows[1]]), false,
  "Delete state is not edit-dirty");
assert.equal(hasEditableAccountWorkloadChanges(savedRows, savedRows.map((item) => ({ ...item }))), false,
  "identical drafts do not expose Save/Cancel");
const authoritativeAfterHighlight = [{ ...savedRows[0], isImportant: false }, savedRows[1]];
const mergedAfterHighlight = overlayEditableAccountWorkloadChanges(authoritativeAfterHighlight, editedRows);
assert.equal(mergedAfterHighlight[0].account, "Edited Account", "an immediate action preserves another editable draft");
assert.equal(mergedAfterHighlight[0].isImportant, false, "authoritative action state is not overwritten by a stale draft");
assert.deepEqual(classifyAccountDeleteTargets(savedRows, ["new-1", "1", "2"], "new-1"), {
  draftIds: ["new-1"], activeIds: ["1"], permanentIds: ["2"]
}, "draft, saved active, and saved deleted targets are distinguished before confirmation");
assert.deepEqual(
  applyPermanentDeletesLocally([row("1"), row("2", true), row("3", true)], ["2"]),
  [row("1"), row("3", true)],
  "local/fallback permanent delete removes only confirmed permanent targets"
);
assert.deepEqual(
  applyPermanentDeletesLocally([row("1"), row("2", true)], []),
  [row("1"), row("2", true)],
  "local/fallback rows are preserved when no permanent delete was requested"
);

async function verifyMinimumPendingDuration() {
  let requestedDelay = 0;
  const result = await withMinimumPendingDuration(
    async () => "saved",
    500,
    (() => {
      const times = [1000, 1125];
      return () => times.shift() ?? 1125;
    })(),
    async (milliseconds: number) => { requestedDelay = milliseconds; }
  );
  assert.equal(result, "saved");
  assert.equal(requestedDelay, 375, "a fast save must keep the JET progress dialog visible long enough to perceive");
  console.log("accountsWorkloadsSelection tests passed");
}

verifyMinimumPendingDuration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});