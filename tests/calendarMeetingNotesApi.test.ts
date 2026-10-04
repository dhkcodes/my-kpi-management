import assert from "node:assert/strict";
import {
  createCalendarEvent,
  createCalendarEventEntity,
  listCalendarAccounts,
  listCalendarRelatedItems,
  listCalendarEvents,
  listKoreanHolidays,
  updateCalendarEvent,
  syncCalendarEventShares,
  type CalendarEventInput
} from "../src/data/calendarApi";
import {
  createMeetingNote,
  createMeetingNoteEntity,
  listMeetingNotes,
  updateMeetingNote,
  syncMeetingNoteShares,
  type MeetingNoteInput
} from "../src/data/meetingNotesApi";

process.env.TZ = "UTC";

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];
const jsonBody = (call: Call) => JSON.parse(String(call.init?.body)) as Record<string, unknown>;
const response = (value: unknown, status = 200) => status === 204 ? new Response(null, { status }) : Response.json(value, { status });

const eventDto = {
  id: 41, ownerUserKey: "owner", accountId: 7, title: "Account review", description: "Pipeline",
  location: "Seoul", startsAt: "2026-10-03T09:00:00+09:00", endsAt: "2026-10-03T10:00:00+09:00",
  allDay: false, hasEndTime: true, timezone: "Asia/Seoul", visibility: "DETAILS", versionNo: 3,
  effectiveAccess: "EDIT", effectiveVisibility: "DETAILS"
};
const noteDto = {
  id: 51, ownerUserKey: "owner", calendarEventId: 41, accountId: 7, title: "Review minutes",
  meetingAt: "2026-10-03T09:00:00+09:00", notes: "Manual minutes", transcript: "Transcript",
  summary: "Summary", actionItems: JSON.stringify([{ text: "Follow up", completed: false }]),
  recordingName: null, recordingMimeType: null, recordingDurationSeconds: null, recordingStatus: "NONE",
  versionNo: 4, effectiveAccess: "EDIT", notesAccess: true, audioAccess: false
};

const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  calls.push({ url, init });
  const method = init?.method ?? "GET";
  if (url === "/api/v1/calendar/events?fy=FY27") return response([eventDto]);
  if (url === "/api/v1/collaboration/directory/accounts?fiscalYear=FY27&search=Acme") {
    return response([{ accountId: 77, account: "Acme Virtual Account" }]);
  }
  if (url === "/api/v1/collaboration/directory/related-items?fiscalYear=FY27&search=Acme") {
    return response([{ type: "OPPTY", id: 99, accountId: 77, accountName: "Acme", workloadName: "OCI",
      opptyName: "Expansion / OPP-99", label: "Acme · OCI · Expansion / OPP-99" }]);
  }
  if (url === "/api/v1/calendar/events/41/shares" && method === "GET") return response([{ userKey: "user/one", access: "VIEW", visibility: "BUSY_ONLY" }]);
  if (url === "/api/v1/calendar/events" && method === "POST") return response({ ...eventDto, id: 42, versionNo: 1 }, 201);
  if (url === "/api/v1/calendar/events/41" && method === "PUT") return response({ ...eventDto, versionNo: 4 });
  if (url.includes("/api/v1/calendar/events/") && url.includes("/shares/") && method === "PUT") return response(JSON.parse(String(init?.body)));
  if (url.includes("/api/v1/calendar/events/") && url.includes("/shares/") && method === "DELETE") return response(undefined, 204);
  if (url === "/api/v1/calendar/holidays?year=2026") return response({
    year: 2026,
    firstSupportedYear: 2025,
    lastSupportedYear: 2027,
    supportedYears: [2025, 2026, 2027],
    source: { publisher: "KASA/KASI", title: "Almanac", url: "https://astro.kasi.re.kr/kor/life/post/almanac" },
    holidays: [{ date: "2026-10-03", name: "National Foundation Day", type: "PUBLIC_HOLIDAY" }]
  });

  if (url === "/api/v1/meeting-notes?fy=FY27") return response([noteDto]);
  if (url === "/api/v1/meeting-notes/51/shares" && method === "GET") return response([{ userKey: "user/one", access: "EDIT", notesAccess: true, audioAccess: false }]);
  if (url === "/api/v1/meeting-notes" && method === "POST") return response({ ...noteDto, id: 52, versionNo: 1 }, 201);
  if (url === "/api/v1/meeting-notes/51" && method === "PUT") return response({ ...noteDto, versionNo: 5 });
  if (url.includes("/api/v1/meeting-notes/") && url.includes("/shares/") && method === "PUT") return response(JSON.parse(String(init?.body)));
  if (url.includes("/api/v1/meeting-notes/") && url.includes("/shares/") && method === "DELETE") return response(undefined, 204);
  throw new Error(`Unexpected request: ${method} ${url}`);
};

