import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /type EditableField = "account" \| "workload" \| "planNumber" \| "latestUpdate" \| "notes"/,
  "the pure AW table exposes exactly the five requested editable fields");
assert.match(page, /<th>Account<\/th><th>Workload<\/th><th>Plan Number<\/th><th>Latest Update<\/th><th>Notes<\/th>/,
  "columns remain in the requested order");
assert.match(page, /onDblClick=\{\(\) => beginEdit\(row\.rowKey, field\)\}/,
  "display cells enter edit mode on double-click");
assert.match(page, /active \|\| adding \? input : \(value \|\| "—"\)/,
  "saved rows render values instead of permanent inputs");
assert.match(page, /setEditSnapshot\(\{ hierarchy, dirtyAccounts:[\s\S]{0,180}planWrites:/,
  "edit sessions capture a restorable draft snapshot");
assert.match(page, /event\.key === "Escape"[\s\S]{0,80}cancelEdit\(\)/,
  "Escape restores the pre-edit snapshot");
assert.match(page, /event\.key === "Enter" && !event\.shiftKey[\s\S]{0,120}commitEdit\(\)/,
  "Enter commits and Shift+Enter preserves multiline input as in the historical editor");
assert.match(page, /field === "latestUpdate" \|\| field === "notes"[\s\S]{0,120}<textarea/,
  "Latest Update reuses the earlier multiline editor behavior");
assert.match(page, /const draftActive = dirtyAccounts\.size > 0 \|\| dirtyWorkloads\.size > 0 \|\| planWrites\.length > 0/);
assert.match(page, /draftActive && <button[^>]*>[\s\S]{0,40}Save<\/button>/,
  "Save is explicit and only appears for a Draft");
assert.match(page, /accounts: \[\], workloads: \[\], deals: \[\], workloadPlans:/,
  "AW-only saves send no opportunity operations so hidden opportunities are preserved");
assert.doesNotMatch(page, /Add Oppty|accounts-workloads-child-row|accounts-workloads-opportunities/,
  "opportunity expanders and management UI are excluded");
assert.match(page, /fetchForecastCandidates/);
assert.match(page, /filterForecastCandidates\(forecastCandidates, hierarchy\.accounts\)/);
assert.match(page, /CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요"/);
assert.match(page, /sourcePlanId: candidate\.planId, sourcePlanNumber: candidate\.planNumber/);
assert.match(page, /accounts: \[\.\.\.created, \.\.\.updated\]/,
  "candidate drafts are prepended ahead of existing rows");
assert.match(styles, /\.accounts-workloads-grid-wrap\s*\{[^}]*overflow:\s*auto/,
  "horizontal overflow remains inside the table wrapper");
assert.match(styles, /\.accounts-workloads-grid\.accounts-workloads-grid--aw-only\s*\{[^}]*min-width:\s*72rem/,
  "the five-column table retains a wide scrollable layout");
assert.match(styles, /\.accounts-workloads-grid--aw-only td\.is-unsaved-cell/,
  "Draft cells retain the historical unsaved styling");

console.log("Accounts & Workloads double-click AW-only UI contracts passed");
