import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALENDAR_SHARE_COLORS, LONG_PRESS_CREATE_DELAY_MS, MIN_CALENDAR_DURATION_MINUTES, appendMentionToken, applyRelatedSelection, ensureMinimumTimedDuration, eventCalendarDate, eventLocalParts, eventOccursOnDate, eventOccursOnScheduleDate, extractTitleSearchTrigger, formatKoreanStartTime, getEventBadgeText, layoutTimelineEvents, longPressCanActivate, longPressMovementCancels, minutesToTime, normalizeEventRange, normalizeEventTimes, prependRelatedToken, relatedAccountName, requestIsLatest, resizeTimelineRange, snapTimelinePointer, timelineCreationRange } from "../src/data/calendarUx";

const calendarUxSource = readFileSync("src/data/calendarUx.ts", "utf8");

assert.deepEqual(normalizeEventRange({ startDate: "2026-10-03", endDate: "" }), { startDate: "2026-10-03", endDate: "2026-10-03" }, "a missing end date is normalized to the start date");
assert.deepEqual(normalizeEventRange({ startDate: "2026-10-04", endDate: "2026-10-03" }), { startDate: "2026-10-04", endDate: "2026-10-03" }, "an explicit invalid end date remains visible for validation");
assert.deepEqual(eventLocalParts("2026-10-05T00:15:00Z", "Asia/Seoul"), { date: "2026-10-05", time: "09:15" }, "server UTC values are restored in the event timezone");
assert.deepEqual(eventLocalParts("2026-10-04T15:00:00Z", "Asia/Seoul"), { date: "2026-10-05", time: "00:00" }, "midnight preserves the event-local date");
assert.equal(eventCalendarDate("2026-10-04T15:00:00Z", "Asia/Seoul"), "2026-10-05", "untimed/all-day calendar dates are independent of the browser timezone");
assert.equal(eventOccursOnDate("2026-09-29", "2026-10-03", "2026-10-01"), true, "multi-day events cross month boundaries");
assert.equal(eventOccursOnDate("2026-09-29", "2026-10-03", "2026-10-04"), false);
const koreanHolidays = new Set(["2026-10-05", "2026-10-09"]);
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "NONE", recurrenceUntil: null, workingDays: 5 }, "2026-10-02", koreanHolidays), true, "a five-working-day duration includes its Friday start");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "NONE", recurrenceUntil: null, workingDays: 5 }, "2026-10-03", koreanHolidays), false, "working-day duration excludes Saturday");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "NONE", recurrenceUntil: null, workingDays: 5 }, "2026-10-05", koreanHolidays), false, "working-day duration excludes the substitute holiday");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "NONE", recurrenceUntil: null, workingDays: 5 }, "2026-10-09", koreanHolidays), false, "working-day duration excludes Hangeul Day");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "NONE", recurrenceUntil: null, workingDays: 5 }, "2026-10-12", koreanHolidays), true, "the fifth displayed working day advances past both holidays and weekends");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "WEEKLY", recurrenceUntil: "2026-10-16", workingDays: 1 }, "2026-10-09", koreanHolidays), true, "weekly recurrence renders its later occurrence");
assert.equal(eventOccursOnScheduleDate({ startDate: "2026-10-02", endDate: "2026-10-02", recurrence: "WEEKLY", recurrenceUntil: "2026-10-16", workingDays: 1 }, "2026-10-23", koreanHolidays), false, "recurrence does not start after its end date");
assert.equal(formatKoreanStartTime("00:05"), "오전 12시 5분");
assert.equal(formatKoreanStartTime("10:00"), "오전 10시");
assert.equal(formatKoreanStartTime("12:30"), "오후 12시 30분");
assert.equal(formatKoreanStartTime("15:07"), "오후 3시 7분");
assert.equal(getEventBadgeText({ accountName: "Acme", title: "Review", startTime: "15:07", timeUnknown: false, allDay: false }), "Review · 오후 3시 7분");
assert.equal(getEventBadgeText({ accountName: "Acme", title: "[Acme] Review", startTime: "15:07", timeUnknown: false, allDay: false }), "[Acme] Review · 오후 3시 7분", "legacy title text remains text while relation metadata renders separately");
assert.equal(getEventBadgeText({ accountName: "Acme", title: "Review", startTime: "15:07", timeUnknown: true, allDay: false }), "Review");
assert.equal(getEventBadgeText({ accountName: "Acme", title: "Review", startTime: "15:07", timeUnknown: false, allDay: true }), "Review");
assert.deepEqual(normalizeEventTimes({ allDay: false, timeUnknown: true, startTime: "", endTime: "" }), { startTime: "00:00", endTime: "00:00" }, "time-unknown values must satisfy the API midnight contract");
assert.deepEqual(normalizeEventTimes({ allDay: false, timeUnknown: false, startTime: "09:00", endTime: "" }), { startTime: "09:00", endTime: "09:00" }, "start-only timed events keep zero duration");
assert.deepEqual(normalizeEventTimes({ allDay: false, timeUnknown: false, startTime: "00:00", endTime: "" }), { startTime: "00:00", endTime: "00:00" }, "midnight is retained rather than treated as missing");
assert.equal(MIN_CALENDAR_DURATION_MINUTES, 60, "timed events use a one-hour minimum");
assert.deepEqual(ensureMinimumTimedDuration({ allDay: false, timeUnknown: false, startDate: "2026-10-04", endDate: "2026-10-04", startTime: "13:10", endTime: "13:30" }), { startDate: "2026-10-04", startTime: "13:10", endDate: "2026-10-04", endTime: "14:10" }, "a short timed save is extended to exactly one hour");
assert.deepEqual(ensureMinimumTimedDuration({ allDay: false, timeUnknown: false, startDate: "2026-10-04", endDate: "2026-10-04", startTime: "23:30", endTime: "" }), { startDate: "2026-10-04", startTime: "23:30", endDate: "2026-10-05", endTime: "00:30" }, "minimum duration carries into the next day");
assert.deepEqual(ensureMinimumTimedDuration({ allDay: true, timeUnknown: false, startDate: "2026-10-04", endDate: "2026-10-04", startTime: "", endTime: "" }), { startDate: "2026-10-04", startTime: "", endDate: "2026-10-04", endTime: "" });
assert.deepEqual(extractTitleSearchTrigger("Prepare @Acme"), { kind: "related", query: "Acme" });
assert.deepEqual(extractTitleSearchTrigger("Review #Jane"), { kind: "user", query: "Jane" });
assert.equal(extractTitleSearchTrigger("Prepare *Cloud migration"), null, "asterisk is literal title text, not a search trigger");
assert.deepEqual(extractTitleSearchTrigger("@  Acme"), { kind: "related", query: "Acme" }, "mention search preserves the active suffix while trimming its leading spacing");
assert.equal(extractTitleSearchTrigger("literal [Acme] text"), null, "typed brackets are not relationship tokens");
assert.equal(prependRelatedToken("Discuss renewal @Ac", "Acme"), "Discuss renewal");
assert.deepEqual(applyRelatedSelection("Discuss renewal @mig", { type: "WORKLOAD", id: 72, accountId: 9, accountName: "Acme", label: "Cloud migration" }), {
  title: "Discuss renewal", accountId: "9", relatedItemType: "WORKLOAD", relatedItemId: "72", relatedItemLabel: "Acme · Cloud migration"
}, "a child relation keeps the title pure while retaining its parent account and child relation metadata");
assert.deepEqual(applyRelatedSelection("Review @deal", { type: "OPPTY", id: 81, accountId: 9, accountName: "Acme", label: "FY27 Renewal" }), {
  title: "Review", accountId: "9", relatedItemType: "OPPTY", relatedItemId: "81", relatedItemLabel: "Acme · FY27 Renewal"
}, "an opportunity persists its parent account label and its own child relation id");
assert.equal(relatedAccountName(9, "Acme · Cloud migration"), "Acme");
assert.doesNotMatch(calendarUxSource, /titleWithAccountPrefix/, "the discarded account-title prefix helper stays removed");
assert.equal(snapTimelinePointer(310, 0, 540, 540, 1080), 850, "a pointer at 14:10 snaps to the exact ten-minute location");
assert.equal(snapTimelinePointer(540, 0, 540, 540, 1080, true), 1080, "a resize handle can snap to the timeline end");
assert.equal(minutesToTime(850), "14:10");
assert.deepEqual(resizeTimelineRange(600, 600), { startMinutes: 600, endMinutes: 660 }, "resize enforces the one-hour minimum");
assert.deepEqual(resizeTimelineRange(850, 869), { startMinutes: 850, endMinutes: 910 }, "a 20-minute pointer range is clamped to one hour");
assert.deepEqual(resizeTimelineRange(850, 921), { startMinutes: 850, endMinutes: 920 }, "ranges longer than one hour retain ten-minute snapping");
assert.equal(LONG_PRESS_CREATE_DELAY_MS, 500, "creation waits for an intentional 500ms hold");
assert.equal(longPressCanActivate(1_000, 1_499, 0), false, "the press is still pending before 500ms");
assert.equal(longPressCanActivate(1_000, 1_500, 0), true, "the press activates at the 500ms boundary");
assert.equal(longPressCanActivate(1_000, 1_600, 9), false, "a moved pointer cannot activate later");
assert.equal(longPressMovementCancels(0, 0, 7, 4), false, "small pointer jitter does not steal native scrolling");
assert.equal(longPressMovementCancels(0, 0, 9, 0), true, "movement beyond tolerance cancels the pending hold");
assert.deepEqual(timelineCreationRange(850), { startMinutes: 850, endMinutes: 910 }, "activation previews a one-hour event");
assert.deepEqual(timelineCreationRange(850, 880), { startMinutes: 880, endMinutes: 940 }, "dragging creation moves the default one-hour block without resizing it");
assert.deepEqual(timelineCreationRange(850, 800), { startMinutes: 800, endMinutes: 860 }, "dragging upward also preserves the default one-hour duration");
assert.deepEqual(timelineCreationRange(1070), { startMinutes: 1020, endMinutes: 1080 }, "the default hour remains in timeline bounds");
assert.deepEqual(layoutTimelineEvents([
  { id: 1, startMinutes: 540, endMinutes: 600 },
  { id: 2, startMinutes: 570, endMinutes: 630 },
  { id: 3, startMinutes: 630, endMinutes: 650 }
]), [
  { id: 1, startMinutes: 540, endMinutes: 600, column: 0, columnCount: 2 },
  { id: 2, startMinutes: 570, endMinutes: 630, column: 1, columnCount: 2 },
  { id: 3, startMinutes: 630, endMinutes: 650, column: 0, columnCount: 1 }
], "overlaps are assigned selectable side-by-side columns; touching edges do not overlap");
assert.equal(appendMentionToken("Discuss renewal #Ja", "Jane Doe"), "Discuss renewal");
assert.equal(CALENDAR_SHARE_COLORS.length, 10, "the standard palette exposes ten Redwood-friendly colors");
assert.equal(requestIsLatest(4, 4), true);
assert.equal(requestIsLatest(3, 4), false, "stale directory responses are rejected");
console.log("calendar UX tests passed");
