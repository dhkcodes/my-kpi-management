# Consumption Common Page Design Standard

Status: Active  
Applies to: **Consumption Analysis**, **Forecast vs Actual (FVA)**, and **Consumption Records**  
Last updated: 2026-10-11

## 1. Scope and exceptions

This standard covers the three Consumption routes only. It standardizes names, accessibility semantics, control height and error behavior while preserving each page's approved information architecture and pre-commonization visual layout.

Exceptions:

- Analysis keeps FY, Pillar, Sales Rep and searchable Account context.
- FVA keeps FY/Quarter/Pillar and Account search.
- Records keeps From/To and Search Account / End User. It does not gain an FY control.
- Account search inputs are not native select controls and are excluded from select-arrow styling.
- Home is outside this scope. Consumption icon styling must not leak into Home.

## 2. Shared tokens

| Token | Value | Use |
|---|---:|---|
| `--kap-consumption-control-height` | `2.15rem` | Existing Account/search inputs, From/To selects, relevant selects and Pillar buttons |
| `--kpi-panel-radius` | `var(--oj-core-border-radius-md, .2rem)` | Search/filter panels and subtle panel radius |

Native Sales Rep/Account controls use the Analysis reference typography (`Arial`, `.72rem`, `400`) and neutral Redwood/JET background, border and primary text colors. Existing disabled states, focus rings, busy indicators and message severity tokens remain authoritative.

## 3. Root container, fixed regions and scrolling

- `.kpi-shell` owns the viewport grid: header, content and footer.
- `.kap-page-shell__scroll` remains the single vertical page-scroll owner.
- Wide tables may retain their own horizontal scrolling, but must not introduce a second page-level vertical scrollbar.
- The three Consumption `.kap-page-shell` roots alone use `var(--oj-core-border-radius-md, .2rem)`, measured at approximately `3.2px`; the previous commonization value measured approximately `12px`.
- Commonization must not add a global footer margin. Existing shell/layout flow owns footer spacing.
- The Footer on these three routes alone uses the grid-level small radius `.2rem`; its content and spacing remain unchanged.

## 4. Heading, search and filter alignment

- Page titles begin at the `.kap-page-shell__inner` content start line.
- Use `PageFilterPanel` / `.kap-page-filter` without changing each page's field order or labels.
- Desktop filter layout remains wrapped flex with existing page-specific alignment.
- Mobile remains the existing page-specific single-column/responsive layout.
- Control height is `2.15rem`.
- Analysis, FVA and Records native selects use the same `.65rem` start inset. Per-validation-string pixel offsets are prohibited; align the actual font family, size, weight and color instead.
- All three pages' native select arrows use `background-position: right .55rem center` and `padding-inline-end: 1.75rem`.
- Sales Rep defaults to `All Sales Reps`; Account defaults to `All Accounts`.
- Active-default Quarter, Sales Rep and Account fields use the shared white content background and primary text color. Disabled and focus visuals are separate states and must not leak into the active default state.
- FVA Sales Rep and Account controls match the Analysis typography and desktop width rules. Sales Rep remains content-sized; Analysis/FVA/Records Account fields keep the established `18.75rem` desktop bound and become full width at `720px` and below.
- Account search inputs share the native field typography and neutral colors but remain excluded from select-arrow rules.

## 5. Explanation icons

- Consumption icon rules must be scoped to Consumption surfaces.
- Home retains the pre-commonization geometry at desktop and mobile: trigger approximately `9.59px × 9.59px`, horizontal margins `1.6px`, and wrapper margin `1.6px 0 0 -1.28px`.
- Regression review must compare the visible glyph, clickable trigger box, margins and position relative to its label; glyph size alone is insufficient.
- Decorative glyphs remain `aria-hidden`; the trigger button owns the accessible label and tooltip relationship.

## 6. Data Control Bar

The shared row between the search/filter container and primary data area is named **Data Control Bar**.

Implementation primitive: `DataControlBar` / `.kap-data-control-bar`.

