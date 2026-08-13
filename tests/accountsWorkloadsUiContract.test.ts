import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const page = read("src/components/content/AccountsWorkloadsPage.tsx");
const content = read("src/components/content/index.tsx");

assert.match(page, /deleteMode === "permanent" \|\| deleteMode === "mixed"/, "deleted and mixed selections require confirmation");
assert.match(page, /filter\(\(id\) => rows\.find\(\(row\) => row\.id === id\)\?\.isDeleted\)/, "permanent targets are isolated from selected deleted rows");
assert.match(page, /applyDraftDelete\([\s\S]*activeIds/, "mixed confirmation stages active rows for draft deletion");
assert.match(page, />Delete<\/oj-button>/, "destructive action label is always Delete");
assert.doesNotMatch(page, /\{deleteMode ===|Selected rows:/, "dynamic top-action delete labels and selected count are absent");
assert.match(page, /hasSelectedDeletedRows[\s\S]*&& \([\s\S]*>Restore<\/oj-button>/, "Restore is conditionally rendered for deleted selections");
assert.match(page, />Refresh<\/oj-button>/, "Refresh action is rendered");
assert.match(page, /accounts-workloads-notes-content[^>]*title=/, "Notes exposes full content through a native tooltip");
assert.match(content, /oj-progress-circle[\s\S]*value=\{-1\}/, "initial load uses an indeterminate JET progress circle");

console.log("accountsWorkloadsUiContract tests passed");
