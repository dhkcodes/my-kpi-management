import assert from "node:assert/strict";
import {
  createWeeklyActivity,
  fetchWeeklyActivities,
  getDefaultWeeklyActivityRange,
  updateWeeklyActivity,
  WeeklyActivitiesApiError
} from "../src/data/weeklyActivitiesApi";
import { fetchWeeklyActivityLoadedWindow } from "../src/components/content/weeklyActivitiesPageState";

const run = async () => {
const record = {
  activityId: 7,
  weekOfDate: "2026-08-15",
  thisWeekHtml: "<p>Completed</p>",
  thisWeekText: "Completed",
  nextWeekHtml: "<p>Planned</p>",
  nextWeekText: "Planned",
  versionNo: 1,
  createdAt: "2026-08-15T10:00:00Z",
  createdBy: "weekly-activity-api",
  updatedAt: "2026-08-15T10:00:00Z",
  updatedBy: "weekly-activity-api"
};

const seen: Array<{ url: string; init?: RequestInit }> = [];
const fetchOk = async (input: RequestInfo | URL, init?: RequestInit) => {
  seen.push({ url: String(input), init });
  return new Response(JSON.stringify({ items: [record], totalElements: 1, page: 0, size: 50 }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
const page = await fetchWeeklyActivities({
  fromDate: "2026-07-15",
  toDate: "2026-08-15",
  search: "plan",
  page: 0,
  size: 50
}, fetchOk);
assert.equal(page.items[0].activityId, 7);
assert.equal(page.totalElements, 1);
assert.match(seen[0].url, /fromDate=2026-07-15/);
assert.match(seen[0].url, /toDate=2026-08-15/);
assert.match(seen[0].url, /search=plan/);
assert.match(seen[0].url, /page=0/);
assert.match(seen[0].url, /size=50/);

for (const invalidText of ["bad \uFFFD", "bad \uD800", "bad \uDC00"]) {
  const invalidResponseFetch = async () => new Response(JSON.stringify({
    items: [{ ...record, thisWeekText: invalidText }],
    totalElements: 1,
    page: 0,
    size: 50
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    () => fetchWeeklyActivities({ fromDate: "2026-07-15", toDate: "2026-08-15" }, invalidResponseFetch),
    /Malformed Weekly Activities page response/,
    "API normalization rejects replacement characters and unpaired UTF-16 surrogates from the server"
  );
}

let invalidRequestFetchCalled = false;
const invalidRequestFetch = async () => {
  invalidRequestFetchCalled = true;
  return new Response(JSON.stringify(record), { status: 200 });
};
await assert.rejects(
  () => createWeeklyActivity({ weekOfDate: "2026-08-15", thisWeekHtml: "<p>bad \uD800</p>", nextWeekHtml: "<p>Plan</p>" }, invalidRequestFetch),
  /UTF-8/,
  "invalid user content is rejected before JSON serialization can normalize it"
);
assert.equal(invalidRequestFetchCalled, false);
await assert.rejects(
  () => fetchWeeklyActivities({ fromDate: "2026-07-15", toDate: "2026-08-15", search: "bad \uFFFD" }, invalidRequestFetch),
  /UTF-8/,
  "invalid search content is rejected before URL encoding"
);

const mutationFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  seen.push({ url: String(input), init });
  return new Response(JSON.stringify(record), { status: 200, headers: { "Content-Type": "application/json" } });
};
await createWeeklyActivity({ weekOfDate: "2026-08-15", thisWeekHtml: "<p>Completed</p>", nextWeekHtml: "<p>Planned</p>" }, mutationFetch);
assert.equal(seen[seen.length - 1]?.init?.method, "POST");
assert.doesNotMatch(String(seen[seen.length - 1]?.init?.body), /versionNo/);
await updateWeeklyActivity(7, { weekOfDate: "2026-08-15", thisWeekHtml: "<p>Completed</p>", nextWeekHtml: "<p>Planned</p>", versionNo: 1 }, mutationFetch);
assert.equal(seen[seen.length - 1]?.init?.method, "PUT");
assert.match(String(seen[seen.length - 1]?.init?.body), /"versionNo":1/);

const conflictFetch = async () => new Response(JSON.stringify({ code: "VERSION_CONFLICT", message: "stale" }), {
  status: 409,
  headers: { "Content-Type": "application/json" }
});
await assert.rejects(
  () => updateWeeklyActivity(7, { weekOfDate: "2026-08-15", thisWeekHtml: "<p>A</p>", nextWeekHtml: "<p>B</p>", versionNo: 1 }, conflictFetch),
  (error: unknown) => error instanceof WeeklyActivitiesApiError && error.status === 409 && error.code === "VERSION_CONFLICT"
);

assert.deepEqual(getDefaultWeeklyActivityRange(new Date("2026-08-15T12:00:00Z")), {
  fromDate: "2026-07-15",
  toDate: "2026-08-15"
});
assert.deepEqual(getDefaultWeeklyActivityRange(new Date("2025-03-31T12:00:00Z")), {
  fromDate: "2025-02-28",
  toDate: "2025-03-31"
});

const requestedRefreshPages: number[] = [];
const refreshedWindow = await fetchWeeklyActivityLoadedWindow(
  { fromDate: "2026-07-01", toDate: "2026-08-31", search: "", page: 2, size: 2 },
  async (query) => {
    const requestedPage = query.page ?? 0;
    requestedRefreshPages.push(requestedPage);
    return {
      items: [
        { ...record, activityId: requestedPage * 2 + 1 },
        { ...record, activityId: requestedPage * 2 + 2 }
      ],
      totalElements: 8,
      page: requestedPage,
      size: 2
    };
  }
);
assert.deepEqual(requestedRefreshPages, [0, 1, 2], "authoritative post-save refresh reloads every currently loaded page");
assert.deepEqual(refreshedWindow.items.map(({ activityId }) => activityId), [1, 2, 3, 4, 5, 6], "authoritative refresh preserves the loaded three-page window");
assert.equal(refreshedWindow.page, 2, "the current loaded page count is preserved");

console.log("weeklyActivitiesApi tests passed");
};

void run();