- The common component owns only the name, wrapper and `role="toolbar"` semantics.
- It does not impose `align-items`, `justify-content`, gap, margin, padding, min-height or wrapping.
- Existing page-specific classes own layout and overflow prevention.
- Spacing is accepted from rendered visible edges: filter/search outer border bottom → visible Reload button top, then visible Reload button bottom → first result/table outer border top.
- Preserve each page and breakpoint's pre-commonization values. Do not force upper and lower gaps to match, and do not turn one observed button height into a new fixed standard.
- FVA keeps `Show MTD` and Reload in the same approved row.
- Records mobile also keeps Show MTD/count and Reload in one toolbar row when they fit. Do not reserve a `100%` activity flex-basis that forces Reload onto a second row; that combination produced a misleading `45.19px` filter-to-Reload gap (`5.19px` lead-in + `32px` Show MTD row + `8px` row gap).

### Activity controls

- Reload uses the established `compactTimestampButton`: one outlined JET button containing the Reload icon (or the same-slot spinner while busy), internal divider, and completed time.
- The visible timestamp stays inside the button. No external timestamp DOM or visible `Reload` / `Refreshing` string is added.
- `aria-label`, accessible status and tooltip retain the action and full KST timestamp.
- Idle and busy states preserve the same rendered button box, timestamp position, toolbar height and Show MTD alignment.
- Completion time changes only after a successful load. A failed operation retains both successful data and timestamp.

## 7. Analysis refresh policy

- Initial load may use the initial page loading state.
- A later FY/filter refresh keeps the last completed data and page shell mounted.
- The FY selector remains disabled while its request is in flight, preserving the existing selection-lock policy.
- When the requested FY differs from the displayed response FY, the accessible status states both values: `Refreshing FYxx; showing FYyy until complete`.
- The progress indicator uses viewport-centered coordinates (`left: 50vw; top: 50vh`) only for Analysis FY partial refresh. The actual indicator node is a direct child of the page body and uses `transform: translate(-50%, -50%)`; no transformed ancestor participates in that positioning.
- The Analysis-specific rule neutralizes the generic floating progress card (`background: transparent`, no border, radius, shadow or padding), so only the thin progress track is visible. The shell and last successful result stay mounted; no white loading box or top-left displacement is allowed.
- Do not place the indicator inside `.consumption-analysis-data-controls`: the `3dec372` combination of an absolute `.consumption-analysis-data-controls .kap-page-data-progress` rule with the generic transform was the control-bar relocation regression. Fixed positioning itself was not the root cause.
- Request-generation checks remain in place so a stale response cannot overwrite the latest valid request.

## 8. Error handling

### Initial-load failure

- No usable data is available.
- Render one inline error banner in normal flow with Retry.

### Operation failure with successful data already present

- Keep content and last-success timestamp visible.
- Render one floating error banner in the existing notification region.
- Do not duplicate the same error inline and floating.

Rules:

- Preserve JET alert/live-region semantics and keyboard operation.
- Use JET/Redwood severity styling rather than a second hard-coded palette.
- Production error verification must use non-mutating request interception. Do not alter production data or execute Import Apply.

## 9. Oracle JET element selection record

The project uses Oracle JET `20.1.3`.

- Keep `oj-c-message-banner` for Redwood severity, close behavior and accessibility semantics.
- Keep native `select` where existing DOM/CSS relies on native controls; style only the owned select element and do not target JET internal classes.
- Keep `oj-button` for Reload and action controls.
- Do not override Oracle JET internal DOM or internal class names.

## 10. Verification contract

Minimum release checks:

1. `npm run test:consumption`
2. `npm run typecheck`
3. `npm run test:consumption-browser`
4. `git diff --check`
5. `npx ojet build --release`
6. Authenticated desktop Chromium `1440 × 1000`, desktop Playwright WebKit, and `390 × 844` WebKit mobile emulation review of Home and all three Consumption routes. Containerized Playwright WebKit is not real iPhone Safari; report that distinction explicitly.
7. Analysis partial-refresh probe confirms previous response remains visible, FY selection is locked, visible status identifies requested/displayed FY, and the completed response replaces it.
8. No production data mutation; Import Apply remains out of scope.
