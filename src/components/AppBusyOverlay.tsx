import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getAppBusyCount, subscribeAppBusy } from "../app/appBusy";
import "ojs/ojprogress-bar";

function hasInlineBusySurface(): boolean {
  return typeof document !== "undefined" && document.querySelector('[data-app-busy-surface="true"]') !== null;
}

export function AppBusyOverlay() {
  const [busy, setBusy] = useState(() => getAppBusyCount() > 0);
  const [inlineBusySurface, setInlineBusySurface] = useState(hasInlineBusySurface);

  useEffect(() => subscribeAppBusy((count) => setBusy(count > 0)), []);
  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateInlineBusySurface = () => setInlineBusySurface(hasInlineBusySurface());
    updateInlineBusySurface();
    const observer = new MutationObserver(updateInlineBusySurface);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!busy || inlineBusySurface) return null;

  return (
    <div class="kap-app-loading kap-busy-overlay" role="progressbar" aria-label="Preparing application" aria-busy="true">
      <oj-progress-bar value={-1} aria-label="Preparing application"></oj-progress-bar>
    </div>
  );
}
