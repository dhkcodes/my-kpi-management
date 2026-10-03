import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationRoute, getNavigationRouteFromPath } from "../src/components/navigationRoutes";
import { getFiscalYearForDate, getFiscalYearRange, getMonthCells, getDayKind } from "../src/data/calendarDateUtils";
import { getLocalRecordingKey, getRecordingCapability } from "../src/data/localRecordingStore";
import { canAccessLocalRecording } from "../src/data/meetingNotesApi";

assert.equal(getNavigationRoute("calendar").module, "calendar");
assert.equal(getNavigationRoute("meeting-notes").module, "meetingNotes");
assert.equal(getNavigationRouteFromPath("/calendar").id, "calendar");
assert.equal(getNavigationRouteFromPath("/meeting-notes").id, "meeting-notes");

assert.equal(getFiscalYearForDate("2025-05-31"), "FY25");
assert.equal(getFiscalYearForDate("2025-06-01"), "FY26");
assert.deepEqual(getFiscalYearRange("FY26"), { fromDate: "2025-06-01", toDate: "2026-05-31" });
const june = getMonthCells(2025, 5);
assert.equal(june.length, 42, "month view has a stable six-week grid");
assert.equal(june[0].date, "2025-06-01");
assert.equal(getDayKind("2025-06-01", new Map()), "sunday");
assert.equal(getDayKind("2025-06-07", new Map()), "saturday");
assert.equal(getDayKind("2025-06-06", new Map([["2025-06-06", "Memorial Day"]])), "holiday");

assert.deepEqual(getRecordingCapability({ hasMediaRecorder: false, hasGetUserMedia: true, isSecureContext: true, isMobile: false }),
  { supported: false, reason: "Recording is not supported by this browser." });
assert.deepEqual(getRecordingCapability({ hasMediaRecorder: true, hasGetUserMedia: true, isSecureContext: true, isMobile: true }),
  { supported: false, reason: "Quick recording is unavailable on mobile. Use manual notes instead." });
assert.deepEqual(getRecordingCapability({ hasMediaRecorder: true, hasGetUserMedia: true, isSecureContext: false, isMobile: false }),
  { supported: false, reason: "Recording requires a secure browser context (HTTPS)." });
assert.equal(getRecordingCapability({ hasMediaRecorder: true, hasGetUserMedia: true, isSecureContext: true, isMobile: false }).supported, true);
assert.equal(getLocalRecordingKey(" user/a ", "51"), '["user/a","51"]', "local audio keys are scoped to the authenticated user");
assert.notEqual(getLocalRecordingKey("user/a", "51"), getLocalRecordingKey("user/b", "51"));
assert.equal(canAccessLocalRecording({ ownerUserKey: "user/a", audioAccess: false }, "user/a"), true, "owners can access their local audio");
assert.equal(canAccessLocalRecording({ ownerUserKey: "user/a", audioAccess: true }, "user/b"), true, "explicit audio grants allow shared-note audio access");
assert.equal(canAccessLocalRecording({ ownerUserKey: "user/a", audioAccess: false }, "user/b"), false, "note text access does not imply audio access");

const navSource = readFileSync("src/data/kpiMockData.ts", "utf8");
assert.match(navSource, /id: "my-activities"[\s\S]*children: activityNavItems/);
assert.match(navSource, /id: "calendar", label: "Calendar"/);
assert.match(navSource, /id: "meeting-notes", label: "Meeting Notes"/);
const calendarSource = readFileSync("src/components/content/CalendarPage.tsx", "utf8");
assert.match(calendarSource, /Weekend · Sunday/);
assert.match(calendarSource, /Weekend · Saturday/);
assert.match(calendarSource, /Holiday/);
assert.match(calendarSource, /PRIVATE[\s\S]*BUSY_ONLY[\s\S]*DETAILS/);
assert.match(calendarSource, /VIEW[\s\S]*EDIT/);
const notesSource = readFileSync("src/components/content/MeetingNotesPage.tsx", "utf8");
assert.match(notesSource, /Raw audio stays on this device and browser only/);
assert.match(notesSource, /I have everyone’s consent to record/);
assert.match(notesSource, /external AI is not configured/i);
assert.match(notesSource, /disabled[\s\S]*Generate/);
assert.match(notesSource, /permission-error/);
assert.match(notesSource, /interrupted/);
assert.match(notesSource, /save-error/);
assert.match(notesSource, /Share settings were not fully synchronized/);
assert.match(notesSource, /Retry sharing/);
assert.match(notesSource, /canAccessLocalRecording/);
const contentSource = readFileSync("src/components/content/index.tsx", "utf8");
assert.match(contentSource, /recordingNamespace=\{profile\.userKey\}/);

console.log("calendar and meeting notes tests passed");
