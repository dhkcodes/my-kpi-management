# Calendar Round 5 authenticated UI verification — 2026-10-05

Target: local release build through the authenticated production API proxy (`127.0.0.1:18185`).
Browser: Playwright Chromium fallback build on Oracle Linux. No credentials, cookies, tokens, or response bodies are recorded.

## Confirmed with real UI/API interaction

- Normal account authentication succeeded; Calendar heading rendered.
- A single date click selected without opening an editor.
- Keyboard activation opened the date pop-up timeline.
- The timeline rendered 00:00 through 24:00 after the correction.
- Typing a 26-character event title generated no calendar mutation before Save.
- The Recurrence icon opened the Oracle JET pop-up without unmounting the editor.
- UI Save created a test-only event; observed `POST /api/v1/calendar/events` status `201`.
- A selected event did not enter inline title editing on a single selection action.
- Repeated failed verification runs removed stale `R5 UI VERIFY …` events through the UI before the next run.
- Final cleanup-only run removed the remaining test event through the UI and completed successfully.

## Confirmed executable gates

- `npm run test:calendar-meeting-notes`: pass after the Round 5 corrections.
- `npm run typecheck`: pass.
- `npx ojet build --release`: pass.
- Release output scan: no Calendar mock-server marker, `serviceWorker.register`, `navigator.serviceWorker`, or service-worker artifact found.

## Not completed / not evidence of pass

- The headless run did not finish title update/reload, pointer move, pointer resize, and final delete in one uninterrupted scenario. Earlier authenticated UI evidence in `ui-crud-20261005.md` covers create/reload/update/reload/delete for the prior corrected build only.
- The provided account returned zero additional selectable participant candidates. Checkbox multi-selection is covered by source/type/contract checks, not a real two-user UI result.
- No second authenticated account or physical mobile device was available.
- Recurring-event occurrence-versus-series update/delete is unsupported by the current API contract and therefore remains a confirmed product gap, not a passed item.

This document must not be used to mark all 23 requirements complete or to justify production deployment.
