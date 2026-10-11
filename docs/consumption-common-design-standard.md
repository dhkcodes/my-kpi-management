# Consumption Common Page Design Standard

Status: Active  
Applies to: **Consumption Analysis**, **Forecast vs Actual (FVA)**, and **Consumption Records**  
Last updated: 2026-10-11

## 1. Scope and exceptions

This standard applies only to controls that already exist on the three Consumption pages. It does not add missing filters or controls.

- Consumption Records keeps its existing **From Quarter / To Quarter** range.
- Consumption Records does **not** add a fiscal-year selector.
- Analysis and FVA keep their existing fiscal-year selector.
- Page-specific business actions and table content remain page-specific.
- Shared CSS overrides must remain scoped by `.kap-page-shell.consumption-page`, `.kap-page-shell.consumption-insights-page`, or `.kap-page-shell.forecast-actual-page` so unrelated routes are not changed.

## 2. Shared tokens

| Token | Value | Use |
|---|---:|---|
| `--kap-consumption-control-height` | `2.15rem` | Existing Account/search inputs, From/To selects, relevant selects, and Pillar buttons |
| `--kpi-panel-radius` | `var(--oj-core-border-radius-md, .2rem)` | Search/filter container radius; same subtle radius level as grid panels |
| `--kap-data-control-gap` | `.5rem` | Desktop gap inside Data Control Bar |
| `--kap-section-gap` | `.375rem` | Search → Data Control Bar spacing baseline |
| `--kap-footer-gap` | `.75rem` | Root page container → footer vertical gap (`.5rem` at `<=760px`) |

Typography is unchanged. Existing Redwood/JET colors, disabled states, focus rings, busy indicators and message severity tokens remain authoritative.

## 3. Root container, fixed regions and scrolling

- `.kpi-shell` owns the viewport grid: header, content and footer.
- `.kpi-shell__body` and `.kpi-content` remain non-scrolling containment regions.
- `.kap-page-shell` is height-constrained and clips overflow.
- `.kap-page-shell__scroll` is the single vertical page scroll owner.
- Wide tables may retain their own horizontal scrolling, but must not introduce a second page-level vertical scrollbar.
- Header/navigation and footer remain outside the page body scroll.
- Footer spacing is `--kap-footer-gap`; mobile spacing is `.5rem`.

## 4. Heading and left alignment

- Page title begins at the `.kap-page-shell__inner` content start line.
- Search/filter container begins on the same root content line.
- Data Control Bar uses the same full content width.
- Show MTD and its applied-date label begin at `.5rem` inset through `.consumption-records-toolbar__left`, consistently across all three pages.
- Page-specific summary values may follow Show MTD, but must not move its starting line.

## 5. Search/filter container

- Use `PageFilterPanel` / `.kap-page-filter`.
- Background: existing alternate surface token.
- Border: existing `--kpi-border`.
- Radius: `--kpi-panel-radius`.
- Desktop layout: wrapped flex row, controls bottom-aligned, column gap `.75rem`, row gap `.5rem`, padding `.5rem .75rem`.
- Mobile (`<=760px`): one-column grid, stretch controls, padding `.65rem`.
- Filter titles stay directly above their controls with the existing `.72rem` bold label style and `.2rem` label-to-control gap.

## 6. Inputs and state expression

Existing controls only:

- Account search input
- General search input
- Existing select controls
- Consumption Records From/To quarter selectors
- Pillar segmented buttons

Rules:

- Height/min-height: `--kap-consumption-control-height` (`2.15rem`).
- Existing font sizes and horizontal padding are retained.
- Disabled, focus-visible, selected/pressed and busy states use existing Redwood/JET semantics and tokens.
- Pillar buttons retain `aria-pressed` and their current selected-state border/color.
- Search inputs retain their current clear affordance and composition-event handling.
- Records From/To remains a quarter-range selector; no FY control is introduced.

## 7. Explanation icons

- Help/explanation triggers are `1.15rem × 1.15rem`.
- Inline margin from the associated label is `.1rem`.
- Keep `cursor: help`, visible keyboard focus, accessible name/title, and `aria-describedby` or equivalent tooltip relationship.
- Decorative glyphs inside the trigger remain `aria-hidden`; the button owns the accessible label.

## 8. Data Control Bar

The shared row between the search/filter container and primary data area is named **Data Control Bar**.

Implementation primitive: `DataControlBar` / `.kap-data-control-bar`.

- Semantics: `role="toolbar"` with a page-specific accessible label.
- Left: Show MTD, applied date and optional page summary.
- Right: reload control, busy indicator and last successful completion time.
- Desktop: center-aligned, `justify-content: space-between`, gap `.5rem`.
- Mobile: wrapping behavior follows the page-specific summary needs; common gap is `.375rem`.
- Search → bar top spacing: `.375rem`.
- Bar → table/content spacing: `.325rem`.
- Reload host height: `2.25rem` on desktop and `2.75rem` at `<=760px`; existing icon and font size remain.
- Busy state uses the existing progress indicator and disabled reload action.
- The displayed completion time changes only after a successful load. A failed refresh keeps both existing data and the last successful timestamp.

## 9. Error handling

### 9.1 Data unavailable / page cannot display its primary content

- Render a shared JET `oj-c-message-banner` in normal document flow, immediately below the page header and before filters/content.
- Use `severity="error"`, sticky persistence, a concise summary and retry guidance.
- Provide a JET Retry button when retry is possible.
- Inline wrapper: `.app-message-region.is-inline` (`position: static; width: 100%`).

### 9.2 Non-blocking operation failure

Examples: refresh with preserved data, export, import or save failure.

- Keep existing data visible.
- Preserve the last successful completion time.
- Use the shared floating `AppMessageBanner` in the upper-right.
- Desktop edge offset: `1rem`, maximum width `28rem`.
- Mobile edge offset: `.5rem`, width `calc(100vw - 1rem)`.
- Error messages remain until dismissed; success/information messages may auto-dismiss.

### 9.3 Shared safeguards

- Classify by user impact, not page name.
- Do not show the same error both inline and floating.
- Preserve JET alert/live-region semantics and keyboard operability.
- Do not hard-code a second error palette; use JET/Redwood severity styling.
- Production error-state verification must use request interception or another non-mutating method; never corrupt production data to trigger an error.

## 10. Oracle JET element selection record

The project uses Oracle JET `18.1.0`.

- Kept `oj-c-message-banner` for Redwood severity, close behavior and accessibility semantics.
- Kept `oj-button` for Retry and Reload actions.
- Kept native HTML search/select controls where the existing page behavior depends on composition handling, simple quarter options, or established lightweight filtering.
- Kept native Pillar buttons because they form a compact `aria-pressed` segmented control with page-owned state.
- No JET DataProvider-backed selector was introduced because no new selection control was requested.

## 11. Verification contract

Minimum release verification covers:

1. shared contract/type checks and production build;
2. authenticated desktop and mobile views for all three pages;
3. computed input/control height and filter radius;
4. root page scrolling and table horizontal scrolling;
5. inline load-error vs floating operation-error behavior using non-mutating interception;
6. preserved content and last-success timestamp after a failed refresh;
7. route-scope check confirming unrelated pages do not receive Consumption-only control overrides.
