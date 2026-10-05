# Calendar Round 5 — final evidence map (2026-10-05)

Statuses: `PASS`, `PARTIAL`, `LIMITED`.

| # | Status | Evidence / remaining boundary |
|---|---|---|
| 1 | PARTIAL | Operating month navigation: main/surface identity retained, full Processing 0, focus retained. Keep editing: draft/editor identity/focus/scroll retained. Fixture rejected drag: persisted state unchanged and rollback message visible. Year navigation and every search/save/toggle path were not each instrumented for DOM identity in the same run. Evidence: `prod-flicker-navigation-20261005.json/.webm`, `prod-flicker-keep-editing-20261005.webm`, `fixture-drag-resize-rollback-20261005.json`. |
| 2 | PASS | Monthly single click selects one event and exposes immediate actions; blank click removes selection/actions. Private/Time Off immediate mutations persisted in operating checks. |
| 3 | PARTIAL | A→B→blank and selection/edit separation pass. Automated computed-style comparison covers state classes; final subjective visual composition remains user UAT. |
| 4 | PASS | `@Account` operating search/token removal/reload; participant fixture multi-select/unselect/reselect, exact mutations, reload; general typing does not open relation search. ACL is tracked only under #16. |
| 5 | PASS | Monthly double-click opens timeline; saved title double-click alone enters editor; Save/Discard/reload pass in operating UI. |
| 6 | PASS | Recurrence JET popup opens, exposes Repeat/end/working-days controls, Weekly Apply persists and reloads. |
| 7 | PASS | Relation data renders on its own text line with no anchor links; editable affordances are buttons, not links. |
| 8 | PASS | Selected actions measured in event upper-right; clear on deselection and remain clickable with tooltip visible. |
| 9 | PARTIAL | Two-line DOM/CSS and full tooltip structure pass; tooltip no longer intercepts actions. Exhaustive real overflow combinations remain. |
| 10 | PASS | This Week and Next Week use two distinct bordered `.calendar-weekly-popup__box` containers. |
| 11 | PASS | At 390×600 only the 09:00–18:00 timeline scrollTop changes; all-day/unscheduled area y remains fixed. |
| 12 | PASS | Per-character input, focus, search-request separation and pre-Save mutation boundary verified in fixture. |
| 13 | PASS | Unsaved settings/relations remain draft-only until final Save; saved-event Recurrence Apply and participant changes mutate immediately. |
| 14 | LIMITED | Private precedence is encoded and Private events are omitted from sharing; cancelled public status remains mapped. Real owner/viewer observation requires second account. |
| 15 | PASS | Calendar grid uses `.55fr` weekend columns vs `1fr` weekdays. |
| 16 | LIMITED | Shared-event read/write guards and owner-color contracts pass; real two-account color/read/access revocation unavailable. |
| 17 | PASS | Operating artifact `df816e1` includes `ee7dd6e` OPEN-only filter; deployed SHA matches manifest. Focused lookup/HTTP tests pass and operating OPEN relation persists. |
| 18 | PASS | Keep editing, Discard and close, Save and close values and server outcomes pass in operating UI. |
| 19 | PARTIAL | Main actions, popups, status and error copy tested in English; full string allowlist remains. User data and Korean holidays are exempt. |
| 20 | PARTIAL | Oracle JET icon-only elements/classes and English labels pass; exhaustive real hover/focus tooltip matrix remains. |
| 21 | PASS | Interval/guidance copy removed by contract; all-day/unscheduled continuous input and timed creation remain functional. |
| 22 | PASS | `ACTIVITY PLANNING` is absent; Calendar legend is right-justified directly above the surface; Calendar and Weekly Activities headings match y-position, height and 26.4px font size within the measured tolerance. Evidence: `fixture-layout-tooltip-20261005.json`. |
| 23 | PASS | Monthly 4/timeline 5 action contracts, independent Private/Time Off direct toggles and active state, Recurrence scope, saved immediate Apply and draft final-Save timing pass. |

Environment limitations: no real second account and no real mobile device/WebKit. Fixture/mobile viewport evidence must not be represented as those environments.
