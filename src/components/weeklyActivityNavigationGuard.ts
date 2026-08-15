export type AnchorClickIntent = Readonly<{
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
}>;

export type AnchorNavigationIntent = Readonly<{
  href: string;
  target?: string | null;
  download?: boolean;
}>;

const HISTORY_INDEX_KEY = "__kpiHistoryIndex";

export const getHistoryIndex = (state: unknown): number | null => {
  if (typeof state !== "object" || state === null) return null;
  const index = (state as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null;
};

export const withHistoryIndex = (state: unknown, index: number): Record<string, unknown> => ({
  ...(typeof state === "object" && state !== null ? state as Record<string, unknown> : {}),
  [HISTORY_INDEX_KEY]: index
});

export const getRejectedPopstateDelta = (currentIndex: number, destinationState: unknown): number | null => {
  const destinationIndex = getHistoryIndex(destinationState);
  return destinationIndex === null ? null : currentIndex - destinationIndex;
};

export const shouldReleaseWeeklyActivityDraft = (previousRouteId: string, nextRouteId: string): boolean =>
  previousRouteId === "weekly-activities" && nextRouteId !== previousRouteId;

export const isSameDocumentNavigation = (currentHref: string, destinationHref: string): boolean => {
  try {
    const current = new URL(currentHref);
    const destination = new URL(destinationHref);
    return current.origin === destination.origin && current.pathname === destination.pathname && current.search === destination.search;
  } catch {
    return false;
  }
};

export const hasNavigationDestinationChanged = (
  previousRouteId: string,
  nextRouteId: string,
  previousHref: string,
  nextHref: string
): boolean => previousRouteId !== nextRouteId || previousHref !== nextHref;

/** True only when the click can replace the document in the current browsing context. */
export const isCurrentContextAnchorNavigation = (
  click: AnchorClickIntent,
  anchor: AnchorNavigationIntent,
  currentUrl: string
): boolean => {
  if (
    click.defaultPrevented || click.button !== 0 || click.ctrlKey || click.metaKey ||
    click.shiftKey || click.altKey || anchor.download
  ) return false;

  const target = (anchor.target ?? "").trim().toLowerCase();
  if (target && target !== "_self") return false;

  try {
    const current = new URL(currentUrl);
    const destination = new URL(anchor.href, current);
    if (destination.protocol !== "http:" && destination.protocol !== "https:") return false;
    return destination.href !== current.href;
  } catch {
    return false;
  }
};