async function main() {
  calls.length = 0;
  const events = await listCalendarEvents("FY27", fetchImpl);
  assert.equal(calls[0]?.url, "/api/v1/calendar/events?fy=FY27");
  assert.deepEqual(events[0], {
    id: 41, ownerUserKey: "owner", ownerBadgeColor: null, versionNo: 3, title: "Account review", startsAt: eventDto.startsAt, endsAt: eventDto.endsAt,
    allDay: false, hasEndTime: true, timeUnknown: false, forcePrivate: false, status: "SCHEDULED", timezone: "Asia/Seoul",
    accountId: 7, relatedItemType: null, relatedItemId: null, relatedItemLabel: null,
    location: "Seoul", description: "Pipeline", visibility: "DETAILS", effectiveVisibility: "DETAILS",
    shares: [{ userKey: "user/one", permission: "VIEW", visibility: "BUSY_ONLY" }], canEdit: true
  });

  const event: CalendarEventInput = {
    title: "Account review", startsAt: "2026-10-03T09:00", endsAt: "2026-10-03T10:00", allDay: false,
    timeUnknown: false, forcePrivate: false, timezone: "Asia/Seoul", accountId: 7,
    relatedItemType: "OPPTY", relatedItemId: 99, relatedItemLabel: "Acme · OCI · Expansion / OPP-99", location: null,
    description: null, visibility: "DETAILS",
    shares: [{ userKey: "user/two", permission: "EDIT", visibility: "DETAILS" }]
  };
  calls.length = 0;
  const createdEvent = await createCalendarEvent(event, fetchImpl);
  assert.equal(createdEvent.id, 42);
  assert.deepEqual(jsonBody(calls[0]), {
    accountId: 7, relatedItemType: "OPPTY", relatedItemId: 99,
    relatedItemLabel: "Acme · OCI · Expansion / OPP-99", title: "Account review", description: null, location: null,
    startsAt: "2026-10-03T09:00:00+09:00", endsAt: "2026-10-03T10:00:00+09:00",
    allDay: false, timeUnknown: false, forcePrivate: false, timezone: "Asia/Seoul", visibility: "DETAILS"
  });
  assert.equal(calls[1]?.url, "/api/v1/calendar/events/42/shares/user%2Ftwo");
  assert.deepEqual(jsonBody(calls[1]), { userKey: "user/two", access: "VIEW", visibility: "DETAILS" });

  calls.length = 0;
  await createCalendarEvent({ ...event, endsAt: null, shares: [] }, fetchImpl);
  assert.equal(jsonBody(calls[0]).endsAt, null, "a start-only event keeps its absent end time in the request");

  calls.length = 0;
  await createCalendarEvent({
    ...event,
    startsAt: "2026-03-08T00:00",
    endsAt: "2026-03-08T23:59",
    allDay: true,
    timezone: "America/Los_Angeles",
    shares: []
  }, fetchImpl);
  const springAllDay = jsonBody(calls[0]);
  assert.equal(springAllDay.startsAt, "2026-03-08T00:00:00-08:00", "all-day start keeps the selected Calendar date before the DST transition");
  assert.equal(springAllDay.endsAt, "2026-03-08T23:59:00-07:00", "all-day end keeps the selected Calendar date after the DST transition");

  calls.length = 0;
  await createCalendarEvent({
    ...event,
    startsAt: "2026-10-04T00:00",
    endsAt: "2026-10-04T23:59",
    allDay: true,
    timezone: "Asia/Seoul",
    shares: []
  }, fetchImpl);
  const seoulAllDay = jsonBody(calls[0]);
  assert.equal(seoulAllDay.startsAt, "2026-10-04T00:00:00+09:00", "all-day start keeps the selected Seoul Calendar date");
  assert.equal(seoulAllDay.endsAt, "2026-10-04T23:59:00+09:00", "all-day end keeps the selected Seoul Calendar date");

  calls.length = 0;
  await createCalendarEvent({
    ...event,
    startsAt: "2026-04-24T00:00",
    endsAt: "2026-04-24T23:59",
    allDay: true,
    timezone: "Africa/Cairo",
    shares: []
  }, fetchImpl);
  const midnightGapAllDay = jsonBody(calls[0]);
  assert.equal(midnightGapAllDay.startsAt, "2026-04-24T01:00:00+03:00", "a midnight DST gap advances to the first valid minute of the selected date");
  assert.equal(midnightGapAllDay.endsAt, "2026-04-24T23:59:00+03:00", "the all-day end remains on the selected date after the transition");

  calls.length = 0;
  await updateCalendarEvent(events[0]!, { ...event, shares: [{ userKey: "user/two", permission: "VIEW", visibility: "DETAILS" }] }, fetchImpl);
  const eventUpdate = calls.find((call) => call.url === "/api/v1/calendar/events/41" && call.init?.method === "PUT")!;
  assert.equal(jsonBody(eventUpdate).versionNo, 3, "calendar updates carry the last server version");
  assert.ok(calls.some((call) => call.url.endsWith("/shares/user%2Fone") && call.init?.method === "DELETE"), "removed calendar shares are deleted");
  assert.ok(calls.some((call) => call.url.endsWith("/shares/user%2Ftwo") && call.init?.method === "PUT"), "calendar shares are upserted");

  calls.length = 0;
  const holidays = await listKoreanHolidays(2026, fetchImpl);
  assert.deepEqual(holidays, [{ date: "2026-10-03", name: "National Foundation Day", type: "PUBLIC_HOLIDAY" }]);
  assert.equal(calls[0]?.url, "/api/v1/calendar/holidays?year=2026");

  calls.length = 0;
  const accountOptions = await listCalendarAccounts("FY27", "Acme", fetchImpl);
  assert.equal(calls[0]?.url, "/api/v1/collaboration/directory/accounts?fiscalYear=FY27&search=Acme");
  assert.deepEqual(accountOptions, [{ accountId: 77, account: "Acme Virtual Account" }]);

  calls.length = 0;
  const relatedItems = await listCalendarRelatedItems("FY27", "Acme", fetchImpl);
  assert.equal(calls[0]?.url, "/api/v1/collaboration/directory/related-items?fiscalYear=FY27&search=Acme");
  assert.deepEqual(relatedItems, [{ type: "OPPTY", id: 99, accountId: 77, accountName: "Acme", workloadName: "OCI",
    opptyName: "Expansion / OPP-99", label: "Acme · OCI · Expansion / OPP-99" }]);

  calls.length = 0;
  const notes = await listMeetingNotes("FY27", fetchImpl);
  assert.equal(calls[0]?.url, "/api/v1/meeting-notes?fy=FY27");
  assert.deepEqual(notes[0], {
    id: 51, versionNo: 4, title: "Review minutes", meetingDate: "2026-10-03", calendarEventId: 41,
    accountId: 7, notes: "Manual minutes", transcript: "Transcript", summary: "Summary",
    actionItems: [{ text: "Follow up", completed: false }],
    shares: [{ userKey: "user/one", permission: "EDIT" }], canEdit: true,
    ownerUserKey: "owner", audioAccess: false
  });

  const note: MeetingNoteInput = {
    title: "Review minutes", meetingDate: "2026-10-03", calendarEventId: 41, accountId: 7,
    notes: "Manual minutes", transcript: "Transcript", summary: "Summary",
    actionItems: [{ text: "Follow up", completed: false }], shares: [{ userKey: "user/two", permission: "VIEW" }]
  };
  calls.length = 0;
  const createdNote = await createMeetingNote(note, fetchImpl);
  assert.equal(createdNote.id, 52);
  assert.deepEqual(jsonBody(calls[0]), {
    calendarEventId: 41, accountId: 7, title: "Review minutes", meetingAt: "2026-10-03T00:00:00+00:00",
    notes: "Manual minutes", transcript: "Transcript", summary: "Summary",
    actionItems: JSON.stringify([{ text: "Follow up", completed: false }]),
    recordingName: null, recordingMimeType: null, recordingDurationSeconds: null, recordingStatus: "NONE"
  });
  assert.equal(calls[1]?.url, "/api/v1/meeting-notes/52/shares/user%2Ftwo");
  assert.deepEqual(jsonBody(calls[1]), { userKey: "user/two", access: "VIEW", notesAccess: true, audioAccess: false });

  calls.length = 0;
  await updateMeetingNote(notes[0]!, { ...note, shares: [{ userKey: "user/two", permission: "EDIT" }] }, fetchImpl);
  const noteUpdate = calls.find((call) => call.url === "/api/v1/meeting-notes/51" && call.init?.method === "PUT")!;
  assert.equal(jsonBody(noteUpdate).versionNo, 4, "meeting-note updates carry the last server version");
  assert.ok(calls.some((call) => call.url.endsWith("/shares/user%2Fone") && call.init?.method === "DELETE"), "removed minutes shares are deleted");
  const noteShare = calls.find((call) => call.url.endsWith("/shares/user%2Ftwo") && call.init?.method === "PUT")!;
  assert.deepEqual(jsonBody(noteShare), { userKey: "user/two", access: "EDIT", notesAccess: true, audioAccess: false });

  calls.length = 0;
  const eventEntity = await createCalendarEventEntity(event, fetchImpl);
  assert.equal(eventEntity.id, 42);
  assert.equal(eventEntity.versionNo, 1);
  assert.deepEqual(eventEntity.shares, [], "the authoritative event is available before ACL synchronization");
  assert.equal(calls.length, 1, "entity creation is a distinct request");
  await syncCalendarEventShares(eventEntity, event.shares, fetchImpl);
  assert.equal(calls.filter((call) => call.url === "/api/v1/calendar/events" && call.init?.method === "POST").length, 1,
    "retrying ACL synchronization cannot recreate the event");

  calls.length = 0;
  const noteEntity = await createMeetingNoteEntity(note, fetchImpl);
  assert.equal(noteEntity.id, 52);
  assert.equal(noteEntity.versionNo, 1);
  assert.deepEqual(noteEntity.shares, [], "the authoritative note is available before ACL synchronization");
  assert.equal(calls.length, 1, "note creation is a distinct request");
  await syncMeetingNoteShares(noteEntity, note.shares, fetchImpl);
  assert.equal(calls.filter((call) => call.url === "/api/v1/meeting-notes" && call.init?.method === "POST").length, 1,
    "retrying note ACL synchronization cannot recreate the note");

  console.log("calendar and meeting notes API DTO tests passed");
}

void main();
