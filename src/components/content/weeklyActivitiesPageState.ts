import {
  fetchWeeklyActivities,
  WeeklyActivitiesPage,
  WeeklyActivitiesQuery,
  WeeklyActivityRecord
} from "../../data/weeklyActivitiesApi";
import { hasValidUtf8Content } from "../../data/utf8TextPolicy";
import {
  deriveWeeklyActivityPlainText,
  hasWeeklyActivityVisibleBase,
  WeeklyActivityDrafts
} from "./weeklyActivityEditorSession";

export const validateWeeklyActivityDraft = (weekOfDate: string, drafts: WeeklyActivityDrafts): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOfDate)) return "Select a valid Week Date.";
  if (![weekOfDate, drafts.thisWeekHtml, drafts.nextWeekHtml].every(hasValidUtf8Content)) {
    return "Activity content must be valid UTF-8 without replacement characters or unpaired surrogates.";
  }
  const thisWeekText = deriveWeeklyActivityPlainText(drafts.thisWeekHtml);
  const nextWeekText = deriveWeeklyActivityPlainText(drafts.nextWeekHtml);
  if (!hasWeeklyActivityVisibleBase(thisWeekText) || !hasWeeklyActivityVisibleBase(nextWeekText)) {
    return "Both Completed and Planned activities require meaningful content. Use ‘None’ when applicable.";
  }
  if (thisWeekText.length > 20_000 || nextWeekText.length > 20_000 || thisWeekText.length + nextWeekText.length > 40_000) {
    return "Each activity field is limited to 20,000 plain-text characters (40,000 total).";
  }
  return "";
};

export class LatestRequestGuard {
  private latestRequest = 0;

  begin(): number {
    this.latestRequest += 1;
    return this.latestRequest;
  }

  isLatest(requestId: number): boolean {
    return requestId === this.latestRequest;
  }
}

type FetchWeeklyActivitiesPage = (query: WeeklyActivitiesQuery) => Promise<WeeklyActivitiesPage>;

export const fetchWeeklyActivityLoadedWindow = async (
  query: WeeklyActivitiesQuery,
  fetchPage: FetchWeeklyActivitiesPage = fetchWeeklyActivities
): Promise<WeeklyActivitiesPage> => {
  const currentPage = query.page ?? 0;
  const pages = await Promise.all(
    Array.from({ length: currentPage + 1 }, (_, page) => fetchPage({ ...query, page }))
  );
  const latest = pages[pages.length - 1];
  return {
    items: pages.flatMap((page) => page.items),
    totalElements: latest.totalElements,
    page: currentPage,
    size: query.size ?? latest.size
  };
};

export const reconcileWeeklyActivityMutation = (
  items: WeeklyActivityRecord[],
  saved: WeeklyActivityRecord,
  query: WeeklyActivitiesQuery
): WeeklyActivityRecord[] => {
  const reconciled = items.filter((item) => item.activityId !== saved.activityId);
  if (weeklyActivityMatchesQuery(saved, query)) reconciled.push(saved);
  const loadedWindowSize = Math.max(query.size ?? 50, items.length);
  return reconciled.sort(compareWeeklyActivitiesNewestFirst).slice(0, loadedWindowSize);
};

export const weeklyActivityMatchesQuery = (item: WeeklyActivityRecord, query: WeeklyActivitiesQuery): boolean => {
  if (item.weekOfDate < query.fromDate || item.weekOfDate > query.toDate) return false;
  const search = (query.search ?? "").trim().toLowerCase();
  if (!search) return true;
  return `${item.thisWeekText}\n${item.nextWeekText}`.toLowerCase().includes(search);
};

const compareWeeklyActivitiesNewestFirst = (left: WeeklyActivityRecord, right: WeeklyActivityRecord): number =>
  right.weekOfDate.localeCompare(left.weekOfDate) ||
  right.updatedAt.localeCompare(left.updatedAt) ||
  right.activityId - left.activityId;
