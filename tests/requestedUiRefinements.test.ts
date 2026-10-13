import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const aw = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const kpi = readFileSync("src/components/content/KpiSpreadsheetPage.tsx", "utf8");
const css = readFileSync("src/styles/app.css", "utf8");

test("analysis uses the corrected dynamic MTD label and touch-accessible overlap explanation", () => {
  assert.match(analysis, /Includes MTD/);
  assert.doesNotMatch(analysis, /<span>Closed-period MTD fallback/);
  assert.match(analysis, /min\(max\(MTD, 0\), max\(Forecast, 0\)\)/);
  assert.match(analysis, /variant="overlap"/);
});

test("records summary and table panel styles match the requested hierarchy", () => {
  assert.match(css, /\.consumption-summary__table tbody th:first-child[^}]*background: #f7f5f2/);
  assert.match(css, /\.consumption-summary__table thead th[^}]*color: #184f73/);
  assert.match(css, /\.consumption-summary__amount strong[^}]*font-weight: 400/);
  assert.match(css, /\.consumption-table-scroll[^}]*border-radius:\s*(?:8px|10px|\.5rem)/);
});

test("AW and Opportunity cells use explicit touch double activation and protect active editors", () => {
  assert.match(aw, /createDoubleActivationTracker/);
  assert.match(aw, /mobileEditActivationRef/);
  assert.match(aw, /onPointerDown=/);
  assert.match(aw, /onPointerUp=/);
  assert.match(aw, /onPointerCancel\(\)/);
  assert.match(aw, /`aw:\$\{key\}:\$\{field\}`/);
  assert.match(aw, /`opportunity:\$\{key\}:\$\{field\}`/);
  assert.match(aw, /data-aw-field=\{field\}/);
  assert.match(aw, /data-deal-field=\{field\}/);
  assert.match(aw, /\(event as unknown as PointerEvent\)\.pointerType === "touch"[\s\S]*?event\.stopPropagation\(\)/);
});

test("KPI editor absorbs repeated touch and click activation", () => {
  assert.match(kpi, /onPointerDown=\{stopGridInteraction\}/);
  assert.match(kpi, /onPointerUp=\{stopGridInteraction\}/);
  assert.match(kpi, /onClick=\{stopGridInteraction\}/);
});

test("Opportunity sticky identity columns release horizontal space on AW mobile only", () => {
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*?\.accounts-workloads-page \.accounts-workloads-oppty-grid \.is-oppty-sticky-name,[\s\S]*?\.accounts-workloads-page \.accounts-workloads-oppty-grid \.is-oppty-sticky-id\s*\{[^}]*position:\s*static/
  );
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*?\.accounts-workloads-page \.accounts-workloads-opportunities__heading\s*\{[^}]*position:\s*sticky[^}]*max-width:\s*calc\(100vw - 2rem\)/
  );
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*?\.accounts-workloads-page \.accounts-workloads-opportunity-heading-actions\s*\{[^}]*flex-wrap:\s*wrap/
  );
});
