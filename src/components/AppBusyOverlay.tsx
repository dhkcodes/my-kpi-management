import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getAppBusyCount, subscribeAppBusy } from "../app/appBusy";
import "ojs/ojprogress-circle";

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
    <div class="kap-app-loading kap-busy-overlay" role="status" aria-live="polite" aria-label="Loading" aria-busy="true">
      <oj-progress-circle value={-1} size="sm" aria-label="Loading"></oj-progress-circle>
      <span>Loading</span>
    </div>
  );
}
