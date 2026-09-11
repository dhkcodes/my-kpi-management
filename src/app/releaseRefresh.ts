type HeadResponse = Readonly<{
  ok: boolean;
  redirected: boolean;
  headers: Readonly<{ get(name: string): string | null }>;
}>;

type ReleaseRefreshDependencies = Readonly<{
  initialLastModified: string;
  fetchHead: () => Promise<HeadResponse>;
  reload: () => void;
  getReloadTarget: () => string | null;
  setReloadTarget: (value: string) => void;
}>;

const parsedTimestamp = (value: string | null): number | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const createReleaseRefreshCheck = (dependencies: ReleaseRefreshDependencies): (() => Promise<void>) => {
  const initialTimestamp = parsedTimestamp(dependencies.initialLastModified);
  let reloadRequested = false;
  let checking = false;

  return async () => {
    if (reloadRequested || checking || initialTimestamp === null) return;
    checking = true;
    try {
      const response = await dependencies.fetchHead();
      if (!response.ok || response.redirected) return;
      const currentValue = response.headers.get("last-modified");
      const currentTimestamp = parsedTimestamp(currentValue);
      if (currentTimestamp === null || currentTimestamp <= initialTimestamp) return;
      const reloadTarget = String(currentTimestamp);
      if (dependencies.getReloadTarget() === reloadTarget) return;
      reloadRequested = true;
      dependencies.setReloadTarget(reloadTarget);
      dependencies.reload();
    } catch {
      // A release check must never interrupt application use.
    } finally {
      checking = false;
    }
  };
};

const storageKey = "kap-release-refresh-target";

const getReloadTarget = (): string | null => {
  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const setReloadTarget = (value: string): void => {
  try {
    window.sessionStorage.setItem(storageKey, value);
  } catch {
    // Reload still proceeds when browser storage is unavailable.
  }
};

export const startReleaseRefreshWatcher = (): void => {
  const check = createReleaseRefreshCheck({
    initialLastModified: document.lastModified,
    fetchHead: () => fetch(window.location.href, {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual"
    }),
    reload: () => window.location.reload(),
    getReloadTarget,
    setReloadTarget
  });
  void check();
  window.setInterval(() => void check(), 30_000);
};
